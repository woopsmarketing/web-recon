/**
 * The fast authoring preview session (Task 28 Phase 3).
 *
 *   preview = immutable Recon Template
 *           + customer authored Site state (authored.slotValues)
 *           + lightweight theme / asset overlays (authored.theme, authored.assets)
 *
 * WHAT AN EDIT COSTS. Nothing in this file runs reconstruction, compiles a
 * template, creates a theme run, materializes assets or bakes a production
 * package. A text or URL edit is one atomic overlay write plus one epoch
 * write; a theme edit is one CSS write; an image edit is one file write into
 * the preview's own media override directory. `next build` is paid ONCE, when
 * the preview app is materialized, and reused by every later session.
 *
 * WHY NOT A WORKER RESTART PER EDIT. Restarting `next start` is correct — it
 * is what src/recon-template/parity-qa.ts already does — but ~320 ms of every
 * restart is Node/Next process boot that no tuning removes, and it discards
 * the warm page cache. It is kept as the explicit `hot: false` fallback and as
 * the correctness reference, not as the authoring path.
 *
 * WHY NOT PROXY SUBSTITUTION. A proxy that rewrites values in the response
 * body addresses a STRING; Slot V2 addresses an OCCURRENCE
 * (pageId/viewport/nodeId/childIndex) and verifies `expectedValue` before
 * writing. Substitution discards that guard. It stays where it already
 * belongs — document-unique strings such as <title> in src/seo/serve.ts.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { startApp } from "../recon-template/parity-qa.js";
import type { RewriteMap } from "../assets/types.js";
import type { SiteThemeAdapter, ThemeFile } from "../theme/types.js";
import { AUTHORING_EPOCH_ENV, AUTHORING_HOT_ENV } from "./patch.js";
import { materializeAuthoringPreview, type PreviewManifest } from "./materialize.js";
import { authoredThemeOverlayCss, type AuthoredThemeInput } from "./lineage.js";
import { startAuthoringProxy, GENERATED_STYLES_PATH } from "./serve.js";
import { AuthoringOverlay, authoringPreviewDir } from "./workspace.js";
import type { EditorBridgeConfig } from "./bridge.js";

export interface AuthoringPreviewOptions {
  /** Immutable Recon Template run directory — a READ-ONLY input. */
  templateRunDir: string;
  /** Preview workspace. Default: data/<host>/authoring-previews/<templateRunId>. */
  previewDir?: string;
  /** authored.slotValues — the authoritative content truth. */
  slotValues?: Record<string, unknown>;
  /** authored.theme, applied through the pure theme-overlay generator. */
  authoredTheme?: AuthoredThemeInput;
  /** Base theme + adapter the authored tokens override. */
  themeBase?: { adapter: SiteThemeAdapter; theme: ThemeFile };
  /** Pre-rendered overlay CSS, when the caller already has it. */
  themeOverlayCss?: string;
  /** Frozen materialization media dir + rewrite map (optional lineage). */
  mediaDir?: string;
  rewriteMap?: RewriteMap;
  /** Origins allowed to drive the editor bridge. Empty = NO bridge injected. */
  editorOrigins?: string[];
  /** Drop image overrides left by an earlier session on this preview dir. */
  resetMediaOverrides?: boolean;
  /** false = no hot seam; every content edit restarts the preview worker. */
  hot?: boolean;
  forceMaterialize?: boolean;
  log?: (line: string) => void;
}

export interface AuthoringPreviewSession {
  /** Stable preview URL for the whole session — the editor iframe never moves. */
  readonly baseUrl: string;
  readonly previewDir: string;
  /**
   * The materialized app directory — `<previewDir>/app`.
   *
   * Task 28 integration: region/route ENABLEMENT is not an overlay. It removes
   * nodes from the page trees and rows from the route table, so it is applied
   * to `app/reconstruction-data` by `applyEnablementToApp` and needs a worker
   * restart to be observable (the patched loader memoizes the RAW page JSON
   * for the process lifetime — `rawCache` in patch.ts). Exposing the directory
   * keeps that application in the caller, where the safety decision already
   * lives, instead of teaching this session about enablement.
   */
  readonly appDir: string;
  readonly manifest: PreviewManifest;
  /** true when this session paid the one-time copy + patch + build. */
  readonly materialized: boolean;
  readonly materializeMs: { copy: number; patch: number; build: number };
  /** The exact bytes the proxy splices before </head>, or "" when no bridge. */
  readonly bridgeScript: string;
  readonly hot: boolean;
  upstreamBaseUrl: () => string;
  /** The preview worker's stdout/stderr — `[wr-slot]` guard warnings land here. */
  workerOutput: () => string;
  epoch: () => string;
  slotValues: () => Record<string, unknown>;
  workerStarts: () => number;
  /**
   * Swap the preview worker behind the STABLE proxy url.
   *
   * The editor iframe never moves: the proxy url is the session's identity and
   * the new worker is started before the old one is stopped. This is the same
   * `restart` the `hot: false` fallback uses — exported because a structural
   * change to `app/reconstruction-data` (enablement) cannot be picked up by
   * the epoch seam, which only invalidates the APPLIED tree, not the raw JSON.
   */
  restartWorker: () => Promise<number>;
  /** authored.slotValues edit → visible on the next request. */
  setSlotValue: (key: string, value: unknown) => Promise<string>;
  setSlotValues: (values: Record<string, unknown>) => Promise<string>;
  /** authored.theme edit → visible through the stylesheet overlay. */
  setAuthoredTheme: (authoredTheme: AuthoredThemeInput) => Promise<string>;
  setThemeOverlayCss: (css: string) => Promise<void>;
  clearMediaOverrides: () => Promise<void>;
  /** authored.assets edit → visible through the per-request media read. */
  replaceMedia: (mediaName: string, file: string | Buffer) => Promise<string>;
  stop: () => Promise<void>;
}

