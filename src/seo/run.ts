import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { checkBrandIsolation, deriveForbiddenTerms } from "./brand-isolation.js";
import {
  buildProductionSeoPlan,
  loadContentRunForSeo,
  loadTemplateForSeo,
  checkForbiddenCopy,
  type ProvidedBusinessFacts,
} from "./production-plan.js";
import { renderPlanHead } from "./render-head.js";
import { generateRobotsTxt, generateSitemapXml } from "./robots-sitemap.js";
import { loadSourceSeoSnapshot } from "./source-observe.js";
import { createdAtFromRunId, newSeoRunId, productionSeoPlanDir } from "./store.js";
import {
  ProductionSeoPlanManifestSchema,
  ProductionSeoPlanSchema,
  RenderedHeadSchema,
  type PlannedValue,
  type ProductionSeoPlan,
  type ProductionSeoPlanManifest,
  type RenderedHead,
} from "./types.js";

/**
 * Production SEO Plan run — one directory holding the plan, the rendered
 * head, robots.txt, the sitemap (plan or final), the consolidated
 * needs-input report and the manifest with both automated checks
 * (forbidden-copy, brand isolation). A failing check fails the run.
 */

export interface CreatePlanRunOptions {
  templateManifestRef: string;
  contentRunDir: string;
  sourceSnapshotRef: string;
  productionDomain?: string;
  facts?: ProvidedBusinessFacts;
  outputDir?: string;
  runId?: string;
  log?: (line: string) => void;
}

/** Extract only the strings that will actually be RENDERED as production SEO. */
export function renderedSurfaceOf(plan: ProductionSeoPlan, renderedHead: RenderedHead, robotsTxt: string, sitemapXml: string): { location: string; content: unknown }[] {
  const planned = (route: string, field: string, value: PlannedValue): { location: string; content: unknown } => ({
    location: `plan.routes[${route}].${field}`,
    content: [value.value, value.previewFallback ?? null],
  });
  const documents: { location: string; content: unknown }[] = [];
  for (const route of plan.routes) {
    documents.push(
      planned(route.route, "title", route.title),
      planned(route.route, "description", route.description),
      { location: `plan.routes[${route.route}].canonical`, content: route.canonical.value },
      planned(route.route, "og.title", route.openGraph.title),
      planned(route.route, "og.description", route.openGraph.description),
      planned(route.route, "og.url", route.openGraph.url),
      planned(route.route, "og.image", route.openGraph.image),
      planned(route.route, "og.siteName", route.openGraph.siteName),
      planned(route.route, "twitter.title", route.twitter.title),
      planned(route.route, "twitter.site", route.twitter.site),
      { location: `plan.routes[${route.route}].jsonLd`, content: route.jsonLd.json ?? null },
    );
  }
  documents.push({ location: "site.siteName", content: plan.site.siteName.value });
  documents.push({
    location: "rendered-head",
    content: renderedHead.routes.map((r) => ({ route: r.route, title: r.title, headHtml: r.headHtml })),
  });
  documents.push({ location: "robots.txt", content: robotsTxt });
  documents.push({ location: "sitemap.xml", content: sitemapXml });
  return documents;
}

function countNeedsInput(plan: ProductionSeoPlan): { total: number; entries: { location: string; basis: string }[] } {
  const entries: { location: string; basis: string }[] = [];
  const visit = (location: string, value: unknown): void => {
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      if (record.status === "needs-input") {
        entries.push({ location, basis: typeof record.basis === "string" ? record.basis : "" });
        return;
      }
      for (const [key, child] of Object.entries(record)) visit(`${location}.${key}`, child);
    }
  };
  visit("domainState", plan.domainState);
  visit("site", plan.site);
  for (const route of plan.routes) visit(`routes[${route.route}]`, route);
  return { total: entries.length, entries };
}

