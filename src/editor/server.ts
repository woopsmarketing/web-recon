/**
 * The Visual Editor's HTTP boundary — a dependency-free `node:http` server on
 * its OWN 127.0.0.1 origin.
 *
 * WHY ITS OWN ORIGIN, AND NOT A PATH ON THE PREVIEW PROXY. The preview
 * bridge's security model is cross-origin by construction: it posts only to
 * explicitly allowlisted origins (never `"*"`) and accepts only messages whose
 * `event.origin` is allowlisted AND whose `event.source` is the embedder.
 * Serving the editor from the preview's own origin would make both of those
 * guards vacuous, and it would put editor bytes inside the serve boundary
 * whose separation from the production bake is a tested property. So: two
 * ports, two origins, one postMessage channel.
 *
 * WHY NO FRAMEWORK. `src/authoring-preview/serve.ts`, `src/theme/serve.ts`,
 * `src/seo/serve.ts` and `src/assets/serve.ts` already hand-roll exactly this
 * shape. Adding a UI framework or a bundler would need a dependency this task
 * has no budget for, and a second Next app under `src/` would rewrite the
 * SHARED root `tsconfig.json` on first run and drop `.next/**\/*.ts` where
 * `tsc --noEmit` would find it — breaking the typecheck gate for every other
 * agent.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { runAiRewrite, AiRewriteUnavailable, type AiRewriteScope } from "./ai-rewrite.js";
import { listEditorSites, listEditorTemplates } from "./catalog.js";
import { toggleRoute } from "./enablement.js";
import { EDITOR_CLIENT_CSS, EDITOR_CLIENT_JS, editorClientHtml } from "./client.js";
import {
  commitEdits,
  commitThemeTokens,
  revisionRows,
  undoLastRevision,
  EDITOR_REDO_POLICY,
} from "./commit.js";
import { buildSlotInspector, currentSlotValue } from "./inspect.js";
import { validateThemeTokens } from "./panels.js";
import type { EditorRuntime } from "./runtime.js";
import type { AuthoredEdit } from "../release/authored.js";
import { createSite, CreateSiteError, type CreateSiteOptions } from "../release/create-site.js";
import { ContentBriefSchema, type ContentBrief } from "../content-injection/index.js";

export async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        probe.close(() => reject(new Error("could not determine a free port")));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

const MAX_BODY = 4 * 1024 * 1024;

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error("request body too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function send(response: ServerResponse, status: number, type: string, body: string | Buffer): void {
  const payload = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  response.writeHead(status, {
    "content-type": type,
    "content-length": String(payload.length),
    "cache-control": "no-store",
  });
  response.end(payload);
}

function json(response: ServerResponse, status: number, body: unknown): void {
  send(response, status, "application/json; charset=utf-8", JSON.stringify(body));
}

export interface EditorServerHandle {
  baseUrl: string;
  port: number;
  server: Server;
  stop: () => Promise<void>;
}

export interface EditorServerOptions {
  port: number;
  /** Returns the CURRENT runtime; site switching replaces it. */
  runtime: () => EditorRuntime;
  /** Opens another release project and installs it as the current runtime. */
  openSite: (projectDir: string) => Promise<EditorRuntime>;
  title?: string;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

