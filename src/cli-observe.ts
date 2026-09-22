import { observePage, saveObservation } from "./observer/index.js";
import type { ViewportObservation } from "./observer/index.js";
import {
  LAYOUT_PROBE_WIDTHS,
  MOBILE_LAYOUT_PROBE_WIDTHS,
  PAGE_STATE_EVIDENCE_ROOT_DEFAULT,
  type ProbeWidthProvenance,
} from "./observer/types.js";
import { parseProbeWidths, resolveProbeWidths } from "./observer/layout-probe.js";

/**
 * web-recon Observe CLI — Phase 3 (Single Page Static Observation),
 * responsive in Task 05.
 *
 * Flow (per viewport — desktop AND mobile):
 *   URL → Chromium render → stabilize (load → networkidle → fonts.ready →
 *   [optional prepare-scroll] → settle) → DOM/CSS(dedup)/geometry/assets/links/
 *   frames → full-page screenshot → JSON + PNG under viewports/<id>/.
 *
 * Read-only: it renders and reads a single page in each viewport. With
 * `--prepare-scroll` it may scroll (read-only) to trigger lazy content.
 *
 * Task 28.7 A2 — it may ALSO run the bounded, evidence-gated page-state
 * normalization phase before collection (default ON; `--no-normalize-page-state`
 * opts out), which is the one phase allowed to click. COLLECTION stays strictly
 * read-only: it never types or submits. See `src/observer/observe-page.ts` for
 * the full contract. Discovery (`pnpm recon`) is a separate command.
 */

function printUsage(): void {
  console.log(
    "Usage: pnpm observe <url> [--prepare-scroll] [--no-normalize-page-state] " +
      "[--probe-widths=700,1100] [--source-package] [--no-source-package-json] [--no-layout-probe]",
  );
  console.log("  Renders one page in Chromium at desktop AND mobile viewports");
  console.log("  and stores a deep observation per viewport under");
  console.log("  data/<host>/<run-id>/viewports/<id>/ (read-only; no interaction).");
  console.log("");
  console.log("Options:");
  console.log(
    "  --prepare-scroll   Read-only auto-scroll to trigger lazy-loaded content",
  );
  console.log(
    "  --no-normalize-page-state       do NOT dismiss entry popups before " +
      "collection (observe the page WITH its popup; recorded in the artifact)",
  );
  console.log(
    `  --page-state-evidence-root=DIR  where dismissal evidence is written` +
      ` (default ${PAGE_STATE_EVIDENCE_ROOT_DEFAULT})`,
  );
  console.log(
    `  --probe-widths=700,1100         extra layout-probe widths (desktop context;` +
      ` defaults ${LAYOUT_PROBE_WIDTHS.join(",")})`,
  );
  console.log(
    `  --probe-widths-mobile=430,600   extra widths for the mobile-context probe` +
      ` (defaults ${MOBILE_LAYOUT_PROBE_WIDTHS.join(",")})`,
  );
  console.log(
    "  --source-package                Source Preservation V2 Phase 1: capture a" +
      " Source Package per viewport load (viewports/<id>/source-package/)",
  );
  console.log(
    "  --no-source-package-json        with --source-package, do NOT capture" +
      " JSON response bodies (captured by default when --source-package is on)",
  );
  console.log(
    "  --no-layout-probe               skip the multi-width layout probes (one" +
      " bounded load per viewport; e.g. a Source Package capture)",
  );
}

