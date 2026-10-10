import { lstat, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { SOURCE_MARKER_FILE, SOURCE_MARKER_V2_TEXT } from "../portfolio-sync/managed";
import { HEAD_SCRIPTS_FILE, SiteHeadScriptsDocSchema } from "../site/head-scripts";
import { INQUIRY_FILE, SiteInquiryDocSchema } from "../site/inquiry";
import { SiteInstanceSchema } from "../site/instance";
import { SITES_DIR, buildSiteSnapshot, siteDir } from "../site/load";
import { ProvisionError, validateProvisionSpec, type ProvisionSpec } from "./spec";
import { STARTERS_DIR, StarterError, phoneOf, renderStarter } from "./starter";

/**
 * scaffoldSite — writes data/sites/<siteId>/ for a brand-new site: the starter of its Template with
 * the spec's values in it, plus the documents that come from the spec alone.
 *
 *   from the starter (tokens resolved on parsed values — starter.ts)
 *     settings.json · slots.json · theme.json · content/business.json · content/banners.json ·
 *     assets/registry.json + its image files (copied byte for byte)
 *   from the spec
 *     site.json                 identity (brand name, public origin, locale) + the exact release pin
 *     scripts.json              the BoostChat widget loader (data-boost-chat-key)
 *     inquiry.json              the lead endpoint
 *     integration.json          first-party data opt-in, as the hand-made sites have it
 *     content/projects.json     empty  ┐ a new site has NO portfolio; the two documents keep the
 *     content/categories.json   empty  ┘ directory a valid site before it is declared managed
 *
 * Never: a portfolio project, a category, a review, a logo, a contact detail the spec does not have.
 *
 * Idempotent: an existing directory that holds exactly these files with exactly these bytes
 * (portfolio.source.json, the managed marker written by the next step, may be there too) is left
 * alone. An existing directory with ANYTHING else is refused — an existing site is never rewritten.
 * Nothing is written outside data/sites/<siteId>/.
 *
 * The result is loaded with the platform's own loader before this returns: a site that the builder
 * would refuse is refused here, and the directory this call created is removed again.
 */

export interface ScaffoldResult {
  status: "written" | "unchanged";
  /** repository-relative */
  siteDir: string;
  /** site-relative paths, sorted */
  files: string[];
}

const json = (value: unknown) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);

async function listFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await listFiles(path.join(dir, e.name), r)));
    else out.push(r);
  }
  return out;
}

/** Everything scaffoldSite writes for this spec: site-relative path → bytes. Pure apart from reading the starter. */
export async function planScaffold(opts: { repoRoot: string; spec: unknown }): Promise<{ spec: ProvisionSpec; files: Map<string, Buffer> }> {
  const { spec, starter, release } = await validateProvisionSpec({ repoRoot: opts.repoRoot, raw: opts.spec });
  let rendered: Awaited<ReturnType<typeof renderStarter>>;
  try {
    rendered = await renderStarter(starter, { brandName: spec.identity.brandName, phone: phoneOf(spec.contact.phone), email: spec.contact.email });
  } catch (error) {
    if (error instanceof StarterError) throw new ProvisionError("starter_invalid", `the ${STARTERS_DIR}/${starter.templateId} starter cannot be used: ${error.message}`);
    throw error;
  }

  const site = SiteInstanceSchema.parse({
    schemaVersion: 1,
    siteId: spec.siteId,
    identity: { brandName: spec.identity.brandName, publicOrigin: spec.publicOrigin, locale: spec.identity.locale },
    template: { templateId: release.templateId, templateVersion: release.templateVersion, releaseId: release.releaseId, releaseHash: release.releaseHash },
    theme: { base: "template-default" },
  });
  const scripts = SiteHeadScriptsDocSchema.parse({
    schemaVersion: 1,
    headScripts: [{ id: "boostchat-widget", src: spec.boostchat.widgetScriptUrl, attrs: { "data-boost-chat-key": spec.boostchat.widgetKey } }],
  });
  const inquiry = SiteInquiryDocSchema.parse({ schemaVersion: 1, endpoint: spec.boostchat.leadEndpoint });
  // the content origin of the starter's own documents: the two empty collections say the same
  const origin = (rendered.documents.get("content/business.json") as { origin?: unknown } | undefined)?.origin;

  const files = new Map<string, Buffer>();
  for (const [rel, doc] of rendered.documents) files.set(rel, json(doc));
  for (const [rel, source] of rendered.assets) files.set(rel, await readFile(source));
  files.set("site.json", json(site));
  files.set(HEAD_SCRIPTS_FILE, json(scripts));
  files.set(INQUIRY_FILE, json(inquiry));
  files.set("integration.json", json({ schemaVersion: 1, firstPartyData: { enabled: true } }));
  files.set("content/projects.json", json({ schema: "projects@1", origin, items: [] }));
  files.set("content/categories.json", json({ schema: "categories@1", origin, items: [] }));
  return { spec, files };
}

