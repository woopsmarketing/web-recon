/**
 * The editor's in-process runtime: one open Site, one preview session, and the
 * memoized reads that make a click feel instant.
 *
 * WHY EVERYTHING IS LOADED ONCE. `slots.json` and `slot-bindings.json` are
 * 2.9 MB EACH on the linear.app template (3,079 slots / 9,929 bindings).
 * Parsing and indexing them per request would make the inspector feel broken;
 * they are read once when a Site is opened and inverted in memory. The browser
 * never receives the bindings file — only the resolved answer for the element
 * the operator actually clicked.
 */
import path from "node:path";

import {
  startAuthoringPreview,
  type AuthoringPreviewSession,
} from "../authoring-preview/session.js";
import { authoringPreviewDir } from "../authoring-preview/workspace.js";
import { loadEditorAssetLineage, type EditorAssetLineage } from "./assets.js";
import { loadEditorSite, type EditorSite } from "./catalog.js";
import {
  routeEnablementPanel,
  syncPreviewEnablement,
  type PreviewEnablementSync,
  type RouteEnablementPanel,
} from "./enablement.js";
import { loadReleaseProject } from "../release/store.js";
import {
  buildBrandPanel,
  buildQaPanel,
  buildRegionPanel,
  buildThemePanel,
  loadThemeBase,
  scanBrandForSite,
  UNWIRED_REGION_ENABLEMENT,
  type BrandPanel,
  type LoadedThemeBase,
  type QaPanel,
  type RegionEnablementPort,
  type RegionPanel,
  type ThemePanel,
} from "./panels.js";
import type { BrandSurfaceReport } from "../release/brand-scan.js";

export interface OpenSiteOptions {
  projectDir: string;
  /** Preview workspace. Default `data/<host>/authoring-previews/wr28-editor-<templateRunId>`. */
  previewDir?: string;
  editorOrigin: string;
  log?: (line: string) => void;
}

export interface OpenSiteTiming {
  siteLoadMs: number;
  previewStartMs: number;
  materialized: boolean;
  materializeMs: { copy: number; patch: number; build: number };
  /** Restoring + applying the authored enablement to the preview workspace. */
  enablementMs: number;
  /** true when the workspace did NOT already carry this project's plan. */
  enablementApplied: boolean;
}

export class EditorRuntime {
  site: EditorSite;
  session: AuthoringPreviewSession;
  assetLineage: EditorAssetLineage | null;
  themeBase: LoadedThemeBase | null;
  regionPort: RegionEnablementPort;
  timing: OpenSiteTiming;
  private brandReport: BrandSurfaceReport | null | undefined = undefined;

  private constructor(
    site: EditorSite,
    session: AuthoringPreviewSession,
    assetLineage: EditorAssetLineage | null,
    themeBase: LoadedThemeBase | null,
    regionPort: RegionEnablementPort,
    timing: OpenSiteTiming,
  ) {
    this.site = site;
    this.session = session;
    this.assetLineage = assetLineage;
    this.themeBase = themeBase;
    this.regionPort = regionPort;
    this.timing = timing;
  }

  static defaultPreviewDir(host: string, templateRunDir: string): string {
    return authoringPreviewDir(host, `wr28-editor-${path.basename(templateRunDir)}`);
  }