export async function startEditorServer(options: EditorServerOptions): Promise<EditorServerHandle> {
  const title = options.title ?? "Visual Editor";

  const bootstrap = async (): Promise<unknown> => {
    const runtime = options.runtime();
    const { sites, warnings } = await listEditorSites();
    return {
      editorTitle: title,
      previewBaseUrl: runtime.session.baseUrl,
      breakpoint: runtime.site.breakpoint,
      viewports: [
        { id: "desktop", width: 1440, height: 900 },
        { id: "mobile", width: 390, height: 844 },
      ],
      viewportNote:
        "Desktop 1440x900 / Mobile 390x844 are the OBSERVED profiles (src/observer/types.ts) and the widths every QA " +
        "suite uses; the switching rule is the template's own inferred breakpoint (" +
        runtime.site.breakpoint +
        "): mobile < breakpoint <= desktop. The Mobile view reproduces the mobile TREE and its CSS layout at 390 CSS px — " +
        "it does NOT reproduce the observation's deviceScaleFactor 3 or hasTouch.",
      site: {
        siteKey: runtime.site.siteKey,
        projectId: runtime.site.projectId,
        host: runtime.site.host,
        projectDir: runtime.site.projectDir,
        displayName: runtime.site.displayName,
        releaseState: runtime.site.releaseState,
        templateId: runtime.site.templateId,
        templateRunDir: runtime.site.templateRunDir,
        slotCount: runtime.site.index.slotCount,
        bindingCount: runtime.site.index.bindingCount,
        authoredSlotValues: Object.keys(runtime.site.project.authored.slotValues).length,
        contentRunDir: runtime.site.contentRunDir,
        regionsFile: runtime.site.regionsFile,
      },
      sites: sites.map((entry) => ({
        siteKey: entry.siteKey,
        name: entry.name,
        projectDir: entry.projectDir,
        releaseState: entry.releaseState,
        updatedAt: entry.updatedAt,
      })),
      siteWarnings: warnings,
      routes: runtime.site.routes,
      timing: runtime.timing,
      previewDir: runtime.session.previewDir,
    };
  };

  const server = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      const route = url.pathname;

      if (route === "/" || route === "/index.html") {
        send(response, 200, "text/html; charset=utf-8", editorClientHtml(title));
        return;
      }
      if (route === "/editor.css") {
        send(response, 200, "text/css; charset=utf-8", EDITOR_CLIENT_CSS);
        return;
      }
      if (route === "/editor.js") {
        send(response, 200, "text/javascript; charset=utf-8", EDITOR_CLIENT_JS);
        return;
      }

      if (route === "/api/bootstrap") {
        json(response, 200, await bootstrap());
        return;
      }

      /**
       * TEMPLATE LIBRARY (Task 28 Phase 7). Every filesystem-derived template,
       * newest-created first — id, source host, route count, core-reconstruct
       * count, structure-only count, collection count, createdAt are all
       * already fields on `TemplateEntry` (see `src/registry/types.ts`), so
       * this is a straight passthrough with no client-side computing needed.
       * Does not require an open site.
       */
      if (route === "/api/templates") {
        const { templates, warnings } = await listEditorTemplates();
        json(response, 200, { templates, warnings });
        return;
      }

      /**
       * SITE LIBRARY (Task 28 Phase 7). The FULL `SiteEntry` for every release
       * project on disk (bootstrap's own `sites` array is a slim subset for the
       * site-switcher and is left unchanged). Does not require an open site.
       */
      if (route === "/api/sites") {
        const { sites, warnings } = await listEditorSites();
        json(response, 200, { sites, warnings });
        return;
      }

      const runtime = options.runtime();

      if (route === "/api/regions") {
        json(
          response,
          200,
          await runtime.regionPanel(url.searchParams.get("pageId"), url.searchParams.get("viewport")),
        );
        return;
      }
      if (route === "/api/routes") {
        json(response, 200, await runtime.routePanel());
        return;
      }
      if (route === "/api/theme") {
        json(response, 200, await runtime.themePanel());
        return;
      }
      if (route === "/api/brand") {
        if (request.method !== "POST") {
          json(response, 200, await runtime.brandPanel());
          return;
        }
      }
      if (route === "/api/qa") {
        json(response, 200, await runtime.qaPanel());
        return;
      }
      if (route === "/api/revisions") {
        json(response, 200, { revisions: await revisionRows(runtime.site.projectDir) });
        return;
      }
      if (route === "/api/slot") {
        const key = url.searchParams.get("key") ?? "";
        const slot = runtime.site.index.slotByKey.get(key);
        if (slot === undefined) {
          json(response, 404, { error: `unknown slot key ${key}` });
          return;
        }
        json(
          response,
          200,
          buildSlotInspector({
            index: runtime.site.index,
            slot,
            authored: runtime.site.project.authored,
            pageId: url.searchParams.get("pageId"),
            viewport: url.searchParams.get("viewport"),
            accounting: runtime.site.accounting,
            accountingAvailable: runtime.site.accounting.size > 0,
            assetLineage: runtime.assetLineage,
            // The generated first draft: what the preview is showing under any
            // authored edit. Without it the inspector would report the SOURCE
            // default as "current" while the iframe rendered the draft.
            draft: runtime.site.contentSlotValues,
          }),
        );
        return;
      }

      if (request.method !== "POST") {
        json(response, 404, { error: `no route ${route}` });
        return;
      }

      const body = (await readBody(request)) as Record<string, unknown>;

      if (route === "/api/resolve") {
        json(
          response,
          200,
          runtime.site.index.resolve({
            node: asString(body.node),
            dynNode: asString(body.dynNode),
            dynTrigger: asString(body.dynTrigger),
            pageId: asString(body.pageId),
            viewport: asString(body.viewport),
            route: asString(body.route),
          }),
        );
        return;
      }

      if (route === "/api/select-site") {
        const projectDir = asString(body.projectDir);
        if (projectDir === null) {
          json(response, 400, { error: "projectDir is required" });
          return;
        }
        await options.openSite(projectDir);
        json(response, 200, await bootstrap());
        return;
      }

      /**
       * CREATE SITE (Task 28 Phase 8). REQUIRED: `templateManifestFile` and a
       * `brief.goal` — everything else the brief omits is a reported gap, not
       * a blocking question (Task 27 §5). Runs the real pipeline (content
       * generation from the brief → production compile against the template's
       * shared per-host theme/SEO/asset artifacts → registration as a NEW,
       * INDEPENDENT release project) and returns a summary, never the whole
       * internal result object.
       */
      if (route === "/api/create-site") {
        const templateManifestFile = asString(body.templateManifestFile);
        // The brief is PARSED, not cast. A cast would let a typo'd field reach
        // the packet as a silent no-op; the schema rejects it by name.
        const briefParse = ContentBriefSchema.safeParse(body.brief ?? {});
        if (templateManifestFile === null || !briefParse.success) {
          json(response, 400, {
            error:
              templateManifestFile === null
                ? "templateManifestFile is required"
                : `brief is not a content brief: ${briefParse.error!.issues
                    .slice(0, 5)
                    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                    .join("; ")}`,
          });
          return;
        }
        const brief: ContentBrief = briefParse.data;
        if (asString(brief.goal) === null) {
          json(response, 400, { error: "brief.goal is required — it is the one thing that cannot be defaulted" });
          return;
        }
        const createOptions: CreateSiteOptions = {
          templateManifestFile,
          brief,
          ...(asString(body.siteId) !== null ? { siteId: asString(body.siteId) as string } : {}),
          ...(asString(body.projectId) !== null
            ? { projectId: asString(body.projectId) as string }
            : {}),
          ...(asString(body.displayName) !== null
            ? { displayName: asString(body.displayName) as string }
            : {}),
          ...(asString(body.themeRunDir) !== null
            ? { themeRunDir: asString(body.themeRunDir) as string }
            : {}),
          ...(asString(body.seoPlanRunDir) !== null
            ? { seoPlanRunDir: asString(body.seoPlanRunDir) as string }
            : {}),
          ...(asString(body.materializationRunDir) !== null
            ? { materializationRunDir: asString(body.materializationRunDir) as string }
            : {}),
          ...(asString(body.pageRegionsDir) !== null
            ? { pageRegionsDir: asString(body.pageRegionsDir) as string }
            : {}),
          ...(asString(body.contentProvider) === "fake" ? { contentProvider: "fake" as const } : {}),
          log: (line) => console.log(`  [create-site] ${line}`),
        };
        try {
          const started = Date.now();
          const result = await createSite(createOptions);
          json(response, 200, {
            siteKey: result.prepare.registeredSiteKey,
            projectDir: result.prepare.projectDir,
            // IDENTITY, stated rather than inferred. A brief-only create is
            // named from the brief (never from the source host), and a
            // derived name that was already taken is reported as stepped
            // past instead of silently re-preparing someone else's project.
            siteId: result.siteId,
            siteIdSource: result.siteIdSource,
            siteIdBase: result.siteIdBase,
            siteIdDisambiguation: result.siteIdDisambiguation,
            // True when an existing project at this site id was re-prepared
            // rather than a new one created. Surfaced so "created" is never a
            // claim the operator cannot check.
            reprepared: result.prepare.reprepared,
            releaseState: result.prepare.project.releaseState,
            routeScope: result.routeScope.counts,
            structureOnlyRoutes: result.routeScope.excludedStructureOnlyRoutes,
            templateUnmutated: result.templateUnmutated,
            pageRegionsDir: result.pageRegionsDir,
            pageRegionsSource: result.pageRegionsSource,
            contentProvider: result.contentProvider,
            contentAssignedSlots: result.contentAssignedSlots,
            contentUnresolvedSlots: result.contentUnresolvedSlots,
            briefGaps: result.briefGaps,
            registryWarnings: result.prepare.registryWarnings,
            // THE FIRST DRAFT, per route — what the operator actually asked for
            // when they pressed Create.
            firstDraft: result.firstDraft,
            firstDraftFile: result.firstDraftFile,
            consistency: result.consistency,
            elapsedMs: Date.now() - started,
          });
        } catch (error) {
          json(response, error instanceof CreateSiteError ? 409 : 500, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      /** A keystroke: PREVIEW ONLY. No project write, no revision. */
      if (route === "/api/preview-value") {
        const slotKey = asString(body.slotKey);
        if (slotKey === null || !runtime.site.index.slotByKey.has(slotKey)) {
          json(response, 400, { error: `unknown slot key ${String(body.slotKey)}` });
          return;
        }
        const epoch = await runtime.session.setSlotValue(slotKey, body.value);
        json(response, 200, { epoch, committed: false, revision: null });
        return;
      }

      /** Save: the transaction boundary. One commit, at most one revision. */
      if (route === "/api/save") {
        const edits = Array.isArray(body.edits) ? (body.edits as AuthoredEdit[]) : [];
        if (edits.length === 0) {
          json(response, 400, { error: "no edits supplied" });
          return;
        }
        const summary = asString(body.summary) ?? "editor save";
        const commit = await commitEdits(runtime.site.projectDir, edits, summary);
        await runtime.refreshProject();
        await runtime.session.setSlotValues(runtime.previewSlotValues());
        // A Save can carry an enablement op like any other AuthoredEdit, so the
        // preview is re-synced here too. It is a signature no-op for a plain
        // text edit: nothing is copied and the worker is not restarted.
        const sync = commit.changed ? await runtime.syncEnablement() : null;
        const chain = await revisionRows(runtime.site.projectDir);
        json(response, 200, {
          changed: commit.changed,
          revisionId: commit.revision?.revisionId ?? null,
          revisionCount: chain.length,
          authoredSlotValues: Object.keys(commit.authored.slotValues).length,
          sync,
        });
        return;
      }

      if (route === "/api/undo") {
        const result = await undoLastRevision(runtime.site.projectDir);
        // UNDO RESTORES ENABLEMENT TOO. `restoreAuthoredRevision` restores the
        // WHOLE authored state, so an undone disable has to put the nodes and
        // the route back in the preview — the same sync path the toggle used,
        // which restores from the frozen template before re-applying.
        let sync = null;
        if (result.undone) {
          await runtime.refreshProject();
          await runtime.session.setSlotValues(runtime.previewSlotValues());
          sync = await runtime.syncEnablement();
        }
        const chain = await revisionRows(runtime.site.projectDir);
        json(response, 200, {
          undone: result.undone,
          reason: result.reason,
          revisionId: result.revision?.revisionId ?? null,
          restoredFrom: result.restoredFrom,
          cursorRevisionId: result.cursorRevisionId,
          remainingUndos: result.remainingUndos,
          revisionCount: chain.length,
          redoPolicy: EDITOR_REDO_POLICY,
          sync,
        });
        return;
      }

      if (route === "/api/theme/preview") {
        const { accepted, rejected } = validateThemeTokens(
          (body.tokens ?? {}) as Record<string, string>,
        );
        if (runtime.themeBase === null) {
          json(response, 400, { error: "no theme run on this project's accepted lineage", rejected });
          return;
        }
        const merged = { ...(runtime.site.project.authored.theme.tokens ?? {}), ...accepted };
        for (const [id, value] of Object.entries(accepted)) if (value === "") delete merged[id];
        const css = await runtime.session.setAuthoredTheme({ tokens: merged });
        json(response, 200, { accepted, rejected, cssBytes: css.length, committed: false });
        return;
      }

      if (route === "/api/theme/save") {
        const { accepted, rejected } = validateThemeTokens(
          (body.tokens ?? {}) as Record<string, string>,
        );
        const commit = await commitThemeTokens(runtime.site.projectDir, accepted, {
          ...(asString(body.themeSourceFile) !== null
            ? { themeSourceFile: asString(body.themeSourceFile) as string }
            : {}),
        });
        await runtime.refreshProject();
        json(response, 200, {
          changed: commit.changed,
          revisionId: commit.revision?.revisionId ?? null,
          accepted,
          rejected,
        });
        return;
      }

      if (route === "/api/asset") {
        const slotKey = asString(body.slotKey);
        const file = asString(body.file);
        const slot = slotKey === null ? undefined : runtime.site.index.slotByKey.get(slotKey);
        if (slot === undefined || slot.type !== "image") {
          json(response, 400, { error: `slot ${String(slotKey)} is not an image slot` });
          return;
        }
        if (file === null) {
          json(response, 400, { error: "a replacement file path is required" });
          return;
        }
        // The image the operator is REPLACING is the one the preview shows —
        // authored edit, else the generated draft, else the source default.
        const value = currentSlotValue(slot, runtime.site.project.authored, runtime.site.contentSlotValues);
        const src = typeof value === "string" ? value : value.src;
        const asset = runtime.assetLineage?.bySourceUrl.get(src) ?? null;
        if (asset === null) {
          json(response, 409, {
            error:
              "this image has no assetId on the accepted asset materialization, so there is nothing to key an " +
              "authored replacement by. Re-run the assets stage for this lineage first.",
          });
          return;
        }
        const alt = asString(body.alt);
        const commit = await commitEdits(
          runtime.site.projectDir,
          [
            {
              op: "set-asset",
              assetId: asset.assetId,
              file,
              ...(alt !== null ? { alt } : {}),
            },
          ],
          `editor: image ${slot.key}`,
        );
        await runtime.refreshProject();
        // Live preview: write the operator's bytes into the preview's own
        // media override dir. This is the SAME per-request read the shipped
        // asset proxy does — no stage rerun, no media set copy.
        const bytes = await readFile(path.resolve(file));
        const served: string[] = [];
        const names = new Set<string>();
        if (asset.mediaName !== null) names.add(asset.mediaName);
        const direct = runtime.assetLineage?.mediaNameBySourceUrl.get(src);
        if (direct !== undefined) names.add(direct);
        for (const name of names) {
          await runtime.session.replaceMedia(name, bytes);
          served.push(name);
        }
        json(response, 200, {
          changed: commit.changed,
          revisionId: commit.revision?.revisionId ?? null,
          assetId: asset.assetId,
          served,
        });
        return;
      }

      if (route === "/api/brand") {
        const surfaceId = asString(body.surfaceId);
        const decision = asString(body.decision);
        if (surfaceId === null || decision === null) {
          json(response, 400, { error: "surfaceId and decision are required" });
          return;
        }
        const edit = {
          op: "set-brand-decision" as const,
          surfaceId,
          decision: decision as "REPLACE" | "REMOVE" | "PRESERVE",
          ...(body.replacement !== undefined
            ? { replacement: body.replacement as { text?: string; assetId?: string; file?: string } }
            : {}),
          ...(asString(body.reason) !== null ? { reason: asString(body.reason) as string } : {}),
          ...(asString(body.note) !== null ? { note: asString(body.note) as string } : {}),
        };
        try {
          const commit = await commitEdits(runtime.site.projectDir, [edit], `editor: brand ${surfaceId}`);
          await runtime.refreshProject();
          json(response, 200, {
            changed: commit.changed,
            revisionId: commit.revision?.revisionId ?? null,
            note:
              "recorded in authored.brand. It is applied by the PRODUCTION BAKE, not by the authoring preview, " +
              "so the iframe will not change.",
          });
        } catch (error) {
          json(response, 400, { error: error instanceof Error ? error.message : String(error) });
        }
        return;
      }

      /**
       * REGION ENABLEMENT. A refusal is a 200 carrying the engine's refusals —
       * NOT an HTTP error: the operator asked a legitimate question and the
       * engine gave a specific answer, and an error status would let the client
       * render "failed" instead of the reason. Nothing is written on a refusal,
       * so no revision is appended and the preview is not touched.
       */
      if (route === "/api/region-enablement") {
        const regionId = asString(body.regionId);
        if (regionId === null) {
          json(response, 400, { error: "regionId is required" });
          return;
        }
        if (!runtime.regionPort.wired) {
          json(response, 501, {
            error: "region enablement is not wired in this editor build",
            seam: (await runtime.regionPanel(null, null)).enablementSeam,
          });
          return;
        }
        const scope = asString(body.scope);
        const viewedRoute = asString(body.route);
        const result = await runtime.regionPort.write(runtime.site, {
          regionId,
          enabled: body.enabled === true,
          // The route the operator is looking at. The client also sends
          // `routes: [route]` — an explicit single-element list is harder to
          // misread than a field that silently means "everywhere" when absent
          // — and both are forwarded so the engine's widening guard is live.
          ...(viewedRoute !== null ? { route: viewedRoute } : {}),
          ...(scope === "global" || scope === "routes" ? { scope } : {}),
          ...(Array.isArray(body.routes) ? { routes: body.routes as string[] } : {}),
          ...(Array.isArray(body.cascadeRegionIds)
            ? { cascadeRegionIds: body.cascadeRegionIds as string[] }
            : {}),
          ...(asString(body.reason) !== null ? { reason: asString(body.reason) as string } : {}),
        });
        await runtime.refreshProject();
        const sync = result.changed ? await runtime.syncEnablement() : null;
        json(response, 200, { ...result, sync });
        return;
      }

      /**
       * ROUTE ENABLEMENT. Same contract as the region toggle: the engine
       * decides over the WHOLE disabled set (`last-route` and the navigation
       * cascade are properties of the set, not of one route), a refusal writes
       * nothing, and an acceptance appends exactly one revision and is made
       * physical in the preview before the response returns.
       */
      if (route === "/api/route-enablement") {
        const target = asString(body.route);
        if (target === null) {
          json(response, 400, { error: "route is required" });
          return;
        }
        const result = await toggleRoute(runtime.site, {
          route: target,
          enabled: body.enabled === true,
          ...(asString(body.reason) !== null ? { reason: asString(body.reason) as string } : {}),
        });
        await runtime.refreshProject();
        const sync = result.changed ? await runtime.syncEnablement() : null;
        json(response, 200, { ...result, sync });
        return;
      }

      if (route === "/api/ai-rewrite") {
        const scope = body.scope as AiRewriteScope | undefined;
        if (scope === undefined || (scope.kind !== "slot" && scope.kind !== "region")) {
          json(response, 400, { error: 'scope must be { kind: "slot" | "region", ... }' });
          return;
        }
        try {
          const proposal = await runAiRewrite({
            site: runtime.site,
            scope,
            route: asString(body.route),
            provider: asString(body.provider) ?? "fake",
            ...(asString(body.resultFile) !== null
              ? { resultFile: asString(body.resultFile) as string }
              : {}),
          });
          json(response, 200, proposal);
        } catch (error) {
          json(response, error instanceof AiRewriteUnavailable ? 409 : 500, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

      json(response, 404, { error: `no route ${route}` });
    })().catch((error: unknown) => {
      json(response, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.on("error", reject);
    server.listen(options.port, "127.0.0.1", () => resolve());
  });

  return {
    baseUrl: `http://127.0.0.1:${options.port}`,
    port: options.port,
    server,
    stop: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
