import type { Browser, Page, Request, Response } from "playwright";
import { isSameSite, normalizeUrl } from "../discovery/index.js";
import {
  OBSERVATION_COLOR_SCHEME,
  OBSERVATION_LOCALE,
  OBSERVATION_REDUCED_MOTION,
  OBSERVATION_TIMEZONE,
} from "../observer/types.js";
import {
  BLOCKED_STATUSES,
  NAV_TIMEOUT_MS,
  SETTLE_MS,
  WAIT_UNTIL,
  contentTypeEssence,
  isHtmlContentType,
  type CandidateVerification,
  type RedirectHop,
  type VerificationStatus,
} from "./types.js";
import {
  SIGNALS_CONFIG,
  buildFingerprints,
  collectSignalsInBrowser,
  type RawSignals,
} from "./fingerprint.js";
import {
  STRUCTURAL_RAW_CONFIG,
  buildStructuralProfile,
  collectStructuralRawInBrowser,
} from "./structural-profile.js";

/**
 * Verify ONE candidate URL (Task 06). Read-only: it performs a GET navigation
 * and inspects the resulting page — never clicks, types, or submits.
 *
 * Each candidate runs in a FRESH BrowserContext so cookies / localStorage /
 * sessionStorage from an earlier candidate cannot leak forward and skew the
 * result (visit order must not change a verification). The browser PROCESS is
 * shared across candidates for speed; only the context is per-candidate.
 */

/** A candidate to verify (from discovery.links). */
export interface Candidate {
  candidateUrl: string;
  normalizedCandidateUrl: string;
}

/** The desktop-like viewport used for verification (Observer-consistent). */
export const VERIFIER_VIEWPORT = { width: 1440, height: 900 } as const;

/** tsx/esbuild adds a module-local `__name` helper to preserve Function.name.
 * That helper is absent in the browser, so a serialized `page.evaluate`
 * function can throw `__name is not defined`. Install a no-op shim first (as a
 * string, so it is not itself transformed). Mirrors the Observer's shim. */
async function installNameShim(page: Page): Promise<void> {
  await page.evaluate(
    "globalThis.__name = globalThis.__name || function (fn) { return fn; };",
  );
}

/** Collapse whitespace and cap length so error strings never carry blobs. */
function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const oneLine = raw.replace(/\s+/g, " ").trim();
  return oneLine.length > 300 ? oneLine.slice(0, 300) : oneLine;
}

/**
 * Reconstruct the server (3xx) redirect chain from the final request by walking
 * `redirectedFrom()` backward, then resolving each hop's redirect response for
 * its status + `Location`. Only data Playwright exposes directly is stored — the
 * chain is never inferred/guessed.
 */
async function buildRedirectChain(
  finalRequest: Request,
): Promise<{ chain: RedirectHop[]; count: number }> {
  const requests: Request[] = [];
  let cur: Request | null = finalRequest;
  while (cur) {
    requests.unshift(cur);
    cur = cur.redirectedFrom();
  }
  // Every request except the final one produced a redirect response.
  const chain: RedirectHop[] = [];
  for (let i = 0; i < requests.length - 1; i++) {
    const req = requests[i];
    let status = 0;
    let location: string | undefined;
    try {
      const resp = await req.response();
      if (resp) {
        status = resp.status();
        const loc = resp.headers()["location"];
        if (loc) location = loc;
      }
    } catch {
      // Leave status 0 / location undefined if the hop response is unavailable.
    }
    chain.push({ url: req.url(), status, ...(location ? { location } : {}) });
  }
  return { chain, count: requests.length - 1 };
}

/** Decide the deterministic status once the final response is known. */
function classify(
  finalSameSite: boolean,
  httpStatus: number,
  contentType: string | undefined,
): VerificationStatus {
  if (!finalSameSite) return "external-redirect";
  if (BLOCKED_STATUSES.includes(httpStatus)) return "blocked";
  if (httpStatus >= 400) return "http-error";
  if (!isHtmlContentType(contentType)) return "non-html";
  return "valid-html";
}

