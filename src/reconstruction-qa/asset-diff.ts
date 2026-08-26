import type { AssetCatalog, ElementSpecNode } from "../sitespec/index.js";
import type { QaCapturedElement } from "./capture-page.js";
import type { PageDiagnostics } from "./capture-page.js";
import type { AssetDiffSummary } from "./types.js";

/**
 * Asset comparison and asset root causes (items 51–55).
 *
 * The measurement is deliberately the browser's own view of an image rather than
 * a URL comparison: `img.complete` plus `naturalWidth` answers "did a picture
 * actually appear?", which is the only question a fidelity report cares about. A
 * URL that matches and a picture that never decoded is still a hole in the page.
 *
 * Five distinct causes hide behind one visual symptom, and item 53 requires them
 * kept apart:
 *
 *   asset-missing-in-sitespec         the SiteSpec never had a reference — the
 *                                     hole starts upstream of reconstruction
 *   asset-unresolved-in-reconstruction the reference exists but the generator
 *                                     could not turn it into a src
 *   asset-reference-load-failure      the clone requested it and the request
 *                                     failed
 *   asset-hotlink-blocked             …and it failed cross-origin, with a status
 *                                     or error that says the origin refused it
 *   asset-source-drift                the LIVE original fails too, so the clone
 *                                     is reproducing the site's own behavior
 *
 * The MDN case is exactly why this split exists (item 54): those reference
 * assets fail because of a cross-origin resource policy, and folding them into
 * "runtime JS error" would blame the clone's runtime for someone else's header.
 *
 * ## What counts as "the snapshot showed an image"
 *
 * Only a POSITIVE decode: `naturalWidth > 0` on the snapshot's asset record, or
 * on the live original captured now. A non-zero layout box is NOT evidence — a
 * `loading="lazy"` `<img>` below the fold reserves its box and decodes nothing,
 * and both the Observer and this QA capture at scroll 0, so that image is
 * legitimately undecoded on every side. Accepting the box as evidence reported 31
 * "asset load failures" on domainchecker for images the original never painted
 * either.
 */

export interface AssetFinding {
  nodeId: string;
  tagName: string;
  cause:
    | "asset-missing-in-sitespec"
    | "asset-unresolved-in-reconstruction"
    | "asset-reference-load-failure"
    | "asset-hotlink-blocked"
    | "asset-source-drift";
  /** Snapshot evidence that a picture was there. */
  snapshotNaturalWidth?: number;
  snapshotNaturalHeight?: number;
  snapshotBoxArea: number;
  cloneHasSrc: boolean;
  cloneNaturalWidth: number;
  cloneComplete: boolean;
  cloneSrc: string;
  originalNaturalWidth?: number;
  sameOrigin?: boolean;
  assetId?: string;
  assetUrl?: string;
  /** The clone-side network failure that explains it, when one was recorded. */
  failureReason?: string;
  /**
   * The SiteSpec HAS this asset — attached to a different node.
   *
   * Task 09's `deriveAssets()` deduplicates URL assets on `type|url`, so the
   * SECOND `<img>` pointing at the same file never gets an asset record and
   * Task 13 therefore compiles it with `assetRefs: []`. That is a per-element
   * mapping loss upstream of reconstruction, and it is what produced 325 of the
   * `asset-missing` findings on nextjs.org — every duplicated logo and icon.
   * Distinguishing it matters because the fix is a re-observation, not an
   * exact-observation request.
   */
  assetReferenceLostUpstream?: boolean;
}

export interface AssetDiffResult {
  summary: AssetDiffSummary;
  findings: AssetFinding[];
}

export interface AssetDiffInput {
  nodes: readonly ElementSpecNode[];
  cloneByNodeId: ReadonlyMap<string, QaCapturedElement>;
  originalByNodeId?: ReadonlyMap<string, QaCapturedElement>;
  assetCatalog: AssetCatalog;
  cloneDiagnostics?: PageDiagnostics;
  originalDiagnostics?: PageDiagnostics;
  rootUrl: string;
}

/** Statuses/errors that mean the origin refused a cross-origin fetch. */
function looksHotlinkBlocked(reason: string | undefined, status: number): boolean {
  if (status === 403 || status === 401 || status === 451) return true;
  if (!reason) return false;
  return /blocked|CORP|CORS|ERR_BLOCKED|NotSameOrigin|opaque/i.test(reason);
}

function fileNameOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.pathname;
  } catch {
    return url;
  }
}

