import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ContentBriefSchema,
  ContentInputError,
  type BriefGap,
  type ContentBrief,
  type ProvidedFact,
} from "./types.js";

/**
 * ONE BRIEF → FIRST DRAFT (Task 27 §5).
 *
 * The failure mode this module exists to prevent is interactive question
 * bombardment: an engine that refuses to draft anything until the operator has
 * answered fifteen questions. So EVERY FIELD IS OPTIONAL — the same rule
 * `src/release/checklist.ts` (~104-115) states for the release checklist
 * ("Every field optional — this is NOT an intake form").
 *
 * A missing non-essential field is REPORTED as a gap in the packet, with what
 * it costs, and generation proceeds. The single essential input is what the
 * site is for, and it arrives as free text (`goal`, or the caller's raw
 * intent) — never as a form.
 */

export async function loadContentBrief(file: string): Promise<ContentBrief> {
  let raw: string;
  try {
    raw = await readFile(path.resolve(file), "utf8");
  } catch {
    throw new ContentInputError(`cannot read brief ${file}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ContentInputError(`${file} is not valid JSON`);
  }
  const brief = ContentBriefSchema.safeParse(parsed);
  if (!brief.success) {
    throw new ContentInputError(
      `${file} is not a content brief: ${brief.error.issues
        .slice(0, 5)
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }
  return brief.data;
}

/** Preferences a generator reads as strings. Only what the brief actually said. */
export function briefPreferences(brief: ContentBrief | undefined): Record<string, string> {
  if (brief === undefined) return {};
  const out: Record<string, string> = {};
  if (brief.workingName !== undefined) out["workingName"] = brief.workingName;
  if (brief.category !== undefined) out["category"] = brief.category;
  if (brief.audience !== undefined) out["audience"] = brief.audience;
  if (brief.positioning !== undefined) out["positioning"] = brief.positioning;
  if (brief.primaryConversion !== undefined) out["primaryConversion"] = brief.primaryConversion;
  if (brief.tone !== undefined && brief.tone.length > 0) out["tone"] = brief.tone.join(", ");
  return out;
}

export function briefFacts(brief: ContentBrief | undefined): ProvidedFact[] {
  return brief?.facts ?? [];
}

/**
 * NON-ESSENTIAL gaps only. Nothing here blocks a draft; each entry says what
 * the engine will do instead, so the operator can decide whether to care.
 */
const NON_ESSENTIAL_GAPS: { field: string; has: (b: ContentBrief) => boolean; consequence: string }[] = [
  { field: "workingName", has: (b) => b.workingName !== undefined, consequence: "the generator picks a placeholder name; rename later without regenerating" },
  { field: "category", has: (b) => b.category !== undefined, consequence: "positioning is inferred from the raw intent only" },
  { field: "audience", has: (b) => b.audience !== undefined, consequence: "copy is written for a general reader" },
  { field: "primaryConversion", has: (b) => b.primaryConversion !== undefined, consequence: "CTA wording is generic; no conversion goal is asserted" },
  { field: "tone", has: (b) => b.tone !== undefined && b.tone.length > 0, consequence: "a neutral professional tone is used" },
  { field: "facts", has: (b) => b.facts !== undefined && b.facts.length > 0, consequence: "every verifiable claim stays needs-input under verified-only" },
];

export function briefGaps(brief: ContentBrief | undefined): BriefGap[] {
  const value = brief ?? {};
  return NON_ESSENTIAL_GAPS.filter((gap) => !gap.has(value)).map((gap) => ({
    field: gap.field,
    consequence: gap.consequence,
  }));
}
