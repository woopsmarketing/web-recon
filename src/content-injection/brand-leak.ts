import type { SlotValue } from "../recon-template/types.js";
import {
  brandTokensFromHost,
  containsBrandToken,
  scanRuntimeTemplateSurfaces,
  type BrandSurface,
} from "./brand-surfaces.js";
import type { LoadedReconTemplate } from "./load-template.js";
import {
  BrandLeakReportSchema,
  CONTENT_SCHEMA_VERSION,
  type BrandLeakReport,
  type BrandLeakWarning,
  type ContentUnitsFile,
} from "./types.js";

/**
 * Source-brand leak detection (Task 19 §16).
 *
 * When a Stripe-derived template is repurposed, nothing of Stripe's own
 * identity may survive as if it were a fact about the NEW site. This is a
 * deterministic MVP scan — no NER, no AI: it derives brand tokens from the
 * source host and flags editable in-scope slots whose EFFECTIVE value (after
 * the overlay) still carries the source brand or an original external
 * destination. Everything found is a WARNING for the operator report, never a
 * silent rewrite.
 */

/** The token primitives moved to `brand-surfaces.ts` (Task 27) so the wider
 *  surface scan and this slot scan share ONE definition of "the source brand";
 *  re-exported here because `brandTokensFromHost` is part of the public
 *  content-injection barrel. */
export { brandTokensFromHost };

/**
 * PERCENT-ENCODING HID THE BRAND FROM THIS SCAN (found by the Phase 9/10
 * verifier, fixed in the correction pass). `containsBrandToken` requires a
 * non-alphanumeric boundary around the token; inside a query string the
 * separator is `%20`, whose last character is a DIGIT, so
 * `?message=...%20Linear%20...` matched nothing and one written url carrying
 * the source brand was reported by no scanner at all. A url is scanned in both
 * its raw and its decoded form; a malformed escape decodes to itself.
 */
function decodedForm(value: string): string | undefined {
  if (!/%[0-9a-f]{2}/i.test(value)) return undefined;
  try {
    const decoded = decodeURIComponent(value);
    return decoded === value ? undefined : decoded;
  } catch {
    return undefined;
  }
}

function textOf(value: SlotValue | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return [value.src, value.alt ?? "", value.srcset ?? ""].join(" ");
  }
  return undefined;
}

/**
 * Surface-scoped source-brand findings from the template's RUNTIME IR
 * (Task 28 CR8) — the inline-SVG and attribute surfaces that carry the source
 * mark but bind to NO editable slot, so `detectSourceBrandLeaks` (which
 * iterates slots) structurally cannot see them.
 *
 * DEDUPLICATED BY VALUE: one `<symbol id="stripe-logo">` reused on 20 routes
 * across 2 viewports is ONE finding carrying `occurrences: 40`, not 40 lines.
 * Without that, a large template would bury the slot-scoped findings the
 * operator can actually act on.
 *
 * `source-url` hits are deliberately NOT emitted here: an external destination
 * that is still the source site's is already the slot-scoped
 * `original-external-url-*` kind, and every source-host href/src is already
 * counted by the release layer's own surface scan.
 */
const SURFACE_KINDS = [
  "svg-aria-label",
  "svg-symbol-id",
  "svg-text",
  "image-alt",
  "aria-label",
] as const satisfies readonly BrandSurface[];

type SurfaceKind = (typeof SURFACE_KINDS)[number];

function isSurfaceKind(surface: BrandSurface): surface is SurfaceKind {
  return (SURFACE_KINDS as readonly BrandSurface[]).includes(surface);
}

