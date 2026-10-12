import { z } from "zod";
import { RecordIdSchema } from "../content/schema";
import type { CollectionQuery } from "../content/reader";
import type { SlotDeclarations } from "../slots/slots";

/**
 * Template Defaults + Sparse Site Overrides = Effective Settings.
 *
 * - A Template declares every per-site key (section key → strict zod schema + defaults).
 * - A site stores only the keys it overrides, bound to ONE template id.
 * - Merge is shallow per section: an override value (object, array, discriminated
 *   selection) REPLACES the default value, it is never deep-merged.
 * - Unknown section keys, unknown fields and a template mismatch all FAIL.
 */

export interface SectionSettingsDeclaration<S extends z.ZodObject = z.ZodObject> {
  schema: S;
  defaults: z.input<S>;
  /** Section-level copy/link/media slots (platform/slots). Not settings: resolved separately. */
  slots?: SlotDeclarations;
}

export type SectionDeclarations = Record<string, SectionSettingsDeclaration>;

export type EffectiveSettings<D extends SectionDeclarations> = {
  [K in keyof D]: z.output<D[K]["schema"]>;
};

export const SiteSettingsDocSchema = z
  .object({
    schemaVersion: z.literal(1),
    templateId: z.string().min(1),
    overrides: z.record(z.string(), z.record(z.string(), z.unknown())),
  })
  .strict();
export type SiteSettingsDoc = z.infer<typeof SiteSettingsDocSchema>;

export class SettingsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsError";
  }
}

function issues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

export function resolveEffectiveSettings<D extends SectionDeclarations>(
  template: { id: string; sections: D },
  rawDoc: unknown,
): EffectiveSettings<D> {
  const parsed = SiteSettingsDocSchema.safeParse(rawDoc);
  if (!parsed.success) throw new SettingsError(`site settings invalid: ${issues(parsed.error)}`);
  const doc = parsed.data;
  if (doc.templateId !== template.id) {
    throw new SettingsError(
      `site settings are for template "${doc.templateId}" but the build uses "${template.id}"`,
    );
  }
  for (const key of Object.keys(doc.overrides)) {
    if (!Object.hasOwn(template.sections, key)) {
      throw new SettingsError(`unknown site settings key "${key}" (not declared by template "${template.id}")`);
    }
  }
  const effective: Record<string, unknown> = {};
  for (const [key, decl] of Object.entries(template.sections)) {
    const merged = { ...(decl.defaults as Record<string, unknown>), ...(doc.overrides[key] ?? {}) };
    const result = decl.schema.safeParse(merged);
    if (!result.success) throw new SettingsError(`settings "${key}" invalid: ${issues(result.error)}`);
    effective[key] = result.data;
  }
  return effective as EffectiveSettings<D>;
}

// ------------------------------------------- closed selection → query -------

/** Project selection modes a Template may offer. Closed; no free-form filters. */
export const ProjectSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("latest") }).strict(),
  z.object({ mode: z.literal("category"), category: RecordIdSchema }).strict(),
  z
    .object({
      mode: z.literal("manual"),
      ids: z
        .array(RecordIdSchema)
        .min(1)
        .max(48)
        .refine((ids) => new Set(ids).size === ids.length, { message: "manual ids must be unique" }),
    })
    .strict(),
]);
export type ProjectSelectionSetting = z.infer<typeof ProjectSelectionSchema>;

/** settings → closed query descriptor (the only "mapping" the platform does). */
export function projectsQuery(settings: {
  selection: ProjectSelectionSetting;
  limit: number;
}): Extract<CollectionQuery, { type: "projects" }> {
  return { type: "projects", selection: settings.selection, limit: settings.limit };
}
