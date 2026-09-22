/**
 * Preflight, executed INSIDE the build workspace against the release's own
 * template + platform code (tsx --tsconfig <workspace template tsconfig>).
 * Resolves the SiteContext exactly as the Next build will, runs the declared
 * collection selections and prints a JSON summary for the build record.
 *
 * usage: tsx --tsconfig <ws>/templates/<id>/v<major>/tsconfig.json preflight.ts <ws>/templates/<id>/v<major>/template.ts
 */
import { pathToFileURL } from "node:url";
import { getSiteContext } from "./bound";
import { projectsQuery, type ProjectSelectionSetting } from "../settings/settings";
import type { TemplateManifest } from "./template-manifest";

const templateFile = process.argv[2];
if (!templateFile) throw new Error("preflight: template manifest path required");
const mod = (await import(pathToFileURL(templateFile).href)) as { default: TemplateManifest };
const template = mod.default;
const ctx = getSiteContext(template);

const warnings: string[] = [];
const selections: Record<string, { mode: string; resultCount: number }> = {};
for (const [key, value] of Object.entries(ctx.settings as Record<string, Record<string, unknown>>)) {
  const selection = value.selection as ProjectSelectionSetting | undefined;
  if (!selection || typeof value.limit !== "number") continue;
  const res = ctx.content.list(projectsQuery({ selection, limit: value.limit }));
  selections[key] = { mode: selection.mode, resultCount: res.items.length };
  for (const w of res.warnings) warnings.push(`${key}: ${w.message}`);
}

process.stdout.write(
  `${JSON.stringify({ ok: true, settings: ctx.settings, theme: ctx.theme, selections, warnings, routes: template.routes, slots: ctx.slotSources })}\n`,
);
