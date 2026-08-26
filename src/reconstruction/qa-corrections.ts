import { bindingKey } from "./interaction-bindings.js";
import { isSafeCssProperty, isSafeCssValue } from "./style-generator.js";
import { ReconstructionError } from "./types.js";

/**
 * Optional QA corrections (Task 15, items 113–116).
 *
 * Task 14's contract does not change: `pnpm reconstruct <site-spec>` with no
 * corrections produces byte-identical output to the Task 14 baseline. That is
 * asserted by a regression, and it is why every code path in this file is
 * reachable only when a correction set was explicitly supplied.
 *
 * The generator deliberately does NOT import anything from
 * `src/reconstruction-qa/`. The dependency runs one way — QA reads
 * reconstruction, never the reverse — so the correction shapes are re-declared
 * here as the narrow input this engine understands. A correction is DATA: a
 * closed type, a fixed payload, and a fixed application site. There is no
 * selector, no JavaScript and no React in it (item 90), and the CSS it produces
 * is generated from a template with the observed values run through the same
 * property allowlist and value validator every other declaration uses.
 *
 * Where each type lands:
 *
 *   document-canvas-background      one `html { … }` rule in the app's own
 *                                   stylesheet — the canvas the observed
 *                                   document-root background would have
 *                                   propagated to
 *   interaction-target-state-style  one rule scoped to
 *                                   `[data-wr-viewport][data-wr-page]
 *                                    [data-wr-node][data-wr-revealed]`,
 *                                   plus the reveal hook on that node so the
 *                                   runtime marks it when it opens
 *   safe-data-image-recovery        a `src` on one element, pointing at a
 *                                   content-addressed file this run copies into
 *                                   `public/wr/qa-assets/`
 */

export interface CanvasBackgroundCorrectionInput {
  type: "document-canvas-background";
  properties: Record<string, string>;
}

export interface InteractionStateStyleCorrectionInput {
  type: "interaction-target-state-style";
  pageId: string;
  viewport: "desktop" | "mobile";
  targetNodeId: string;
  state: "open";
  /**
   * `open` keys the rule on the attribute the BROWSER toggles (a native
   * `<details>`); `revealed` keys it on the marker the generated
   * InteractionRuntime sets. Absent is treated as `revealed` for compatibility
   * with a correction set written before this field existed.
   */
  stateHook?: "open" | "revealed";
  properties: Record<string, string>;
}

export interface SafeDataImageCorrectionInput {
  type: "safe-data-image-recovery";
  pageId: string;
  viewport: "desktop" | "mobile";
  nodeId: string;
  /** Path the corrected app serves the recovered image at. */
  publicPath: string;
  /** File name inside the correction set's asset directory. */
  assetFile: string;
}

export type ReconstructionCorrectionInput =
  | CanvasBackgroundCorrectionInput
  | InteractionStateStyleCorrectionInput
  | SafeDataImageCorrectionInput;

export interface ReconstructionCorrections {
  /** Provenance, recorded in the corrected manifest (item 116). */
  sourceQaRun: string;
  correctionSet: string;
  sourceSiteSpec?: string;
  /** Absolute directory holding the correction assets. */
  assetDir: string;
  corrections: ReconstructionCorrectionInput[];
}

export interface CorrectionPlan {
  /** Extra CSS appended to the app's own stylesheet. Empty when unused. */
  css: string;
  /** `pageId|viewport|nodeId` → corrected image src. */
  imageSrc: Map<string, string>;
  /** `pageId|viewport|nodeId` of nodes that need the runtime's reveal hook. */
  revealNodes: Set<string>;
  /** `public/wr/qa-assets/<file>` → absolute source path to copy. */
  assets: Map<string, string>;
  counts: {
    canvasBackground: number;
    interactionTargetStateStyle: number;
    safeDataImageRecovery: number;
  };
}

const PUBLIC_ASSET_PREFIX = "/wr/qa-assets/";