export async function createProductionSeoPlanRun(options: CreatePlanRunOptions): Promise<{
  manifest: ProductionSeoPlanManifest;
  plan: ProductionSeoPlan;
  outputDir: string;
}> {
  const log = options.log ?? (() => {});
  const template = await loadTemplateForSeo(options.templateManifestRef);
  const contentRun = await loadContentRunForSeo(options.contentRunDir);
  const snapshot = await loadSourceSeoSnapshot(options.sourceSnapshotRef);
  const runId = options.runId ?? newSeoRunId();

  const plan = buildProductionSeoPlan({
    runId,
    template,
    contentRun,
    sourceSnapshot: snapshot,
    productionDomain: options.productionDomain,
    facts: options.facts,
  });

  const upstreamTitles = new Map(template.routes.map((r) => [r.key, r.title ?? null]));
  const renderedHead = renderPlanHead(plan, upstreamTitles);
  const robotsTxt = generateRobotsTxt(plan);
  const sitemap = generateSitemapXml(plan);

  const forbiddenCopy = checkForbiddenCopy(plan, snapshot);
  const forbiddenTerms = deriveForbiddenTerms(snapshot);
  const brandIsolation = checkBrandIsolation(
    forbiddenTerms,
    renderedSurfaceOf(plan, renderedHead, robotsTxt, sitemap.xml),
  );
  const needsInput = countNeedsInput(plan);

  const outputDir = path.resolve(options.outputDir ?? productionSeoPlanDir(template.sourceHost, runId));
  await mkdir(path.join(outputDir, "report"), { recursive: true });
  const files = {
    planFile: "production-seo-plan.json",
    robotsFile: "robots.txt",
    sitemapFile: sitemap.filename,
    renderedHeadFile: "rendered-head.json",
    needsInputFile: "report/needs-input.json",
  };
  const manifest = ProductionSeoPlanManifestSchema.parse({
    schemaVersion: 1,
    schemaName: "production-seo-plan-v1",
    runId,
    createdAt: createdAtFromRunId(runId),
    sourceHost: template.sourceHost,
    inputs: {
      templateManifestFile: path.relative(process.cwd(), template.manifestFile),
      templateId: template.templateId,
      contentRunDir: path.relative(process.cwd(), contentRun.runDir),
      sourceSnapshotDir: path.relative(process.cwd(), path.resolve(options.sourceSnapshotRef)),
      sourceSnapshotRunId: snapshot.runId,
    },
    domainState: plan.domainState,
    counts: {
      routes: plan.routes.length,
      contentInjectedRoutes: plan.routes.filter((r) => r.contentScope === "content-injected").length,
      knownTitles: plan.routes.filter((r) => r.title.status === "known").length,
      needsInputTitles: plan.routes.filter((r) => r.title.status === "needs-input").length,
      knownDescriptions: plan.routes.filter((r) => r.description.status === "known").length,
      needsInputDescriptions: plan.routes.filter((r) => r.description.status === "needs-input").length,
      needsInputValues: needsInput.total,
    },
    checks: { forbiddenCopy, brandIsolation },
    files,
  } satisfies ProductionSeoPlanManifest);

  await writeFile(path.join(outputDir, files.planFile), JSON.stringify(plan, null, 2) + "\n", "utf8");
  await writeFile(path.join(outputDir, files.robotsFile), robotsTxt, "utf8");
  await writeFile(path.join(outputDir, files.sitemapFile), sitemap.xml, "utf8");
  await writeFile(path.join(outputDir, files.renderedHeadFile), JSON.stringify(renderedHead, null, 2) + "\n", "utf8");
  await writeFile(
    path.join(outputDir, files.needsInputFile),
    JSON.stringify({ total: needsInput.total, entries: needsInput.entries }, null, 2) + "\n",
    "utf8",
  );
  await writeFile(path.join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", "utf8");

  log(`[seo:plan] routes ${plan.routes.length} (injected ${manifest.counts.contentInjectedRoutes}) — needs-input values ${needsInput.total}`);
  log(`[seo:plan] forbidden-copy ${forbiddenCopy.pass ? "PASS" : "FAIL"} (${forbiddenCopy.comparisons} comparisons), brand isolation ${brandIsolation.pass ? "PASS" : "FAIL"} (${brandIsolation.scannedStrings} strings vs ${forbiddenTerms.length} terms)`);
  if (!forbiddenCopy.pass || !brandIsolation.pass) {
    throw new Error(
      `production SEO plan failed its own checks: forbiddenCopy=${forbiddenCopy.pass} brandIsolation=${brandIsolation.pass} — see ${outputDir}/manifest.json`,
    );
  }
  return { manifest, plan, outputDir };
}

export interface LoadedPlanRun {
  runDir: string;
  manifest: ProductionSeoPlanManifest;
  plan: ProductionSeoPlan;
  renderedHead: RenderedHead;
  robotsTxt: string;
  sitemapXml: string | null;
  templateAppDir: string;
}

export async function loadProductionSeoPlanRun(runDirRef: string): Promise<LoadedPlanRun> {
  const runDir = path.resolve(runDirRef.endsWith("manifest.json") ? path.dirname(runDirRef) : runDirRef);
  const manifest = ProductionSeoPlanManifestSchema.parse(
    JSON.parse(await readFile(path.join(runDir, "manifest.json"), "utf8")),
  );
  const plan = ProductionSeoPlanSchema.parse(
    JSON.parse(await readFile(path.join(runDir, manifest.files.planFile), "utf8")),
  );
  const renderedHead = RenderedHeadSchema.parse(
    JSON.parse(await readFile(path.join(runDir, manifest.files.renderedHeadFile), "utf8")),
  );
  const robotsTxt = await readFile(path.join(runDir, manifest.files.robotsFile), "utf8");
  const sitemapXml =
    plan.domainState.mode === "preview"
      ? null
      : await readFile(path.join(runDir, manifest.files.sitemapFile), "utf8");
  const templateAppDir = path.join(path.dirname(path.resolve(manifest.inputs.templateManifestFile)), "app");
  return { runDir, manifest, plan, renderedHead, robotsTxt, sitemapXml, templateAppDir };
}
