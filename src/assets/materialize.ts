/**
 * Content-hash asset materialization (Task 22 C) + rewrite map (D) +
 * replacement seam (J).
 *
 * Fetch policy:
 *  - candidates are inventory URL entries classified `safe-to-materialize`
 *    or `replacement-recommended` (fetched so the runtime dependency dies,
 *    but flagged for operator replacement);
 *  - `replacement-required` (brand marks, people, customer identity) and
 *    `license-needs-review` (fonts) are NEVER auto-fetched — recorded as
 *    `skipped-<classification>`;
 *  - truncated URLs are `skipped-truncated`;
 *  - the host allowlist is EXACTLY the set of hosts the inventory observed —
 *    the fetcher cannot be pointed anywhere else.
 *
 * Storage: media/<sha256>.<ext>; identical bytes collapse into one file.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { mapWithConcurrency, safeFetchAsset, extensionForMime, DEFAULT_FETCH_POLICY } from "./safe-fetch.js";
import type { SafeFetchPolicy } from "./safe-fetch.js";
import { assetMaterializationDir, createdAtFromRunId, newAssetRunId } from "./store.js";
import type { LoadedInventoryRun } from "./run.js";
import {
  ASSET_MATERIALIZATION_SCHEMA_NAME,
  ASSET_REPLACEMENT_SCHEMA_NAME,
  ASSET_SCHEMA_VERSION,
  AssetMaterializationManifestSchema,
  ReplacementManifestSchema,
  RewriteMapSchema,
  type AssetClassification,
  type AssetMaterializationManifest,
  type MaterializedEntry,
  type ReplacementManifest,
  type RewriteMap,
} from "./types.js";

const MATERIALIZED_CLASSES: AssetClassification[] = [
  "safe-to-materialize",
  "replacement-recommended",
];

function expectedKindFor(kind: string): SafeFetchPolicy["expectedKind"] {
  if (kind === "source" || kind === "video") return "video";
  if (kind === "audio") return "audio";
  if (kind === "font") return "font";
  if (kind === "css-background") return "image";
  return "image";
}

export interface MaterializeOptions {
  inventoryRun: LoadedInventoryRun;
  runId?: string;
  outputDir?: string;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  concurrency?: number;
  spacingMs?: number;
  /** TEST-ONLY passthroughs into the fetch policy (local fixtures). */
  allowPrivateHostPorts?: Set<string>;
  allowedPorts?: number[];
  lookup?: SafeFetchPolicy["lookup"];
  log?: (line: string) => void;
}

export interface MaterializationRunResult {
  outputDir: string;
  manifest: AssetMaterializationManifest;
  rewriteMap: RewriteMap;
  replacementManifest: ReplacementManifest;
}