export async function scaffoldSite(opts: { repoRoot: string; spec: unknown }): Promise<ScaffoldResult> {
  const { spec, files } = await planScaffold(opts);
  const dir = siteDir(opts.repoRoot, spec.siteId);
  const rel = `${SITES_DIR}/${spec.siteId}`;
  const planned = [...files.keys()].sort();
  const sitesRoot = path.join(opts.repoRoot, SITES_DIR);
  await mkdir(sitesRoot, { recursive: true });

  const existing = await lstat(dir).catch(() => undefined);
  if (existing) {
    if (!existing.isDirectory()) throw new ProvisionError("site_exists_different", `${rel} exists and is not a directory`);
    const present = (await listFiles(dir)).sort();
    const different: string[] = [];
    for (const f of present) {
      if (f === SOURCE_MARKER_FILE) {
        if ((await readFile(path.join(dir, f), "utf8")) !== SOURCE_MARKER_V2_TEXT) different.push(f);
      } else if (!files.has(f)) different.push(f);
    }
    for (const [f, bytes] of files) {
      const st = await lstat(path.join(dir, f)).catch(() => undefined);
      if (!st?.isFile() || !(await readFile(path.join(dir, f))).equals(bytes)) different.push(f);
    }
    if (different.length > 0) {
      const names = [...new Set(different)].sort();
      throw new ProvisionError(
        "site_exists_different",
        `${rel} already exists and is not what this spec would write (${names.length} file(s) differ: ${names.slice(0, 5).join(", ")}${names.length > 5 ? ", …" : ""}); an existing site is never rewritten`,
      );
    }
    await assertLoads(opts.repoRoot, spec.siteId);
    return { status: "unchanged", siteDir: rel, files: planned };
  }

  await mkdir(dir);
  try {
    // the directory is ours and new: it must sit exactly where the site id says, under data/sites
    if ((await realpath(dir)) !== path.join(await realpath(sitesRoot), spec.siteId)) throw new ProvisionError("site_dir_invalid", `${rel} does not resolve inside ${SITES_DIR}`);
    for (const [f, bytes] of files) {
      const target = path.join(dir, f);
      if (path.relative(dir, target).startsWith("..") || path.isAbsolute(path.relative(dir, target))) throw new ProvisionError("site_dir_invalid", `refusing to write outside ${rel}: ${f}`);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: "wx" });
    }
    await assertLoads(opts.repoRoot, spec.siteId);
  } catch (error) {
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
  return { status: "written", siteDir: rel, files: planned };
}

/** The platform's own loader accepts the directory (schemas, template binding, every referenced image present and inside assets/), and it holds no portfolio. */
async function assertLoads(repoRoot: string, siteId: string): Promise<void> {
  let loaded: Awaited<ReturnType<typeof buildSiteSnapshot>>;
  try {
    loaded = await buildSiteSnapshot({ repoRoot, siteId, mode: "public", at: new Date().toISOString() });
  } catch (error) {
    throw new ProvisionError("site_invalid", `the scaffolded site does not load: ${(error as Error).message}`);
  }
  const { content } = loaded.snapshot;
  if (content.projects.length > 0 || content.categories.length > 0 || content.reviews !== undefined) {
    throw new ProvisionError("site_invalid", "the scaffolded site holds portfolio content (projects, categories or reviews); a new site starts with none");
  }
}
