import type { SlotValue } from "../recon-template/types.js";
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

/** `stripe.com` → ["stripe"]; `foo-bar.co.kr` → ["foo-bar", "foo", "bar"]. */
export function brandTokensFromHost(host: string): string[] {
  const first = host.toLowerCase().split(".")[0];
  const tokens = new Set<string>([first]);
  for (const part of first.split(/[-_]/)) {
    if (part.length >= 4) tokens.add(part);
  }
  return [...tokens].filter((t) => t.length >= 3).sort();
}

function containsToken(value: string, token: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, "i").test(value);
}

function textOf(value: SlotValue | undefined): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    return [value.src, value.alt ?? "", value.srcset ?? ""].join(" ");
  }
  return undefined;
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

      const hitToken = brandTokens.find((token) => containsToken(text, token));
      if (hitToken !== undefined) {
        warnings.push({
          issue: "source-brand-leak",
          slotKey: slot.key,
          kind: changed ? "brand-token-in-value" : "brand-token-in-untouched-default",
          detail: changed
            ? `generated value still contains source brand token "${hitToken}"`
            : `editable slot kept its default, which contains source brand token "${hitToken}"`,
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
    warnings,
  });
}