interface ParsedArgs {
  url?: string;
  prepareScroll: boolean;
  /** Task 28.7 A2 — bounded page-state normalization (default ON). */
  normalizePageState: boolean;
  /**
   * Task 28.75 — where dismissal evidence is written. The DEFAULT
   * ({@link PAGE_STATE_EVIDENCE_ROOT_DEFAULT}) is wave-neutral and outside
   * `docs/result/`; a wave that wants its evidence filed with its report passes
   * its own root.
   */
  pageStateEvidenceRoot?: string;
  /** Task 28.6 W1.3 — extra probe widths for this observation. */
  probeWidths?: number[];
  probeWidthsMobile?: number[];
  /** Source Preservation V2 Phase 1 — capture a Source Package per viewport (default OFF). */
  sourcePackage: boolean;
  /** Within a Source Package capture, capture JSON response bodies (default ON; --no-source-package-json opts out). */
  sourcePackageJson: boolean;
  /** Skip the layout probes (default: run them). */
  layoutProbe: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let url: string | undefined;
  // Task 28.6 W8 RC2 — ON by default; --no-prepare-scroll opts out.
  let prepareScroll = true;
  // Task 28.7 A2 — ON by default; --no-normalize-page-state opts out.
  let normalizePageState = true;
  let pageStateEvidenceRoot: string | undefined;
  let probeWidths: number[] | undefined;
  let probeWidthsMobile: number[] | undefined;
  let sourcePackage = false;
  let sourcePackageJson = true;
  let layoutProbe = true;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--source-package") sourcePackage = true;
    else if (arg === "--no-source-package") sourcePackage = false;
    else if (arg === "--source-package-json") sourcePackageJson = true;
    else if (arg === "--no-source-package-json") sourcePackageJson = false;
    else if (arg === "--no-layout-probe") layoutProbe = false;
    else if (arg === "--layout-probe") layoutProbe = true;
    else if (arg === "--prepare-scroll") prepareScroll = true;
    else if (arg === "--no-prepare-scroll") prepareScroll = false;
    else if (arg === "--normalize-page-state") normalizePageState = true;
    else if (arg === "--no-normalize-page-state") normalizePageState = false;
    else if (arg === "--page-state-evidence-root")
      pageStateEvidenceRoot = argv[++i];
    else if (arg.startsWith("--page-state-evidence-root="))
      pageStateEvidenceRoot = arg.slice("--page-state-evidence-root=".length);
    else if (arg === "--probe-widths") probeWidths = parseProbeWidths(argv[++i]);
    else if (arg.startsWith("--probe-widths="))
      probeWidths = parseProbeWidths(arg.slice("--probe-widths=".length));
    else if (arg === "--probe-widths-mobile")
      probeWidthsMobile = parseProbeWidths(argv[++i]);
    else if (arg.startsWith("--probe-widths-mobile="))
      probeWidthsMobile = parseProbeWidths(arg.slice("--probe-widths-mobile=".length));
    else if (!arg.startsWith("--") && url === undefined) url = arg;
  }
  return {
    url,
    prepareScroll,
    normalizePageState,
    ...(pageStateEvidenceRoot ? { pageStateEvidenceRoot } : {}),
    ...(probeWidths ? { probeWidths } : {}),
    ...(probeWidthsMobile ? { probeWidthsMobile } : {}),
    sourcePackage,
    sourcePackageJson,
    layoutProbe,
  };
}

const kb = (n: number): string => `${(n / 1024).toFixed(1)} KB`;
const mb = (n: number): string => `${(n / (1024 * 1024)).toFixed(2)} MB`;

function printViewport(v: ViewportObservation): void {
  const p = v.profile;
  const tags = [
    `${p.width}×${p.height}`,
    `DPR ${p.deviceScaleFactor}`,
    p.isMobile ? "mobile" : "desktop-ua",
    p.hasTouch ? "touch" : "no-touch",
  ].join(", ");
  console.log("");
  console.log(`== ${p.id} (${tags}) ==`);
  console.log(`  Document: ${v.metadata.documentWidth}×${v.metadata.documentHeight}`);
  console.log(
    `  Fonts ready: ${v.loadStrategy.fontsReadyReached} | Network idle: ${v.loadStrategy.networkIdleReached}`,
  );
  if (v.loadStrategy.prepareScroll) {
    console.log(
      `  Prepare-scroll: ${v.loadStrategy.scrollSteps} steps, ${v.loadStrategy.scrollDistancePx}px`,
    );
  }
  console.log(`  DOM elements: ${v.stats.domElementCount} (geometry ${v.stats.elementsWithGeometry})`);
  console.log(
    `  Visible: ${v.stats.effectiveVisibleCount} effective / ${v.stats.localVisibleCount} local`,
  );
  console.log(
    `  Styles: ${v.stats.uniqueStyleCount} unique / ${v.stats.rawStyleOccurrenceCount} occurrences ` +
      `(dedup ${(v.styleDedup.dedupRatio * 100).toFixed(1)}%)`,
  );
  console.log(`  Assets: ${v.stats.assetCount} (inline SVG ${v.stats.inlineSvgCount})`);
  console.log(`  Links: ${v.stats.linkCount} (internal ${v.stats.internalLinkCount})`);
  console.log(`  Frames: ${v.stats.iframeCount} | Open shadow roots: ${v.stats.openShadowRootCount}`);
  const s = v.sizes;
  console.log(
    `  Sizes: rendered ${kb(s.renderedHtmlBytes)}, dom ${kb(s.domJsonBytes)}, ` +
      `styles ${kb(s.stylesJsonBytes)}, assets ${kb(s.assetsJsonBytes)}, ` +
      `links ${kb(s.linksJsonBytes)}, frames ${kb(s.framesJsonBytes)}, ` +
      `screenshot ${kb(s.screenshotBytes)}`,
  );
  const savedBytes = s.inlineStylesDomBytes - s.domPlusStylesBytes;
  const savedPct =
    s.inlineStylesDomBytes > 0 ? (savedBytes / s.inlineStylesDomBytes) * 100 : 0;
  console.log(
    `    dom+styles ${kb(s.domPlusStylesBytes)} (inline-styles equiv ${kb(s.inlineStylesDomBytes)}; ` +
      `dedup saves ${kb(savedBytes)}, ${savedPct.toFixed(1)}%)`,
  );
  console.log(`    viewport total ${mb(s.viewportTotalBytes)}`);
}

