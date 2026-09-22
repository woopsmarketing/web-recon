import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { RuntimeElementNode, RuntimePage, RuntimeRouteMap } from "../reconstruction/index.js";
import { SlotizedRenderError, type RenderWarning } from "./types.js";

/**
 * SITE IDENTITY — Task 29.1.
 *
 * Four inputs, four questions, deliberately kept apart:
 *
 *   PROVENANCE     where this template came from   (template manifest `source`)
 *   SITE IDENTITY  who the rendered site is        (this file)
 *   CONTENT PACK   visible/editable page copy      (slots)
 *   THEME PACK     visual token values             (tokens)
 *
 * Identity is applied ONLY to site-level surfaces of the rendered app shell —
 * never to page copy. A company name painted in a hero or footer is a slot and
 * belongs to the Content Pack; the public origin, package name, document
 * locale and the site-level metadata fallback belong here. Provenance is never
 * overwritten: the render manifest keeps `provenance.sourceOrigin` alongside
 * `siteIdentity.publicOrigin`, and the two are expected to differ.
 *
 * Vocabulary note: the release pipeline's `productionBaseUrl`
 * (src/release/types.ts) is the same idea as `publicOrigin`; it is not imported
 * so slotized templates stay decoupled from the release/SiteInstance code.
 */

export const SITE_IDENTITY_SCHEMA_VERSION = "1" as const;

/** npm-package and URL-path safe: lowercase alnum words joined by single hyphens. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX = 64;

function normalizeOrigin(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
  if (url.username !== "" || url.password !== "") return undefined;
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") return undefined;
  return url.origin;
}

function isWellFormedLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}

export const SiteIdentitySchema = z
  .object({
    schemaVersion: z.literal(SITE_IDENTITY_SCHEMA_VERSION),
    brandName: z.string().trim().min(1, "brandName must be non-empty"),
    legalName: z.string().trim().min(1, "legalName must be non-empty when provided").optional(),
    publicOrigin: z
      .string()
      .refine((value) => normalizeOrigin(value) !== undefined, {
        message: "publicOrigin must be an http(s) origin with no path, query, hash or credentials",
      })
      .transform((value) => normalizeOrigin(value)!)
      .optional(),
    slug: z
      .string()
      .max(SLUG_MAX, `slug must be at most ${SLUG_MAX} characters`)
      .regex(SLUG_RE, "slug must be lowercase letters/digits joined by single hyphens (package/path safe)"),
    locale: z
      .string()
      .trim()
      .min(1, "locale must be non-empty")
      .refine(isWellFormedLocale, { message: "locale must be a well-formed BCP 47 tag" }),
  })
  .strict();
export type SiteIdentity = z.infer<typeof SiteIdentitySchema>;

export async function loadSiteIdentity(file: string): Promise<SiteIdentity> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    throw new SlotizedRenderError(`site identity could not be read: ${file} (${(error as Error).message})`);
  }
  const parsed = SiteIdentitySchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new SlotizedRenderError(`site identity failed validation: ${file}\n  ${issues.join("\n  ")}`);
  }
  return parsed.data;
}

/** Where the template came from. Recorded in every render; never rewritten. */
export interface RenderProvenance {
  sourceOrigin: string;
  sourceRootUrl: string;
  sourceHost: string;
  templateId: string;
  templateVersion: string;
  reconstructionRunId?: string;
}

export function provenanceOf(manifest: {
  templateId: string;
  templateVersion: string;
  source: { host: string; rootUrl: string; reconstructionRunId?: string };
}): RenderProvenance {
  let sourceOrigin = manifest.source.rootUrl;
  try {
    sourceOrigin = new URL(manifest.source.rootUrl).origin;
  } catch {
    // keep the recorded value verbatim
  }
  return {
    sourceOrigin,
    sourceRootUrl: manifest.source.rootUrl,
    sourceHost: manifest.source.host,
    templateId: manifest.templateId,
    templateVersion: manifest.templateVersion,
    ...(manifest.source.reconstructionRunId === undefined
      ? {}
      : { reconstructionRunId: manifest.source.reconstructionRunId }),
  };
}

// ---------------------------------------------------------------------------
// Identity surfaces of the rendered app shell
// ---------------------------------------------------------------------------

/** Files that carry SITE identity in a rendered app (relative to the render dir). */
export const IDENTITY_SURFACE_FILES = {
  routeMap: "reconstruction-data/route-map.json",
  packageJson: "package.json",
  generatedConfig: "src/generated/generated-config.ts",
  layout: "app/layout.tsx",
} as const;

/** Internal records of a render: provenance is ALLOWED to name the source here. */
export const INTERNAL_PROVENANCE_FILES = ["manifest.json", "render-report.json"] as const;

