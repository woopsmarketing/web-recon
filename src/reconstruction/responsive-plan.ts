import type { SiteSpec } from "../sitespec/index.js";
import { ReconstructionError, type BreakpointSpec } from "./types.js";

/**
 * Breakpoint inference (items 28, 29).
 *
 * Task 13 states plainly that it observed two endpoints and nothing between
 * them, and it keeps `inferredBreakpoints: []` empty on purpose so that a number
 * nobody measured can never be mistaken for one somebody did. Task 14 is the
 * layer allowed to make that inference, because it is the layer that has to
 * choose ONE number in order to emit a media query at all.
 *
 * The rule is the midpoint of the two observed widths, rounded down, and it is
 * the same rule for every site — no per-site table, no 768, no 1024 (item 114).
 * With the corpus's 390 / 1440 endpoints that is 915.
 *
 * Convention, stated once and implemented once (item 28):
 *
 *   width  <  breakpoint   → the MOBILE tree is the visible one
 *   width >=  breakpoint   → the DESKTOP tree is the visible one
 *
 * `provenance` is `inferred` (or `operator-override` for `--breakpoint N`) and
 * never `observed`. Task 15 gets to disagree with the number; what it must not
 * be able to do is mistake it for evidence.
 */

export const BREAKPOINT_CONVENTION =
  "mobile: width < breakpoint; desktop: width >= breakpoint";

export interface InferBreakpointOptions {
  /** `--breakpoint N`. Recorded as an operator override, not as observation. */
  override?: number;
}

export function inferBreakpoint(
  siteSpec: SiteSpec,
  options: InferBreakpointOptions = {},
): BreakpointSpec {
  const profiles = siteSpec.responsiveModel.observedViewports;
  const mobile = profiles.find((p) => p.id === "mobile");
  const desktop = profiles.find((p) => p.id === "desktop");
  if (!mobile || !desktop) {
    throw new ReconstructionError(
      `the SiteSpec's responsive model does not carry both observed viewport ` +
        `endpoints (found: ${profiles.map((p) => p.id).join(", ") || "none"}). ` +
        `A breakpoint cannot be inferred from one endpoint, and this generator ` +
        `does not fall back to a conventional number.`,
    );
  }
  if (!(desktop.width > mobile.width)) {
    throw new ReconstructionError(
      `observed desktop width (${desktop.width}) is not greater than observed ` +
        `mobile width (${mobile.width}); there is no midpoint to infer.`,
    );
  }

  if (options.override !== undefined) {
    const value = Math.trunc(options.override);
    if (!Number.isFinite(value) || value <= 0) {
      throw new ReconstructionError(
        `--breakpoint must be a positive integer (got ${options.override})`,
      );
    }
    return {
      value,
      provenance: "operator-override",
      method: "cli-override",
      mobileObservedWidth: mobile.width,
      desktopObservedWidth: desktop.width,
      convention: BREAKPOINT_CONVENTION,
    };
  }

  return {
    value: Math.floor((mobile.width + desktop.width) / 2),
    provenance: "inferred",
    method: "observed-endpoint-midpoint",
    mobileObservedWidth: mobile.width,
    desktopObservedWidth: desktop.width,
    convention: BREAKPOINT_CONVENTION,
  };
}

/**
 * The two media queries that implement the convention above.
 *
 * The mobile query stops at `breakpoint - 0.02px` rather than `breakpoint - 1px`
 * because viewport widths are fractional on fractional-DPR displays, and a 1px
 * gap would leave both variants hidden at, say, 914.5px. 0.02px is below the
 * smallest width a browser reports and above nothing at all.
 */
export function breakpointMediaQueries(breakpoint: number): {
  desktop: string;
  mobile: string;
} {
  return {
    desktop: `(min-width: ${breakpoint}px)`,
    mobile: `(max-width: ${(breakpoint - 0.02).toFixed(2)}px)`,
  };
}
