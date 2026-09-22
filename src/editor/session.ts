/**
 * `startVisualEditor()` — the whole operator app in one call.
 *
 * ORDER MATTERS. The editor's port is reserved FIRST, because the preview
 * session needs the editor's ORIGIN before it starts: `editorOrigins` is what
 * decides whether the bridge is injected at all, and an empty list means no
 * bridge. So the editor origin is known, then the preview is started with it,
 * then the HTTP server binds that same reserved port.
 */
import { EditorRuntime } from "./runtime.js";
import { findFreePort, startEditorServer, type EditorServerHandle } from "./server.js";
import { RELEASE_REGION_ENABLEMENT } from "./region-enablement.js";
import { UNWIRED_REGION_ENABLEMENT, type RegionEnablementPort } from "./panels.js";

export interface VisualEditorOptions {
  /** Release project directory — the Site to open first. */
  projectDir: string;
  /** Preview workspace; default `data/<host>/authoring-previews/wr28-editor-<templateRunId>`. */
  previewDir?: string;
  /** Fixed editor port; default a free one. */
  port?: number;
  title?: string;
  /**
   * Region/route enablement port. Defaults to the release module's own
   * evaluator + authored-state writer; pass `UNWIRED_REGION_ENABLEMENT` to run
   * the panel read-only.
   */
  regionEnablement?: RegionEnablementPort;
  log?: (line: string) => void;
}

export interface VisualEditorSession {
  /** The operator opens THIS url. */
  readonly baseUrl: string;
  readonly previewBaseUrl: string;
  readonly previewDir: string;
  readonly runtime: () => EditorRuntime;
  readonly server: EditorServerHandle;
  /** ms: reserve port → site loaded → preview up → server listening. */
  readonly startupMs: number;
  readonly previewStartMs: number;
  readonly siteLoadMs: number;
  readonly materialized: boolean;
  stop: () => Promise<void>;
}

export async function startVisualEditor(options: VisualEditorOptions): Promise<VisualEditorSession> {
  const started = Date.now();
  const port = options.port ?? (await findFreePort());
  const editorOrigin = `http://127.0.0.1:${port}`;
  const regionPort = options.regionEnablement ?? RELEASE_REGION_ENABLEMENT;

  let runtime = await EditorRuntime.open(
    {
      projectDir: options.projectDir,
      ...(options.previewDir !== undefined ? { previewDir: options.previewDir } : {}),
      editorOrigin,
      ...(options.log !== undefined ? { log: options.log } : {}),
    },
    regionPort,
  );

  const server = await startEditorServer({
    port,
    ...(options.title !== undefined ? { title: options.title } : {}),
    runtime: () => runtime,
    openSite: async (projectDir: string) => {
      const previous = runtime;
      const next = await EditorRuntime.open(
        {
          projectDir,
          editorOrigin,
          ...(options.log !== undefined ? { log: options.log } : {}),
        },
        regionPort,
      );
      runtime = next;
      // The old preview only goes away AFTER the new one answers, so the
      // editor never points its iframe at a dead port.
      if (previous.session.baseUrl !== next.session.baseUrl) await previous.stop();
      return next;
    },
  });

  return {
    baseUrl: server.baseUrl,
    previewBaseUrl: runtime.session.baseUrl,
    previewDir: runtime.session.previewDir,
    runtime: () => runtime,
    server,
    startupMs: Date.now() - started,
    previewStartMs: runtime.timing.previewStartMs,
    siteLoadMs: runtime.timing.siteLoadMs,
    materialized: runtime.timing.materialized,
    stop: async () => {
      await server.stop();
      await runtime.stop();
    },
  };
}

export { UNWIRED_REGION_ENABLEMENT, RELEASE_REGION_ENABLEMENT };