export interface IdentitySurfaceResult {
  surface: string;
  file: string;
  status: "rewritten" | "unchanged" | "unpatched";
  detail: string;
}

/**
 * Route map: `rootUrl` + every route `url` rebased onto the public origin
 * (path + query kept). Without a publicOrigin they become root-relative — the
 * source origin is dropped and no customer origin is invented. Titles are NOT
 * touched: they are Content Pack slots.
 */
export function applyIdentityToRouteMap(
  routeMap: RuntimeRouteMap,
  identity: SiteIdentity,
): { changed: number; relative: boolean } {
  const rebase = (value: string): string => {
    let relative: string;
    try {
      const url = new URL(value);
      relative = `${url.pathname}${url.search}${url.hash}`;
    } catch {
      relative = value.startsWith("/") ? value : `/${value}`;
    }
    return identity.publicOrigin === undefined ? relative : `${identity.publicOrigin}${relative}`;
  };
  let changed = 0;
  const nextRoot = rebase(routeMap.rootUrl);
  if (nextRoot !== routeMap.rootUrl) {
    routeMap.rootUrl = nextRoot;
    changed++;
  }
  for (const route of routeMap.routes) {
    const next = rebase(route.url);
    if (next === route.url) continue;
    route.url = next;
    changed++;
  }
  return { changed, relative: identity.publicOrigin === undefined };
}

/**
 * The observed `<html>` renders as a wrapper node (`data-wr-doc-tag="html"`);
 * its `lang` is the document locale, a site-level surface. Only that one node
 * per variant is touched, and only when it already declares a `lang`.
 */
export function applyIdentityLocaleToPage(page: RuntimePage, identity: SiteIdentity): number {
  let changed = 0;
  for (const tree of [page.desktop, page.mobile]) {
    const root = tree.doc as RuntimeElementNode;
    const props = root.p as Record<string, unknown> | undefined;
    if (props === undefined || props["data-wr-doc-tag"] !== "html") continue;
    if (typeof props["lang"] !== "string" || props["lang"] === identity.locale) continue;
    props["lang"] = identity.locale;
    changed++;
  }
  return changed;
}

async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch {
    return undefined;
  }
}

async function appReferencesSourceRootUrl(outDir: string): Promise<boolean> {
  const configFile = path.join(outDir, IDENTITY_SURFACE_FILES.generatedConfig);
  const stack = [path.join(outDir, "app"), path.join(outDir, "src")];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.(tsx?|jsx?|mjs)$/.test(entry.name) && full !== configFile) {
        if ((await readFile(full, "utf8")).includes("SOURCE_ROOT_URL")) return true;
      }
    }
  }
  return false;
}

const LAYOUT_CONFIG_IMPORT = `import { GENERATED_STYLES_HREF } from "../src/generated/generated-config";`;
/** The JSX element line — the bare `<html>` also appears in the doc comment. */
const LAYOUT_HTML_OPEN = "\n    <html>\n";
const LAYOUT_DEFAULT_EXPORT = "export default function RootLayout(";

/**
 * Rewrites the app-shell identity files of an ALREADY COPIED render directory.
 * Every patch is anchored on the exact text the reconstruction generator emits
 * (src/reconstruction/app-template.ts); a missing anchor is reported as
 * `unpatched` with a warning instead of guessing.
 */
