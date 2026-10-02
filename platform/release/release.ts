import { chmod, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import ts from "typescript";
import { hashJson, sha256, stableStringify } from "../util/hash";

/**
 * Template Release = immutable, content-addressed snapshot of
 *   templates/<id>/v<major>/   (minus provenance.json, build outputs)
 *   platform RUNTIME modules   (what renders: content, settings, theme, assets, slots,
 *                               site/* except the JSON store loader) — NOT the builder,
 *                               CLIs, release tooling, dev or tests
 *   package.json + pnpm-lock.yaml   (scoped: platform/runtime/, never the repo root manifest)
 *
 * releaseHash = sha256 over { sorted (path, sha256) file list, templateId,
 * templateVersion, forbiddenTerms, gates } — no timestamps, so the same code
 * always yields the same hash, and editing any of that metadata (or any file byte)
 * is detected. `createdAt` and per-file `size` are informational and NOT hashed.
 * A stored release is never rewritten: files are read-only and every use re-verifies.
 */

export const RELEASES_DIR = "data/template-releases";

export const ReleaseFileSchema = z.object({ path: z.string(), sha256: z.string(), size: z.number() }).strict();
export const ReleaseRecordSchema = z
  .object({
    schemaVersion: z.literal(1),
    templateId: z.string(),
    templateVersion: z.string(),
    releaseId: z.string(),
    releaseHash: z.string().regex(/^[0-9a-f]{64}$/),
    /** Hash over templates/** entries only — "same Template source code" identity. */
    templateSourceHash: z.string().regex(/^[0-9a-f]{64}$/),
    createdAt: z.string(),
    files: z.array(ReleaseFileSchema),
    /** Frozen from provenance.json at release time; builds never read provenance. */
    forbiddenTerms: z.array(z.string()),
    gates: z.record(z.string(), z.object({ pass: z.boolean(), detail: z.string() }).strict()),
  })
  .strict();
export type ReleaseRecord = z.infer<typeof ReleaseRecordSchema>;

export class ReleaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReleaseError";
  }
}

const TEMPLATE_EXCLUDE = new Set(["provenance.json", "node_modules", ".next", "out", "public", "next-env.d.ts", "fixtures"]);
/** platform/ entries that make up the release (the render-time runtime). */
const PLATFORM_RUNTIME_DIRS = ["content", "settings", "theme", "assets", "slots", "site"] as const;
const PLATFORM_RUNTIME_EXCLUDE = new Set(["site/load.ts"]);

/** releaseId = <templateId>-<x.y.z>-<releaseHash[0:12]>; never a path. */
export const RELEASE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d+\.\d+\.\d+-[0-9a-f]{12}$/;

async function walk(dir: string, exclude: Set<string>, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (rel === "" && exclude.has(entry.name)) continue;
    if (entry.name === ".DS_Store") continue;
    const relPath = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walk(path.join(dir, entry.name), exclude, relPath)));
    else if (entry.isFile()) out.push(relPath);
  }
  return out;
}

/** Snapshot file list: snapshot-relative path → absolute source path. */
export async function collectReleaseSources(repoRoot: string, templateId: string, major: number) {
  const templateRel = `templates/${templateId}/v${major}`;
  const templateDir = path.join(repoRoot, templateRel);
  const map = new Map<string, string>();
  for (const f of await walk(templateDir, TEMPLATE_EXCLUDE)) map.set(`${templateRel}/${f}`, path.join(templateDir, f));
  const platformDir = path.join(repoRoot, "platform");
  for (const d of PLATFORM_RUNTIME_DIRS) {
    for (const f of await walk(path.join(platformDir, d), new Set())) {
      if (!PLATFORM_RUNTIME_EXCLUDE.has(`${d}/${f}`)) map.set(`platform/${d}/${f}`, path.join(platformDir, d, f));
    }
  }
  map.set("platform/tsconfig.json", path.join(platformDir, "tsconfig.json"));
  map.set("package.json", path.join(platformDir, "runtime/package.json"));
  map.set("pnpm-lock.yaml", path.join(platformDir, "runtime/pnpm-lock.yaml"));
  return { templateRel, templateDir, sources: new Map([...map].sort(([a], [b]) => (a < b ? -1 : 1))) };
}

export interface ReleaseHashInput {
  templateId: string;
  templateVersion: string;
  forbiddenTerms: readonly string[];
  gates: Record<string, { pass: boolean; detail: string }>;
  files: { path: string; sha256: string }[];
}