/**
 * Task 28.6 C3 D1 — print the widths a probe pass actually sampled AND why each
 * one is there. The set is derived from the page's own authored breakpoints, so
 * "which widths did this run probe" is a per-page answer that only the artifact
 * can give; printing it is how an operator sees a degraded page without opening
 * `layout-probe.json`.
 */
function printProbeWidths(
  label: string,
  probe: { widths: { width: number }[]; widthProvenance?: ProbeWidthProvenance } | undefined,
): void {
  if (!probe) return;
  const p = probe.widthProvenance;
  console.log("");
  console.log(
    `Probe widths (${label}): ${probe.widths.map((w) => w.width).join(", ")}`,
  );
  if (!p) {
    console.log("  (no provenance recorded — fixed floor list)");
    return;
  }
  console.log(
    `  ${p.floorWidths.length} floor + ${p.widthsAdded} derived, cap ${p.cap}` +
      (p.capHit ? " (CAP HIT)" : "") +
      ` | ${p.conditionsRead} @media condition(s) read → ` +
      `${p.breakpointsFolded} breakpoint(s): ${p.breakpointsAdopted} adopted, ` +
      `${p.breakpointsAlreadyBracketed} already bracketed, ` +
      `${p.breakpointsOutOfRange} out of range, ` +
      `${p.breakpointsDroppedByCap} dropped by cap`,
  );
  if (p.degradedToFloor) {
    console.log(`  DEGRADED TO FLOOR — ${String(p.degradedReason)}`);
  }
  for (const origin of p.origins) {
    const authored =
      origin.breakpointPx !== undefined
        ? ` (@media ${origin.breakpointKind}-width ${origin.breakpointPx}px)`
        : "";
    console.log(
      `    ${String(origin.width).padStart(5)}  ${origin.source}` +
        (origin.alsoAuthored ? " +authored" : "") +
        authored,
    );
  }
}