export async function startAuthoringPreview(
  options: AuthoringPreviewOptions,
): Promise<AuthoringPreviewSession> {
  const log = options.log ?? ((): void => {});
  const hot = options.hot ?? true;

  const templateManifest = JSON.parse(
    await readFile(path.join(options.templateRunDir, "manifest.json"), "utf8"),
  ) as { source: { host: string }; templateId: string };
  const previewDir =
    options.previewDir ??
    authoringPreviewDir(templateManifest.source.host, path.basename(options.templateRunDir));

  const materialized = await materializeAuthoringPreview({
    templateRunDir: options.templateRunDir,
    previewDir,
    force: options.forceMaterialize ?? false,
    log,
  });

  const overlay = await AuthoringOverlay.open(previewDir);
  if (options.resetMediaOverrides === true) await overlay.clearMediaOverrides();
  await overlay.writeSlotValues(options.slotValues ?? {});
  const initialCss =
    options.themeOverlayCss ??
    (options.themeBase === undefined
      ? ""
      : authoredThemeOverlayCss({
          adapter: options.themeBase.adapter,
          baseTheme: options.themeBase.theme,
          authoredTheme: options.authoredTheme,
        }).css);
  await overlay.writeThemeOverlayCss(initialCss);

  const workerEnv = (): Record<string, string> => {
    const env: Record<string, string> = {
      WR_SLOT_VALUES_FILE: path.resolve(overlay.paths.slotValuesFile),
    };
    if (hot) {
      env[AUTHORING_HOT_ENV] = "1";
      env[AUTHORING_EPOCH_ENV] = path.resolve(overlay.paths.epochFile);
    }
    return env;
  };

  let worker = await startApp(materialized.paths.appDir, workerEnv());
  let workerStarts = 1;

  const editorOrigins = options.editorOrigins ?? [];
  const bridge: EditorBridgeConfig | undefined =
    editorOrigins.length === 0
      ? undefined
      : {
          editorOrigins,
          breakpoint: materialized.manifest.breakpoint,
          generatedStylesPath: GENERATED_STYLES_PATH,
        };

  const proxy = await startAuthoringProxy(() => worker.baseUrl, {
    themeOverlayFile: materialized.paths.themeOverlayFile,
    mediaOverrideDir: materialized.paths.mediaOverrideDir,
    ...(options.mediaDir !== undefined ? { mediaDir: options.mediaDir } : {}),
    ...(options.rewriteMap !== undefined ? { rewriteMap: options.rewriteMap } : {}),
    ...(bridge !== undefined ? { bridge } : {}),
    readEpoch: () => overlay.epoch,
  });

  /** The `hot: false` fallback: swap the worker behind the stable proxy URL. */
  const restart = async (): Promise<void> => {
    const previous = worker;
    worker = await startApp(materialized.paths.appDir, workerEnv());
    workerStarts += 1;
    await previous.stop();
  };

  return {
    baseUrl: proxy.baseUrl,
    previewDir,
    appDir: materialized.paths.appDir,
    manifest: materialized.manifest,
    materialized: materialized.materialized,
    materializeMs: { copy: materialized.copyMs, patch: materialized.patchMs, build: materialized.buildMs },
    bridgeScript: proxy.bridgeScript,
    hot,
    upstreamBaseUrl: () => worker.baseUrl,
    workerOutput: () => worker.output(),
    epoch: () => overlay.epoch,
    slotValues: () => overlay.slotValues,
    workerStarts: () => workerStarts,
    restartWorker: async () => {
      await restart();
      return workerStarts;
    },
    setSlotValue: async (key, value) => {
      const epoch = await overlay.setSlotValue(key, value);
      if (!hot) await restart();
      return epoch;
    },
    setSlotValues: async (values) => {
      const epoch = await overlay.writeSlotValues(values);
      if (!hot) await restart();
      return epoch;
    },
    setAuthoredTheme: async (authoredTheme) => {
      if (options.themeBase === undefined) {
        throw new Error("setAuthoredTheme needs themeBase (adapter + base theme) at session start");
      }
      const generated = authoredThemeOverlayCss({
        adapter: options.themeBase.adapter,
        baseTheme: options.themeBase.theme,
        authoredTheme,
      });
      await overlay.writeThemeOverlayCss(generated.css);
      return generated.css;
    },
    setThemeOverlayCss: async (css) => {
      await overlay.writeThemeOverlayCss(css);
    },
    clearMediaOverrides: () => overlay.clearMediaOverrides(),
    replaceMedia: async (mediaName, file) => {
      const bytes = typeof file === "string" ? await readFile(file) : file;
      return overlay.writeMediaOverride(mediaName, bytes);
    },
    stop: async () => {
      await proxy.stop();
      await worker.stop();
    },
  };
}