export function diffAssets(input: AssetDiffInput): AssetDiffResult {
  const assetById = new Map(
    input.assetCatalog.assets.map((asset) => [asset.assetId, asset]),
  );
  // Every URL the catalog holds, whatever node it is attached to.
  const catalogUrls = new Set<string>();
  for (const asset of input.assetCatalog.assets) {
    if (asset.url !== undefined) catalogUrls.add(asset.url);
  }
  const findings: AssetFinding[] = [];

  let snapshotImages = 0;
  let cloneImages = 0;
  let cloneImagesLoaded = 0;
  let cloneImagesFailed = 0;
  let cloneImagesWithoutSrc = 0;
  let originalImagesLoaded = 0;
  let originalImagesFailed = 0;
  let originalSeen = 0;

  // Index the clone's network failures by pathname so an <img> can be joined to
  // the response that explains it without keeping any query string.
  const failureByPath = new Map<string, { status: number; reason: string }>();
  for (const failure of input.cloneDiagnostics?.resourceFailures ?? []) {
    failureByPath.set(fileNameOf(failure.url), {
      status: failure.status,
      reason: failure.reason,
    });
  }
  const originalFailurePaths = new Set(
    (input.originalDiagnostics?.resourceFailures ?? []).map((failure) =>
      fileNameOf(failure.url),
    ),
  );

  for (const node of input.nodes) {
    if (node.tagName !== "img") continue;
    snapshotImages++;

    const assets = node.assetRefs
      .map((assetId) => assetById.get(assetId))
      .filter((asset): asset is NonNullable<typeof asset> => asset !== undefined);
    const primary =
      assets.find((asset) => asset.kind === "image-current") ??
      assets.find((asset) => asset.kind === "image") ??
      assets[0];
    const snapshotNaturalWidth = assets
      .map((asset) => asset.naturalWidth ?? 0)
      .reduce((max, value) => (value > max ? value : max), 0);
    const snapshotNaturalHeight = assets
      .map((asset) => asset.naturalHeight ?? 0)
      .reduce((max, value) => (value > max ? value : max), 0);
    const box = node.boundingBox;
    const snapshotBoxArea = box ? box.width * box.height : 0;

    const clone = input.cloneByNodeId.get(node.nodeId);
    if (!clone) continue;
    cloneImages++;
    const cloneImg = clone.img ?? {
      hasSrc: false,
      src: "",
      currentSrc: "",
      complete: false,
      naturalWidth: 0,
      naturalHeight: 0,
    };
    const loaded = cloneImg.naturalWidth > 0;
    if (loaded) cloneImagesLoaded++;
    else if (!cloneImg.hasSrc) cloneImagesWithoutSrc++;
    else cloneImagesFailed++;

    const original = input.originalByNodeId?.get(node.nodeId);
    let originalNaturalWidth: number | undefined;
    if (original) {
      originalSeen++;
      originalNaturalWidth = original.img?.naturalWidth ?? 0;
      if (originalNaturalWidth > 0) originalImagesLoaded++;
      else originalImagesFailed++;
    }

    if (loaded) continue;
    // A picture has to have actually decoded on some observed side. A reserved
    // box with nothing in it is the lazy-loading case, not a defect.
    const snapshotShowedSomething =
      snapshotNaturalWidth > 0 || (originalNaturalWidth ?? 0) > 0;
    if (!snapshotShowedSomething) continue;

    const assetUrl = primary?.url;
    const sameOrigin = primary?.sameOrigin;
    const failure = assetUrl ? failureByPath.get(fileNameOf(assetUrl)) : undefined;

    let cause: AssetFinding["cause"];
    if (originalNaturalWidth !== undefined && originalNaturalWidth === 0) {
      // The live original does not render it either.
      cause = "asset-source-drift";
    } else if (!cloneImg.hasSrc) {
      cause = assets.length === 0 ? "asset-missing-in-sitespec" : "asset-unresolved-in-reconstruction";
    } else if (failure && looksHotlinkBlocked(failure.reason, failure.status)) {
      cause = "asset-hotlink-blocked";
    } else if (sameOrigin === false && (failure !== undefined || cloneImg.complete)) {
      cause = "asset-hotlink-blocked";
    } else {
      cause = "asset-reference-load-failure";
    }
    if (
      cause !== "asset-source-drift" &&
      assetUrl &&
      originalFailurePaths.has(fileNameOf(assetUrl))
    ) {
      cause = "asset-source-drift";
    }

    // Is the file itself already in the catalog, just attached elsewhere?
    let assetReferenceLostUpstream = false;
    if (cause === "asset-missing-in-sitespec") {
      const liveSrc = original?.img?.currentSrc || original?.img?.src || "";
      if (liveSrc !== "") {
        try {
          const resolved = new URL(liveSrc, input.rootUrl).toString();
          assetReferenceLostUpstream = catalogUrls.has(resolved);
        } catch {
          assetReferenceLostUpstream = false;
        }
      }
    }

    findings.push({
      nodeId: node.nodeId,
      tagName: node.tagName,
      cause,
      ...(snapshotNaturalWidth > 0 ? { snapshotNaturalWidth } : {}),
      ...(snapshotNaturalHeight > 0 ? { snapshotNaturalHeight } : {}),
      snapshotBoxArea: Math.round(snapshotBoxArea),
      cloneHasSrc: cloneImg.hasSrc,
      cloneNaturalWidth: cloneImg.naturalWidth,
      cloneComplete: cloneImg.complete,
      cloneSrc: cloneImg.src,
      ...(originalNaturalWidth !== undefined ? { originalNaturalWidth } : {}),
      ...(sameOrigin !== undefined ? { sameOrigin } : {}),
      ...(primary ? { assetId: primary.assetId } : {}),
      ...(assetUrl ? { assetUrl } : {}),
      ...(failure ? { failureReason: `${failure.reason}` } : {}),
      ...(assetReferenceLostUpstream ? { assetReferenceLostUpstream: true } : {}),
    });
  }

  findings.sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));

  return {
    summary: {
      snapshotImages,
      cloneImages,
      cloneImagesLoaded,
      cloneImagesFailed,
      cloneImagesWithoutSrc,
      ...(originalSeen > 0
        ? { originalImagesLoaded, originalImagesFailed }
        : {}),
      cloneResourceFailures: input.cloneDiagnostics?.resourceFailures.length ?? 0,
      ...(input.originalDiagnostics
        ? { originalResourceFailures: input.originalDiagnostics.resourceFailures.length }
        : {}),
    },
    findings,
  };
}
