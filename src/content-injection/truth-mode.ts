import type { SlotValue } from "../recon-template/types.js";
import type { LoadedReconTemplate } from "./load-template.js";
import {
  DEFAULT_CONTENT_TRUTH_MODE,
  type ContentGenerationResult,
  type ContentTruthMode,
  type ProvidedFact,
  type TruthModeDecision,
  type UnresolvedSlot,
} from "./types.js";

/**
 * Content truth mode enforcement (Task 27 §4).
 *
 * Task 19's `no-invented-facts` policy rule bound only the PROMPT: a provider
 * that ignored it produced a plausible-looking claim and nothing downstream
 * objected. This module makes the rule an ENGINE behaviour, deterministically
 * and without an LLM:
 *
 *   verified-only      a fact-shaped value the user did not back is REFUSED —
 *                      the key leaves `slotValues` and becomes `unresolved`.
 *   synthetic-allowed  the same value is KEPT and marked SYNTHETIC, so the
 *                      accounting artifact can never present an invented
 *                      detail as if it were user-supplied or observed.
 *
 * What it deliberately does NOT do: judge whether generic marketing copy is
 * "true". "Practical automation for teams that value focus" is not a factual
 * claim and stays `generated-marketing` in both modes. Only the observable
 * shapes below — a counted metric, a price, a percentage, a phone number, a
 * certification, a superlative social proof, a founding date — are treated as
 * claims, because those are the ones a reader will act on.
 *
 * -------------------------------------------------------------------------
 * DEFAULT DECISION — this is a real behaviour change, not a no-op
 * -------------------------------------------------------------------------
 * `verified-only` is the DEFAULT, and that is STRICTER than every Task 19-26
 * run. Those runs had no engine enforcement at all: a fact-shaped value the
 * provider invented was applied. With this module in the ingest path, the
 * same value is withheld. Concretely, re-ingesting a HISTORICAL generation
 * result whose copy contains a percentage, a price, or "trusted by" phrasing
 * now DEMOTES that value from `slotValues` to `unresolved` (needs-input).
 * Who that can affect: anyone re-running `content:generate --result <old.json>`
 * on an archived result, and any release rerun that re-ingests one — a slot
 * that used to be applied becomes an operator ask, so a project that read
 * PRODUCTION_READY can read INPUTS_REQUIRED after a rerun.
 *
 * The default is kept strict anyway, for three reasons:
 *   1. The demotion is LOUD, never silent. The refusal is printed by
 *      `content:generate`, listed in `truthDecisions[]` inside
 *      `slot-accounting.json`, and reported as a needs-input slot. The
 *      failure mode of the other default — shipping an unbacked "trusted by
 *      4,000 teams" to a customer's production site — is silent.
 *   2. The escape hatch is LOSSLESS. `--truth-mode synthetic-allowed` keeps
 *      every value exactly as the provider produced it, so the resulting
 *      overlay is byte-identical to the Task 19 behaviour; the only
 *      difference is that the invention is now RECORDED (origin
 *      `synthetic-fact`). Preserving history therefore costs one flag and
 *      loses nothing. Pinned by the smoke suite on a Task-19-shaped result.
 *   3. The alternative — defaulting to `synthetic-allowed` — would leave
 *      `no-invented-facts` a prompt request forever, which is the exact
 *      Task 19 gap this section was opened to close.
 */

