import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AssetCatalogSchema,
  InteractionSpecSchema,
  PageSpecSchema,
  SiteSpecSchema,
  StyleCatalogSchema,
  type AssetCatalog,
  type InteractionSpec,
  type PageSpec,
  type SiteSpec,
  type StyleCatalog,
} from "./types.js";
import { assertSiteSpecValid, type SiteSpecBundle } from "./validate-sitespec.js";

/**
 * The SiteSpec consumer API (Task 13, items 72, 73, 74).
 *
 * This is the function Task 14 calls, and the ONLY door it needs. It reads
 * `site-spec.json` and the artifacts inside the SAME directory, and it is
 * structurally incapable of doing anything else: every file reference is proven
 * relative, `..`-free and inside the SiteSpec root before it is opened, and the
 * resolved path is checked against the root again afterwards.
 *
 * `siteSpec.source` names the Task 06–12 runs this was compiled from. This
 * loader does not open them, and a reconstruction that needs them is a
 * reconstruction reading data the SiteSpec should have compiled in (item 11).
 * The whole self-containment claim of Task 13 is testable exactly here: delete
 * every source run, call this function, and everything a renderer needs is still
 * present — which is what the fixture does (item 96).
 */

export class SiteSpecLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteSpecLoadError";
  }
}

export interface LoadedSiteSpec extends SiteSpecBundle {
  /** Directory the SiteSpec was read from — the ONLY directory that was read. */
  rootDir: string;
  siteSpec: SiteSpec;
  styleCatalog: StyleCatalog;
  assetCatalog: AssetCatalog;
  interactionSpec: InteractionSpec;
  pages: PageSpec[];
  /** Convenience index for consumers. */
  pageById: Map<string, PageSpec>;
}

/**
 * Resolve an internal reference and refuse anything that leaves the root.
 *
 * A SiteSpec is a shareable artifact: it can arrive from somewhere else, and a
 * `../../etc/passwd` in a file field must be a load error rather than a read.
 */
function resolveInsideRoot(rootDir: string, reference: string, label: string): string {
  if (reference === "") throw new SiteSpecLoadError(`${label} is empty`);
  if (reference.startsWith("/") || /^[A-Za-z]:[\\/]/.test(reference)) {
    throw new SiteSpecLoadError(`${label} is an absolute path (${reference})`);
  }
  if (reference.includes("\\")) {
    throw new SiteSpecLoadError(`${label} uses a backslash separator (${reference})`);
  }
  if (reference.split("/").includes("..")) {
    throw new SiteSpecLoadError(`${label} escapes the SiteSpec root (${reference})`);
  }
  const resolved = path.resolve(rootDir, reference);
  const root = path.resolve(rootDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new SiteSpecLoadError(`${label} resolves outside the SiteSpec root (${reference})`);
  }
  return resolved;
}

async function readJson(file: string, label: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch (err) {
    throw new SiteSpecLoadError(
      `cannot read ${label}: ${file} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new SiteSpecLoadError(
      `${label} is not valid JSON: ${file} (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

function parse<T>(
  schema: { safeParse: (v: unknown) => { success: boolean; data?: T; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } } },
  value: unknown,
  label: string,
): T {
  const result = schema.safeParse(value);
  if (!result.success || result.data === undefined) {
    const issues = (result.error?.issues ?? [])
      .slice(0, 5)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new SiteSpecLoadError(`${label} failed SiteSpec schema validation: ${issues}`);
  }
  return result.data;
}

export interface LoadSiteSpecOptions {
  /**
   * Re-run the full invariant set after loading (default `true`). The producer
   * already checked these, but a SiteSpec can be edited, truncated or partially
   * copied between the two moments — and a reconstruction engine should find
   * that out here rather than three stages later.
   */
  validate?: boolean;
}

/** Load a complete SiteSpec from `site-spec.json`, reading nothing else. */
export async function loadSiteSpec(
  siteSpecFile: string,
  options: LoadSiteSpecOptions = {},
): Promise<LoadedSiteSpec> {
  const rootDir = path.dirname(path.resolve(siteSpecFile));

  const siteSpec = parse(
    SiteSpecSchema,
    await readJson(path.resolve(siteSpecFile), "site-spec.json"),
    "site-spec.json",
  );

  const styleCatalog = parse(
    StyleCatalogSchema,
    await readJson(
      resolveInsideRoot(rootDir, siteSpec.styleCatalogFile, "styleCatalogFile"),
      siteSpec.styleCatalogFile,
    ),
    siteSpec.styleCatalogFile,
  );
  const assetCatalog = parse(
    AssetCatalogSchema,
    await readJson(
      resolveInsideRoot(rootDir, siteSpec.assetCatalogFile, "assetCatalogFile"),
      siteSpec.assetCatalogFile,
    ),
    siteSpec.assetCatalogFile,
  );
  const interactionSpec = parse(
    InteractionSpecSchema,
    await readJson(
      resolveInsideRoot(rootDir, siteSpec.interactionSpecFile, "interactionSpecFile"),
      siteSpec.interactionSpecFile,
    ),
    siteSpec.interactionSpecFile,
  );

  const pages: PageSpec[] = [];
  for (const entry of siteSpec.pages) {
    const file = resolveInsideRoot(rootDir, entry.file, `pages[${entry.pageId}].file`);
    const page = parse(PageSpecSchema, await readJson(file, entry.file), entry.file);
    if (page.pageId !== entry.pageId) {
      throw new SiteSpecLoadError(
        `${entry.file} declares pageId ${page.pageId}, but site-spec.json indexes it as ${entry.pageId}`,
      );
    }
    pages.push(page);
  }

  const loaded: LoadedSiteSpec = {
    rootDir,
    siteSpec,
    styleCatalog,
    assetCatalog,
    interactionSpec,
    pages,
    pageById: new Map(pages.map((page) => [page.pageId, page])),
  };

  if (options.validate !== false) {
    assertSiteSpecValid(loaded);
  }
  return loaded;
}
