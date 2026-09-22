/**
 * Materialize an authoring-preview app from an immutable Recon Template run
 * (Task 28 Phase 3).
 *
 * The template run is a READ-ONLY input. Its `app/` is copied once into the
 * preview workspace, the two guarded runtime patches are applied to the copy,
 * and `next build` runs once. Every later preview session reuses that build:
 * the whole point of Phase 3 is that authoring never pays a build again.
 *
 * The reuse key is honest — it records the sha256 of the two source runtime
 * files and the patch version, so a template recompiled by a new generator, or
 * a change to src/authoring-preview/patch.ts, forces a rebuild instead of
 * silently serving a stale app.
 */
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { buildApp } from "../recon-template/parity-qa.js";
import {
  AUTHORING_PATCH_VERSION,
  isAuthoringPatched,
  patchLoadPageForAuthoring,
  patchSlotContentForAuthoring,
} from "./patch.js";
import { previewPaths } from "./workspace.js";

const SLOT_CONTENT_REL = path.join("src", "runtime", "slot-content.ts");
const LOAD_PAGE_REL = path.join("src", "runtime", "load-page.ts");

export interface PreviewManifest {
  schemaVersion: 1;
  schemaName: "authoring-preview-v1";
  previewId: string;
  createdAt: string;
  templateRunDir: string;
  templateId: string;
  host: string;
  routes: string[];
  breakpoint: number;
  patchVersion: number;
  /** sha256 of the PRISTINE generated runtime files this preview was cut from. */
  sourceRuntimeHashes: { slotContent: string; loadPage: string };
}

export interface MaterializeResult {
  manifest: PreviewManifest;
  paths: ReturnType<typeof previewPaths>;
  /** true when the app was copied + patched + built by this call. */
  materialized: boolean;
  copyMs: number;
  patchMs: number;
  buildMs: number;
}

function sha256(text: string | Buffer): string {
  return createHash("sha256").update(text).digest("hex");
}

async function exists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

export interface MaterializeOptions {
  templateRunDir: string;
  previewDir: string;
  previewId?: string;
  force?: boolean;
  log?: (line: string) => void;
}

export async function materializeAuthoringPreview(options: MaterializeOptions): Promise<MaterializeResult> {
  const log = options.log ?? ((): void => {});
  const templateAppDir = path.join(options.templateRunDir, "app");
  const manifestRaw = JSON.parse(
    await readFile(path.join(options.templateRunDir, "manifest.json"), "utf8"),
  ) as { templateId: string; source: { host: string }; routes: string[] };
  const routeMap = JSON.parse(
    await readFile(path.join(templateAppDir, "reconstruction-data", "route-map.json"), "utf8"),
  ) as { breakpoint: number };

  const pristineSlotContent = await readFile(path.join(templateAppDir, SLOT_CONTENT_REL), "utf8");
  const pristineLoadPage = await readFile(path.join(templateAppDir, LOAD_PAGE_REL), "utf8");
  if (isAuthoringPatched(pristineSlotContent) || isAuthoringPatched(pristineLoadPage)) {
    throw new Error(
      `template run ${options.templateRunDir} already carries the authoring patch — the immutable template must stay pristine`,
    );
  }
  const sourceRuntimeHashes = {
    slotContent: sha256(pristineSlotContent),
    loadPage: sha256(pristineLoadPage),
  };

  const paths = previewPaths(options.previewDir);
  const previewId = options.previewId ?? path.basename(options.previewDir);
  const manifest: PreviewManifest = {
    schemaVersion: 1,
    schemaName: "authoring-preview-v1",
    previewId,
    createdAt: new Date().toISOString(),
    templateRunDir: options.templateRunDir,
    templateId: manifestRaw.templateId,
    host: manifestRaw.source.host,
    routes: manifestRaw.routes,
    breakpoint: routeMap.breakpoint,
    patchVersion: AUTHORING_PATCH_VERSION,
    sourceRuntimeHashes,
  };

  if (!options.force && (await exists(paths.manifestFile))) {
    const existing = JSON.parse(await readFile(paths.manifestFile, "utf8")) as PreviewManifest;
    const reusable =
      existing.patchVersion === AUTHORING_PATCH_VERSION &&
      existing.templateId === manifest.templateId &&
      existing.sourceRuntimeHashes.slotContent === sourceRuntimeHashes.slotContent &&
      existing.sourceRuntimeHashes.loadPage === sourceRuntimeHashes.loadPage &&
      (await exists(path.join(paths.appDir, ".next", "BUILD_ID")));
    if (reusable) {
      await mkdir(paths.mediaOverrideDir, { recursive: true });
      log(`[authoring-preview] reusing built preview app ${paths.appDir}`);
      return { manifest: existing, paths, materialized: false, copyMs: 0, patchMs: 0, buildMs: 0 };
    }
    log(`[authoring-preview] preview app is stale — rebuilding ${paths.appDir}`);
  }

  await rm(paths.previewDir, { recursive: true, force: true });
  await mkdir(paths.mediaOverrideDir, { recursive: true });

  const copyStart = Date.now();
  // The pre-built `.next` comes along: the patch invalidates it, but Next's
  // incremental cache makes the one required rebuild materially cheaper.
  await cp(templateAppDir, paths.appDir, { recursive: true });
  const copyMs = Date.now() - copyStart;

  const patchStart = Date.now();
  await writeFile(
    path.join(paths.appDir, SLOT_CONTENT_REL),
    patchSlotContentForAuthoring(pristineSlotContent),
    "utf8",
  );
  await writeFile(path.join(paths.appDir, LOAD_PAGE_REL), patchLoadPageForAuthoring(pristineLoadPage), "utf8");
  const patchMs = Date.now() - patchStart;

  const buildMs = await buildApp(paths.appDir, true, log);
  await writeFile(paths.manifestFile, JSON.stringify(manifest, null, 2), "utf8");
  return { manifest, paths, materialized: true, copyMs, patchMs, buildMs };
}
