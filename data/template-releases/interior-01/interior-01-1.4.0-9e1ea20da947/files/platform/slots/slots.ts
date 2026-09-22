import { z } from "zod";
import { AssetRefSchema } from "../content/schema";

/**
 * Minimal Slot model — section-level semantic copy/link/media placeholders.
 *
 * NOT the legacy DOM-based Slot V2 / Slotized V1 system (superseded, never imported).
 *   - no DOM slots, no CSS slots, no arbitrary JSON slots, no per-item slots
 *   - a slot belongs to ONE declared section of ONE Template
 *   - 4 closed value types: text · richText · link · media
 *
 * Boundaries:
 *   project items → ContentReader · enabled/limit/selection → Settings
 *   colors/typography → Theme · name/logo/domain → Identity/Asset
 *   section title/copy/CTA/media → Slot
 *
 * Fallback order (accepted doctrine):
 *   site slot value → content binding (if declared) → neutral UI default (if allowed)
 *   → hide (optional) → needs-input (required: the build fails, nothing is invented)
 */

export const SLOT_TYPES = ["text", "richText", "link", "media"] as const;
export type SlotType = (typeof SLOT_TYPES)[number];

/** Closed content-binding vocabulary. Bindings READ content; slots never copy it. */
export const CONTENT_BINDINGS = ["business.summary"] as const;
export type ContentBinding = (typeof CONTENT_BINDINGS)[number];

interface SlotBase {
  required?: boolean;
  /** Neutral, non-factual UI default (e.g. "Contact"). Never a business claim. */
  neutralDefault?: string;
  binding?: ContentBinding;
}
export type SlotDeclaration =
  | (SlotBase & { type: "text"; maxLength: number })
  | (SlotBase & { type: "richText"; maxParagraphs: number; maxParagraphLength: number })
  | { type: "link"; required?: boolean }
  | { type: "media"; required?: boolean };

export type SlotDeclarations = Record<string, SlotDeclaration>;

// ------------------------------------------------------------ value schemas --

const PlainText = z
  .string()
  .trim()
  .min(1)
  .refine((v) => !/[<>]/.test(v), { message: "slot text is plain text (no markup)" });

/**
 * Link hrefs: site-internal paths (never protocol-relative), on-page anchors, mailto, tel.
 * External https links are NOT accepted in this Slice (package QA refuses off-origin
 * links; an explicit external-link policy comes with a consuming section).
 */
export const SlotLinkSchema = z
  .object({
    label: PlainText.pipe(z.string().max(40)),
    href: z
      .string()
      .regex(/^(\/(?!\/)[a-z0-9\-/]*|#[a-z0-9-]+|mailto:[^\s<>"/]+@[^\s<>"/]+|tel:\+?[0-9\-\s]+)$/i, {
        message: "link href must be /path, #anchor, mailto: or tel:",
      }),
  })
  .strict();
export type SlotLink = z.infer<typeof SlotLinkSchema>;

export const SlotMediaSchema = z.object({ asset: AssetRefSchema, alt: z.string().trim().max(160) }).strict();
export type SlotMedia = z.infer<typeof SlotMediaSchema>;

/** richText = plain paragraphs. No HTML, no marks yet (widen only on evidence). */
export type RichText = { paragraphs: string[] };

function valueSchema(decl: SlotDeclaration): z.ZodTypeAny {
  switch (decl.type) {
    case "text":
      return PlainText.pipe(z.string().max(decl.maxLength));
    case "richText":
      return z
        .object({ paragraphs: z.array(PlainText.pipe(z.string().max(decl.maxParagraphLength))).min(1).max(decl.maxParagraphs) })
        .strict();
    case "link":
      return SlotLinkSchema;
    case "media":
      return SlotMediaSchema;
  }
}

// --------------------------------------------------------- stored document --

export const SiteSlotsDocSchema = z
  .object({
    schemaVersion: z.literal(1),
    templateId: z.string().min(1),
    values: z.record(z.string(), z.record(z.string(), z.unknown())),
  })
  .strict();
export type SiteSlotsDoc = z.infer<typeof SiteSlotsDocSchema>;

export class SlotError extends Error {
  constructor(
    message: string,
    readonly needsInput: string[] = [],
  ) {
    super(message);
    this.name = "SlotError";
  }
}

export type SlotValue = string | RichText | SlotLink | SlotMedia;
export type ResolvedSlotSource = "site" | "binding" | "neutral-default" | "hidden";
export interface ResolvedSlot {
  value: SlotValue | undefined;
  source: ResolvedSlotSource;
}
export type ResolvedSlots = Record<string, Record<string, ResolvedSlot>>;