export function computeReleaseHash(r: ReleaseHashInput): string {
  return hashJson({
    templateId: r.templateId,
    templateVersion: r.templateVersion,
    forbiddenTerms: [...r.forbiddenTerms],
    gates: r.gates,
    files: r.files.map((f) => ({ path: f.path, sha256: f.sha256 })),
  });
}

export function computeTemplateSourceHash(files: { path: string; sha256: string }[]): string {
  return hashJson(files.filter((f) => f.path.startsWith("templates/")).map((f) => ({ path: f.path, sha256: f.sha256 })));
}

// ------------------------------------------------------------ source gates --

/**
 * Template code may import ONLY these modules (allowlist, not blocklist).
 * Anything else — node builtins, fs, network, DB/Supabase clients, platform
 * store/builder/release modules, legacy src/ — is a gate failure. Relative
 * imports must stay inside the template major directory.
 */
const TEMPLATE_IMPORT_ALLOW = new Set([
  "react",
  "next",
  "next/link",
  // Step 4: next/navigation — ONLY the named import `notFound` (see TEMPLATE_NAMED_ONLY).
  "next/navigation",
  "zod",
  "@platform/site/bound",
  "@platform/site/context",
  "@platform/site/template-manifest",
  "@platform/settings/settings",
  // Step 4.1: the pure ProjectFilter contract/evaluator (shared with future backends) and the
  // narrow browser URL-state door (history/query only; no network, no storage).
  "@platform/content/project-filter",
  "@platform/site/browser",
  // 1.6.2: the narrow inquiry door (one fixed-shape POST to the endpoint the SITE declares; the
  // Template still may not reference fetch / timers / window itself — BANNED_IDENTIFIERS).
  "@platform/site/inquiry-client",
]);
/**
 * Allowlisted modules that may be used only through the listed named imports.
 * next/navigation → notFound(): an unknown slug / out-of-range page must render the 404,
 * never an empty page. redirect/permanentRedirect/useRouter/useSearchParams etc. stay
 * refused (runtime-assembled navigation would escape the static link/QA checks); no
 * default/namespace import, no re-export, no dynamic import() of these modules.
 */
const TEMPLATE_NAMED_ONLY = new Map<string, ReadonlySet<string>>([["next/navigation", new Set(["notFound"])]]);
/**
 * Allowlisted modules template code may import for TYPES only (`import type { Metadata } from "next"`).
 * A value import of "next" would expose the server factory (`next({...})`).
 */
const TEMPLATE_TYPE_ONLY = new Set(["next"]);
/** next.config.mjs is framework config, not template code: it may use path, import.meta and RECON_BUILD_ID only. */
const NEXT_CONFIG_ALLOW = new Set(["node:path", "next"]);
/**
 * Identifiers template code may not reference at all: clock, randomness, timers,
 * network, dynamic code, process/global escape hatches.
 */
const BANNED_IDENTIFIERS = new Map<string, string>([
  ["Date", "wall clock"],
  ["Intl", "locale clock/formatting of now"],
  ["performance", "timer"],
  ["setTimeout", "timer"],
  ["setInterval", "timer"],
  ["process", "process/env access"],
  ["globalThis", "global escape hatch"],
  ["global", "global escape hatch"],
  ["window", "global escape hatch"],
  ["self", "global escape hatch"],
  ["fetch", "network"],
  ["XMLHttpRequest", "network"],
  ["WebSocket", "network"],
  ["EventSource", "network"],
  ["navigator", "network/device"],
  ["require", "require()"],
  ["eval", "dynamic code"],
  ["Function", "dynamic code"],
  ["crypto", "randomness"],
]);
const MATH_BANNED = new Set(["random"]);

export interface GateFinding {
  file: string;
  why: string;
}

/**
 * Template code rules (invariant 2 + determinism), on the TypeScript AST (not regex):
 * every import/export/dynamic import specifier, every identifier.
 * `file` is the path relative to the repo/snapshot root, e.g. templates/interior-01/v1/app/page.tsx.
 */