async function main(): Promise<void> {
  console.log("web-recon — observe (responsive: desktop + mobile)");
  console.log("");

  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    printUsage();
    process.exitCode = 1;
    return;
  }
  const {
    url: target,
    prepareScroll,
    normalizePageState,
    pageStateEvidenceRoot,
  } = parsed;
  if (!target) {
    printUsage();
    return;
  }

  if (!/^https?:\/\//i.test(target)) {
    console.error(`Target must be an http(s) URL, got: ${target}`);
    process.exitCode = 1;
    return;
  }

  console.log("Target:");
  console.log(target);
  // Task 28.6 C3 D1 — this is the FLOOR set, not the set that will be probed.
  // The real width set is derived per page from the site's own authored
  // breakpoints once the observation has read its stylesheets, and is printed
  // with its provenance after the run.
  console.log(
    `Probe widths (floor): ${resolveProbeWidths(LAYOUT_PROBE_WIDTHS, parsed.probeWidths ?? []).join(", ")}` +
      ` | mobile ${resolveProbeWidths(MOBILE_LAYOUT_PROBE_WIDTHS, parsed.probeWidthsMobile ?? []).join(", ")}`,
  );
  if (prepareScroll) console.log("(prepare-scroll: ON)");
  if (parsed.sourcePackage)
    console.log(
      `(source-package: ON — viewports/<id>/source-package/` +
        `${parsed.sourcePackageJson ? "" : ", JSON response body capture: OFF"})`,
    );
  if (!parsed.layoutProbe) console.log("(layout probes: OFF)");
  console.log(
    `(page-state normalization: ${normalizePageState ? "ON" : "OFF"}` +
      `${normalizePageState ? `, evidence → ${pageStateEvidenceRoot ?? PAGE_STATE_EVIDENCE_ROOT_DEFAULT}` : ""})`,
  );
  console.log("");

  try {
    const observed = await observePage(target, {
      onLog: (msg) => console.log(msg),
      prepareScroll,
      normalizePageState,
      ...(pageStateEvidenceRoot ? { pageStateEvidenceRoot } : {}),
      ...(parsed.probeWidths ? { probeExtraWidths: parsed.probeWidths } : {}),
      ...(parsed.probeWidthsMobile
        ? { mobileProbeExtraWidths: parsed.probeWidthsMobile }
        : {}),
      ...(parsed.sourcePackage
        ? { sourcePackage: parsed.sourcePackageJson ? true : { bodyPolicy: { json: false } } }
        : {}),
      ...(parsed.layoutProbe ? {} : { layoutProbe: false }),
    });
    const saved = await saveObservation(observed);
    const obs = saved.observation;

    console.log("");
    if (obs.target.finalUrl !== obs.target.requestedUrl) {
      console.log(`Final URL (redirected): ${obs.target.finalUrl}`);
    }
    console.log(`Title: ${obs.target.title || "(none)"}`);
    console.log(
      `Observation profile: locale ${obs.observationProfile.locale}, ` +
        `timezone ${obs.observationProfile.timezone}, ` +
        `colorScheme ${obs.observationProfile.colorScheme}, ` +
        `reducedMotion ${obs.observationProfile.reducedMotion}`,
    );

    printViewport(obs.viewports.desktop);
    printViewport(obs.viewports.mobile);

    for (const v of [obs.viewports.desktop, obs.viewports.mobile]) {
      const sp = v.sourcePackage;
      if (!sp) continue;
      console.log("");
      console.log(`Source package (${v.profile.id}): ${sp.dir}`);
      console.log(
        `  styles ${sp.counts.styles} (raw ${sp.counts.stylesRawCaptured}) | ` +
          `scripts ${sp.counts.scripts} (responses ${sp.counts.scriptResponsesCaptured}) | ` +
          `assets ${sp.counts.assets} | network ${sp.counts.network} | config ${sp.counts.config}`,
      );
      console.log(
        `  initial document ${sp.initialDocument} | runtime DOM ${sp.runtimeDom} | ` +
          `${sp.fileCount} files, ${mb(sp.bytes)} | contentHash ${sp.contentHash.slice(0, 12)}`,
      );
    }

    printProbeWidths("desktop", observed.layoutProbe);
    printProbeWidths("mobile", observed.layoutProbeMobile);

    // Responsive summary (deterministic, side by side).
    const d = obs.responsiveSummary.desktop;
    const m = obs.responsiveSummary.mobile;
    console.log("");
    console.log("Responsive summary        desktop      mobile");
    const row = (label: string, a: number, b: number): void => {
      console.log(
        `  ${label.padEnd(22)}${String(a).padStart(8)}${String(b).padStart(12)}`,
      );
    };
    row("element count", d.elementCount, m.elementCount);
    row("effective visible", d.effectiveVisibleCount, m.effectiveVisibleCount);
    row("document width", d.documentWidth, m.documentWidth);
    row("document height", d.documentHeight, m.documentHeight);
    row("unique styles", d.uniqueStyleCount, m.uniqueStyleCount);
    row("assets", d.assetCount, m.assetCount);
    row("links", d.linkCount, m.linkCount);

    console.log("");
    console.log(
      `Run total: ${mb(obs.sizes.runTotalBytes)} ` +
        `(observation.json ${kb(obs.sizes.observationJsonBytes)})`,
    );
    console.log("");
    console.log("Saved:");
    console.log(saved.observationPath);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

void main();