/**
 * Resolve every declared slot of every section. Unknown section/slot keys and
 * wrong value types fail. Missing required values fail with a needs-input list.
 */
export function resolveSlots(
  template: { id: string; sections: Record<string, { slots?: SlotDeclarations }> },
  rawDoc: unknown | undefined,
  bindings: Partial<Record<ContentBinding, string | undefined>>,
): ResolvedSlots {
  let values: SiteSlotsDoc["values"] = {};
  if (rawDoc !== undefined) {
    const parsed = SiteSlotsDocSchema.safeParse(rawDoc);
    if (!parsed.success) throw new SlotError(`site slots invalid: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
    if (parsed.data.templateId !== template.id) {
      throw new SlotError(`site slots are for template "${parsed.data.templateId}" but the build uses "${template.id}"`);
    }
    values = parsed.data.values;
  }
  for (const [section, sectionValues] of Object.entries(values)) {
    const decls = template.sections[section]?.slots;
    if (!decls) throw new SlotError(`unknown slot section "${section}" (not declared by template "${template.id}")`);
    for (const key of Object.keys(sectionValues)) {
      if (!Object.hasOwn(decls, key)) throw new SlotError(`unknown slot "${section}.${key}"`);
    }
  }

  const out: ResolvedSlots = {};
  const needsInput: string[] = [];
  for (const [section, { slots }] of Object.entries(template.sections)) {
    out[section] = {};
    for (const [key, decl] of Object.entries(slots ?? {})) {
      const raw = values[section]?.[key];
      let resolved: ResolvedSlot = { value: undefined, source: "hidden" };
      if (raw !== undefined) {
        const r = valueSchema(decl).safeParse(raw);
        if (!r.success) throw new SlotError(`slot "${section}.${key}" (${decl.type}) invalid: ${r.error.issues.map((i) => i.message).join("; ")}`);
        resolved = { value: r.data as SlotValue, source: "site" };
      } else if ((decl.type === "text" || decl.type === "richText") && decl.binding && bindings[decl.binding]) {
        const bound = bindings[decl.binding]!;
        // Bound content is validated against the SLOT's contract too (type, plain text, length).
        resolved = { value: validated(section, key, decl, decl.type === "text" ? bound : { paragraphs: [bound] }, "bound value"), source: "binding" };
      } else if ((decl.type === "text" || decl.type === "richText") && decl.neutralDefault !== undefined) {
        const d = decl.neutralDefault;
        resolved = { value: validated(section, key, decl, decl.type === "text" ? d : { paragraphs: [d] }, "template neutral default"), source: "neutral-default" };
      } else if (decl.required) {
        needsInput.push(`${section}.${key}`);
      }
      out[section]![key] = resolved;
    }
  }
  if (needsInput.length > 0) throw new SlotError(`needs-input: required slot(s) without value: ${needsInput.join(", ")}`, needsInput);
  return out;
}

function validated(section: string, key: string, decl: SlotDeclaration, value: unknown, what: string): SlotValue {
  const r = valueSchema(decl).safeParse(value);
  if (!r.success) throw new SlotError(`slot "${section}.${key}" ${what} invalid: ${r.error.issues.map((i) => i.message).join("; ")}`);
  return r.data as SlotValue;
}

/** Typed accessors for template code. Unknown section/slot keys throw (no silent typos). */
export interface SlotReader {
  text(section: string, key: string): string | undefined;
  richText(section: string, key: string): RichText | undefined;
  link(section: string, key: string): SlotLink | undefined;
  media(section: string, key: string): SlotMedia | undefined;
}

export function createSlotReader(resolved: ResolvedSlots, template: { sections: Record<string, { slots?: SlotDeclarations }> }): SlotReader {
  function get(section: string, key: string, type: SlotType) {
    const decl = template.sections[section]?.slots?.[key];
    if (!decl) throw new SlotError(`template reads undeclared slot "${section}.${key}"`);
    if (decl.type !== type) throw new SlotError(`slot "${section}.${key}" is ${decl.type}, read as ${type}`);
    return resolved[section]?.[key]?.value;
  }
  return {
    text: (s, k) => get(s, k, "text") as string | undefined,
    richText: (s, k) => get(s, k, "richText") as RichText | undefined,
    link: (s, k) => get(s, k, "link") as SlotLink | undefined,
    media: (s, k) => get(s, k, "media") as SlotMedia | undefined,
  };
}
