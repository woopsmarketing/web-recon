import type { Page } from "playwright";
import { INITIAL_PAINT_STATE_KEY, MAX_INITIAL_PAINT_ELEMENTS } from "./types.js";

/**
 * Task 28.75 — the INITIAL-PAINT CENSUS, extracted so there is exactly ONE
 * implementation and any Playwright caller can run it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS MODULE EXISTS
 * ---------------------------------------------------------------------------
 * The census used to be a private function inside `observe-page.ts`. The
 * page-state normalizer READS it — `appeared-after-initial-paint` is one of its
 * three STRONG signals — but nothing outside the observer could INSTALL it, so
 * `normalizePageState` was effectively observer-only. Meanwhile the QA source
 * capture rendered the same pages with their entry popups still open, and the
 * clone was charged for content the engine had deliberately dismissed.
 *
 * Extracting the census makes the page-state policy reusable as ONE shared
 * implementation. See `docs/result/28.75/page-state-api-contract.md` for the
 * two-call contract every caller must follow.
 *
 * NOTHING about the document is retained beyond the load: the census parks two
 * `WeakSet`s on the page; readers test membership and never enumerate them.
 */

/**
 * tsx/esbuild wraps named functions with a module-local `__name` helper to
 * preserve `Function.name`. That helper does not exist in the browser, so ANY
 * serialized function handed to `page.evaluate` can throw
 * `__name is not defined`. Install a no-op shim first (as a string, so it is
 * not itself transformed).
 *
 * Idempotent and never throws — every public entry point in this lane installs
 * it for itself, so an external caller cannot lose a phase to a missing shim.
 */
export async function installBrowserNameShim(page: Page): Promise<void> {
  const install = (): Promise<unknown> =>
    page.evaluate(
      "globalThis.__name = globalThis.__name || function (fn) { return fn; };",
    );
  try {
    await install();
  } catch {
    // One retry, then continue. A transient failure to install a no-op shim
    // must not cost the caller its page; if the shim is genuinely missing, the
    // pass that follows fails loudly and for the right reason instead of this
    // line failing for the wrong one.
    await install().catch(() => {});
  }
}

/**
 * Task 28.6 C2 B5 — the in-page pass, taken immediately after `load` and before
 * any stabilization, networkidle wait or preparation scroll.
 *
 * This is the overlay census's and the page-state normalizer's ONLY time-based
 * discriminator, and the reason either can tell an entry popup that appeared
 * later from a legitimate cover section that was there from the first paint.
 *
 * Read-only, and bounded: a document larger than the cap records the elements it
 * reached and says so, so a partial census can never be mistaken for a complete
 * one.
 *
 * Serialized by `page.evaluate`, so it may reference only its own argument and
 * browser globals — no imports, no closures.
 */
export function markInitialPaintInBrowser(arg: {
  key: string;
  maxElements: number;
}): {
  elements: number;
  capHit: boolean;
} {
  const present = new WeakSet<Element>();
  const visible = new WeakSet<Element>();
  const all = document.getElementsByTagName("*");
  let seen = 0;
  let capHit = false;
  for (let i = 0; i < all.length; i++) {
    if (seen >= arg.maxElements) {
      capHit = true;
      break;
    }
    const el = all[i]!;
    seen++;
    present.add(el);
    const cs = getComputedStyle(el);
    if (cs.display === "none") continue;
    if (cs.visibility === "hidden" || cs.visibility === "collapse") continue;
    if (parseFloat(cs.opacity || "1") === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    visible.add(el);
  }
  (window as unknown as Record<string, unknown>)[arg.key] = {
    present,
    visible,
    elements: seen,
    capHit,
  };
  return { elements: seen, capHit };
}

/** What {@link markInitialPaintCensus} reports back. */
export interface InitialPaintCensusResult {
  /**
   * The census was installed AND is complete, so
   * `appeared-after-initial-paint` can contribute evidence on this page-load.
   * `false` when the evaluate failed, or when the document was larger than
   * `maxElements` (a PARTIAL census is refused — see the module note).
   */
  usable: boolean;
  /** Elements the census reached. */
  elements: number;
  /** The census stopped at `maxElements`; it describes only part of the page. */
  capHit: boolean;
  /** First line of the failure, when the census could not be installed at all. */
  error?: string;
}

/**
 * CALL 1 OF THE TWO-CALL PAGE-STATE CONTRACT.
 *
 * Run this on a Playwright `Page` IMMEDIATELY after the navigation resolves
 * (`waitUntil: "load"`) and BEFORE anything that lets the page settle — no
 * networkidle wait, no fonts wait, no scroll. "What painted at the initial
 * paint" is only true if nothing has yet had time to open a popup.
 *
 *   await page.goto(url, { waitUntil: "load" });
 *   await markInitialPaintCensus(page);          // ← here, and only here
 *   …settle…
 *   await normalizePageState(page, { … });       // CALL 2
 *
 * Never throws. A failure degrades to `{usable: false}` and the normalizer then
 * records `initialPaintCensusStatus` accordingly instead of guessing.
 */
export async function markInitialPaintCensus(
  page: Page,
  options: { maxElements?: number } = {},
): Promise<InitialPaintCensusResult> {
  await installBrowserNameShim(page);
  try {
    const out = await page.evaluate(markInitialPaintInBrowser, {
      key: INITIAL_PAINT_STATE_KEY,
      maxElements: options.maxElements ?? MAX_INITIAL_PAINT_ELEMENTS,
    });
    return { usable: !out.capHit, elements: out.elements, capHit: out.capHit };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return {
      usable: false,
      elements: 0,
      capHit: false,
      error: raw.split("\n", 1)[0]!.trim().slice(0, 300),
    };
  }
}