export function scanTemplateSource(file: string, text: string, siteIds: readonly string[]): GateFinding[] {
  if (!/\.(ts|tsx|js|mjs|jsx|cjs|mts|cts)$/.test(file)) return [];
  const findings: GateFinding[] = [];
  const add = (why: string) => findings.push({ file, why });
  const isNextConfig = /(^|\/)next\.config\.mjs$/.test(file);
  const majorRoot = /^(templates\/[^/]+\/v\d+)\//.exec(file)?.[1];
  const kind = file.endsWith("x") ? ts.ScriptKind.TSX : file.endsWith(".mjs") || file.endsWith(".js") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);

  function checkSpecifier(spec: string) {
    if (spec.startsWith(".")) {
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), spec));
      if (!majorRoot || !(resolved === majorRoot || resolved.startsWith(`${majorRoot}/`))) add(`relative import "${spec}" leaves the template directory`);
      return;
    }
    const allowed = isNextConfig ? NEXT_CONFIG_ALLOW : TEMPLATE_IMPORT_ALLOW;
    if (!allowed.has(spec)) add(`import "${spec}" is not on the template import allowlist`);
  }

  function checkTypeOnly(spec: string, node: ts.Node) {
    if (isNextConfig || !TEMPLATE_TYPE_ONLY.has(spec) || ts.isImportTypeNode(node)) return;
    const why = `"${spec}" may only be imported for types (import type { … })`;
    if (ts.isImportDeclaration(node)) {
      const clause = node.importClause;
      if (!clause) return add(why);
      if (clause.isTypeOnly) return;
      const b = clause.namedBindings;
      if (clause.name || !b || !ts.isNamedImports(b) || b.elements.length === 0 || b.elements.some((el) => !el.isTypeOnly)) add(why);
      return;
    }
    if (ts.isExportDeclaration(node) && node.isTypeOnly) return;
    add(why);
  }

  function checkNamedOnly(spec: string, node: ts.Node) {
    const names = isNextConfig ? undefined : TEMPLATE_NAMED_ONLY.get(spec);
    if (!names) return;
    const allowed = [...names].join(", ");
    if (!ts.isImportDeclaration(node)) return add(`"${spec}" may only be imported as { ${allowed} } (no re-export / dynamic / type import)`);
    const clause = node.importClause;
    const bindings = clause?.namedBindings;
    if (!clause || clause.name || !bindings || !ts.isNamedImports(bindings) || bindings.elements.length === 0) {
      return add(`"${spec}" may only be imported as { ${allowed} } (no default / namespace / side-effect import)`);
    }
    for (const el of bindings.elements) {
      const imported = (el.propertyName ?? el.name).text;
      if (!names.has(imported)) add(`"${spec}" export "${imported}" is not allowed (only ${allowed})`);
    }
  }

  function visit(node: ts.Node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        checkSpecifier(node.moduleSpecifier.text);
        checkNamedOnly(node.moduleSpecifier.text, node);
        checkTypeOnly(node.moduleSpecifier.text, node);
      } else add("non-literal module specifier");
    } else if (ts.isImportEqualsDeclaration(node)) {
      add("import = require()");
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteralLike(arg)) {
        checkSpecifier(arg.text);
        checkNamedOnly(arg.text, node);
        checkTypeOnly(arg.text, node);
      } else add("dynamic import() with a non-literal specifier");
    } else if (ts.isImportTypeNode(node)) {
      const lit = node.argument;
      if (ts.isLiteralTypeNode(lit) && ts.isStringLiteral(lit.literal)) {
        checkSpecifier(lit.literal.text);
        checkNamedOnly(lit.literal.text, node);
      }
    } else if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword && !isNextConfig) {
      add("import.meta in template code");
    } else if (ts.isIdentifier(node)) {
      const name = node.text;
      const parent = node.parent;
      const isPropertyName =
        (parent && ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (parent && (ts.isPropertyAssignment(parent) || ts.isPropertySignature(parent) || ts.isMethodDeclaration(parent)) && parent.name === node) ||
        (parent && ts.isJsxAttribute(parent));
      if (!isPropertyName && BANNED_IDENTIFIERS.has(name)) {
        const envOk =
          isNextConfig &&
          name === "process" &&
          ts.isPropertyAccessExpression(parent) &&
          parent.name.text === "env" &&
          ts.isPropertyAccessExpression(parent.parent) &&
          parent.parent.name.text === "RECON_BUILD_ID";
        if (!envOk) add(`${BANNED_IDENTIFIERS.get(name)} (\`${name}\`) in template code`);
      }
      if (name === "Math" && parent && ts.isPropertyAccessExpression(parent) && MATH_BANNED.has(parent.name.text)) add("randomness (Math.random) in template code");
    } else if (ts.isElementAccessExpression(node) && !ts.isStringLiteralLike(node.argumentExpression) && !ts.isNumericLiteral(node.argumentExpression)) {
      // computed member access on anything could reach banned members by name; only literal keys are allowed
      const target = node.expression;
      if (ts.isIdentifier(target) && (target.text === "Math" || BANNED_IDENTIFIERS.has(target.text))) add("computed access to a banned global");
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  for (const id of siteIds) if (text.includes(id)) add(`hard-coded siteId "${id}"`);
  return findings;
}

/** Scan every template file of a major BEFORE anything imports it. */
export async function gateTemplateSources(repoRoot: string, templateId: string, major: number, siteIds: readonly string[], forbiddenTerms: readonly string[]) {
  const { sources } = await collectReleaseSources(repoRoot, templateId, major);
  const findings: GateFinding[] = [];
  for (const [rel, abs] of sources) {
    const text = await readFile(abs, "utf8");
    findings.push(...scanForbiddenTerms(rel, text, forbiddenTerms));
    if (rel.startsWith("templates/")) findings.push(...scanTemplateSource(rel, text, siteIds));
  }
  return findings;
}

export function scanForbiddenTerms(file: string, text: string, terms: readonly string[]): GateFinding[] {
  const lower = text.toLowerCase();
  return terms.filter((t) => lower.includes(t.toLowerCase())).map((t) => ({ file, why: `forbidden source term "${t}"` }));
}

// ---------------------------------------------------------------- create ----

export interface CreateReleaseResult {
  record: ReleaseRecord;
  dir: string;
  created: boolean;
}

export function releaseDir(repoRoot: string, templateId: string, releaseId: string): string {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(templateId)) throw new ReleaseError(`invalid templateId "${templateId}"`);
  if (!RELEASE_ID_RE.test(releaseId) || !releaseId.startsWith(`${templateId}-`)) {
    throw new ReleaseError(`invalid releaseId "${releaseId}" (expected ${templateId}-<x.y.z>-<hash12>)`);
  }
  const root = path.resolve(repoRoot, RELEASES_DIR);
  const dir = path.resolve(root, templateId, releaseId);
  if (!dir.startsWith(`${root}${path.sep}`)) throw new ReleaseError(`release path escapes the release store`);
  return dir;
}

