import type { BrowserContext, Page, Route } from "playwright";
import {
  ALLOWED_REQUEST_METHODS,
  SAFETY_EVENT_ORDER,
  type SafetyEvent,
} from "./types.js";

/**
 * Action-phase safety guards (Task 11, items 36–44).
 *
 * The governing principle (item 36): this engine exists to OBSERVE public UI
 * state. It must never be the cause of a signup, a login, a purchase, a delete,
 * a save, a publish, an upload or an email. Task 10's `guardFlags` already keep
 * the obvious ones out of the plan, but a plain `<button>` with a JavaScript
 * handler can do any of those, and stored markup can not tell you which. So the
 * live run gets a second, independent layer that does not depend on the plan
 * being right:
 *
 *   navigation  a main-frame document request is aborted (item 39)
 *   popup       a new page is closed immediately, never explored (item 40)
 *   download    cancelled; nothing is ever written to disk (item 41)
 *   write       POST / PUT / PATCH / DELETE / … aborted before the network (42)
 *   dialog      dismissed, never accepted (an accepted `confirm()` is a yes)
 *
 * Everything is recorded as a blocked ATTEMPT. A blocked analytics beacon is an
 * expected, acceptable cost (item 43): this stage would rather lose a state
 * change than risk causing a write on somebody else's server, and the count is
 * reported rather than hidden.
 *
 * Guards are ARMED only after the initial page load. A page has to be allowed to
 * load itself — including whatever POST its own bootstrap makes — before the
 * action phase begins. Everything after that moment is caused by the click.
 *
 * What is deliberately NOT attempted (item 44): WebSocket and Service Worker
 * interception. Playwright has no stable, non-invasive API for either at this
 * version, and monkey-patching page globals would distort exactly the behavior
 * this stage is trying to measure. Recorded as a known limitation instead.
 */

/** `origin + pathname` — never the query string, never the body (item 42). */
function safeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "(unparseable)";
  }
}

function isSameOrigin(requestUrl: string, pageUrl: string): boolean | undefined {
  try {
    return new URL(requestUrl).origin === new URL(pageUrl).origin;
  } catch {
    return undefined;
  }
}

export class SafetyGuard {
  private readonly collected: SafetyEvent[] = [];
  private armed = false;
  private baseUrl: string;

  private constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Install every guard on a fresh context/page pair.
   *
   * The route handler is registered BEFORE the initial navigation but stays
   * inert until {@link arm} is called, so there is no window in which a click
   * could fire before interception is in place.
   */
  static async install(
    context: BrowserContext,
    page: Page,
    targetUrl: string,
  ): Promise<SafetyGuard> {
    const guard = new SafetyGuard(targetUrl);

    await context.route("**/*", async (route: Route) => {
      const request = route.request();
      if (!guard.armed) {
        await guard.safeContinue(route);
        return;
      }

      const method = request.method().toUpperCase();
      const url = request.url();

      // Item 39 — a main-frame document request during the action phase is the
      // page trying to leave. Abort it: the state we are measuring is THIS
      // page's, and following the link would explore a URL nobody planned.
      //
      // `request.frame()` THROWS when the request was issued before its frame
      // existed, which is exactly what a `window.open` looks like. Such a
      // request can never be this page's main frame, and the popup guard closes
      // the window it belongs to.
      let mainFrameNavigation = false;
      if (request.isNavigationRequest()) {
        try {
          mainFrameNavigation = request.frame() === page.mainFrame();
        } catch {
          mainFrameNavigation = false;
        }
      }
      if (mainFrameNavigation) {
        guard.record({
          type: "navigation-blocked",
          method,
          url: safeUrl(url),
          ...(isSameOrigin(url, guard.baseUrl) !== undefined
            ? { sameOrigin: isSameOrigin(url, guard.baseUrl) as boolean }
            : {}),
        });
        await guard.safeAbort(route, "aborted");
        return;
      }

      if (!ALLOWED_REQUEST_METHODS.includes(method)) {
        guard.record({
          type: "blocked-write-request",
          method,
          url: safeUrl(url),
          ...(isSameOrigin(url, guard.baseUrl) !== undefined
            ? { sameOrigin: isSameOrigin(url, guard.baseUrl) as boolean }
            : {}),
        });
        await guard.safeAbort(route, "blockedbyclient");
        return;
      }

      await guard.safeContinue(route);
    });

    // Item 40 — a popup is closed immediately and never navigated or read.
    context.on("page", (popup: Page) => {
      if (popup === page) return;
      guard.record({
        type: "popup-attempt",
        url: safeUrl(popup.url()),
      });
      void popup.close().catch(() => {});
    });

    // Item 41 — nothing is ever saved. `acceptDownloads:false` on the context
    // already cancels; this records the attempt and cancels again defensively.
    page.on("download", (download) => {
      guard.record({
        type: "download-attempt",
        detail: download.suggestedFilename() ? "named" : "unnamed",
      });
      void download.cancel().catch(() => {});
    });

    // A `confirm()` in a click handler would otherwise hang the action.
    // Dismissed, never accepted: accepting is answering "yes" to a question this
    // engine has no business answering.
    page.on("dialog", (dialog) => {
      guard.record({ type: "dialog-dismissed", detail: dialog.type() });
      void dialog.dismiss().catch(() => {});
    });

    return guard;
  }

  private async safeContinue(route: Route): Promise<void> {
    try {
      await route.continue();
    } catch {
      // The context can close while a request is in flight; that is not an error.
    }
  }

  private async safeAbort(route: Route, code: string): Promise<void> {
    try {
      await route.abort(code as Parameters<Route["abort"]>[0]);
    } catch {
      // Same: a race with context teardown is not a failure of the guard.
    }
  }

  private record(event: SafetyEvent): void {
    this.collected.push(event);
  }

  /**
   * Record an event the interception layer cannot see for itself.
   *
   * The only current caller is the same-document (`history.pushState`)
   * navigation detected by comparing the before/after URLs: it produces no
   * network request, so no route handler can observe it, but it is exactly the
   * kind of "the action left the page" fact the safety log exists to hold.
   */
  note(event: SafetyEvent): void {
    this.record(event);
  }

  /** Called once the initial load is complete: everything after is the click. */
  arm(finalUrl?: string): void {
    if (finalUrl) this.baseUrl = finalUrl;
    this.armed = true;
  }

  /** Stop intercepting (used while tearing a context down). */
  disarm(): void {
    this.armed = false;
  }

  /** Deterministically ordered, so two identical runs produce identical files. */
  events(): SafetyEvent[] {
    return [...this.collected].sort((a, b) => {
      const type =
        SAFETY_EVENT_ORDER.indexOf(a.type) - SAFETY_EVENT_ORDER.indexOf(b.type);
      if (type !== 0) return type;
      const method = (a.method ?? "").localeCompare(b.method ?? "");
      if (method !== 0) return method;
      const url = (a.url ?? "").localeCompare(b.url ?? "");
      if (url !== 0) return url;
      return (a.detail ?? "").localeCompare(b.detail ?? "");
    });
  }
}