export async function createAssetMaterializationRun(
  options: MaterializeOptions,
): Promise<MaterializationRunResult> {
  const log = options.log ?? ((): void => {});
  const { inventory, classification } = options.inventoryRun;
  const classByInventoryId = new Map(
    classification.map((d) => [d.inventoryId, d.classification]),
  );

  const urlEntries = inventory.entries.filter(
    (e): e is typeof e & { url: string } => e.url !== null,
  );
  const allowedHosts = new Set(
    urlEntries.map((e) => new URL(e.url).hostname),
  );

  const runId = options.runId ?? newAssetRunId();
  const outputDir = path.resolve(
    options.outputDir ?? assetMaterializationDir(inventory.sourceHost, runId),
  );
  const mediaDir = path.join(outputDir, "media");
  await mkdir(mediaDir, { recursive: true });
  await mkdir(path.join(outputDir, "report"), { recursive: true });

  const policyBase = {
    timeoutMs: options.timeoutMs ?? DEFAULT_FETCH_POLICY.timeoutMs,
    maxBytes: options.maxBytes ?? DEFAULT_FETCH_POLICY.maxBytes,
    maxRedirects: options.maxRedirects ?? DEFAULT_FETCH_POLICY.maxRedirects,
    allowedPorts: options.allowedPorts,
    allowPrivateHostPorts: options.allowPrivateHostPorts,
    lookup: options.lookup,
  };
  const concurrency = options.concurrency ?? 2;
  const spacingMs = options.spacingMs ?? 100;

  const shaToFile = new Map<string, string>(); // sha256 -> localPath
  const shaSizes = new Map<string, number>(); // sha256 -> byte size (dedup-safe)

  const candidates = urlEntries.filter((entry) => {
    const cls = classByInventoryId.get(entry.inventoryId);
    return cls !== undefined && MATERIALIZED_CLASSES.includes(cls) && !entry.truncated;
  });
  log(
    `materializing ${candidates.length}/${urlEntries.length} url entries ` +
      `(concurrency ${concurrency}, hosts: ${[...allowedHosts].sort().join(", ")})`,
  );

  const fetched = await mapWithConcurrency(
    candidates,
    concurrency,
    spacingMs,
    async (entry): Promise<MaterializedEntry> => {
      const result = await safeFetchAsset(entry.url, {
        ...policyBase,
        allowedHosts,
        expectedKind: expectedKindFor(entry.kind),
      });
      if (result.status !== "fetched" || !result.body) {
        return {
          inventoryId: entry.inventoryId,
          sourceUrl: entry.url,
          classification: classByInventoryId.get(entry.inventoryId) ?? "replacement-recommended",
          status: result.status,
          httpStatus: result.httpStatus,
          mime: result.mime,
          size: null,
          sha256: null,
          localPath: null,
          redirectChain: result.redirectChain,
        };
      }
      const sha256 = createHash("sha256").update(result.body).digest("hex");
      const ext = extensionForMime(result.mime ?? "", entry.url);
      let localPath = shaToFile.get(sha256);
      if (!localPath) {
        localPath = `/media/${sha256}.${ext}`;
        shaToFile.set(sha256, localPath);
        shaSizes.set(sha256, result.body.length);
        await writeFile(path.join(mediaDir, `${sha256}.${ext}`), result.body);
      }
      return {
        inventoryId: entry.inventoryId,
        sourceUrl: entry.url,
        classification: classByInventoryId.get(entry.inventoryId) ?? "replacement-recommended",
        status: "fetched",
        httpStatus: result.httpStatus,
        mime: result.mime,
        size: result.body.length,
        sha256,
        localPath,
        redirectChain: result.redirectChain,
      };
    },
  );

  const skipped: MaterializedEntry[] = urlEntries
    .filter((entry) => !candidates.includes(entry))
    .map((entry) => {
      const cls = classByInventoryId.get(entry.inventoryId) ?? "replacement-recommended";
      return {
        inventoryId: entry.inventoryId,
        sourceUrl: entry.url,
        classification: cls,
        status: entry.truncated ? "skipped-truncated" : `skipped-${cls}`,
        httpStatus: null,
        mime: null,
        size: null,
        sha256: null,
        localPath: null,
        redirectChain: [],
      };
    });

  const entries = [...fetched, ...skipped].sort((a, b) =>
    a.inventoryId.localeCompare(b.inventoryId),
  );

  const rewriteMap: RewriteMap = RewriteMapSchema.parse({
    schemaVersion: ASSET_SCHEMA_VERSION,
    entries: entries
      .filter((e) => e.status === "fetched" && e.localPath !== null)
      .map((e) => {
        const inventoryEntry = inventory.entries.find(
          (i) => i.inventoryId === e.inventoryId,
        );
        const contexts: ("html" | "css")[] =
          inventoryEntry?.origin === "generated-css-url" ? ["css"] : ["html", "css"];
        return { sourceUrl: e.sourceUrl, localPath: e.localPath as string, contexts };
      })
      .sort((a, b) => b.sourceUrl.length - a.sourceUrl.length || a.sourceUrl.localeCompare(b.sourceUrl)),
  } satisfies RewriteMap);

  // Replacement seam (J): every asset an operator should or must replace.
  const replacementManifest: ReplacementManifest = ReplacementManifestSchema.parse({
    schemaVersion: ASSET_SCHEMA_VERSION,
    schemaName: ASSET_REPLACEMENT_SCHEMA_NAME,
    entries: inventory.entries
      .filter((entry) => {
        const cls = entry.url ? classByInventoryId.get(entry.inventoryId) : undefined;
        return cls === "replacement-recommended" || cls === "replacement-required";
      })
      .map((entry) => {
        const cls = classByInventoryId.get(entry.inventoryId) as AssetClassification;
        return {
          inventoryId: entry.inventoryId,
          sourceUrl: entry.url,
          classification: cls,
          slotKeys: entry.slotKeys,
          imageBrief: entry.imageBrief,
          replacement: {
            status: "awaiting-input" as const,
            providedFile: null,
            providedBy: null,
          },
          note:
            cls === "replacement-required"
              ? "NOT auto-fetched: source brand / person / customer-identity surface. Supply a replacement image (connects to the Task 19 imageBrief for the joined slot) and re-run materialization."
              : "Materialized locally for runtime independence, but the content is still the source site's. Replacement recommended.",
        };
      }),
  } satisfies ReplacementManifest);

  const totalBytes = [...shaSizes.values()].reduce((sum, size) => sum + size, 0);

  const counts = {
    candidates: candidates.length,
    fetched: entries.filter((e) => e.status === "fetched").length,
    skippedByClassification: entries.filter((e) => e.status.startsWith("skipped-") && e.status !== "skipped-truncated").length,
    skippedTruncated: entries.filter((e) => e.status === "skipped-truncated").length,
    failed: entries.filter((e) => e.status !== "fetched" && !e.status.startsWith("skipped-")).length,
    uniqueFiles: shaToFile.size,
    totalBytes,
    rewriteEntries: rewriteMap.entries.length,
  };

  const manifest: AssetMaterializationManifest = AssetMaterializationManifestSchema.parse({
    schemaVersion: ASSET_SCHEMA_VERSION,
    schemaName: ASSET_MATERIALIZATION_SCHEMA_NAME,
    runId,
    createdAt: createdAtFromRunId(runId),
    sourceHost: inventory.sourceHost,
    inventoryRunDir: path.relative(process.cwd(), options.inventoryRun.runDir),
    policy: {
      timeoutMs: policyBase.timeoutMs,
      maxBytes: policyBase.maxBytes,
      maxRedirects: policyBase.maxRedirects,
      concurrency,
      allowedHosts: [...allowedHosts].sort(),
      materializedClassifications: MATERIALIZED_CLASSES,
    },
    counts,
    files: {
      rewriteMap: "rewrite-map.json",
      replacementManifest: "replacement-manifest.json",
      mediaDir: "media",
    },
    entries,
  } satisfies AssetMaterializationManifest);

  const writeJson = async (file: string, value: unknown): Promise<void> =>
    writeFile(path.join(outputDir, file), JSON.stringify(value, null, 2) + "\n", "utf8");
  await writeJson("manifest.json", manifest);
  await writeJson("rewrite-map.json", rewriteMap);
  await writeJson("replacement-manifest.json", replacementManifest);
  log(
    `materialization run written: ${outputDir} — fetched ${counts.fetched}/${counts.candidates}, ` +
      `${counts.uniqueFiles} unique files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB`,
  );

  return { outputDir, manifest, rewriteMap, replacementManifest };
}

export interface LoadedMaterializationRun {
  runDir: string;
  manifest: AssetMaterializationManifest;
  rewriteMap: RewriteMap;
  replacementManifest: ReplacementManifest;
  mediaDir: string;
}

export async function loadAssetMaterializationRun(
  runDirRef: string,
): Promise<LoadedMaterializationRun> {
  const runDir = path.resolve(
    runDirRef.endsWith("manifest.json") ? path.dirname(runDirRef) : runDirRef,
  );
  const manifest = AssetMaterializationManifestSchema.parse(
    JSON.parse(await readFile(path.join(runDir, "manifest.json"), "utf8")),
  );
  const rewriteMap = RewriteMapSchema.parse(
    JSON.parse(await readFile(path.join(runDir, manifest.files.rewriteMap), "utf8")),
  );
  const replacementManifest = ReplacementManifestSchema.parse(
    JSON.parse(
      await readFile(path.join(runDir, manifest.files.replacementManifest), "utf8"),
    ),
  );
  return {
    runDir,
    manifest,
    rewriteMap,
    replacementManifest,
    mediaDir: path.join(runDir, manifest.files.mediaDir),
  };
}
