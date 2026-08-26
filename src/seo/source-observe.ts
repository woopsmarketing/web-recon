import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseRenderedDocumentSeo, urlsEquivalent } from "./head-parse.js";
import { fetchLiveSiteFiles, notFetchedSiteFiles } from "./live-fetch.js";
import { createdAtFromRunId, newSeoRunId, sourceSeoSnapshotDir } from "./store.js";
import {
  SourceSeoSnapshotSchema,
  type SourcePageSeo,
  type SourceSeoSnapshot,
  type SourceSiteSeo,
} from "./types.js";

/**
 * Source SEO Observer (Task 21 A) — how does the ORIGINAL site do SEO?
 *
 * Input: a stored Task 09 site-observation run (immutable) + its lineage
 * verification.json. Everything page-level is read from stored evidence
 * (`rendered.html` desktop, `links.json`, `observation.json`); the only
 * optional network access is the bounded robots.txt/sitemap fetch, because
 * those files exist in no stored artifact.
 *
 * Output: data/<host>/source-seo-snapshots/<run-id>/source-seo-snapshot.json
 * (schema source-seo-snapshot-v1, provenance `observed`). This artifact is
 * EVIDENCE — the Production SEO Plan may audit it but never copy from it.
 */

interface ObservationRunPage {
  pageId: string;
  url: string;
  finalUrl?: string;
  status: string;
  pageObservationFile: string;
}

interface VerificationCandidate {
  candidateUrl: string;
  normalizedCandidateUrl?: string;
  finalUrl?: string;
  httpStatus?: number | null;
  status?: string;
}

interface LinkEntry {
  elementId: string;
  href: string;
  resolvedUrl: string;
  internal: boolean;
}

function pathDepth(url: string): number {
  try {
    const segments = new URL(url).pathname.split("/").filter((s) => s !== "");
    return segments.length;
  } catch {
    return 0;
  }
}

