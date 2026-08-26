/**
 * Natural-language resolution seam (spec §10).
 *
 * The operator's primary input stays natural language ("도메인은 https://abc.ai이고
 * 회사명은 ABC AI야 …"). This module is the provider-neutral seam that turns
 * such text into a production-resolution-v1 pack:
 *
 *   ResolutionParser        the whole provider contract — parse(text) → pack
 *   ManualJsonResolutionParser  the shipped provider: the operator (or an
 *                           operator-driven LLM session, as the accepted
 *                           stripe content run already does for content)
 *                           converts the sentence to JSON by hand
 *
 * No remote LLM API is wired in this task (spec §10 explicitly allows manual
 * conversion). WHATEVER produced the JSON, the output must pass the
 * production-resolution-v1 validator — release:resolve enforces that gate.
 */
import { ProductionResolutionSchema, type ProductionResolution } from "./types.js";

export interface ResolutionParser {
  name: string;
  /** Turn operator text into a resolution pack. MUST validate before return. */
  parse(text: string): Promise<ProductionResolution>;
}

/** The shipped provider: input IS the JSON (manually converted from language). */
export class ManualJsonResolutionParser implements ResolutionParser {
  name = "manual-json";
  async parse(text: string): Promise<ProductionResolution> {
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (error) {
      throw new Error(
        "manual-json parser expects a production-resolution-v1 JSON document " +
          "(convert the natural-language request by hand or with your own LLM session): " +
          (error instanceof Error ? error.message : String(error)),
      );
    }
    return ProductionResolutionSchema.parse(raw);
  }
}

const PARSERS: Record<string, () => ResolutionParser> = {
  "manual-json": () => new ManualJsonResolutionParser(),
};

export function resolveResolutionParser(name: string): ResolutionParser {
  const factory = PARSERS[name];
  if (factory === undefined) {
    throw new Error(
      `no resolution parser named "${name}" — available: ${Object.keys(PARSERS).join(", ")}. ` +
        "An LLM-backed parser plugs in here without touching the validator gate.",
    );
  }
  return factory();
}