function declarations(properties: Readonly<Record<string, string>>): string {
  const parts: string[] = [];
  for (const name of Object.keys(properties).sort()) {
    const value = properties[name]!;
    if (!isSafeCssProperty(name)) {
      throw new ReconstructionError(
        `correction carries a CSS property outside the allowlist: ${name}`,
      );
    }
    if (!isSafeCssValue(value)) {
      throw new ReconstructionError(
        `correction carries an unsafe CSS value for ${name}`,
      );
    }
    parts.push(`${name}:${value}`);
  }
  return parts.join(";");
}

/** A public path must stay inside the generated asset directory. */
function assertSafePublicPath(publicPath: string, assetFile: string): void {
  if (!publicPath.startsWith(PUBLIC_ASSET_PREFIX)) {
    throw new ReconstructionError(
      `correction asset public path must start with ${PUBLIC_ASSET_PREFIX}: ${publicPath}`,
    );
  }
  const name = publicPath.slice(PUBLIC_ASSET_PREFIX.length);
  if (name === "" || name !== assetFile) {
    throw new ReconstructionError(
      `correction asset public path ${publicPath} does not match its asset file ${assetFile}`,
    );
  }
  if (!/^[a-f0-9]{64}\.[a-z0-9]{2,5}$/.test(name)) {
    throw new ReconstructionError(
      `correction asset file name is not content-addressed: ${name}`,
    );
  }
}

/**
 * Compile a correction set into the three things the generator applies.
 *
 * Fails rather than degrades: an unsafe value, a non-content-addressed asset
 * name or a duplicate correction for one node is an engine-level fault
 * (item 176), not something to quietly skip.
 */
export function buildCorrectionPlan(
  corrections: ReconstructionCorrections | undefined,
): CorrectionPlan | undefined {
  if (!corrections || corrections.corrections.length === 0) return undefined;

  const rules: string[] = [];
  const imageSrc = new Map<string, string>();
  const revealNodes = new Set<string>();
  const assets = new Map<string, string>();
  const counts = {
    canvasBackground: 0,
    interactionTargetStateStyle: 0,
    safeDataImageRecovery: 0,
  };

  let canvasSeen = false;
  for (const correction of corrections.corrections) {
    switch (correction.type) {
      case "document-canvas-background": {
        if (canvasSeen) {
          throw new ReconstructionError(
            "two document-canvas-background corrections were supplied; the canvas has one background",
          );
        }
        canvasSeen = true;
        const body = declarations(correction.properties);
        if (body === "") break;
        rules.push(
          `/* QA correction: observed document-root background, propagated to the canvas. */\n` +
            `html{${body}}`,
        );
        counts.canvasBackground++;
        break;
      }
      case "interaction-target-state-style": {
        const body = declarations(correction.properties);
        if (body === "") break;
        const hook = correction.stateHook ?? "revealed";
        const stateSelector = hook === "open" ? "[open]" : '[data-wr-revealed="1"]';
        const selector =
          `[data-wr-viewport="${correction.viewport}"][data-wr-page="${correction.pageId}"] ` +
          `[data-wr-node="${correction.targetNodeId}"]${stateSelector}`;
        rules.push(
          `/* QA correction: open-state style observed live on the original (${hook}). */\n` +
            `${selector}{${body}}`,
        );
        // The runtime marker only exists for regions the runtime opens; a native
        // `<details>` needs no hook because the browser moves `open` itself.
        if (hook === "revealed") {
          revealNodes.add(
            bindingKey(correction.pageId, correction.viewport, correction.targetNodeId),
          );
        }
        counts.interactionTargetStateStyle++;
        break;
      }
      case "safe-data-image-recovery": {
        assertSafePublicPath(correction.publicPath, correction.assetFile);
        const key = bindingKey(correction.pageId, correction.viewport, correction.nodeId);
        const existing = imageSrc.get(key);
        if (existing !== undefined && existing !== correction.publicPath) {
          throw new ReconstructionError(
            `two different image corrections target ${key}`,
          );
        }
        imageSrc.set(key, correction.publicPath);
        assets.set(correction.assetFile, correction.assetFile);
        counts.safeDataImageRecovery++;
        break;
      }
    }
  }

  return {
    css: rules.length === 0 ? "" : `${rules.join("\n")}\n`,
    imageSrc,
    revealNodes,
    assets,
    counts,
  };
}