/** Claim shapes. Every one is a pattern over the PRODUCED value, never a guess. */
const FACT_CLAIM_PATTERNS: { id: string; re: RegExp }[] = [
  {
    id: "counted-metric",
    re: /\b\d[\d,.]*\s*(?:\+|k|m|b|만|억|천)?\s*(?:customers|users|teams|companies|clients|developers|businesses|downloads|installs|고객|기업|사용자|팀)\b/i,
  },
  { id: "price", re: /(?:[$€£¥₩]\s?\d)|(?:\b\d[\d,.]*\s?(?:USD|EUR|GBP|JPY|KRW|원)\b)/i },
  { id: "percentage", re: /\b\d[\d.]*\s?%/ },
  { id: "phone-number", re: /(?:\+\d[\d\s().-]{6,}\d)|(?:\b\d{2,4}-\d{3,4}-\d{4}\b)/ },
  {
    id: "certification-or-award",
    re: /\b(?:award[- ]winning|awarded|certified|accredited|ISO\s?\d{4,5}|SOC\s?2|HIPAA|PCI[- ]DSS|patent(?:ed|s)?)\b/i,
  },
  {
    id: "superlative-social-proof",
    re: /\b(?:trusted by|used by|rated|#1|no\.\s?1|world'?s (?:largest|leading|first|best)|industry[- ]leading)\b/i,
  },
  { id: "founding-date", re: /\b(?:founded|established|since|설립)\s*(?:in\s+)?\d{4}\b/i },
];

/** `declared-synthetic` is the generator's own admission, not a pattern match. */
export const DECLARED_SYNTHETIC = "declared-synthetic";

export function resolveTruthMode(mode: ContentTruthMode | undefined): ContentTruthMode {
  return mode ?? DEFAULT_CONTENT_TRUTH_MODE;
}

/** Collapsed lowercase form, so "Trusted  By" and "trusted by" compare equal. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** The first claim shape a text value matches, or undefined. */
export function factClaimIn(value: string): string | undefined {
  for (const pattern of FACT_CLAIM_PATTERNS) {
    if (pattern.re.test(value)) return pattern.id;
  }
  return undefined;
}

/** A claim is backed when the user actually supplied the detail it states. */
export function claimBackedByFacts(value: string, providedFacts: readonly ProvidedFact[]): boolean {
  const haystack = normalize(value);
  return providedFacts.some((fact) => {
    const needle = normalize(fact.value);
    return needle.length > 0 && haystack.includes(needle);
  });
}

export interface TruthModeOutcome {
  /** The result after enforcement — the ONLY thing that may become an overlay. */
  result: ContentGenerationResult;
  decisions: TruthModeDecision[];
  /** Keys whose value is an accepted invention (synthetic-allowed only). */
  syntheticKeys: Set<string>;
  /** Keys the mode refused; they are in `result.unresolved` now. */
  refusedKeys: Set<string>;
}

/**
 * Apply the mode to a generation result. Text and url values are examined;
 * image values are not (an image is never a sentence-shaped claim, and §19
 * already routes image changes through explicit briefs).
 *
 * A value identical to the template default is NOT a new claim — it is source
 * content that survived, which `brand-leak.ts` already reports on its own axis.
 * A value whose source is `user-provided` is backed by definition.
 */
export function applyTruthMode(
  template: LoadedReconTemplate,
  mode: ContentTruthMode,
  result: ContentGenerationResult,
  providedFacts: readonly ProvidedFact[],
): TruthModeOutcome {
  const decisions: TruthModeDecision[] = [];
  const syntheticKeys = new Set<string>();
  const refusedKeys = new Set<string>();
  const declared = new Set(result.synthetic ?? []);

  const slotValues: Record<string, SlotValue> = {};
  const sources: Record<string, string> = {};
  const refused: UnresolvedSlot[] = [];

  for (const [key, value] of Object.entries(result.slotValues)) {
    const keep = (): void => {
      slotValues[key] = value;
      const source = result.sources[key];
      if (source !== undefined) sources[key] = source;
    };
    const isDeclared = declared.has(key);
    if (typeof value !== "string") {
      // An image value is never a sentence-shaped claim; only an explicit
      // declaration can make one synthetic.
      if (isDeclared && mode === "synthetic-allowed") syntheticKeys.add(key);
      keep();
      continue;
    }
    const claim = isDeclared ? DECLARED_SYNTHETIC : factClaimIn(value);
    if (claim === undefined) {
      keep();
      continue;
    }
    if (!isDeclared) {
      if (result.sources[key] === "user-provided") {
        decisions.push({
          slotKey: key,
          claim,
          decision: "backed-by-user-fact",
          detail: "value is marked user-provided; the operator supplied it",
        });
        keep();
        continue;
      }
      if (claimBackedByFacts(value, providedFacts)) {
        decisions.push({
          slotKey: key,
          claim,
          decision: "backed-by-user-fact",
          detail: "claim text is contained in a providedFacts entry",
        });
        keep();
        continue;
      }
      const original = template.defaultContent.values[key];
      if (typeof original === "string" && normalize(original) === normalize(value)) {
        // Source content that survived: reported by the brand-leak scan, not here.
        keep();
        continue;
      }
    }
    if (mode === "synthetic-allowed") {
      syntheticKeys.add(key);
      decisions.push({
        slotKey: key,
        claim,
        decision: "marked-synthetic",
        detail: "invented detail retained under synthetic-allowed; provenance recorded",
      });
      keep();
      continue;
    }
    refusedKeys.add(key);
    refused.push({
      slotKey: key,
      reason: `needs factual input: unsupported ${claim} claim (content truth mode: ${mode})`,
    });
    decisions.push({
      slotKey: key,
      claim,
      decision: "refused-unresolved",
      detail: "no providedFacts entry backs this claim; the value was withheld",
    });
  }

  const alreadyUnresolved = new Set(result.unresolved.map((item) => item.slotKey));
  const nextResult: ContentGenerationResult = {
    ...result,
    slotValues: slotValues as ContentGenerationResult["slotValues"],
    sources: sources as ContentGenerationResult["sources"],
    unresolved: [...result.unresolved, ...refused.filter((item) => !alreadyUnresolved.has(item.slotKey))],
  };
  // Always rewritten, never inherited: a key the mode refused must not keep a
  // stale synthetic marker from the provider's own draft.
  if (syntheticKeys.size > 0) nextResult.synthetic = [...syntheticKeys].sort();
  else delete nextResult.synthetic;
  return { result: nextResult, decisions, syntheticKeys, refusedKeys };
}
