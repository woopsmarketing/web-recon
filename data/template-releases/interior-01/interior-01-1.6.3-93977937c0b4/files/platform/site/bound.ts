import { readFileSync } from "node:fs";
import { createSiteContext, SiteContextError, type SiteContext } from "./context";
import type { SectionDeclarations } from "../settings/settings";
import type { TemplateManifest } from "./template-manifest";

/**
 * Build-time binding: the site builder writes ONE binding file into the build
 * workspace and points RECON_SITE_BINDING at it. Template code calls
 * getSiteContext(manifest) and never learns a path, a siteId literal or a store.
 */
interface Binding {
  siteId: string;
  mode: "public" | "preview";
  at: string;
  release: { templateId: string; templateVersion: string; releaseId: string; releaseHash: string };
  snapshotFile: string;
}

let cached: { key: string; ctx: SiteContext } | undefined;

export function getSiteContext<D extends SectionDeclarations>(template: TemplateManifest<D>): SiteContext<D> {
  const bindingFile = process.env.RECON_SITE_BINDING;
  if (!bindingFile) throw new SiteContextError("RECON_SITE_BINDING is not set — templates render only inside a site build");
  if (cached?.key === bindingFile) return cached.ctx as SiteContext<D>;
  const binding = JSON.parse(readFileSync(bindingFile, "utf8")) as Binding;
  const snapshot: unknown = JSON.parse(readFileSync(binding.snapshotFile, "utf8"));
  const ctx = createSiteContext({
    siteId: binding.siteId,
    template,
    templateRelease: binding.release,
    mode: binding.mode,
    at: binding.at,
    snapshot,
  });
  cached = { key: bindingFile, ctx };
  return ctx;
}
