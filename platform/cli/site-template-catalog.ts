/**
 * pnpm site:template-catalog --out <dir>      write the template catalog export (catalog.json + previews/*.jpg)
 * pnpm site:template-catalog --check <dir>    exit 1 when <dir> differs from what would be generated (generatedAt ignored)
 *
 * Read-only on the repository: releases (data/template-releases), presentation files + preview pictures
 * (data/template-catalog), site starters (data/site-starters). Writes only catalog.json and previews/* inside --out.
 * No network, no build, no publish.
 */
import path from "node:path";
import { CatalogError, buildCatalog, diffCatalogExport, writeCatalogExport } from "../catalog/catalog";

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(name);
  const value = i >= 0 ? args[i + 1] : undefined;
  return value && !value.startsWith("--") ? value : undefined;
}
const out = flag("--out");
const check = flag("--check");
const known = new Set(["--out", "--check"]);
const unknown = args.filter((a, i) => (a.startsWith("--") ? !known.has(a) : !known.has(args[i - 1] ?? "")));
if ((out === undefined) === (check === undefined) || unknown.length > 0) {
  console.error("usage: pnpm site:template-catalog --out <dir>   |   pnpm site:template-catalog --check <dir>");
  process.exit(2);
}

try {
  const repoRoot = process.cwd();
  const built = await buildCatalog({ repoRoot });
  const summary = built.catalog.templates.map((t) => ({ templateId: t.templateId, releases: t.releases.length, starters: t.releases.filter((r) => r.starter).length, previews: Object.values(t.previews).filter(Boolean).length }));
  if (out !== undefined) {
    const dir = path.resolve(repoRoot, out);
    await writeCatalogExport(dir, built);
    console.log(JSON.stringify({ status: "written", out: dir, sourceCommit: built.catalog.sourceCommit, templates: summary }, null, 2));
  } else {
    const dir = path.resolve(repoRoot, check as string);
    const problems = await diffCatalogExport(dir, built);
    if (problems.length > 0) {
      console.error(`site:template-catalog --check FAILED: ${dir} is out of date\n- ${problems.join("\n- ")}`);
      process.exit(1);
    }
    console.log(JSON.stringify({ status: "in-sync", dir, templates: summary }, null, 2));
  }
} catch (error) {
  console.error(`site:template-catalog FAILED: ${error instanceof CatalogError ? error.message : (error as Error).message}`);
  process.exit(1);
}