export async function detectTemplateBrandSurfaceLeaks(
  template: LoadedReconTemplate,
): Promise<BrandLeakWarning[]> {
  const host = template.manifest.source.host;
  const scan = await scanRuntimeTemplateSurfaces({
    templateAppDir: template.appDir,
    sourceHost: host,
  });
  const byValue = new Map<
    string,
    { kind: SurfaceKind; value: string; matched: string; route: string; nodeId: string | null; occurrences: number }
  >();
  for (const hit of scan.hits) {
    if (!isSurfaceKind(hit.surface)) continue;
    const key = `${hit.surface}|${hit.value}|${hit.matched}`;
    const existing = byValue.get(key);
    if (existing !== undefined) {
      existing.occurrences += 1;
      continue;
    }
    byValue.set(key, {
      kind: hit.surface,
      value: hit.value,
      matched: hit.matched,
      route: hit.route,
      nodeId: hit.nodeId,
      occurrences: 1,
    });
  }
  return [...byValue.values()]
    .sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.value < b.value ? -1 : a.value > b.value ? 1 : 0))
    .map((entry) => ({
      issue: "source-brand-leak" as const,
      // No slot binds this surface — a fabricated slot key would be worse than
      // an honest null.
      slotKey: null,
      kind: entry.kind,
      severity: "warning" as const,
      surface: entry.kind,
      nodeId: entry.nodeId,
      route: entry.route,
      occurrences: entry.occurrences,
      detail:
        `template markup surface "${entry.kind}" still carries source brand token ` +
        `"${entry.matched}" (${JSON.stringify(entry.value)}) — ${entry.occurrences} occurrence(s); ` +
        "no slot binds this surface, so it cannot be authored away (detection only)",
    }));
}

export function detectSourceBrandLeaks(
  template: LoadedReconTemplate,
  unitsFile: ContentUnitsFile,
  effectiveValues: Map<string, SlotValue>,
  changedKeys: Set<string>,
  /**
   * Slot keys the user targeted but that stayed at their default because of a
   * named ENGINE limitation (unresolved reason carrying the
   * `engine-limitation` marker). Task 19.1 §13: these are BLOCKERS, not the
   * ordinary kept-default warnings — the user asked for a change and the
   * engine could not deliver it.
   */
  engineBlockedKeys: Set<string> = new Set(),
  /**
   * Surface-scoped findings from `detectTemplateBrandSurfaceLeaks` (Task 28
   * CR8). Passed IN rather than scanned here so this function stays sync and
   * pure over the values it was given.
   */
  surfaceWarnings: readonly BrandLeakWarning[] = [],
): BrandLeakReport {
  const host = template.manifest.source.host;
  const brandTokens = brandTokensFromHost(host);
  const warnings: BrandLeakWarning[] = [];
  let scanned = 0;

  for (const unit of unitsFile.units) {
    for (const slot of unit.slots) {
      const effective = effectiveValues.get(slot.key) ?? slot.currentValue;
      const text = textOf(effective);
      if (text === undefined) continue;
      scanned++;
      const changed = changedKeys.has(slot.key);

      if (!changed && engineBlockedKeys.has(slot.key)) {
        warnings.push({
          issue: "source-brand-leak",
          slotKey: slot.key,
          kind: "blocked-visible-source-content",
          severity: "blocker",
          detail:
            "user selected this visible content for change but an engine limitation kept the source default",
        });
        continue;
      }

      const decoded = slot.type === "url" ? decodedForm(text) : undefined;
      const hitToken = brandTokens.find((token) => containsBrandToken(text, token));
      const decodedHitToken =
        hitToken === undefined && decoded !== undefined
          ? brandTokens.find((token) => containsBrandToken(decoded, token))
          : undefined;
      const token = hitToken ?? decodedHitToken;
      if (token !== undefined) {
        const where = hitToken !== undefined ? "" : " (percent-decoded form)";
        warnings.push({
          issue: "source-brand-leak",
          slotKey: slot.key,
          kind: changed ? "brand-token-in-value" : "brand-token-in-untouched-default",
          detail: changed
            ? `generated value still contains source brand token "${token}"${where}`
            : `editable slot kept its default, which contains source brand token "${token}"${where}`,
        });
        continue;
      }

      // Original external destinations: an external URL that is still exactly
      // the source site's default is not production-ready (§17).
      if (slot.type === "url" && slot.urlKind === "external") {
        const defaultValue = typeof slot.currentValue === "string" ? slot.currentValue : undefined;
        if (typeof effective === "string" && effective === defaultValue) {
          warnings.push({
            issue: "source-brand-leak",
            slotKey: slot.key,
            kind: changed
              ? "original-external-url-retained"
              : "original-external-url-in-untouched-default",
            detail: `external URL still points at the source site's destination (${effective.slice(0, 80)})`,
          });
        }
      }
    }
  }

  return BrandLeakReportSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    brandTokens,
    scannedSlots: scanned,
    // Slot-scoped findings first (they have a write target), surface-scoped
    // findings after.
    warnings: [...warnings, ...surfaceWarnings],
  });
}