export async function createRelease(opts: {
  repoRoot: string;
  templateId: string;
  major: number;
  templateVersion: string;
  siteIds: readonly string[];
  now: string;
}): Promise<CreateReleaseResult> {
  const { repoRoot, templateId, major, templateVersion } = opts;
  if (!templateVersion.startsWith(`${major}.`)) {
    throw new ReleaseError(`template manifest version ${templateVersion} is not in major v${major}`);
  }
  const { templateDir, sources } = await collectReleaseSources(repoRoot, templateId, major);
  const provenance = JSON.parse(await readFile(path.join(templateDir, "provenance.json"), "utf8")) as { forbiddenTerms: string[] };
  const forbiddenTerms = [...provenance.forbiddenTerms];

  const files: { path: string; sha256: string; size: number }[] = [];
  const findings: GateFinding[] = [];
  const contents = new Map<string, Buffer>();
  for (const [rel, abs] of sources) {
    const buf = await readFile(abs);
    contents.set(rel, buf);
    files.push({ path: rel, sha256: sha256(buf), size: buf.length });
    const text = buf.toString("utf8");
    findings.push(...scanForbiddenTerms(rel, text, forbiddenTerms));
    if (rel.startsWith("templates/")) findings.push(...scanTemplateSource(rel, text, opts.siteIds));
  }
  if (findings.length > 0) {
    throw new ReleaseError(`release gates failed:\n${findings.map((f) => `  ${f.file}: ${f.why}`).join("\n")}`);
  }

  const gates = {
    "source-isolation": { pass: true, detail: `${files.length} files scanned for ${forbiddenTerms.length} forbidden terms` },
    "template-code-rules": {
      pass: true,
      detail: "template imports on allowlist only; no Date/random/network/require/eval; no siteId literals; no env reads (next.config: RECON_BUILD_ID only)",
    },
  };
  const releaseHash = computeReleaseHash({ templateId, templateVersion, forbiddenTerms, gates, files });
  const releaseId = `${templateId}-${templateVersion}-${releaseHash.slice(0, 12)}`;
  const dir = releaseDir(repoRoot, templateId, releaseId);

  const existing = await stat(path.join(dir, "release.json")).catch(() => undefined);
  if (existing) {
    const record = await loadRelease(repoRoot, templateId, releaseId);
    if (record.releaseHash !== releaseHash) {
      throw new ReleaseError(`release ${releaseId} exists with a different hash — refusing to overwrite`);
    }
    await verifyRelease(repoRoot, record);
    return { record, dir, created: false };
  }

  const record: ReleaseRecord = {
    schemaVersion: 1,
    templateId,
    templateVersion,
    releaseId,
    releaseHash,
    templateSourceHash: computeTemplateSourceHash(files),
    createdAt: opts.now,
    files,
    forbiddenTerms,
    gates,
  };

  const tmp = `${dir}.tmp-${process.pid}`;
  await rm(tmp, { recursive: true, force: true });
  for (const [rel, buf] of contents) {
    const target = path.join(tmp, "files", rel);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, buf);
    await chmod(target, 0o444);
  }
  await writeFile(path.join(tmp, "release.json"), `${JSON.stringify(record, null, 2)}\n`);
  await chmod(path.join(tmp, "release.json"), 0o444);
  await mkdir(path.dirname(dir), { recursive: true });
  await rename(tmp, dir);
  return { record, dir, created: true };
}

