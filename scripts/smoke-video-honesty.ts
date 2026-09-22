/**
 * pnpm tsx scripts/smoke-video-honesty.ts — Task 28.5B (Change 4) proof suite.
 *
 * Accepted Task 28.5A fact (docs/result/handoffs/28.5-root-causes.json, the
 * video-honesty finding): a source `<video src=...>` could disappear from the
 * reconstruction while `reconstruction-manifest.json` still reported
 * `unresolvedElementAssets: 0`. Root cause, confirmed at
 * src/reconstruction/asset-resolver.ts:23-25/150-165 pre-fix —
 * `PRIMARY_IMAGE_KINDS` never included the `video` kind, so a `<video>`'s own
 * media reference could never become its `src`; where a poster existed, the
 * poster's image URL silently substituted for `src` instead; and
 * `result.unresolved` was gated on `tagName === "img"` only, so neither
 * failure was ever counted.
 *
 * This suite drives the REAL resolver (`AssetResolver.resolve`) and the real
 * compile path (`compileNode` / `compileElement` from compile-node.ts) against
 * constructed SiteSpec-shaped fixtures — no full site pipeline needed, since
 * both are pure functions over their inputs. Section A exercises
 * `AssetResolver` directly for precision on the resolution/priority logic;
 * Section B drives the full `compileNode` path (counters + actual React SSR
 * HTML output) to prove the fix is wired end-to-end, not just correct in
 * isolation.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { createElement, type ReactNode } from "react";

import {
  AssetResolver,
  compileNode,
  newCounters,
  LinkRewriter,
  type CompileNodeContext,
  type InteractionPlan,
  type RuntimeNode,
} from "../src/reconstruction/index.js";
import type { AssetCatalog, AssetSpec, ElementSpecNode, SpecNode } from "../src/sitespec/index.js";

let checks = 0;
let failures = 0;
function check(name: string, ok: boolean | undefined, detail = ""): void {
  checks++;
  if (ok) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string): void {
  console.log(`\n== ${title}`);
}

// ---------------------------------------------------------------------------
// Fixture builders
// ---------------------------------------------------------------------------

function asset(id: string, kind: string, url: string | undefined): AssetSpec {
  return {
    assetId: id,
    kind,
    ...(url !== undefined ? { url } : {}),
    usageCount: 1,
    sourcePageIds: ["p000001"],
  };
}

function catalog(assets: AssetSpec[]): AssetCatalog {
  const kindCounts: Record<string, number> = {};
  for (const a of assets) kindCounts[a.kind] = (kindCounts[a.kind] ?? 0) + 1;
  return {
    schemaVersion: 4,
    assetCount: assets.length,
    occurrenceCount: assets.length,
    kindCounts,
    assets,
  };
}

let nodeSeq = 0;
function el(
  tagName: string,
  opts: {
    nodeId?: string;
    childNodeIds?: string[];
    assetRefs?: string[];
    attributes?: Record<string, string>;
  } = {},
): ElementSpecNode {
  nodeSeq++;
  return {
    nodeId: opts.nodeId ?? `n${String(nodeSeq).padStart(6, "0")}`,
    type: "element",
    sourceElementId: `e${String(nodeSeq).padStart(6, "0")}`,
    childNodeIds: opts.childNodeIds ?? [],
    tagName,
    attributes: opts.attributes ?? {},
    localVisible: true,
    effectiveVisible: true,
    assetRefs: opts.assetRefs ?? [],
    relations: [],
    limitations: [],
  };
}

// Minimal RuntimeNode → HTML renderer, mirroring the real generated app's
// NODE_RENDERER_TSX template (src/reconstruction/runtime-template.ts) closely
// enough to prove `props.src` actually reaches rendered markup — it is test
// scaffolding, not a second implementation of the renderer (no logic beyond
// createElement + recursion lives here).
function renderRuntimeNode(node: RuntimeNode, key: number): ReactNode {
  if (node.k === "t") return node.v;
  const props: Record<string, unknown> = { key };
  if (node.p) for (const name in node.p) props[name] = node.p[name];
  const children = node.c;
  if (!children || children.length === 0) return createElement(node.t, props);
  return createElement(
    node.t,
    props,
    children.map((child, index) => renderRuntimeNode(child, index)),
  );
}

function emptyInteractionPlan(): InteractionPlan {
  return {
    bindings: new Map(),
    unknowns: new Map(),
    revealTargets: new Set(),
    unsupported: [],
    sourcePatternInstances: 0,
    unknownSourceInstances: 0,
    nativeBindings: 0,
    scriptedBindings: 0,
    dynamicTargets: 0,
    byPatternType: {},
    byMechanism: {},
    interactionStateConflicts: 0,
    dynamicTargetsWithContent: 0,
    dynamicTemplateNodes: 0,
    observedTargetBindings: 0,
    observedTargetsRevealed: 0,
    observedTargetsWithContent: 0,
    observedTargetsUnresolved: 0,
    observedTargetsHostMounted: 0,
    observedTargetsCaptureExpanded: 0,
    templateStyleTokens: new Set(),
    observedOpenStates: new Map(),
    limitations: new Set(),
  };
}

function makeContext(nodeById: Map<string, SpecNode>, assets: AssetResolver): CompileNodeContext {
  return {
    pageId: "p000001",
    pageUrl: "https://example.com/",
    viewportId: "desktop",
    nodeById,
    generatedIdNodes: new Set(),
    assets,
    links: new LinkRewriter({ rootUrl: "https://example.com", routeKeys: new Set() }),
    interactions: emptyInteractionPlan(),
    styleRenders: () => false,
  };
}

async function main(): Promise<void> {
  // =========================================================================
  section("A — AssetResolver.resolve() direct (priority + honesty logic)");
  // =========================================================================
  {
    const cat = catalog([
      asset("a-video-ok", "video", "https://cdn.example.com/media/hero.mp4"),
      asset("a-poster-ok", "video-poster", "https://cdn.example.com/media/hero-poster.jpg"),
      asset("a-poster-only", "video-poster", "https://cdn.example.com/media/only-poster.jpg"),
    ]);
    const resolver = new AssetResolver({ assetCatalog: cat, rootUrl: "https://example.com" });

    // Case 1: resolvable src, video kind wins even alongside a poster.
    const r1 = resolver.resolve("video", ["a-video-ok", "a-poster-ok"]);
    check(
      "1. video kind wins src over co-present video-poster kind",
      r1.src === "https://cdn.example.com/media/hero.mp4" && r1.unresolved === false,
      JSON.stringify(r1),
    );

    // Case 2: src fails resolution (assetRef present, catalog has no match).
    const r2 = resolver.resolve("video", ["a-does-not-exist"]);
    check(
      "2. video src fails resolution → unresolved, no src",
      r2.src === undefined && r2.unresolved === true,
      JSON.stringify(r2),
    );

    // Case 3: poster-only — src still gets the poster URL (poster handling
    // unchanged) but the substitution is counted as unresolved (the fix).
    const r3 = resolver.resolve("video", ["a-poster-only"]);
    check(
      "3. poster-only video: src = poster URL (unchanged render)",
      r3.src === "https://cdn.example.com/media/only-poster.jpg",
      JSON.stringify(r3),
    );
    check(
      "3. poster-only video: substitution is counted as unresolved (the fix)",
      r3.unresolved === true,
      JSON.stringify(r3),
    );

    // Case 4 (children): a <source> that fails to resolve is counted, same
    // shape as an <img> failing to resolve.
    const r4bad = resolver.resolve("source", ["a-does-not-exist"]);
    check(
      "4. unresolvable <source> child is counted unresolved",
      r4bad.unresolved === true,
      JSON.stringify(r4bad),
    );
    const catSource = catalog([asset("a-source-ok", "source", "https://cdn.example.com/v2.webm")]);
    const resolverSource = new AssetResolver({ assetCatalog: catSource, rootUrl: "https://example.com" });
    const r4okReal = resolverSource.resolve("source", ["a-source-ok"]);
    check(
      "4. resolvable <source> child resolves normally",
      r4okReal.src === "https://cdn.example.com/v2.webm" && r4okReal.unresolved === false,
      JSON.stringify(r4okReal),
    );

    // Case 5 (regression): unresolvable <img> still counts, unaffected.
    const r5 = resolver.resolve("img", ["a-does-not-exist"]);
    check(
      "5. regression: unresolvable <img> still flags unresolved",
      r5.unresolved === true,
      JSON.stringify(r5),
    );

    // Sanity: image/source own resolution priority is untouched.
    const catImg = catalog([
      asset("a-img", "image", "https://cdn.example.com/logo.png"),
      asset("a-src", "source", "https://cdn.example.com/logo-fallback.png"),
    ]);
    const resolverImg = new AssetResolver({ assetCatalog: catImg, rootUrl: "https://example.com" });
    const rImg = resolverImg.resolve("img", ["a-img", "a-src"]);
    check(
      "sanity: image kind still beats source kind for <img>",
      rImg.src === "https://cdn.example.com/logo.png",
      JSON.stringify(rImg),
    );
  }

  // =========================================================================
  section("B — full compileNode() pipeline (counters + rendered HTML)");
  // =========================================================================
  {
    const cat = catalog([
      asset("a1-video", "video", "https://cdn.example.com/media/hero.mp4"),
      asset("a1-poster", "video-poster", "https://cdn.example.com/media/hero-poster.jpg"),
      asset("a3-poster", "video-poster", "https://cdn.example.com/media/gap-poster.jpg"),
      asset("a4-source-ok", "source", "https://cdn.example.com/media/clip.webm"),
      asset("aimg-ok", "image", "https://cdn.example.com/img/logo.png"),
    ]);
    const resolver = new AssetResolver({ assetCatalog: cat, rootUrl: "https://example.com" });

    // video1: resolvable src + poster → case 1 & case 3's "poster still works
    // when content also resolves" companion.
    const video1 = el("video", { nodeId: "n-video1", assetRefs: ["a1-video", "a1-poster"] });

    // video2: assetRef present but unresolvable → case 2, THE invariant test.
    const video2 = el("video", { nodeId: "n-video2", assetRefs: ["a-missing"] });

    // video3: no own assetRef, no children at all → closes the exact
    // root-cause shape (Observer recorded nothing usable, no fallback exists).
    const video3 = el("video", { nodeId: "n-video3", assetRefs: [] });

    // video4: no own assetRef, but has <source> children → case 4. One child
    // resolves, one does not.
    const source4ok = el("source", { nodeId: "n-source4ok", assetRefs: ["a4-source-ok"] });
    const source4bad = el("source", { nodeId: "n-source4bad", assetRefs: ["a-missing"] });
    const video4 = el("video", {
      nodeId: "n-video4",
      assetRefs: [],
      childNodeIds: [source4ok.nodeId, source4bad.nodeId],
    });

    // video5: poster-only, no video-kind asset → case 3's honesty half.
    const video5 = el("video", { nodeId: "n-video5", assetRefs: ["a3-poster"] });

    // img1: regression control, unresolvable.
    const img1 = el("img", { nodeId: "n-img1", assetRefs: ["a-missing"] });

    // img2: regression control, resolvable.
    const img2 = el("img", { nodeId: "n-img2", assetRefs: ["aimg-ok"] });

    const root = el("div", {
      nodeId: "n-root",
      childNodeIds: [
        video1.nodeId,
        video2.nodeId,
        video3.nodeId,
        video4.nodeId,
        video5.nodeId,
        img1.nodeId,
        img2.nodeId,
      ],
    });

    const nodeById = new Map<string, SpecNode>(
      [root, video1, video2, video3, video4, source4ok, source4bad, video5, img1, img2].map(
        (n) => [n.nodeId, n],
      ),
    );

    const context = makeContext(nodeById, resolver);
    const counters = newCounters();
    const runtime = compileNode(root.nodeId, context, counters);

    check("compileNode returned a tree", runtime !== null);

    // --- counters -----------------------------------------------------------
    check(
      "counters: unresolvedElementAssets > 0 (invariant: not silently 0)",
      counters.unresolvedElementAssets > 0,
      String(counters.unresolvedElementAssets),
    );
    // Expected unresolved: video2 (bad src), video3 (empty, no children),
    // source4bad (bad src child), video5 (poster substitution), img1 (bad
    // src) = 5. video1, video4 (parent), source4ok, img2 are NOT unresolved.
    check(
      "counters: exactly the 5 genuinely-unresolved elements are counted",
      counters.unresolvedElementAssets === 5,
      `got ${counters.unresolvedElementAssets}`,
    );
    check(
      "counters: element-asset-unresolved limitation recorded",
      counters.limitations.has("element-asset-unresolved"),
    );
    check(
      "counters: resolvedImageSrc counts the genuinely-resolved src elements",
      counters.resolvedImageSrc >= 4, // video1, video4's source4ok, video5(poster src still set), img2
      String(counters.resolvedImageSrc),
    );

    // --- per-node checks via the compiled runtime tree ----------------------
    if (runtime === null || runtime.k !== "e") {
      check("runtime root is an element node", false);
    } else {
      const byId = new Map<string, RuntimeNode>();
      const walk = (node: RuntimeNode): void => {
        if (node.k === "e") {
          byId.set(node.n, node);
          for (const child of node.c ?? []) walk(child);
        }
      };
      walk(runtime);

      const rt1 = byId.get("n-video1");
      check(
        "1. video1: resolved src is the video URL, not the poster",
        rt1?.k === "e" && rt1.p?.["src"] === "https://cdn.example.com/media/hero.mp4",
        JSON.stringify(rt1 && rt1.k === "e" ? rt1.p : rt1),
      );

      const rt4ok = byId.get("n-source4ok");
      check(
        "4. video4/source4ok: child resolved normally",
        rt4ok?.k === "e" && rt4ok.p?.["src"] === "https://cdn.example.com/media/clip.webm",
      );

      const rt5 = byId.get("n-video5");
      check(
        "3. video5 (poster-only): poster URL still ends up in src (render unchanged)",
        rt5?.k === "e" && rt5.p?.["src"] === "https://cdn.example.com/media/gap-poster.jpg",
      );

      const rtImg2 = byId.get("n-img2");
      check(
        "sanity: regular <img> still resolves normally",
        rtImg2?.k === "e" && rtImg2.p?.["src"] === "https://cdn.example.com/img/logo.png",
      );

      const rtVideo3 = byId.get("n-video3");
      check(
        "video3 (nothing at all): no src prop set",
        rtVideo3?.k === "e" && rtVideo3.p?.["src"] === undefined,
      );
    }

    // --- 1. resolvable video src renders in actual output HTML --------------
    if (runtime !== null) {
      const html = renderToStaticMarkup(renderRuntimeNode(runtime, 0));
      check(
        "1. resolved video src renders into output HTML",
        html.includes('src="https://cdn.example.com/media/hero.mp4"'),
      );
      check(
        "2. unresolvable video src does NOT appear as a fabricated src in output HTML",
        !html.includes("undefined") && !/n-video2[^>]*src=/.test(html),
      );
      check(
        "5. regression: unresolvable <img> renders with no src attribute",
        // n-img1's <img> element carries data-wr-node="n-img1" and no src=
        new RegExp(`<img[^>]*data-wr-node="n-img1"[^>]*>`).test(html) &&
          !new RegExp(`data-wr-node="n-img1"[^>]*src=`).test(html),
      );
    }
  }

  // =========================================================================
  section("C — 28.5B correction: GAP-A (undercount) and GAP-B (overcount)");
  // =========================================================================
  // Both gaps were found by the independent verifier
  // (docs/result/handoffs/28.5B-verify-video.json) as STRUCTURAL holes in the
  // invariant with zero occurrences in today's corpus. They are latent, so
  // only a fixture can hold them closed — hence this section.
  {
    const cat = catalog([
      asset("c-bg", "background-image", "https://cdn.example.com/img/bg.png"),
      asset("c-mask", "mask-image", "https://cdn.example.com/img/mask.svg"),
      asset("c-source-ok", "source", "https://cdn.example.com/media/ok.webm"),
    ]);
    const resolver = new AssetResolver({ assetCatalog: cat, rootUrl: "https://example.com" });

    // --- GAP-A, resolver level ---------------------------------------------
    const gapA = resolver.resolve("source", []);
    check(
      "GAP-A: <source> with zero assetRefs is flagged unresolved (was silently false)",
      gapA.unresolved === true,
      JSON.stringify(gapA),
    );
    check(
      "GAP-A regression: <img> with zero assetRefs still flagged unresolved",
      resolver.resolve("img", []).unresolved === true,
    );
    check(
      "GAP-A regression: a non-media tag with zero assetRefs is still NOT flagged",
      resolver.resolve("div", []).unresolved === false &&
        resolver.resolve("video", []).unresolved === false,
    );

    // --- GAP-B, resolver level ---------------------------------------------
    // A <video> carrying ONLY the background-image ref that collect-assets.ts
    // pushes onto every styled element must not be judged at all here: it has
    // no own MEDIA asset, and only compile-node can see its <source> children.
    const gapB = resolver.resolve("video", ["c-bg"]);
    check(
      "GAP-B: <video> with only a non-media (background-image) ref is NOT flagged by the resolver",
      gapB.unresolved === false,
      JSON.stringify(gapB),
    );
    check(
      "GAP-B: that <video> reports noOwnMediaAsset so compile-node can decide",
      gapB.noOwnMediaAsset === true,
      JSON.stringify(gapB),
    );
    check(
      "GAP-B: several non-media refs (background-image + mask-image) behave the same",
      resolver.resolve("video", ["c-bg", "c-mask"]).unresolved === false,
    );
    check(
      "GAP-B regression: a dangling ref has no kind to inspect and still counts",
      resolver.resolve("video", ["c-does-not-exist"]).unresolved === true,
    );
    check(
      "GAP-B regression: <img> with only a background-image ref is untouched (still unresolved)",
      resolver.resolve("img", ["c-bg"]).unresolved === true,
    );

    // --- both gaps, full compileNode() path --------------------------------
    // videoA: GAP-A shape — no own asset, one <source> child that itself has
    // ZERO assetRefs. Media is gone; exactly ONE element must be counted.
    const sourceA = el("source", { nodeId: "n-c-sourceA", assetRefs: [] });
    const videoA = el("video", {
      nodeId: "n-c-videoA",
      assetRefs: [],
      childNodeIds: [sourceA.nodeId],
    });

    // videoB: GAP-B shape — a background-image ref of its own plus a <source>
    // child that resolves fine. Renders correctly; must NOT be counted.
    const sourceB = el("source", { nodeId: "n-c-sourceB", assetRefs: ["c-source-ok"] });
    const videoB = el("video", {
      nodeId: "n-c-videoB",
      assetRefs: ["c-bg"],
      childNodeIds: [sourceB.nodeId],
    });

    // videoC: the GAP-B fix must not become a blanket amnesty — a non-media
    // ref and NO <source> child is still a video whose media went missing.
    const videoC = el("video", { nodeId: "n-c-videoC", assetRefs: ["c-bg"] });

    const rootC = el("div", {
      nodeId: "n-c-root",
      childNodeIds: [videoA.nodeId, videoB.nodeId, videoC.nodeId],
    });
    const nodeByIdC = new Map<string, SpecNode>(
      [rootC, videoA, sourceA, videoB, sourceB, videoC].map((n) => [n.nodeId, n]),
    );

    const countersC = newCounters();
    const runtimeC = compileNode(rootC.nodeId, makeContext(nodeByIdC, resolver), countersC);

    // Expected: sourceA (GAP-A, counted at the child) + videoC (non-media ref,
    // no source child) = 2. videoA's PARENT is not counted — that is the
    // "exactly once" half of GAP-A. videoB and sourceB are not counted at all.
    check(
      "GAP-A + GAP-B: exactly 2 elements counted (broken <source>, media-less <video>)",
      countersC.unresolvedElementAssets === 2,
      `got ${countersC.unresolvedElementAssets}`,
    );

    // Isolate each shape so the total above cannot pass by cancellation.
    const countA = newCounters();
    compileNode("n-c-videoA", makeContext(nodeByIdC, resolver), countA);
    check(
      "GAP-A: the <video>/<source> pair with lost media is counted EXACTLY once",
      countA.unresolvedElementAssets === 1,
      `got ${countA.unresolvedElementAssets}`,
    );

    const countB = newCounters();
    const runtimeB = compileNode("n-c-videoB", makeContext(nodeByIdC, resolver), countB);
    check(
      "GAP-B: a <video> with a non-media ref and a good <source> child is NOT counted",
      countB.unresolvedElementAssets === 0,
      `got ${countB.unresolvedElementAssets}`,
    );

    const countC = newCounters();
    compileNode("n-c-videoC", makeContext(nodeByIdC, resolver), countC);
    check(
      "GAP-B: the fix is not a blanket amnesty — non-media ref + no <source> child still counts once",
      countC.unresolvedElementAssets === 1,
      `got ${countC.unresolvedElementAssets}`,
    );

    // --- and it actually renders --------------------------------------------
    if (runtimeB !== null) {
      const htmlB = renderToStaticMarkup(renderRuntimeNode(runtimeB, 0));
      check(
        "GAP-B: that uncounted <video> really does render its media from the <source> child",
        htmlB.includes('src="https://cdn.example.com/media/ok.webm"'),
        htmlB,
      );
      check(
        "GAP-B: the background-image ref is not fabricated into the <video>'s src",
        !htmlB.includes("https://cdn.example.com/img/bg.png"),
        htmlB,
      );
    } else {
      check("GAP-B: videoB compiled", false);
    }

    if (runtimeC !== null) {
      const htmlC = renderToStaticMarkup(renderRuntimeNode(runtimeC, 0));
      check(
        "GAP-A: the <source> with no assetRefs renders with no src attribute",
        new RegExp(`data-wr-node="n-c-sourceA"`).test(htmlC) &&
          !new RegExp(`data-wr-node="n-c-sourceA"[^>]*src=`).test(htmlC),
        htmlC,
      );
    } else {
      check("GAP-A: rootC compiled", false);
    }
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[smoke:video-honesty] ERROR —", err);
  process.exitCode = 1;
});