function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.origin}${p}${u.search}`;
  } catch {
    return url;
  }
}

export interface SourceObserveOptions {
  siteObservationFile: string;
  verificationFile?: string;
  liveSiteFiles?: boolean;
  outputDir?: string;
  runId?: string;
  log?: (line: string) => void;
}

export async function observeSourceSeo(options: SourceObserveOptions): Promise<{
  snapshot: SourceSeoSnapshot;
  outputDir: string;
  snapshotFile: string;
}> {
  const log = options.log ?? (() => {});
  const observationFile = path.resolve(options.siteObservationFile);
  const observationDir = path.dirname(observationFile);
  const manifest = JSON.parse(await readFile(observationFile, "utf8")) as {
    rootUrl: string;
    pages: ObservationRunPage[];
  };
  const rootUrl = manifest.rootUrl;
  const host = new URL(rootUrl).host;

  // ---- verification lineage (http status per verified URL) -----------------
  const statusByUrl = new Map<string, { httpStatus: number | null; status: string }>();
  if (options.verificationFile !== undefined) {
    const verification = JSON.parse(await readFile(path.resolve(options.verificationFile), "utf8")) as {
      candidates: VerificationCandidate[];
    };
    for (const candidate of verification.candidates) {
      const record = {
        httpStatus: candidate.httpStatus ?? null,
        status: candidate.status ?? "unknown",
      };
      for (const url of [candidate.candidateUrl, candidate.normalizedCandidateUrl, candidate.finalUrl]) {
        if (url !== undefined) statusByUrl.set(normalizeUrlKey(url), record);
      }
    }
  }

  // ---- page-level observation ---------------------------------------------
  const successPages = manifest.pages.filter((p) => p.status === "success");
  const pages: SourcePageSeo[] = [];
  const linksByPage = new Map<string, LinkEntry[]>();
  for (const page of successPages) {
    const pageDir = path.dirname(path.join(observationDir, page.pageObservationFile));
    const renderedFile = path.join(pageDir, "viewports", "desktop", "rendered.html");
    const linksFile = path.join(pageDir, "viewports", "desktop", "links.json");
    const html = await readFile(renderedFile, "utf8");
    const facts = parseRenderedDocumentSeo(html);
    const links = JSON.parse(await readFile(linksFile, "utf8")) as LinkEntry[];
    linksByPage.set(page.pageId, links);
    const finalUrl = page.finalUrl ?? page.url;
    const verified = statusByUrl.get(normalizeUrlKey(page.url)) ?? statusByUrl.get(normalizeUrlKey(finalUrl));
    pages.push({
      pageId: page.pageId,
      url: page.url,
      finalUrl,
      httpStatus: verified?.httpStatus ?? null,
      htmlLang: facts.htmlLang,
      title: facts.title,
      metaDescription: facts.metaDescription,
      canonical:
        facts.canonicalHref === null
          ? null
          : { href: facts.canonicalHref, selfReferential: urlsEquivalent(facts.canonicalHref, finalUrl) },
      metaRobots: facts.metaRobots,
      hreflangCount: facts.hreflang.length,
      hreflang: facts.hreflang,
      openGraph: facts.openGraph,
      twitter: facts.twitter,
      jsonLd: facts.jsonLd,
      headingOutline: facts.headingOutline,
      imageAltAudit: facts.imageAltAudit,
      links: {
        total: links.length,
        internal: links.filter((l) => l.internal).length,
        external: links.filter((l) => !l.internal).length,
      },
    });
    log(`[seo:observe] ${page.pageId} ${page.url} — title=${facts.title !== null ? "yes" : "NO"} og=${facts.openGraph.length} ld+json=${facts.jsonLd.length}`);
  }

  // ---- site-level analysis -------------------------------------------------
  const pageByUrlKey = new Map<string, SourcePageSeo>();
  for (const page of pages) {
    pageByUrlKey.set(normalizeUrlKey(page.url), page);
    pageByUrlKey.set(normalizeUrlKey(page.finalUrl), page);
  }

  let edges = 0;
  let internalLinkOccurrences = 0;
  const inboundTargets = new Map<string, Set<string>>();
  const brokenInternalLinks: SourceSiteSeo["brokenInternalLinks"] = [];
  const unverifiedTargets = new Set<string>();
  for (const page of pages) {
    const links = linksByPage.get(page.pageId) ?? [];
    const seenTargets = new Set<string>();
    for (const link of links) {
      if (!link.internal) continue;
      internalLinkOccurrences += 1;
      const targetKey = normalizeUrlKey(link.resolvedUrl);
      const targetPage = pageByUrlKey.get(targetKey);
      if (targetPage !== undefined && targetPage.pageId !== page.pageId) {
        if (!seenTargets.has(targetPage.pageId)) {
          seenTargets.add(targetPage.pageId);
          edges += 1;
          let inbound = inboundTargets.get(targetPage.pageId);
          if (inbound === undefined) inboundTargets.set(targetPage.pageId, (inbound = new Set()));
          inbound.add(page.pageId);
        }
        continue;
      }
      const verified = statusByUrl.get(targetKey);
      if (verified === undefined) {
        if (targetPage === undefined) unverifiedTargets.add(targetKey);
        continue;
      }
      const broken =
        (verified.httpStatus !== null && verified.httpStatus >= 400) ||
        verified.status === "http-error" ||
        verified.status === "navigation-error";
      if (broken) {
        brokenInternalLinks.push({
          fromPageId: page.pageId,
          href: link.href,
          resolvedUrl: link.resolvedUrl,
          httpStatus: verified.httpStatus,
          reason: verified.status,
        });
      }
    }
  }

  const rootKey = normalizeUrlKey(rootUrl);
  const orphanCandidates = pages
    .filter((page) => !inboundTargets.has(page.pageId))
    .filter((page) => normalizeUrlKey(page.url) !== rootKey)
    .map((page) => ({ pageId: page.pageId, url: page.url }));

  const groupBy = (extract: (p: SourcePageSeo) => string | null): Map<string, string[]> => {
    const groups = new Map<string, string[]>();
    for (const page of pages) {
      const value = extract(page);
      if (value === null || value === "") continue;
      const existing = groups.get(value);
      if (existing === undefined) groups.set(value, [page.pageId]);
      else existing.push(page.pageId);
    }
    return groups;
  };

  const duplicateTitles = [...groupBy((p) => p.title).entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([title, pageIds]) => ({ title, pageIds }));
  const duplicateDescriptions = [...groupBy((p) => p.metaDescription).entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([description, pageIds]) => ({ description, pageIds }));
  const canonicalClusters = [...groupBy((p) => p.canonical?.href ?? null).entries()].map(
    ([canonical, pageIds]) => ({
      canonical,
      pageIds,
      containsSelfReference: pageIds.some(
        (id) => pages.find((p) => p.pageId === id)?.canonical?.selfReferential === true,
      ),
    }),
  );

  const missing = (kind: SourceSiteSeo["missingMetadata"][number]["kind"], predicate: (p: SourcePageSeo) => boolean) => ({
    kind,
    pageIds: pages.filter(predicate).map((p) => p.pageId),
  });
  const missingMetadata = [
    missing("title", (p) => p.title === null || p.title === ""),
    missing("description", (p) => p.metaDescription === null),
    missing("canonical", (p) => p.canonical === null),
    missing("open-graph", (p) => p.openGraph.length === 0),
    missing("twitter", (p) => p.twitter.length === 0),
    missing("json-ld", (p) => p.jsonLd.length === 0),
    missing("h1", (p) => !p.headingOutline.some((h) => h.level === 1)),
  ].filter((entry) => entry.pageIds.length > 0);

  const indexability: SourceSiteSeo["indexability"] = pages.map((page) => {
    const canonicalSelf = page.canonical === null ? null : page.canonical.selfReferential;
    let verdict: SourceSiteSeo["indexability"][number]["verdict"];
    if (page.metaRobots !== null && /noindex/i.test(page.metaRobots)) verdict = "robots-noindex";
    else if (canonicalSelf === false) verdict = "canonical-points-elsewhere";
    else if (page.httpStatus !== null && (page.httpStatus < 200 || page.httpStatus >= 300))
      verdict = "not-observed";
    else verdict = "no-observed-blocker";
    return {
      pageId: page.pageId,
      url: page.url,
      httpStatus: page.httpStatus,
      metaRobots: page.metaRobots,
      canonicalSelf,
      verdict,
    };
  });

  const siteFiles =
    options.liveSiteFiles === true ? await fetchLiveSiteFiles(rootUrl) : notFetchedSiteFiles();

  const runId = options.runId ?? newSeoRunId();
  const snapshot: SourceSeoSnapshot = SourceSeoSnapshotSchema.parse({
    schemaVersion: 1,
    schemaName: "source-seo-snapshot-v1",
    runId,
    createdAt: createdAtFromRunId(runId),
    host,
    rootUrl,
    provenance: "observed",
    source: {
      siteObservationFile: path.relative(process.cwd(), observationFile),
      verificationFile:
        options.verificationFile !== undefined
          ? path.relative(process.cwd(), path.resolve(options.verificationFile))
          : null,
      pagesObserved: pages.length,
    },
    pages,
    site: {
      routeDepth: pages.map((p) => ({ pageId: p.pageId, url: p.url, depth: pathDepth(p.url) })),
      linkGraph: { nodes: pages.length, edges, internalLinkOccurrences },
      orphanCandidatesWithinObservedSubgraph: orphanCandidates,
      duplicateTitles,
      duplicateDescriptions,
      canonicalClusters,
      missingMetadata,
      brokenInternalLinks,
      unverifiedInternalLinkTargets: {
        targets: unverifiedTargets.size,
        sampleUrls: [...unverifiedTargets].sort().slice(0, 10),
      },
      indexability,
      robotsTxt: siteFiles.robotsTxt,
      sitemaps: siteFiles.sitemaps,
    },
  } satisfies SourceSeoSnapshot);

  const outputDir = path.resolve(options.outputDir ?? sourceSeoSnapshotDir(host, runId));
  await mkdir(outputDir, { recursive: true });
  const snapshotFile = path.join(outputDir, "source-seo-snapshot.json");
  await writeFile(snapshotFile, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  return { snapshot, outputDir, snapshotFile };
}

export async function loadSourceSeoSnapshot(fileOrDir: string): Promise<SourceSeoSnapshot> {
  const resolved = path.resolve(fileOrDir);
  const file = resolved.endsWith(".json") ? resolved : path.join(resolved, "source-seo-snapshot.json");
  return SourceSeoSnapshotSchema.parse(JSON.parse(await readFile(file, "utf8")));
}