// ------------------------------------------------------- load + verify ------

export async function loadRelease(repoRoot: string, templateId: string, releaseId: string): Promise<ReleaseRecord> {
  const file = path.join(releaseDir(repoRoot, templateId, releaseId), "release.json");
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new ReleaseError(`template release ${templateId}/${releaseId} not found`);
  }
  const record = ReleaseRecordSchema.parse(raw);
  if (record.releaseId !== releaseId || record.templateId !== templateId) {
    throw new ReleaseError(`release.json at ${templateId}/${releaseId} describes ${record.templateId}/${record.releaseId}`);
  }
  if (!record.releaseId.endsWith(`-${record.releaseHash.slice(0, 12)}`) || record.releaseId !== `${record.templateId}-${record.templateVersion}-${record.releaseHash.slice(0, 12)}`) {
    throw new ReleaseError(`release ${record.releaseId}: id does not match its hash/version`);
  }
  return record;
}

/** Re-hash every stored file; any drift (mutation, extra/missing file) fails. */
export async function verifyRelease(repoRoot: string, record: ReleaseRecord): Promise<void> {
  const root = path.join(releaseDir(repoRoot, record.templateId, record.releaseId), "files");
  // Compare as sorted path lists: a depth-first walk orders "x/page/…" before "x/page.tsx",
  // plain string order does the opposite.
  const byPath = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const onDisk = (await walk(root, new Set())).sort(byPath);
  const expected = record.files.map((f) => f.path);
  if (stableStringify(onDisk) !== stableStringify([...expected].sort(byPath))) {
    throw new ReleaseError(`release ${record.releaseId}: stored file set differs from release.json`);
  }
  for (const f of record.files) {
    const actual = sha256(await readFile(path.join(root, f.path)));
    if (actual !== f.sha256) throw new ReleaseError(`release ${record.releaseId}: ${f.path} was modified`);
  }
  if (computeReleaseHash(record) !== record.releaseHash) {
    throw new ReleaseError(`release ${record.releaseId}: releaseHash does not match its files/metadata`);
  }
  if (computeTemplateSourceHash(record.files) !== record.templateSourceHash) {
    throw new ReleaseError(`release ${record.releaseId}: templateSourceHash does not match its file list`);
  }
}

export async function materializeRelease(repoRoot: string, record: ReleaseRecord, target: string): Promise<void> {
  const root = path.join(releaseDir(repoRoot, record.templateId, record.releaseId), "files");
  await cp(root, target, { recursive: true });
  // Copies keep the read-only mode; the workspace is disposable and must be writable.
  // Re-hash the COPY: the build compiles exactly the bytes the release recorded.
  for (const f of record.files) {
    const p = path.join(target, f.path);
    await chmod(p, 0o644);
    if (sha256(await readFile(p)) !== f.sha256) throw new ReleaseError(`materialized ${f.path} differs from release ${record.releaseId}`);
  }
}
