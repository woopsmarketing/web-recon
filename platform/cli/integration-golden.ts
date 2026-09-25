/**
 * tsx --tsconfig platform/tsconfig.json platform/cli/integration-golden.ts [--write]
 *
 * The pinned Portfolio V0.2 golden integration package (docs/reports/integration/07, rev 9.2.1 —
 * the fixture both sides test against, 07 §16 step 2). It is the PURE emission of one fixed input —
 * site boost-interior-demo, mode public, at 2026-09-22T12:00:00Z (integration.test.ts's AT), routes
 * of templates/interior-01/v1 — so the same canonical data always gives the same bytes and the same
 * resourceVersion (INV-1/INV-26), and a data change gives a new file name (RV5).
 *
 * Default: CHECK — exit 1 when the golden directory differs from what the producer emits now.
 * --write: validate (fail closed: any validator error or warning refuses), then rewrite
 *          manifest.json, portfolio.<resourceVersion>.json and golden.json. A stale
 *          portfolio.<other version>.json is removed; an existing file of the SAME version with
 *          different bytes is refused (one resourceVersion never names two byte sequences).
 *
 * Nothing is built, published or uploaded: this writes only under platform/test/golden/. The
 * package on disk in data/site-builds/ (the V0.1 golden and the live pilot's rollback) is untouched.
 */
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareSiteInput } from "../build/site-build";
import { createContentReader } from "../content/reader";
import { CORE_SCHEMA_VERSION, PORTFOLIO_SCHEMA_VERSION, PRODUCER_VERSION } from "../integration/contract";
import { emitIntegration, type PortfolioDocument } from "../integration/emit";
import { validateIntegration } from "../integration/validate";
import { planRoutes } from "../site/routes";
import { sha256 } from "../util/hash";
import template from "../../templates/interior-01/v1/template";

export const GOLDEN_DIR = "platform/test/golden/portfolio-v0.2";
export const GOLDEN_INPUT = { siteId: "boost-interior-demo", mode: "public", at: "2026-09-22T12:00:00Z", template: "interior-01/v1" } as const;

/** golden.json — facts about the two files, every one of them computed from the emission (the test re-derives and compares it whole). */
export function goldenRecord(doc: PortfolioDocument, files: { name: string; bytes: number; sha256: string }[], validator: { errors: number; warnings: number }) {
  const count = <T>(xs: readonly T[], key: (x: T) => string) => {
    const out: Record<string, number> = {};
    for (const x of xs) out[key(x)] = (out[key(x)] ?? 0) + 1;
    return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
  };
  return {
    contractRevision: "9.2.1",
    manifestSchemaVersion: CORE_SCHEMA_VERSION,
    documentSchemaVersion: PORTFOLIO_SCHEMA_VERSION,
    producerVersion: PRODUCER_VERSION,
    input: GOLDEN_INPUT,
    resourceVersion: doc.version,
    files,
    records: doc.records.length,
    counts: {
      projectType: count(doc.records, (r) => r.projectType ?? "absent"),
      total: count(doc.records, (r) => r.pricing?.total?.kind ?? "absent"),
      perArea: count(doc.records, (r) => r.pricing?.perArea?.source ?? "absent"),
      workScopes: doc.workScopes?.length ?? 0,
      facets: Object.fromEntries(Object.entries(doc.facets ?? {}).map(([k, v]) => [k, v.values.length])),
    },
    validator,
  };
}

async function main() {
  const write = process.argv.includes("--write");
  const repoRoot = process.cwd();
  const dir = path.join(repoRoot, GOLDEN_DIR);
  const input = await prepareSiteInput({ repoRoot, siteId: GOLDEN_INPUT.siteId, mode: GOLDEN_INPUT.mode, at: GOLDEN_INPUT.at });
  const planned = planRoutes(template.routes, createContentReader(input.snapshot.content)).routes.map((r) => ({ key: r.key, pattern: r.pattern, paths: r.paths }));
  const e = emitIntegration({ snapshot: input.snapshot, declaredRoutes: template.routes, plannedRoutes: planned });
  const v = validateIntegration(e, { siteId: input.snapshot.siteId, publicOrigin: input.snapshot.site.identity.publicOrigin, pagePaths: new Set(planned.flatMap((r) => r.paths)) });
  if (!e.portfolio) throw new Error("the demo offers no portfolio resource");
  const files = e.files.map((f) => ({ name: path.basename(f.path), bytes: f.bytes.length, sha256: f.sha256, data: f.bytes }));
  const record = `${JSON.stringify(goldenRecord(e.portfolio.document, files.map(({ name, bytes, sha256 }) => ({ name, bytes, sha256 })), { errors: v.errors.length, warnings: v.warnings.length }), null, 2)}\n`;
  const expected = new Map<string, Uint8Array>([...files.map((f) => [f.name, f.data] as const), ["golden.json", new TextEncoder().encode(record)]]);

  const present = new Map<string, Uint8Array>();
  for (const name of await readdir(dir).catch(() => [] as string[])) if (name.endsWith(".json")) present.set(name, await readFile(path.join(dir, name)));
  const drift = [...new Set([...expected.keys(), ...present.keys()])].sort().filter((n) => {
    const a = expected.get(n);
    const b = present.get(n);
    return !a || !b || sha256(a) !== sha256(b);
  });

  if (!write) {
    console.log(JSON.stringify({ goldenDir: GOLDEN_DIR, resourceVersion: e.portfolio.version, validator: { errors: v.errors, warnings: v.warnings }, drift }, null, 2));
    process.exit(drift.length === 0 && v.errors.length === 0 && v.warnings.length === 0 ? 0 : 1);
  }
  if (v.errors.length > 0 || v.warnings.length > 0) throw new Error(`refusing to write a golden that does not validate cleanly:\n${[...v.errors, ...v.warnings].join("\n")}`);
  for (const [name, data] of present) {
    const want = expected.get(name);
    if (want && name.startsWith("portfolio.") && sha256(want) !== sha256(data)) throw new Error(`${name}: the same resourceVersion with different bytes — refused (RV5 immutability)`);
    if (!want) await rm(path.join(dir, name));
  }
  await mkdir(dir, { recursive: true });
  for (const [name, data] of expected) await writeFile(path.join(dir, name), data);
  console.log(JSON.stringify({ goldenDir: GOLDEN_DIR, resourceVersion: e.portfolio.version, wrote: [...expected.keys()], removed: [...present.keys()].filter((n) => !expected.has(n)) }, null, 2));
}

// Run only as a script: integration.test.ts imports goldenRecord / GOLDEN_* from here.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