export async function verifyCandidate(
  browser: Browser,
  candidate: Candidate,
  rootUrl: string,
): Promise<CandidateVerification> {
  const t0 = Date.now();
  const base: Pick<
    CandidateVerification,
    "candidateUrl" | "normalizedCandidateUrl"
  > = {
    candidateUrl: candidate.candidateUrl,
    normalizedCandidateUrl: candidate.normalizedCandidateUrl,
  };

  const context = await browser.newContext({
    viewport: { width: VERIFIER_VIEWPORT.width, height: VERIFIER_VIEWPORT.height },
    locale: OBSERVATION_LOCALE,
    timezoneId: OBSERVATION_TIMEZONE,
    colorScheme: OBSERVATION_COLOR_SCHEME as "light",
    reducedMotion: OBSERVATION_REDUCED_MOTION as "no-preference",
  });
  try {
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT_MS);

    // Capture the last main-frame navigation response. Non-HTML responses (e.g.
    // application/pdf) make Chromium abort the navigation to download the file,
    // so `page.goto` throws WITHOUT returning a Response — but the response event
    // still fired, so we can still read its status/content-type and classify it
    // as `non-html` instead of a navigation-error.
    let capturedResponse: Response | null = null;
    page.on("response", (resp) => {
      const req = resp.request();
      if (req.isNavigationRequest() && resp.frame() === page.mainFrame()) {
        capturedResponse = resp;
      }
    });

    let response: Response | null = null;
    let gotoError: unknown;
    try {
      response = await page.goto(candidate.candidateUrl, {
        waitUntil: WAIT_UNTIL,
        timeout: NAV_TIMEOUT_MS,
      });
    } catch (err) {
      gotoError = err;
    }

    // Prefer goto's response; fall back to the captured navigation response when
    // goto threw or returned null (download-abort case).
    const finalResponse: Response | null = response ?? capturedResponse;
    if (!finalResponse) {
      return {
        ...base,
        status: "navigation-error",
        redirected: false,
        redirectCount: 0,
        timingMs: Date.now() - t0,
        error: gotoError ? sanitizeError(gotoError) : "no main-document response",
      };
    }
    response = finalResponse;

    // page.url() may still be about:blank after a download-abort; fall back to
    // the response URL so finalUrl always reflects the fetched document.
    const pageUrl = page.url();
    const finalUrl =
      pageUrl && pageUrl !== "about:blank" ? pageUrl : response.url();
    const httpStatus = response.status();
    const contentType = contentTypeEssence(response.headers()["content-type"]);
    const finalSameSite = isSameSite(finalUrl, rootUrl);

    const { chain, count: redirectCount } = await buildRedirectChain(
      response.request(),
    );
    const finalNorm = normalizeUrl(finalUrl) ?? finalUrl;
    const redirected =
      redirectCount > 0 || finalNorm !== candidate.normalizedCandidateUrl;

    const status = classify(finalSameSite, httpStatus, contentType);

    const result: CandidateVerification = {
      ...base,
      status,
      httpStatus,
      ...(contentType ? { contentType } : {}),
      finalUrl,
      finalSameSite,
      redirected,
      redirectCount,
      ...(redirectCount > 0 ? { redirectChain: chain } : {}),
      timingMs: 0, // filled in below
    };

    // Identity signals + fingerprints only for usable HTML pages — keeps the
    // filter fast and avoids reading content from error / non-html / external
    // responses.
    if (status === "valid-html") {
      await page.waitForTimeout(SETTLE_MS);
      let signals: RawSignals | null = null;
      try {
        await installNameShim(page);
        signals = await page.evaluate(collectSignalsInBrowser, SIGNALS_CONFIG);
      } catch {
        signals = null;
      }
      if (signals) {
        if (signals.title) result.title = signals.title;
        if (signals.canonicalHref) {
          try {
            const canonicalUrl = new URL(signals.canonicalHref, finalUrl).toString();
            result.canonicalUrl = canonicalUrl;
            result.canonicalSameSite = isSameSite(canonicalUrl, rootUrl);
          } catch {
            // Unresolvable canonical href: ignore (hint only, never enforced).
          }
        }
        if (signals.metaRobots != null) result.metaRobots = signals.metaRobots;
        result.bodyTextLength = signals.bodyTextLength;
        result.domElementCount = signals.domElementCount;
        result.fingerprints = buildFingerprints(signals);
      }

      // Coarse structural profile (Task 08) — a second lightweight tag-only walk
      // of the same already-loaded DOM. Deliberately NOT folded into the walk
      // above: that one produces the exact Task 06 structure signature and its
      // output must stay byte-identical. Still no styles / geometry / assets, so
      // verification remains far cheaper than an observation.
      try {
        const raw = await page.evaluate(
          collectStructuralRawInBrowser,
          STRUCTURAL_RAW_CONFIG,
        );
        result.structuralProfile = buildStructuralProfile(raw);
      } catch {
        // A page that blocks evaluation still verifies; it just cannot join a
        // structural family later.
      }
    }

    result.timingMs = Date.now() - t0;
    return result;
  } finally {
    await context.close();
  }
}
