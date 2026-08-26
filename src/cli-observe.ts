import { observePage, saveObservation } from "./observer/index.js";
import type { ViewportObservation } from "./observer/index.js";

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
 * `--prepare-scroll` it may scroll (read-only) to trigger lazy content; it never
 * clicks, types, or submits. Discovery (`pnpm recon`) is a separate command.
 */

function printUsage(): void {
  console.log("Usage: pnpm observe <url> [--prepare-scroll]");
  console.log("  Renders one page in Chromium at desktop AND mobile viewports");
  console.log("  and stores a deep observation per viewport under");
  console.log("  data/<host>/<run-id>/viewports/<id>/ (read-only; no interaction).");
  console.log("");
  console.log("Options:");
  console.log(
    "  --prepare-scroll   Read-only auto-scroll to trigger lazy-loaded content",
  );
}

interface ParsedArgs {
  url?: string;
  prepareScroll: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  let url: string | undefined;
  let prepareScroll = false;
  for (const arg of argv) {
    if (arg === "--prepare-scroll") prepareScroll = true;
    else if (!arg.startsWith("--") && url === undefined) url = arg;
  }
  return { url, prepareScroll };
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

async function main(): Promise<void> {
  console.log("web-recon — observe (responsive: desktop + mobile)");
  console.log("");

  const { url: target, prepareScroll } = parseArgs(process.argv.slice(2));
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
  if (prepareScroll) console.log("(prepare-scroll: ON)");
  console.log("");

  try {
    const observed = await observePage(target, {
      onLog: (msg) => console.log(msg),
      prepareScroll,
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
