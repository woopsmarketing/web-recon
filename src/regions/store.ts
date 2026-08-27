import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PAGE_REGIONS_FILE,
  REGION_REPORT_DIR,
  REGION_SUMMARY_FILE,
  type PageRegionsArtifact,
} from "./types.js";

/**
 * PageRegion output namespace.
 *
 *   data/<host>/recon-templates/<run>/  ← READ ONLY (the template being grouped)
 *   data/<host>/page-regions/<run-id>/  ← everything this Task writes
 *
 * A NEW kind under `data/`, never a new file inside a template run: historical
 * run directories are an audited invariant of this program and a region compile
 * is not allowed to be the first thing to break it.
 */

const DATA_DIR = "data";
const PAGE_REGIONS_DIR = "page-regions";

/** Hostname folder, mirroring every other store in this codebase. */
export function siteFolder(url: string): string {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host || "unknown-host";
  } catch {
    return "unknown-host";
  }
}

/** `data/<host>/page-regions/<run-id>`. */
export function pageRegionRunDir(rootUrl: string, runId: string): string {
  return path.join(DATA_DIR, siteFolder(rootUrl), PAGE_REGIONS_DIR, runId);
}

/** A run id for the OUTPUT directory only — never inside `page-regions.json`. */
export function newRegionRunId(now = new Date()): string {
  return now.toISOString().replace(/[:.]/g, "-");
}

/** ISO form of a run id, mirroring `createdAtFromRunId` in the template store. */
export function createdAtFromRunId(runId: string): string {
  const m = runId.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (!m) return runId;
  return `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
}

/** The exact bytes written to `page-regions.json`, also used by the smoke suite. */
export function serializeArtifact(artifact: PageRegionsArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export interface WrittenRegionRun {
  runDir: string;
  artifactFile: string;
  summaryFile: string;
}

/**
 * `page-regions.json` carries NO timestamp: it is a pure function of the
 * template it was compiled from, and the guarantee this Task ships is that two
 * compiles of one template are byte-identical. The single clock reading lives in
 * the run directory name and is echoed into the report.
 */
export async function writeRegionRun(
  runDir: string,
  runId: string,
  artifact: PageRegionsArtifact,
  templateRunDir: string,
): Promise<WrittenRegionRun> {
  await mkdir(path.join(runDir, REGION_REPORT_DIR), { recursive: true });
  const artifactFile = path.join(runDir, PAGE_REGIONS_FILE);
  await writeFile(artifactFile, serializeArtifact(artifact), "utf8");

  const summaryFile = path.join(runDir, REGION_REPORT_DIR, REGION_SUMMARY_FILE);
  const landmarks: Record<string, number> = {};
  const rootTags: Record<string, number> = {};
  for (const region of artifact.regions) {
    landmarks[region.landmark.kind] = (landmarks[region.landmark.kind] ?? 0) + 1;
    rootTags[region.rootTag] = (rootTags[region.rootTag] ?? 0) + 1;
  }
  const largest = [...artifact.regions]
    .sort((a, b) => b.bindingCount - a.bindingCount || (a.regionId < b.regionId ? -1 : 1))
    .slice(0, 20)
    .map((region) => ({
      regionId: region.regionId,
      scope: region.scope,
      rootTag: region.rootTag,
      elementCount: region.elementCount,
      bindingCount: region.bindingCount,
      slotKeys: region.slotKeys.length,
    }));
  await writeFile(
    summaryFile,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        runId,
        createdAt: createdAtFromRunId(runId),
        templateId: artifact.templateId,
        templateRunDir: templateRunDir.split(path.sep).join("/"),
        counts: artifact.counts,
        landmarkBreakdown: landmarks,
        rootTagBreakdown: rootTags,
        largestRegions: largest,
        limitations: artifact.limitations,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  return { runDir, artifactFile, summaryFile };
}
