/**
 * pnpm design:check <templateId> [--release] [--write-tokens]
 *
 * The static checks of a Template's design system (platform/design/check.ts), as JSON on stdout:
 * the registry table (section → variant → status), the registry findings and, per preset, the
 * placeholders it still names.
 *
 *   (no flag)        exit 1 on a registry finding (a missing file, a mislabelled status, a CSS rule broken)
 *   --release        the RELEASE GATE: additionally exit 1 while any preset names a placeholder or
 *                    the font pins are not reproducible — run before `pnpm template:release`
 *   --write-tokens   rewrite styles/design/tokens.css from the compiler (after changing design/tokens.ts)
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkRegistry, registeredVariants, releaseGate, TOKENS_SHEET } from "../design/check";
import { DesignError } from "../design/errors";
import { templateDesign } from "../design/templates";

const args = process.argv.slice(2);
const templateId = args.find((a) => !a.startsWith("--"));
const flags = new Set(args.filter((a) => a.startsWith("--")));
if (!templateId || [...flags].some((f) => f !== "--release" && f !== "--write-tokens")) {
  console.error("usage: pnpm design:check <templateId> [--release] [--write-tokens]");
  process.exit(2);
}
const repoRoot = process.cwd();
try {
  const design = templateDesign(templateId);
  if (flags.has("--write-tokens")) {
    const file = path.join(repoRoot, design.dir, TOKENS_SHEET);
    const head = /^\/\*[\s\S]*?\*\/\n/.exec(await readFile(file, "utf8"))?.[0] ?? "";
    await writeFile(file, `${head}${design.defaultTokensCss(design.classicTheme)}`);
  }
  const table: Record<string, Record<string, string>> = {};
  for (const v of registeredVariants(design.registry)) (table[v.section] ??= {})[v.variant] = v.status;
  const gate = flags.has("--release") ? await releaseGate({ repoRoot, templateId }) : undefined;
  const issues = gate ? gate.issues : await checkRegistry({ repoRoot, templateId });
  console.log(JSON.stringify({ templateId, mode: gate ? "release-gate" : "registry", pass: issues.length === 0, registry: table, presets: gate?.presets, issues }, null, 2));
  if (issues.length > 0) process.exit(1);
} catch (error) {
  if (!(error instanceof DesignError)) throw error;
  console.error(`design:check ${error.code}: ${error.message}`);
  process.exit(1);
}