export async function applyIdentityToAppShell(
  outDir: string,
  identity: SiteIdentity,
  warnings: RenderWarning[],
): Promise<IdentitySurfaceResult[]> {
  const results: IdentitySurfaceResult[] = [];
  const unpatched = (surface: string, file: string, detail: string): void => {
    results.push({ surface, file, status: "unpatched", detail });
    warnings.push({ code: "SITE_IDENTITY_SURFACE_UNPATCHED", message: `${surface}: ${detail}` });
  };

  // --- package.json name ← slug ---------------------------------------------
  const packageFile = path.join(outDir, IDENTITY_SURFACE_FILES.packageJson);
  const packageRaw = await readIfExists(packageFile);
  if (packageRaw === undefined) {
    unpatched("package-name", IDENTITY_SURFACE_FILES.packageJson, "file not found");
  } else {
    const pkg = JSON.parse(packageRaw) as Record<string, unknown>;
    const before = pkg["name"];
    if (before === identity.slug) {
      results.push({ surface: "package-name", file: IDENTITY_SURFACE_FILES.packageJson, status: "unchanged", detail: identity.slug });
    } else {
      pkg["name"] = identity.slug;
      await writeFile(packageFile, `${JSON.stringify(pkg, null, 2)}${packageRaw.endsWith("\n") ? "\n" : ""}`, "utf8");
      results.push({
        surface: "package-name",
        file: IDENTITY_SURFACE_FILES.packageJson,
        status: "rewritten",
        detail: `${String(before)} → ${identity.slug}`,
      });
    }
  }

  // --- generated config: SITE_* constants, SOURCE_ROOT_URL moved out ---------
  const configFile = path.join(outDir, IDENTITY_SURFACE_FILES.generatedConfig);
  const configRaw = await readIfExists(configFile);
  if (configRaw === undefined) {
    unpatched("generated-config", IDENTITY_SURFACE_FILES.generatedConfig, "file not found");
  } else {
    const sourceRootLine = /^export const SOURCE_ROOT_URL = .*;\n/m;
    const keepSourceRoot = await appReferencesSourceRootUrl(outDir);
    if (keepSourceRoot) {
      warnings.push({
        code: "SITE_IDENTITY_SURFACE_UNPATCHED",
        message: "generated-config: SOURCE_ROOT_URL is imported by app code — kept in the shipped config",
      });
    }
    const exports = (keepSourceRoot ? configRaw : configRaw.replace(sourceRootLine, ""))
      .split("\n")
      .filter((line) => line.startsWith("export const "));
    const siteLines = [
      `export const SITE_BRAND_NAME = ${JSON.stringify(identity.brandName)};`,
      `export const SITE_LEGAL_NAME: string | null = ${JSON.stringify(identity.legalName ?? null)};`,
      `export const SITE_PUBLIC_ORIGIN: string | null = ${JSON.stringify(identity.publicOrigin ?? null)};`,
      `export const SITE_SLUG = ${JSON.stringify(identity.slug)};`,
      `export const SITE_LOCALE = ${JSON.stringify(identity.locale)};`,
    ];
    const next = `/**
 * Generated constants. Do not edit — \`pnpm render:template --identity\` rewrote this file.
 *
 * \`SITE_*\` is the rendered site's identity (a SiteIdentity input). The
 * template's source provenance is recorded in the render manifest, not here.
 */

${[...exports.filter((line) => !line.startsWith("export const SITE_")), ...siteLines].join("\n")}
`;
    await writeFile(configFile, next, "utf8");
    results.push({
      surface: "generated-config",
      file: IDENTITY_SURFACE_FILES.generatedConfig,
      status: "rewritten",
      detail: `SITE_* constants written${keepSourceRoot ? "" : "; SOURCE_ROOT_URL removed from the shipped config"}`,
    });
  }

  // --- layout: <html lang>, site-level metadata fallback, metadataBase -------
  const layoutFile = path.join(outDir, IDENTITY_SURFACE_FILES.layout);
  const layoutRaw = await readIfExists(layoutFile);
  const anchorCount = (text: string, anchor: string): number => text.split(anchor).length - 1;
  if (layoutRaw === undefined) {
    unpatched("layout", IDENTITY_SURFACE_FILES.layout, "file not found");
  } else if (
    anchorCount(layoutRaw, LAYOUT_CONFIG_IMPORT) !== 1 ||
    anchorCount(layoutRaw, LAYOUT_HTML_OPEN) !== 1 ||
    anchorCount(layoutRaw, LAYOUT_DEFAULT_EXPORT) !== 1 ||
    configRaw === undefined
  ) {
    unpatched("layout", IDENTITY_SURFACE_FILES.layout, "layout anchors not found exactly once — <html lang> and metadata fallback not applied");
  } else {
    const metadataBlock = `/**
 * Site-level metadata FALLBACK from the SiteIdentity. A route's own title (a
 * Content Pack slot) still wins; this only fills routes without one.
 */
export const metadata: Metadata = {
  title: SITE_BRAND_NAME,
  applicationName: SITE_BRAND_NAME,
  ...(SITE_PUBLIC_ORIGIN === null ? {} : { metadataBase: new URL(SITE_PUBLIC_ORIGIN) }),
};

`;
    const next = layoutRaw
      .replace(
        LAYOUT_CONFIG_IMPORT,
        `import type { Metadata } from "next";\nimport {\n  GENERATED_STYLES_HREF,\n  SITE_BRAND_NAME,\n  SITE_LOCALE,\n  SITE_PUBLIC_ORIGIN,\n} from "../src/generated/generated-config";`,
      )
      .replace(LAYOUT_HTML_OPEN, "\n    <html lang={SITE_LOCALE}>\n")
      .replace(LAYOUT_DEFAULT_EXPORT, `${metadataBlock}${LAYOUT_DEFAULT_EXPORT}`);
    await writeFile(layoutFile, next, "utf8");
    results.push({
      surface: "layout",
      file: IDENTITY_SURFACE_FILES.layout,
      status: "rewritten",
      detail: `<html lang=${identity.locale}>, metadata title/applicationName fallback${identity.publicOrigin === undefined ? "" : ", metadataBase"}`,
    });
  }

  return results;
}
