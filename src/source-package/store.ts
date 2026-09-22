import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AssetsManifestSchema,
  ConfigManifestSchema,
  NetworkManifestSchema,
  ScriptsManifestSchema,
  SourcePackageManifestSchema,
  StylesManifestSchema,
  SOURCE_PACKAGE_SCHEMA_VERSION,
  type SourcePackageCapture,
  type SourcePackageManifest,
  type SourcePackagePointer,
} from "./types.js";

/**
 * Source Package persistence.
 *
 *   <dir>/                       (viewports/<id>/source-package inside an observation)
 *     manifest.json              root manifest: source, document, limits, counts, hash
 *     document/response.html     initial network document, RAW bytes as served
 *     document/runtime.html      runtime DOM snapshot (page.content())
 *     styles/manifest.json       + st0001.<sha12>.css … (authored / .cssom. serialized)
 *     scripts/manifest.json      + sc0001.<sha12>.js …
 *     assets/manifest.json       inventory only (no downloads in Phase 1)
 *     network/manifest.json      + n0007.<sha12>.<ext> for bodies no style/script owns
 *     config/manifest.json       + cf0001.<sha12>.json …
 *
 * JSON is written with keys sorted at every depth (`stableStringify`), so two
 * captures of an unchanged page differ only where the evidence differs
 * (timestamps, arrival sequence). Blob names carry the content hash.
 */

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object" && !(value instanceof Buffer)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) continue;
      out[key] = sortKeysDeep(child);
    }
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

export interface WrittenSourcePackage {
  dir: string;
  manifestPath: string;
  bytes: number;
  fileCount: number;
  manifest: SourcePackageManifest;
}

/** Validate (zod) and write a package into `dir`. Returns measured totals. */
export async function writeSourcePackage(
  dir: string,
  capture: SourcePackageCapture,
): Promise<WrittenSourcePackage> {
  const manifest = SourcePackageManifestSchema.parse(capture.manifest);
  const styles = StylesManifestSchema.parse(capture.styles);
  const scripts = ScriptsManifestSchema.parse(capture.scripts);
  const assets = AssetsManifestSchema.parse(capture.assets);
  const network = NetworkManifestSchema.parse(capture.network);
  const config = ConfigManifestSchema.parse(capture.config);

  // A package is written whole: a stale blob from an earlier write into the
  // same directory would otherwise sit beside the new manifest unreferenced.
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  let bytes = 0;
  let fileCount = 0;
  const writeText = async (rel: string, text: string): Promise<void> => {
    const file = path.join(dir, rel);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text, "utf8");
    bytes += Buffer.byteLength(text, "utf8");
    fileCount++;
  };
  for (const blob of capture.blobs) {
    const file = path.join(dir, blob.file);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, blob.data);
    bytes += blob.data.byteLength;
    fileCount++;
  }
  await writeText(manifest.files.styles, stableStringify(styles));
  await writeText(manifest.files.scripts, stableStringify(scripts));
  await writeText(manifest.files.assets, stableStringify(assets));
  await writeText(manifest.files.network, stableStringify(network));
  await writeText(manifest.files.config, stableStringify(config));
  await writeText("manifest.json", stableStringify(manifest));
  return { dir, manifestPath: path.join(dir, "manifest.json"), bytes, fileCount, manifest };
}

/** The pointer embedded in `observation.json` for one viewport. */
export function makeSourcePackagePointer(
  written: WrittenSourcePackage,
  dirRelative: string,
): SourcePackagePointer {
  const m = written.manifest;
  return {
    schemaVersion: SOURCE_PACKAGE_SCHEMA_VERSION,
    dir: dirRelative,
    manifest: `${dirRelative}/manifest.json`,
    bytes: written.bytes,
    fileCount: written.fileCount,
    contentHash: m.contentHash,
    counts: {
      styles: m.counts.styles.total,
      stylesRawCaptured: m.counts.styles.rawBytesCaptured,
      scripts: m.counts.scripts.total,
      scriptResponsesCaptured: m.counts.scripts.responsesCaptured,
      assets: Object.values(m.counts.assets).reduce((a, b) => a + b, 0),
      network: m.counts.network.total,
      config: Object.values(m.counts.config).reduce((a, b) => a + b, 0),
    },
    initialDocument: m.document.initial.status,
    runtimeDom: m.document.runtimeDom.status,
  };
}

export interface LoadedSourcePackage {
  dir: string;
  manifest: SourcePackageManifest;
  styles: ReturnType<typeof StylesManifestSchema.parse>;
  scripts: ReturnType<typeof ScriptsManifestSchema.parse>;
  assets: ReturnType<typeof AssetsManifestSchema.parse>;
  network: ReturnType<typeof NetworkManifestSchema.parse>;
  config: ReturnType<typeof ConfigManifestSchema.parse>;
}

/** Read a package back (manifests only; blobs are read by the consumer on demand). */
export async function loadSourcePackage(dir: string): Promise<LoadedSourcePackage> {
  const read = async (rel: string): Promise<unknown> => JSON.parse(await readFile(path.join(dir, rel), "utf8")) as unknown;
  const manifest = SourcePackageManifestSchema.parse(await read("manifest.json"));
  return {
    dir,
    manifest,
    styles: StylesManifestSchema.parse(await read(manifest.files.styles)),
    scripts: ScriptsManifestSchema.parse(await read(manifest.files.scripts)),
    assets: AssetsManifestSchema.parse(await read(manifest.files.assets)),
    network: NetworkManifestSchema.parse(await read(manifest.files.network)),
    config: ConfigManifestSchema.parse(await read(manifest.files.config)),
  };
}