  static async open(
    options: OpenSiteOptions,
    regionPort: RegionEnablementPort = UNWIRED_REGION_ENABLEMENT,
  ): Promise<EditorRuntime> {
    const siteStart = Date.now();
    const site = await loadEditorSite(options.projectDir);
    const siteLoadMs = Date.now() - siteStart;

    let assetLineage: EditorAssetLineage | null = null;
    if (site.materializationRunDir !== null) {
      try {
        assetLineage = await loadEditorAssetLineage(site.materializationRunDir);
      } catch {
        assetLineage = null;
      }
    }
    const themeBase = await loadThemeBase(site);

    const previewStart = Date.now();
    const session = await startAuthoringPreview({
      templateRunDir: site.templateRunDir,
      previewDir: options.previewDir ?? EditorRuntime.defaultPreviewDir(site.host, site.templateRunDir),
      slotValues: { ...site.contentSlotValues, ...site.project.authored.slotValues },
      ...(themeBase !== null ? { themeBase } : {}),
      ...(site.project.authored.theme.tokens !== undefined
        ? { authoredTheme: { tokens: site.project.authored.theme.tokens } }
        : {}),
      ...(assetLineage !== null
        ? { mediaDir: assetLineage.mediaDir, rewriteMap: assetLineage.rewriteMap }
        : {}),
      editorOrigins: [options.editorOrigin],
      ...(options.log !== undefined ? { log: options.log } : {}),
    });
    const previewStartMs = Date.now() - previewStart;

    // ENABLEMENT IS APPLIED AT OPEN, NOT LAZILY.
    //
    // The preview app directory outlives the session that made it. A project
    // with a recorded disable must show it in the very first frame, and a
    // workspace a killed session left with nodes deleted must be repaired
    // before the operator sees it — `syncPreviewEnablement` restores from the
    // frozen template and re-applies the current plan, and is a no-op (no copy,
    // no restart) when the workspace already carries exactly that plan.
    const enablementStart = Date.now();
    const enablement = await syncPreviewEnablement(site, session);
    const enablementMs = Date.now() - enablementStart;

    return new EditorRuntime(site, session, assetLineage, themeBase, regionPort, {
      siteLoadMs,
      previewStartMs,
      materialized: session.materialized,
      materializeMs: session.materializeMs,
      enablementMs,
      enablementApplied: enablement.changed,
    });
  }

  /**
   * WHAT THE PREVIEW ACTUALLY SHOWS: the generated first draft, with the
   * operator's authored edits on top. The order matters and is the SAME order
   * `src/production/bake.ts` uses (content overlay first, authored state
   * second), so what the operator sees is what the package will contain. Every
   * caller that re-pushes the overlay — open, save, undo — goes through this
   * one method, because two of them pushing `authored.slotValues` alone would
   * silently drop the draft on the first save.
   */
  previewSlotValues(): Record<string, unknown> {
    return { ...this.site.contentSlotValues, ...this.site.project.authored.slotValues };
  }

  /**
   * Re-read the PROJECT DOCUMENT after a commit — and nothing else.
   *
   * The template, its slot index, the accounting map and the region compile
   * are immutable inputs; re-parsing 5.8 MB of slots + bindings on every save
   * would make Save feel like a rebuild. Only `authored` can have moved.
   */
  async refreshProject(): Promise<void> {
    const { project } = await loadReleaseProject(this.site.projectDir);
    this.site.project = project;
    this.site.releaseState = project.releaseState;
  }

  async brand(): Promise<BrandSurfaceReport | null> {
    if (this.brandReport === undefined) this.brandReport = await scanBrandForSite(this.site);
    return this.brandReport;
  }

  invalidateBrand(): void {
    this.brandReport = undefined;
  }

  async regionPanel(pageId: string | null, viewport: string | null): Promise<RegionPanel> {
    return buildRegionPanel(this.site, pageId, viewport, this.regionPort);
  }

  /**
   * Route enablement for the Pages rail: one row per route in the template's
   * route table, with the engine's own state, its refusals and the navigation
   * cascade a disable would cause.
   */
  async routePanel(): Promise<RouteEnablementPanel> {
    return routeEnablementPanel(this.site);
  }

  /**
   * Make the preview agree with the authored state.
   *
   * Called after EVERY authored write the editor makes — a slot save, an
   * enablement toggle, an UNDO — because an undo can restore an enablement just
   * as easily as a sentence. It is idempotent by plan signature: when the
   * workspace already carries the plan the project wants, nothing is copied,
   * nothing is applied and the worker is not restarted, so a text edit does not
   * pay for it.
   */
  async syncEnablement(): Promise<PreviewEnablementSync> {
    return syncPreviewEnablement(this.site, this.session);
  }

  async themePanel(): Promise<ThemePanel> {
    return buildThemePanel(this.site, this.themeBase);
  }

  async brandPanel(): Promise<BrandPanel> {
    return buildBrandPanel(this.site, await this.brand());
  }

  async qaPanel(): Promise<QaPanel> {
    return buildQaPanel(this.site);
  }

  async stop(): Promise<void> {
    await this.session.stop();
  }
}
