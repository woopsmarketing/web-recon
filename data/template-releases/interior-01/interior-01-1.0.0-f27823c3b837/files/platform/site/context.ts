import { createContentReader, type ContentReader } from "../content/reader";
import { createAssetResolver, type AssetResolver } from "../assets/assets";
import { resolveEffectiveSettings, type EffectiveSettings, type SectionDeclarations } from "../settings/settings";
import { resolveEffectiveTheme, themeToCss, type EffectiveTheme } from "../theme/theme";
import { SiteSnapshotSchema, type BuildMode, type SiteIdentity, type SiteSnapshot } from "./instance";
import type { TemplateManifest } from "./template-manifest";
import { createSlotReader, resolveSlots, type ResolvedSlots, type SlotReader } from "../slots/slots";

/**
 * SiteContext — the ONLY door through which Template code reads site data.
 * Binds one Site Instance + its Effective Settings + ContentReader +
 * AssetResolver + Theme + identity, for one exact Template Release and mode.
 * Pure: no filesystem, no storage client, no wall clock.
 */
export interface SiteContext<D extends SectionDeclarations = SectionDeclarations> {
  siteId: string;
  mode: BuildMode;
  templateRelease: { templateId: string; templateVersion: string; releaseId: string };
  identity: SiteIdentity;
  settings: EffectiveSettings<D>;
  content: ContentReader;
  assets: AssetResolver;
  theme: Partial<EffectiveTheme>;
  themeCss: string;
  /** Section-level copy/link/media slots, fallback chain already applied. */
  slots: SlotReader;
  /** Where each slot value came from (site / binding / neutral-default / hidden) — build record only. */
  slotSources: ResolvedSlots;
}

export class SiteContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteContextError";
  }
}

export interface CreateSiteContextInput<D extends SectionDeclarations> {
  siteId: string;
  template: TemplateManifest<D>;
  /**
   * The release the builder says this code came from (binding file). This is a
   * self-consistency check between snapshot pin and binding; the authoritative pin
   * enforcement + release verification happens in the builder (prepareSiteInput).
   */
  templateRelease: { templateId: string; templateVersion: string; releaseId: string; releaseHash: string };
  mode: BuildMode;
  at: string;
  snapshot: unknown;
}

export function createSiteContext<D extends SectionDeclarations>(input: CreateSiteContextInput<D>): SiteContext<D> {
  const parsed = SiteSnapshotSchema.safeParse(input.snapshot);
  if (!parsed.success) {
    throw new SiteContextError(`site snapshot invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
  }
  const snap: SiteSnapshot = parsed.data;
  const { template, templateRelease: rel } = input;

  if (snap.siteId !== input.siteId || snap.site.siteId !== input.siteId) {
    throw new SiteContextError(`snapshot is for site "${snap.siteId}", requested "${input.siteId}"`);
  }
  if (snap.mode !== input.mode) throw new SiteContextError(`snapshot mode "${snap.mode}" ≠ requested "${input.mode}"`);
  if (rel.templateId !== template.id || rel.templateVersion !== template.version) {
    throw new SiteContextError(
      `release ${rel.templateId}@${rel.templateVersion} does not describe template code ${template.id}@${template.version}`,
    );
  }
  const pin = snap.site.template;
  if (
    pin.templateId !== rel.templateId ||
    pin.templateVersion !== rel.templateVersion ||
    pin.releaseId !== rel.releaseId ||
    pin.releaseHash !== rel.releaseHash
  ) {
    throw new SiteContextError(
      `site "${snap.siteId}" is pinned to ${pin.templateId}@${pin.templateVersion} release ${pin.releaseId}, ` +
        `but is being built with release ${rel.releaseId} (${rel.templateId}@${rel.templateVersion})`,
    );
  }

  const settings = resolveEffectiveSettings(template, snap.settings);
  // Closed selections must reference taxonomy that exists (a typo must not silently empty a section).
  const categoryIds = new Set(snap.content.categories.map((c) => c.id));
  for (const [key, value] of Object.entries(settings as Record<string, { selection?: { mode: string; category?: string } }>)) {
    const sel = value.selection;
    if (sel?.mode === "category" && !categoryIds.has(sel.category!)) {
      throw new SiteContextError(`settings "${key}" selects unknown category "${sel.category}"`);
    }
  }
  const theme = resolveEffectiveTheme(template.theme.consumes, template.theme.defaults, snap.theme);
  const resolvedSlots = resolveSlots(template, snap.slots, { "business.summary": snap.content.business.summary });

  return {
    siteId: snap.siteId,
    mode: snap.mode,
    templateRelease: { templateId: rel.templateId, templateVersion: rel.templateVersion, releaseId: rel.releaseId },
    identity: snap.site.identity,
    settings,
    content: createContentReader(snap.content, { includeDrafts: snap.mode === "preview" }),
    assets: createAssetResolver(snap.assets),
    theme,
    themeCss: themeToCss(theme),
    slots: createSlotReader(resolvedSlots, template),
    slotSources: resolvedSlots,
  };
}
