import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  CATCH_ALL_PAGE_TSX,
  LAYOUT_TSX,
  NEXT_CONFIG_MJS,
  NOT_FOUND_TSX,
  TSCONFIG_JSON,
  generatedConfigTs,
  globalsCss,
  packageJson,
} from "./app-template.js";
import {
  FORM_SAFETY_RUNTIME_TSX,
  INTERACTION_RUNTIME_TSX,
  LOAD_PAGE_TS,
  LOAD_ROUTE_TS,
  NODE_RENDERER_TSX,
  PAGE_RENDERER_TSX,
  ROUTE_KEY_TS,
  RUNTIME_TYPES_TS,
} from "./runtime-template.js";
import type { ReconstructionPlan } from "./plan-reconstruction.js";
import {
  OWNERSHIP_RENDER_BUDGET_PER_PASS,
  confirmOwnedForm,
  measureOwnedJointOverlay,
  verifyLayoutRules,
  verifyOwnedPlanGroups,
  type OwnedFormMismatch,
  type OwnedGroupRejection,
  type TruthCheckResult,
} from "./layout-truth-check.js";
import {
  generateLayoutCss,
  type LayoutInferenceCounters,
  type OwnedPlanOffer,
  type RecoveredLayoutRule,
} from "./layout-inference.js";
import {
  OWNERSHIP_MARKER_CLASSES,
  TEXT_BOX_SHRINK_VARIANT_CLASS,
  generateStylesheet,
} from "./style-generator.js";
import { siteSlug } from "./store.js";
import {
  APP_DIR,
  GENERATED_STYLES_FILE,
  GENERATOR_ENGINE,
  GENERATOR_VERSION,
  MANIFEST_FILE,
  RECONSTRUCTION_LIMITATION_MESSAGES,
  RECONSTRUCTION_SCHEMA_VERSION,
  ROUTE_MAP_FILE,
  RUNTIME_DATA_DIR,
  ReconstructionManifestSchema,
  type GeneratedFile,
  type ManifestStats,
  type ReconstructionManifest,
  type RuntimeElementNode,
  type RuntimePage,
  type RuntimeRouteMap,
} from "./types.js";

/**
 * Writing the app (items 5, 6, 7, 10, 11, 12).
 *
 * A mechanical dump of the plan. Nothing is decided here, which is what makes
 * determinism checkable: two runs produce two directories whose files differ in
 * zero bytes, and the only thing carrying a clock is the run directory's name.
 *
 * The size discipline of item 7 is the reason the runtime data is written with
 * `JSON.stringify(value)` and no indentation while Task 13 chose two-space
 * indent: a SiteSpec is meant to be read by a person reviewing an IR, and a
 * runtime page file is meant to be parsed by a server on a cold start. Different
 * artifacts, different goal.
 */

export interface GenerateAppOptions {
  /** Reconstruction run directory. Created if missing. */
  outputDir: string;
  /** Overwrite an existing output directory instead of refusing (item 5). */
  keepExisting?: boolean;
  /** Absolute directory holding Task 15 correction assets, when any exist. */
  correctionAssetDir?: string;
  sourceSchemaVersion: number;
  sourceSiteSpecVersion: number;
  sourceCompilerVersion: number;
  versions: Parameters<typeof packageJson>[0]["versions"];
  /**
   * Task 28.5B — run the post-emit browser truth check on the recovered layout
   * tier (default true). Setting it false is recorded in the manifest as
   * `layout.truthCheckStatus: "disabled"`; there is no way to skip the check
   * and still produce an artifact that claims it was verified.
   */
  verifyLayout?: boolean;
  /** Progress log for the truth check. */
  onLog?: (message: string) => void;
  /**
   * REC-I2 §C2.4 — THROW when an owned node's box in the real owned form
   * differs from its overlay-form verification by more than 0.5px. Tests set
   * it; production records `layout.ownership.ownedFormMismatches` instead.
   */
  strictOwnership?: boolean;
}

export interface GeneratedApp {
  outputDir: string;
  appDir: string;
  manifest: ReconstructionManifest;
  /**
   * Task 28.5B — what the post-emit browser truth check decided. REC-I2: `rules`
   * / `css` are the FINAL recovered tier (phase A survivors with owner nodes'
   * width-family declarations dropped, plus accepted ownership pieces).
   */
  layoutVerification: TruthCheckResult;
  /** REC-I2 — width-family ownership (phase B + owned-form confirmation). */
  ownership: OwnershipOutcome;
  files: GeneratedFile[];
  bytes: {
    total: number;
    runtimeData: number;
    css: number;
    source: number;
  };
}

class FileWriter {
  readonly files: GeneratedFile[] = [];
  private readonly dirsMade = new Set<string>();

  constructor(private readonly root: string) {}

  async write(relative: string, contents: string): Promise<number> {
    const file = path.join(this.root, relative);
    const dir = path.dirname(file);
    if (!this.dirsMade.has(dir)) {
      await mkdir(dir, { recursive: true });
      this.dirsMade.add(dir);
    }
    await writeFile(file, contents, "utf8");
    const bytes = Buffer.byteLength(contents, "utf8");
    this.files.push({ path: relative.split(path.sep).join("/"), bytes });
    return bytes;
  }
}

/**
 * Manifest `stats` from the plan. Exported so a suite can assert that a counter
 * really reaches the manifest rather than only existing on the plan.
 */
export function statsFrom(plan: ReconstructionPlan): ManifestStats {
  const c = plan.counters;
  return {
    routes: plan.routes.routes.length,
    pageSources: plan.pages.length,
    runtimeElementNodes: c.elementNodes,
    runtimeTextNodes: c.textNodes,
    styledNodes: c.styledNodes,
    missingStyleRefs: plan.styles.missingTokens.length,
    styleRules: plan.styles.ruleCount,
    pseudoRules: plan.pseudoStyles.ruleCount,
    generatedDomIds: c.generatedDomIds,
    rewrittenIdrefTokens: c.rewrittenIdrefTokens,
    unresolvedIdrefTokens: c.unresolvedIdrefTokens,
    patternBindings: plan.interactions.bindings.size,
    nativeBindings: plan.interactions.nativeBindings,
    scriptedBindings: plan.interactions.scriptedBindings,
    unknownBindings: plan.interactions.unknowns.size,
    dynamicTargets: plan.interactions.dynamicTargets,
    dynamicTargetsWithContent: plan.interactions.dynamicTargetsWithContent,
    dynamicTemplateNodes: plan.interactions.dynamicTemplateNodes,
    scrollStateNodes: c.scrollStateNodes,
    scrollRestoreNodes: c.scrollRestoreNodes,
    nestingAdaptations: c.nestingAdaptations,
    nestingDemotions: c.nestingDemotions,
    elementAssetsRequested: c.elementAssetsRequested,
    resolvedImageSrc: c.resolvedImageSrc,
    resolvedSrcset: c.resolvedSrcset,
    inlineSvgRendered: c.inlineSvgRendered,
    unresolvedElementAssets: c.unresolvedElementAssets,
    droppedSrcsetCandidates: c.droppedSrcsetCandidates,
    remoteAssetUrls: c.remoteAssetUrls,
    assetDownloads: 0,
    internalLinksRewritten: c.internalLinksRewritten,
    unresolvedInternalLinks: c.unresolvedInternalLinks,
    externalLinks: c.externalLinks,
    skippedSourceNodes: c.skippedSourceNodes,
    interactionStateConflicts: plan.interactions.interactionStateConflicts,
    // Task 28.5B §5 — surface the custom-property section so an EMPTY one is
    // diagnosable from the manifest alone instead of only from the stylesheet.
    customPropertyBlocks: plan.customProperties.blockCount,
    customPropertyDeclarations: plan.customProperties.declarationCount,
    customPropertyRejected:
      plan.customProperties.rejectedNames +
      plan.customProperties.rejectedValues +
      plan.customProperties.rejectedScopes,
  };
}

/*
 * ---------------------------------------------------------------------------
 * REC-I2 §C2.4 — APPLYING OWNERSHIP (pure).
 * ---------------------------------------------------------------------------
 */

/** Declarations an owner node's MEASURED rules lose (the six + their logical spellings). */
export const OWNED_DROPPED_DECLARATIONS: readonly string[] = [
  "width",
  "min-width",
  "max-width",
  "margin-left",
  "margin-right",
  "flex-basis",
  "margin-inline",
  "margin-inline-start",
  "margin-inline-end",
  "inline-size",
  "min-inline-size",
  "max-inline-size",
];

export interface OwnershipApplication {
  /** Phase-A rules with owner nodes' width-family declarations dropped (empty rules removed). */
  rules: RecoveredLayoutRule[];
  /** Runtime pages carrying marker classes (unchanged pages are the same objects). */
  pages: RuntimePage[];
  /** Style tokens worn by at least one owner node. */
  ownedTokens: Set<string>;
  /** planGroups whose node is absent from the runtime tree (cannot own). */
  missingNodes: string[];
  measuredDeclarationsDropped: number;
  measuredRulesDropped: number;
  shrinkToFitClassesRemoved: number;
  markerBytes: number;
  ownersWithGridTrackRule: number;
}

export function applyOwnership(input: {
  acceptedRules: readonly RecoveredLayoutRule[];
  owners: readonly OwnedPlanOffer[];
  pages: readonly RuntimePage[];
}): OwnershipApplication {
  const ownerKey = (pageId: string, viewportId: string, nodeId: string): string =>
    `${pageId}|${viewportId}|${nodeId}`;
  const byPage = new Map<string, OwnedPlanOffer[]>();
  for (const owner of input.owners) {
    const list = byPage.get(owner.pageId);
    if (list) list.push(owner);
    else byPage.set(owner.pageId, [owner]);
  }
  const ownedTokens = new Set<string>();
  const missingNodes: string[] = [];
  const found = new Set<string>();
  let shrinkToFitClassesRemoved = 0;
  let markerBytes = 0;
  const pages = input.pages.map((page) => {
    const owners = byPage.get(page.pageId);
    if (owners === undefined) return page;
    const clone = JSON.parse(JSON.stringify(page)) as RuntimePage;
    for (const viewportId of ["desktop", "mobile"] as const) {
      const wanted = new Map(
        owners.filter((owner) => owner.viewportId === viewportId).map((owner) => [owner.nodeId, owner]),
      );
      if (wanted.size === 0) continue;
      const stack: RuntimeElementNode[] = [clone[viewportId].doc];
      while (stack.length > 0) {
        const node = stack.pop()!;
        for (const child of node.c ?? []) if (child.k === "e") stack.push(child);
        const owner = wanted.get(node.n);
        if (owner === undefined || node.v !== undefined) continue;
        found.add(owner.planGroup);
        const props = (node.p ??= {});
        const before = typeof props["className"] === "string" ? (props["className"] as string) : undefined;
        const classes = (before ?? "").split(/\s+/).filter((cls) => cls !== "");
        for (const cls of classes) {
          if (cls.startsWith("wr-st")) ownedTokens.add(cls.slice("wr-".length));
        }
        const kept = classes.filter((cls) => cls !== TEXT_BOX_SHRINK_VARIANT_CLASS);
        shrinkToFitClassesRemoved += classes.length - kept.length;
        const after = [...kept, ...OWNERSHIP_MARKER_CLASSES.filter((cls) => !kept.includes(cls))].join(" ");
        props["className"] = after;
        markerBytes +=
          Buffer.byteLength(JSON.stringify({ className: after }), "utf8") -
          (before === undefined ? 2 : Buffer.byteLength(JSON.stringify({ className: before }), "utf8"));
      }
    }
    return clone;
  });
  for (const owner of input.owners) {
    if (!found.has(owner.planGroup)) missingNodes.push(owner.planGroup);
  }
  const owned = new Set(
    input.owners
      .filter((owner) => found.has(owner.planGroup))
      .map((owner) => ownerKey(owner.pageId, owner.viewportId, owner.nodeId)),
  );
  const dropped = new Set(OWNED_DROPPED_DECLARATIONS);
  let measuredDeclarationsDropped = 0;
  let measuredRulesDropped = 0;
  const gridOwners = new Set<string>();
  const rules: RecoveredLayoutRule[] = [];
  for (const rule of input.acceptedRules) {
    const key = ownerKey(rule.pageId, rule.viewportId ?? "desktop", rule.nodeId);
    if (!owned.has(key)) {
      rules.push(rule);
      continue;
    }
    if (rule.kind === "grid-track-columns" || rule.kind === "grid-track-columns-banded") gridOwners.add(key);
    const declarations: Record<string, string> = {};
    for (const [property, value] of Object.entries(rule.declarations)) {
      if (dropped.has(property)) measuredDeclarationsDropped++;
      else declarations[property] = value;
    }
    if (Object.keys(declarations).length === 0) {
      measuredRulesDropped++;
      continue;
    }
    rules.push(
      Object.keys(declarations).length === Object.keys(rule.declarations).length
        ? rule
        : { ...rule, declarations },
    );
  }
  return {
    rules,
    pages,
    ownedTokens,
    missingNodes,
    measuredDeclarationsDropped,
    measuredRulesDropped,
    shrinkToFitClassesRemoved,
    markerBytes,
    ownersWithGridTrackRule: gridOwners.size,
  };
}

/** Review fix (MAJOR-1) — joint-overlay re-measures allowed after rollbacks. */
export const OWNERSHIP_ROLLBACK_PASSES = 2;

export interface OwnershipOutcome {
  offered: number;
  acceptedGroups: string[];
  rejections: OwnedGroupRejection[];
  ownedFormMismatches: OwnedFormMismatch[];
  manifest: NonNullable<NonNullable<ReconstructionManifest["layout"]>["ownership"]>;
}

export async function generateApp(
  plan: ReconstructionPlan,
  options: GenerateAppOptions,
): Promise<GeneratedApp> {
  const { outputDir } = options;
  if (!options.keepExisting) {
    // A stale file from a previous generation would make the determinism claim
    // and the manifest's file list both untrue.
    await rm(path.join(outputDir, APP_DIR), { recursive: true, force: true });
    await rm(path.join(outputDir, MANIFEST_FILE), { force: true });
  }
  await mkdir(outputDir, { recursive: true });

  const writer = new FileWriter(outputDir);
  const appRoot = APP_DIR;
  const p = (...parts: string[]): string => [appRoot, ...parts].join("/");

  // --- app shell ------------------------------------------------------------
  const slug = siteSlug(plan.rootUrl);
  let sourceBytes = 0;
  sourceBytes += await writer.write(
    p("package.json"),
    packageJson({ siteSlug: slug, breakpoint: plan.breakpoint, versions: options.versions }),
  );
  sourceBytes += await writer.write(p("next.config.mjs"), NEXT_CONFIG_MJS);
  sourceBytes += await writer.write(p("tsconfig.json"), TSCONFIG_JSON);

  sourceBytes += await writer.write(p("app", "layout.tsx"), LAYOUT_TSX);
  sourceBytes += await writer.write(p("app", "[[...slug]]", "page.tsx"), CATCH_ALL_PAGE_TSX);
  sourceBytes += await writer.write(p("app", "not-found.tsx"), NOT_FOUND_TSX);
  /*
   * TASK 28.7 §26 — the SAME per-route map that reaches `route-map.json` below
   * and that layout inference split its probe axis on. One object, three
   * readers, so the stylesheet cannot serve a width the rules were not inferred at.
   */
  const routeOverrides = [...(plan.responsive?.byPageId ?? new Map<string, number>())]
    .map(([pageId, breakpoint]) => ({ pageId, breakpoint }))
    .sort((a, b) => (a.pageId < b.pageId ? -1 : a.pageId > b.pageId ? 1 : 0));
  const globals = globalsCss(plan.breakpoint, plan.corrections?.css, routeOverrides);
  const cssBytes = await writer.write(p("app", "globals.css"), globals);

  sourceBytes += await writer.write(p("src", "runtime", "types.ts"), RUNTIME_TYPES_TS);
  sourceBytes += await writer.write(p("src", "runtime", "route-key.ts"), ROUTE_KEY_TS);
  sourceBytes += await writer.write(p("src", "runtime", "load-route.ts"), LOAD_ROUTE_TS);
  sourceBytes += await writer.write(p("src", "runtime", "load-page.ts"), LOAD_PAGE_TS);
  sourceBytes += await writer.write(p("src", "runtime", "NodeRenderer.tsx"), NODE_RENDERER_TSX);
  sourceBytes += await writer.write(p("src", "runtime", "PageRenderer.tsx"), PAGE_RENDERER_TSX);
  sourceBytes += await writer.write(
    p("src", "runtime", "InteractionRuntime.tsx"),
    INTERACTION_RUNTIME_TSX,
  );
  sourceBytes += await writer.write(
    p("src", "runtime", "FormSafetyRuntime.tsx"),
    FORM_SAFETY_RUNTIME_TSX,
  );
  sourceBytes += await writer.write(
    p("src", "generated", "generated-config.ts"),
    generatedConfigTs({
      rootUrl: plan.rootUrl,
      breakpoint: plan.breakpoint,
      routeCount: plan.routes.routes.length,
      pageCount: plan.pages.length,
    }),
  );

  // --- generated stylesheet -------------------------------------------------
  const observedTargetCss = plan.observedTargetCss;
  const composeBase = (stylesCss: string): string =>
    `/* Generated by web-recon from the SiteSpec global style catalog. */\n` +
    // Task 28.5B §5 — source `:root` custom properties, scoped per page ×
    // viewport. First, so every rule below (and every `var()` that survived
    // inside captured inline-SVG markup) resolves against them.
    (plan.customProperties.css === "" ? "" : `${plan.customProperties.css}\n`) +
    `${stylesCss}\n` +
    (plan.pseudoStyles.css === "" ? "" : `${plan.pseudoStyles.css}\n`) +
    (observedTargetCss === "" ? "" : `${observedTargetCss}\n`);
  let baseStylesheet = composeBase(plan.styles.css);

  /*
   * Task 28.5B — verify the recovered tier before it ships.
   *
   * Task 17 §10 emits recovered rules at (0,3,0), above the exact computed
   * class, on the strength of a claim that they "cannot regress the truth
   * viewport by construction". 28.5A measured 349 nodes where they did. So the
   * generator now RENDERS them: the emitted desktop trees plus everything above
   * this line go into Chromium at the truth viewport, once without the recovered
   * tier and once with it, and any candidate that lands farther from its
   * observed box than the exact fallback did is dropped before it reaches the
   * stylesheet. Refusal is free — the node keeps the exact computed style, which
   * is what it would have had if inference had never fired.
   */
  /*
   * REC-I2 — PHASE A verifies every NON-owned rule exactly as before; the
   * `responsive-owned` pieces are verified per node group in phase B below.
   */
  const ownedCandidateRules = plan.layout.rules.filter((rule) => rule.kind === "responsive-owned");
  const phaseAVerification = await verifyLayoutRules({
    rules:
      ownedCandidateRules.length === 0
        ? plan.layout.rules
        : plan.layout.rules.filter((rule) => rule.kind !== "responsive-owned"),
    pages: plan.pages,
    css: `${globals}\n${baseStylesheet}`,
    /*
     * Task 28.7 B1 — the probe evidence the residual freeze audit needs. It is
     * a DIAGNOSTIC that rides along on the renders the check is already doing,
     * and it never rejects a rule: see the report-only note in
     * `layout-truth-check.ts`.
     */
    residualAudit: plan.layout.residualAudit,
    residualAuditNodesOmitted: plan.layout.counters.residualAuditNodesOmitted ?? 0,
    ...(options.verifyLayout === false ? { enabled: false } : {}),
    ...(options.onLog ? { onLog: options.onLog } : {}),
  });

  /*
   * REC-I2 — PHASE B (ownership groups) + OWNERSHIP + OWNED-FORM CONFIRM. With no
   * offer (every pre-P0 observation) every value below is the phase-A value
   * itself, so the written app is byte-identical.
   */
  const offers = plan.layout.ownedPlans ?? [];
  const phaseB = await verifyOwnedPlanGroups({
    offers,
    groupRules: ownedCandidateRules,
    acceptedRules: phaseAVerification.rules,
    pages: plan.pages,
    css: `${globals}\n${baseStylesheet}`,
    ...(options.verifyLayout === false ? { enabled: false } : {}),
    ...(options.onLog ? { onLog: options.onLog } : {}),
  });
  const ownershipRejections = [...phaseB.rejections];
  let acceptedGroupIds = new Set(phaseB.acceptedGroups);
  if (acceptedGroupIds.size > 0 && plan.styleInput === undefined) {
    // Cannot regenerate the exact tier with the split: refuse ownership rather
    // than ship an owned node whose frozen token still carries its width family.
    for (const offer of offers) {
      if (!acceptedGroupIds.has(offer.planGroup)) continue;
      ownershipRejections.push({
        planGroup: offer.planGroup,
        pageId: offer.pageId,
        viewportId: offer.viewportId,
        nodeId: offer.nodeId,
        reason: "unverifiable",
      });
    }
    acceptedGroupIds = new Set();
  }
  const rejectGroups = (groups: readonly OwnedPlanOffer[], reason: OwnedGroupRejection["reason"]): void => {
    for (const offer of groups) {
      ownershipRejections.push({
        planGroup: offer.planGroup,
        pageId: offer.pageId,
        viewportId: offer.viewportId,
        nodeId: offer.nodeId,
        reason,
      });
    }
  };
  let owners = offers.filter((offer) => acceptedGroupIds.has(offer.planGroup));
  {
    const probe = applyOwnership({ acceptedRules: phaseAVerification.rules, owners, pages: plan.pages });
    if (probe.missingNodes.length > 0) {
      const missing = new Set(probe.missingNodes);
      rejectGroups(owners.filter((offer) => missing.has(offer.planGroup)), "unverifiable");
      owners = owners.filter((offer) => !missing.has(offer.planGroup));
    }
  }
  /** The complete owned form for a set of owners (the unowned form when empty). */
  const unownedBase = baseStylesheet;
  const buildOwnedForm = (set: readonly OwnedPlanOffer[]) => {
    const application = applyOwnership({ acceptedRules: phaseAVerification.rules, owners: set, pages: plan.pages });
    const ids = new Set(set.map((offer) => offer.planGroup));
    const shippedOwnedRules = ownedCandidateRules.filter(
      (rule) => rule.planGroup !== undefined && ids.has(rule.planGroup),
    );
    if (set.length === 0 || plan.styleInput === undefined) {
      return {
        application,
        shippedOwnedRules: [] as RecoveredLayoutRule[],
        finalRules: phaseAVerification.rules,
        finalRecoveredCss: phaseAVerification.css,
        ownedStylesCss: plan.styles.css,
        tokensSplit: 0,
        splitRulesEmitted: 0,
        base: unownedBase,
        pages: plan.pages,
      };
    }
    const finalRules = [...application.rules, ...shippedOwnedRules];
    const ownedStyles = generateStylesheet({ ...plan.styleInput, ownedWidthFamilyTokens: application.ownedTokens });
    return {
      application,
      shippedOwnedRules,
      finalRules,
      finalRecoveredCss: generateLayoutCss(finalRules),
      ownedStylesCss: ownedStyles.css,
      tokensSplit: ownedStyles.ownership?.tokensSplit ?? 0,
      splitRulesEmitted: ownedStyles.ownership?.splitRulesEmitted ?? 0,
      base: composeBase(ownedStyles.css),
      pages: application.pages,
    };
  };
  /*
   * Review fix (MAJOR-1) — NOTHING UNCONFIRMED SHIPS. Accepted groups that
   * regress in the final joint state (against M alone) and groups whose OWNED
   * form differs from the overlay form they were verified in are ROLLED BACK:
   * their measured rules come back, their markers and token splits go, and the
   * joint overlay of the survivors is re-measured before the owned form is
   * confirmed again. At most {@link OWNERSHIP_ROLLBACK_PASSES} re-measures; a
   * set still not clean after that is abandoned entirely (`rollback-exhausted`).
   * `strictOwnership` (tests) still throws on the first confirm mismatch.
   */
  let overlayBoxes = phaseB.overlayBoxes;
  let regressed = new Set(phaseB.jointRegressedGroups);
  let jointRegressionRollbacks = 0;
  let ownedFormRollbacks = 0;
  let rollbackExhausted = 0;
  let rollbackPasses = 0;
  /** Review-VF MINOR — page-load retries across phase B, joint re-measures and confirms. */
  let ownershipLoadRetries = phaseB.counters.renderLoadRetries;
  let confirm: Awaited<ReturnType<typeof confirmOwnedForm>> = { checked: 0, mismatches: [], status: "not-run" };
  let form = buildOwnedForm([]);
  const remeasure = async (): Promise<boolean> => {
    if (owners.length === 0) return true;
    if (rollbackPasses >= OWNERSHIP_ROLLBACK_PASSES) {
      rollbackExhausted += owners.length;
      rejectGroups(owners, "rollback-exhausted");
      owners = [];
      return true;
    }
    rollbackPasses++;
    const joint = await measureOwnedJointOverlay({
      offers: owners,
      groupRules: ownedCandidateRules,
      acceptedRules: phaseAVerification.rules,
      pages: plan.pages,
      css: `${globals}\n${unownedBase}`,
    });
    if (joint.status !== "measured") {
      rollbackExhausted += owners.length;
      rejectGroups(owners, "unverifiable");
      owners = [];
      return true;
    }
    ownershipLoadRetries += joint.renderLoadRetries;
    overlayBoxes = joint.overlayBoxes;
    regressed = new Set(joint.jointRegressedGroups);
    return false;
  };
  for (;;) {
    if (regressed.size > 0) {
      const rolled = owners.filter((offer) => regressed.has(offer.planGroup));
      jointRegressionRollbacks += rolled.length;
      rejectGroups(rolled, "joint-regression");
      owners = owners.filter((offer) => !regressed.has(offer.planGroup));
      regressed = new Set();
      if (rolled.length > 0 && (await remeasure())) {
        form = buildOwnedForm([]);
        break;
      }
      continue;
    }
    if (owners.length === 0) {
      form = buildOwnedForm([]);
      break;
    }
    form = buildOwnedForm(owners);
    confirm = await confirmOwnedForm({
      offers: owners,
      overlayBoxes,
      pages: form.pages,
      css: `${globals}\n${form.base}`,
      recoveredCss: form.finalRecoveredCss,
      ...(options.onLog ? { onLog: options.onLog } : {}),
    });
    ownershipLoadRetries += confirm.renderLoadRetries ?? 0;
    if (confirm.mismatches.length === 0) break;
    if (options.strictOwnership === true) {
      throw new Error(
        `REC-I2 owned form differs from its verified overlay form on ${confirm.mismatches.length} sample(s): ` +
          JSON.stringify(confirm.mismatches.slice(0, 5)),
      );
    }
    const mismatched = new Set(confirm.mismatches.map((mismatch) => mismatch.planGroup));
    const rolled = owners.filter((offer) => mismatched.has(offer.planGroup));
    ownedFormRollbacks += rolled.length;
    rejectGroups(rolled, "owned-form-mismatch");
    owners = owners.filter((offer) => !mismatched.has(offer.planGroup));
    options.onLog?.(`[layout-ownership] rolled back ${rolled.length} group(s) whose owned form differed from the overlay`);
    if (await remeasure()) {
      form = buildOwnedForm([]);
      break;
    }
  }
  const application = form.application;
  const shippedOwnedRules = form.shippedOwnedRules;
  const finalRules = form.finalRules;
  const finalRecoveredCss = form.finalRecoveredCss;
  const ownedStylesCss = form.ownedStylesCss;
  const tokensSplit = form.tokensSplit;
  const splitRulesEmitted = form.splitRulesEmitted;
  baseStylesheet = form.base;
  const outputPages = form.pages;
  /** Mismatches in the SHIPPED state: 0 whenever anything was rolled back. */
  const shippedMismatches = owners.length === 0 ? [] : confirm.mismatches;
  const layoutVerification: TruthCheckResult =
    owners.length === 0
      ? phaseAVerification
      : { ...phaseAVerification, rules: finalRules, css: finalRecoveredCss };

  const planCounters = plan.layout.counters.responsiveOwnership;
  const rejectedBy: Record<string, number> = {};
  for (const rejection of ownershipRejections) {
    rejectedBy[rejection.reason] = (rejectedBy[rejection.reason] ?? 0) + 1;
  }
  const provenanceByProperty: Record<string, Record<string, number>> = {};
  for (const owner of owners) {
    for (const [property, histogram] of Object.entries(owner.provenanceByProperty)) {
      const bucket = (provenanceByProperty[property] ??= {});
      for (const [provenance, count] of Object.entries(histogram)) {
        bucket[provenance] = (bucket[provenance] ?? 0) + count;
      }
    }
  }
  const sortNested = (
    record: Record<string, Record<string, number>>,
  ): Record<string, Record<string, number>> =>
    Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [
          key,
          Object.fromEntries(Object.entries(record[key]!).sort(([a], [b]) => a.localeCompare(b))),
        ]),
    );
  const sortFlat = (record: Record<string, number>): Record<string, number> =>
    Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
  const unsplitRecoveredBytes =
    owners.length === 0
      ? 0
      : Buffer.byteLength(generateLayoutCss([...phaseAVerification.rules, ...shippedOwnedRules]), "utf8") -
        Buffer.byteLength(finalRecoveredCss, "utf8");
  const ownership: OwnershipOutcome = {
    offered: offers.length,
    acceptedGroups: owners.map((offer) => offer.planGroup),
    rejections: ownershipRejections,
    ownedFormMismatches: shippedMismatches,
    manifest: {
      nodesConsidered: planCounters?.nodesConsidered ?? 0,
      notConsideredByReason: sortFlat(planCounters?.notConsideredByReason ?? {}),
      nodePlansOffered: offers.length,
      nodesOwned: owners.length,
      nodePlansRejected: ownershipRejections.length,
      rejectedBy: sortFlat(rejectedBy),
      notOfferedByReason: sortFlat(planCounters?.notOfferedByReason ?? {}),
      ambiguousByReason: sortFlat(planCounters?.ambiguousByReason ?? {}),
      contradictedByProperty: sortFlat(planCounters?.contradictedByProperty ?? {}),
      rulesOffered: ownedCandidateRules.length,
      rulesShipped: shippedOwnedRules.length,
      tokensSplit,
      splitRulesEmitted,
      tokenCountDelta: 0,
      cssBytesDelta: Buffer.byteLength(ownedStylesCss, "utf8") - Buffer.byteLength(plan.styles.css, "utf8"),
      recoveredCssBytesDropped: Math.max(0, unsplitRecoveredBytes),
      markerBytes: owners.length === 0 ? 0 : application.markerBytes,
      measuredDeclarationsDropped: owners.length === 0 ? 0 : application.measuredDeclarationsDropped,
      measuredRulesDropped: owners.length === 0 ? 0 : application.measuredRulesDropped,
      shrinkToFitClassesRemoved: owners.length === 0 ? 0 : application.shrinkToFitClassesRemoved,
      ownersWithGridTrackRule: owners.length === 0 ? 0 : application.ownersWithGridTrackRule,
      provenanceByProperty: sortNested(provenanceByProperty),
      verificationWidthsRendered: phaseB.counters.widthsRendered,
      verificationRounds: phaseB.counters.rounds,
      verificationIsolatedRenders: phaseB.counters.isolatedRenders,
      verificationConverged: phaseB.counters.converged,
      acceptedJointRegressions: phaseB.counters.acceptedJointRegressions,
      ownedFormConfirm: confirm.status,
      ownedFormChecked: confirm.checked,
      ownedFormMismatches: shippedMismatches.length,
      ownedFormRollbacks,
      jointRegressionRollbacks,
      rollbackPasses,
      rollbackExhausted,
      verificationRenders: phaseB.counters.renders,
      renderBudgetRejections: phaseB.counters.renderBudgetRejections,
      renderBudgetPerPass: OWNERSHIP_RENDER_BUDGET_PER_PASS,
      witnessesGuarded: phaseB.counters.witnessesGuarded,
      independentSetRenders: phaseB.counters.independentSetRenders,
      renderLoadRetries: ownershipLoadRetries,
      coverageIncompleteByReason: sortFlat(planCounters?.coverageIncompleteByReason ?? {}),
    },
  };

  const stylesheet =
    baseStylesheet +
    // The recovered-rule tier, filtered to the rules a real re-render confirmed.
    // Priority is still structural: recovered rule → observed responsive rule →
    // exact computed fallback.
    (layoutVerification.css === "" ? "" : `${layoutVerification.css}\n`);
  const styleBytes = await writer.write(p("public", ...GENERATED_STYLES_FILE.split("/")), stylesheet);

  // --- QA correction assets (Task 15, item 105) -----------------------------
  // Content-addressed binaries copied into the corrected app's public tree. A
  // baseline reconstruction has no corrections and writes nothing here.
  if (plan.corrections && options.correctionAssetDir) {
    for (const assetFile of [...plan.corrections.assets.keys()].sort()) {
      const source = path.join(options.correctionAssetDir, assetFile);
      const info = await stat(source);
      const relative = p("public", "wr", "qa-assets", assetFile);
      await mkdir(path.dirname(path.join(outputDir, relative)), { recursive: true });
      await copyFile(source, path.join(outputDir, relative));
      writer.files.push({ path: relative.split(path.sep).join("/"), bytes: info.size });
    }
  }

  // --- runtime data ---------------------------------------------------------
  /*
   * §26 BACK-COMPATIBILITY. The scalar `breakpoint` keeps its exact pre-§26
   * meaning and value — four consumers outside this module read it and every
   * artifact written before §26 carries only it — and `pageBreakpoints` is
   * OMITTED entirely when no route disagrees, so a site whose routes all agree
   * writes byte-identical runtime data.
   */
  const pageBreakpoints: Record<string, number> = {};
  for (const { pageId, breakpoint } of routeOverrides) pageBreakpoints[pageId] = breakpoint;
  const routeMap: RuntimeRouteMap = {
    schemaVersion: RECONSTRUCTION_SCHEMA_VERSION,
    rootUrl: plan.rootUrl,
    breakpoint: plan.breakpoint.value,
    ...(routeOverrides.length > 0 ? { pageBreakpoints } : {}),
    routes: plan.routes.routes,
  };
  let runtimeBytes = 0;
  runtimeBytes += await writer.write(
    p(RUNTIME_DATA_DIR, ROUTE_MAP_FILE),
    JSON.stringify(routeMap) + "\n",
  );
  for (const page of outputPages) {
    const file = plan.pageFiles.get(page.pageId);
    if (!file) continue;
    runtimeBytes += await writer.write(
      p(RUNTIME_DATA_DIR, ...file.split("/")),
      JSON.stringify(page) + "\n",
    );
  }

  // --- manifest -------------------------------------------------------------
  const sortRecord = (record: Record<string, number>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const key of Object.keys(record).sort()) out[key] = record[key]!;
    return out;
  };
  const shippedByKind: Record<string, number> = {};
  // Task 28.6 C2b — the same tally split by variant, so the manifest can say how
  // many of the SHIPPED rules the mobile tree actually got. A pre-C2b rule
  // carries no `viewportId` and was, by construction, a desktop rule.
  const shippedByViewport: Record<string, number> = {};
  for (const rule of layoutVerification.rules) {
    shippedByKind[rule.kind] = (shippedByKind[rule.kind] ?? 0) + 1;
    const viewportId = rule.viewportId ?? "desktop";
    shippedByViewport[viewportId] = (shippedByViewport[viewportId] ?? 0) + 1;
  }
  /*
   * Task 28.8 A2 — the same tally for the rules a RE-RENDER threw out. One
   * total over eleven kinds cannot say which kind is proposing badly.
   */
  const authoredIntent = plan.layout.counters.authoredIntent as
    | LayoutInferenceCounters["authoredIntent"]
    | undefined;
  const rejectedByKind: Record<string, number> = {};
  for (const rejection of layoutVerification.rejections) {
    rejectedByKind[rejection.kind] = (rejectedByKind[rejection.kind] ?? 0) + 1;
  }
  const limitationGlossary: Record<string, string> = {};
  for (const code of plan.limitations) {
    limitationGlossary[code] = RECONSTRUCTION_LIMITATION_MESSAGES[code];
  }
  for (const [code, message] of Object.entries(plan.sourceLimitationGlossary)) {
    if (!(code in limitationGlossary)) limitationGlossary[code] = message;
  }

  const manifest: ReconstructionManifest = ReconstructionManifestSchema.parse({
    schemaVersion: RECONSTRUCTION_SCHEMA_VERSION,
    generatorVersion: GENERATOR_VERSION,
    engine: GENERATOR_ENGINE,
    sourceSiteSpecVersion: options.sourceSiteSpecVersion,
    sourceSchemaVersion: options.sourceSchemaVersion,
    sourceCompilerVersion: options.sourceCompilerVersion,
    rootUrl: plan.rootUrl,
    config: {
      inferredBreakpoint: plan.breakpoint,
      ...(plan.responsive && plan.responsive.records.length > 0
        ? { routeBreakpoints: plan.responsive.records }
        : {}),
      ...(plan.responsive && plan.responsive.variantTreeNotObserved.length > 0
        ? { variantTreeNotObserved: plan.responsive.variantTreeNotObserved }
        : {}),
      routeMode: "catch-all",
      assetMode: "reference",
      nextVersion: options.versions.next,
      reactVersion: options.versions.react,
    },
    stats: statsFrom(plan),
    coverage: plan.coverage,
    behavior: plan.behavior,
    layout: {
      pagesWithAlignedProbe: plan.layout.counters.pagesWithAlignedProbe,
      nodesWithProbe: plan.layout.counters.nodesWithProbe,
      // The SHIPPED rules, not the candidates: `recoveredRules` names what is in
      // the stylesheet, and `candidateRules` names what inference proposed.
      recoveredRules: layoutVerification.rules.length,
      centered: shippedByKind["centered-max-width"] ?? 0,
      fullWidth: shippedByKind["full-width"] ?? 0,
      percentage: shippedByKind["percentage-width"] ?? 0,
      responsiveHidden: shippedByKind["responsive-hidden"] ?? 0,
      // --- Task 28.5B accounting ---------------------------------------------
      candidateRules: layoutVerification.counters.candidateRules,
      acceptedRules: layoutVerification.counters.acceptedRules,
      rejectedByGuard: plan.layout.counters.guardRefusals,
      rejectedByTruthCheck: layoutVerification.counters.rejectedByTruthCheck,
      // Geometry candidates the check could not measure are REJECTED, never
      // shipped unverified. Task 28.6 R3 removed the last population that shipped
      // without a render, so `acceptedUnchecked` is 0 unless the caller disabled
      // the check outright.
      rejectedUnverifiable: layoutVerification.counters.rejectedUnverifiable,
      acceptedUnchecked: layoutVerification.counters.acceptedUnchecked,
      acceptedRegressed: layoutVerification.counters.acceptedRegressed,
      guardRefusalsByReason: sortRecord(plan.layout.counters.guardRefusalsByReason),
      // --- Task 28.6 accounting ----------------------------------------------
      // R2: how many candidates could not be told apart from an intrinsically
      // sized box, and which of the two width forms the survivors shipped with.
      widthModeRefusals: plan.layout.counters.widthModeRefusals ?? 0,
      widthModeRefusalsByReason: sortRecord(
        plan.layout.counters.widthModeRefusalsByReason ?? {},
      ),
      widthModeStretch: plan.layout.counters.widthModeStretch ?? 0,
      widthModeFillPercentage: plan.layout.counters.widthModeFillPercentage ?? 0,
      // R1: must be 0 — but 0 here corroborates nothing on its own. A verifier
      // re-introduced the off-by-one and measured this counter still 0, because
      // the scan and the band builder share `bandContains()`. The band EDGES are
      // what pin R1 (smoke-layout-safety Part 6a/6b).
      bandSampleMismatches: plan.layout.counters.bandSampleMismatches ?? 0,
      // D1: where each band EDGE's number came from. A midpoint is arithmetic on
      // the probe's sampling grid; a snapped edge is a number the source's
      // stylesheet wrote. The four "kept the midpoint" channels are separate on
      // purpose — no histogram, an empty one, and one that named nothing in this
      // particular gap are three different facts about the observation.
      authoredBreakpointPages: sortRecord(plan.layout.counters.authoredBreakpointPages ?? {}),
      authoredBreakpointEntries: plan.layout.counters.authoredBreakpointEntries ?? 0,
      authoredBreakpointDeclarations:
        plan.layout.counters.authoredBreakpointDeclarations ?? 0,
      authoredBreakpointUnparsedDeclarations:
        plan.layout.counters.authoredBreakpointUnparsedDeclarations ?? 0,
      authoredBreakpointTruncatedNodes:
        plan.layout.counters.authoredBreakpointTruncatedNodes ?? 0,
      bandEdgesOpen: plan.layout.counters.bandEdgesOpen ?? 0,
      bandEdgesConsidered: plan.layout.counters.bandEdgesConsidered ?? 0,
      bandEdgesSnapped: plan.layout.counters.bandEdgesSnapped ?? 0,
      bandEdgesSnappedAmbiguous: plan.layout.counters.bandEdgesSnappedAmbiguous ?? 0,
      bandEdgesKeptMidpointNoAuthoredInGap:
        plan.layout.counters.bandEdgesKeptMidpointNoAuthoredInGap ?? 0,
      bandEdgesKeptMidpointEmptyHistogram:
        plan.layout.counters.bandEdgesKeptMidpointEmptyHistogram ?? 0,
      bandEdgesKeptMidpointNoHistogram:
        plan.layout.counters.bandEdgesKeptMidpointNoHistogram ?? 0,
      bandEdgeSnapShiftPx: plan.layout.counters.bandEdgeSnapShiftPx ?? 0,
      // R3: banded rules are no longer exempt — they are rendered inside their
      // own active range, and that costs the extra page loads counted here.
      bandCheckable: layoutVerification.counters.bandCheckable,
      rejectedByBandCheck: layoutVerification.counters.rejectedByBandCheck,
      bandWidthsRendered: layoutVerification.counters.bandWidthsRendered,
      // V1: how many banded rules the render actually discriminated by their OWN
      // cascade, and how many an ancestor or the exact tier would have answered
      // for. The pre-V1 presence test could not tell the three apart.
      bandIndependentlyDiscriminated:
        layoutVerification.counters.bandIndependentlyDiscriminated,
      bandHiddenByAncestorAtBandWidth:
        layoutVerification.counters.bandHiddenByAncestorAtBandWidth,
      bandExactTierHidesAtBandWidth:
        layoutVerification.counters.bandExactTierHidesAtBandWidth,
      // V4: banded nodes already out of layout at the truth width in the
      // baseline render, contradicting the probe sample the band was built from.
      bandTruthBaselineNotInLayout:
        layoutVerification.counters.bandTruthBaselineNotInLayout,
      // V2: refusals of the VALUE (an unreadable padding), counted apart from
      // refusals of the SHAPE.
      widthValueRefusals: plan.layout.counters.widthValueRefusals ?? 0,
      widthValueRefusalsByReason: sortRecord(
        plan.layout.counters.widthValueRefusalsByReason ?? {},
      ),
      // C2b: which of the two trees the rules are about. `mobile:probe-absent`
      // in the refusals is the pre-schemaVersion-6 artifact saying so out loud;
      // a mobile count of 0 with no refusal would be the bug this replaced.
      viewportPasses: sortRecord(plan.layout.counters.viewportPasses ?? {}),
      viewportPassesUsed: sortRecord(plan.layout.counters.viewportPassesUsed ?? {}),
      viewportPassRefusals: sortRecord(plan.layout.counters.viewportPassRefusals ?? {}),
      rulesByViewport: sortRecord(plan.layout.counters.rulesByViewport ?? {}),
      shippedRulesByViewport: sortRecord(shippedByViewport),
      // C3: the inline-size funnel, end to end. `inlineSizeOutcomes` sums to
      // `inlineSizeCandidates`, and that sum plus `inlineSizePreStageDrops` is
      // `nodesWithProbe` — so nothing this stage examined can leave uncounted.
      inlineSizeCandidates: plan.layout.counters.inlineSizeCandidates ?? 0,
      inlineSizeOutcomes: sortRecord(plan.layout.counters.inlineSizeOutcomes ?? {}),
      inlineSizeOutcomeDoubleCounts:
        plan.layout.counters.inlineSizeOutcomeDoubleCounts ?? 0,
      inlineSizePreStageDrops: sortRecord(
        plan.layout.counters.inlineSizePreStageDrops ?? {},
      ),
      // A5: the grid-track recovery kind. It relaxes NO containing-block guard —
      // `fr` resolves against the container's own content box, so it needs none.
      gridTrack: shippedByKind["grid-track-columns"] ?? 0,
      gridTrackColumns: plan.layout.counters.gridTrackColumns ?? 0,
      gridTrackRefusals: plan.layout.counters.gridTrackRefusals ?? 0,
      gridTrackRefusalsByReason: sortRecord(
        plan.layout.counters.gridTrackRefusalsByReason ?? {},
      ),
      // Task 28.75 §03b — the banded grid pass, reported apart from the
      // single-band one so neither number can hide inside the other.
      gridTrackBandContainers: plan.layout.counters.gridTrackBandContainers ?? 0,
      gridTrackColumnsBanded: plan.layout.counters.gridTrackColumnsBanded ?? 0,
      gridTrackBandRefusals: plan.layout.counters.gridTrackBandRefusals ?? 0,
      gridTrackBandRefusalsByReason: sortRecord(
        plan.layout.counters.gridTrackBandRefusalsByReason ?? {},
      ),
      gridBandEdgesSnapped: plan.layout.counters.gridBandEdgesSnapped ?? 0,
      gridBandEdgesConsidered: plan.layout.counters.gridBandEdgesConsidered ?? 0,
      bandGeometryCheckable: layoutVerification.counters.bandGeometryCheckable,
      bandGeometryWidthsRendered: layoutVerification.counters.bandGeometryWidthsRendered,
      gridAreaFill: shippedByKind["grid-area-fill-width"] ?? 0,
      gridAreaFillRefusalsByReason: sortRecord(
        plan.layout.counters.gridAreaFillRefusalsByReason ?? {},
      ),
      // Task 28.7 G — the out-of-flow inset equation, read backwards. Shipped
      // count vs candidates: `insetResolvedWidth` is what inference PROPOSED and
      // `insetResolved` what survived the truth check, exactly like `gridTrack`.
      insetResolved: shippedByKind["inset-resolved-width"] ?? 0,
      insetResolvedWidth: plan.layout.counters.insetResolvedWidth ?? 0,
      insetResolvedRefusalsByReason: sortRecord(
        plan.layout.counters.insetResolvedRefusalsByReason ?? {},
      ),
      // Task 28.75 — same split: `trackedFill` is what SHIPPED, `trackedFillWidth`
      // what inference proposed.
      trackedFill: shippedByKind["tracked-fill-width"] ?? 0,
      trackedFillWidth: plan.layout.counters.trackedFillWidth ?? 0,
      trackedFillRefusalsByReason: sortRecord(
        plan.layout.counters.trackedFillRefusalsByReason ?? {},
      ),
      viewportBleed: shippedByKind["viewport-bleed-width"] ?? 0,
      viewportBleedWidth: plan.layout.counters.viewportBleedWidth ?? 0,
      viewportBleedRefusalsByReason: sortRecord(
        plan.layout.counters.viewportBleedRefusalsByReason ?? {},
      ),
      inlineSizeOutcomesSuperseded: plan.layout.counters.inlineSizeOutcomesSuperseded ?? 0,
      damageClamped: shippedByKind["damage-clamped-width"] ?? 0,
      damageClampedWidth: plan.layout.counters.damageClampedWidth ?? 0,
      damageClampRefusalsByReason: sortRecord(
        plan.layout.counters.damageClampRefusalsByReason ?? {},
      ),
      /*
       * Task 28.7 B1 — THE RESIDUAL FREEZE AUDIT. Report only: nothing below
       * gates anything, and none of it feeds the accept/reject accounting
       * above. It answers the question the counters above cannot — which nodes
       * shipped their 1440-resolved pixels because recovery declined, and what
       * those pixels do at the widths the probe actually measured.
       */
      residualAuditStatus: layoutVerification.residual.status,
      residualAuditPasses: layoutVerification.residual.passes,
      residualAuditNodesOffered: plan.layout.counters.residualAuditNodesOffered ?? 0,
      residualAuditNodesMeasured: layoutVerification.residual.nodesMeasured,
      residualAuditNodesOmitted: layoutVerification.residual.nodesOmitted,
      residualAuditWidthsRendered: layoutVerification.residual.widthsRendered,
      residualAuditWidthsCapped: layoutVerification.residual.widthsCapped,
      residualFrozenNodes: layoutVerification.residual.residuals,
      residualFrozenOmitted: layoutVerification.residual.residualsOmitted,
      residualFrozenFamilies: sortRecord(layoutVerification.residual.familyHistogram),
      residualFrozenConsequences: sortRecord(
        layoutVerification.residual.consequenceHistogram,
      ),
      /*
       * Task 28.7 B1 — and the per-node grid refusal log. `gridTrackRefusals`
       * above is a total and `gridTrackRefusalsByReason` a histogram; neither
       * can name a single container. These can, bounded per route by the
       * MEASURED px the frozen track list overhangs by.
       */
      gridTrackRefusalNodes: plan.layout.gridTrackRefusalNodes,
      gridTrackRefusalNodesOmitted: plan.layout.gridTrackRefusalNodesOmitted,
      truthCheckStatus: layoutVerification.counters.status,
      truthCheckable: layoutVerification.counters.truthCheckable,
      truthCheckRounds: layoutVerification.counters.rounds,
      truthCheckPagesRendered: layoutVerification.counters.pagesRendered,
      truthCheckConverged: layoutVerification.counters.converged,
      // P0 contract C2.1 — 1440 alone is not acceptance: geometry rules carrying
      // per-width source samples are also rendered inside their served interval.
      // `rejectedAtIntervalSample` is its own channel, subtracted from
      // `rejectedUnverifiable` alongside the truth and band channels.
      intervalSampleCheckable: layoutVerification.counters.intervalSampleCheckable,
      intervalSamplesRendered: layoutVerification.counters.intervalSamplesRendered,
      intervalSamplesChecked: layoutVerification.counters.intervalSamplesChecked,
      rejectedAtIntervalSample: layoutVerification.counters.rejectedAtIntervalSample,
      rejectedAtIntervalSampleByKind: sortRecord(
        layoutVerification.counters.rejectedAtIntervalSampleByKind,
      ),
      unprobedPositions: layoutVerification.counters.unprobedPositions,
      intervalSampleWidthsCapped: layoutVerification.counters.intervalSampleWidthsCapped,
      intervalSampleUnverifiedByCap: layoutVerification.counters.intervalSampleUnverifiedByCap,
      renderLoadRetries: layoutVerification.counters.renderLoadRetries,
      intervalIsolationRenders: layoutVerification.counters.intervalIsolationRenders,
      intervalCoRejectionsAvoided: layoutVerification.counters.intervalCoRejectionsAvoided,
      truthRecheckRejections: layoutVerification.counters.truthRecheckRejections,
      intervalIsolationBudgetFallbacks: layoutVerification.counters.intervalIsolationBudgetFallbacks,
      rejectedByTruthCheckByKind: sortRecord(rejectedByKind),
      // Task 28.8 A2 — the authored inline-size fallback.
      authoredInlineSize: shippedByKind["authored-inline-size"] ?? 0,
      /*
       * A plan assembled by hand — a fixture, or any caller written before
       * 28.8 — carries no `authoredIntent` block. Absent reads as EMPTY here,
       * which is exactly what a run that never offered the branch a node
       * produced, and never as a missing field the manifest lies about.
       */
      authoredIntentOffered: sortRecord(authoredIntent?.offered ?? {}),
      authoredIntentEmitted: sortRecord(authoredIntent?.emitted ?? {}),
      authoredIntentDeclarations: authoredIntent?.declarations ?? 0,
      authoredIntentCascadeCandidates: authoredIntent?.cascadeCandidates ?? 0,
      authoredIntentWidthAutoAdded: authoredIntent?.widthAutoAdded ?? 0,
      authoredIntentRefusalsByReason: sortRecord(authoredIntent?.refusalsByReason ?? {}),
      authoredIntentDeclarationRefusalsByReason: sortRecord(
        authoredIntent?.declarationRefusalsByReason ?? {},
      ),
      authoredIntentEmittedByProperty: sortRecord(authoredIntent?.emittedByProperty ?? {}),
      authoredIntentVarAdmitted: authoredIntent?.varAdmitted ?? 0,
      // Task 28.8 A3 — text-box block-size relief, in the frozen tier.
      /*
       * Task 28.8 A3 — text-box relief, in the FROZEN tier.
       *
       * Node counts come from the compiler (a class is per node) and the rule
       * count from the stylesheet writer (a rule is per token). Both are
       * reported: 3 rules covering 900 nodes and 900 rules covering 900 nodes
       * are very different facts about the corpus.
       */
      textBoxRelief: {
        minHeightNodes: plan.counters.textBoxHeightNodes ?? 0,
        shrinkToFitWidthDropped: plan.counters.textBoxShrinkNodes ?? 0,
        tokensVariants: plan.styles.textBoxRelief?.tokensVariants ?? 0,
      },
      // REC-I2 §C2.4 — width-family ownership. Present on every manifest this
      // generator writes; an old observation reads `nodesConsidered: 0` with the
      // evidence gate named in `notConsideredByReason`.
      ownership: ownership.manifest,
    },
    // Sorted so the manifest body is a function of the plan, not of write order.
    generatedFiles: [...writer.files].sort((a, b) => (a.path < b.path ? -1 : 1)),
    ...(plan.correctionProvenance
      ? {
          sourceQaRun: plan.correctionProvenance.sourceQaRun,
          correctionSet: plan.correctionProvenance.correctionSet,
          correctionCount: plan.correctionProvenance.correctionCount,
          ...(plan.correctionProvenance.sourceSiteSpec !== undefined
            ? { sourceSiteSpec: plan.correctionProvenance.sourceSiteSpec }
            : {}),
          correctionsByType: {
            "document-canvas-background": plan.corrections?.counts.canvasBackground ?? 0,
            "interaction-target-state-style":
              plan.corrections?.counts.interactionTargetStateStyle ?? 0,
            "safe-data-image-recovery": plan.corrections?.counts.safeDataImageRecovery ?? 0,
          },
        }
      : {}),
    limitations: plan.limitations,
    sourceLimitations: plan.sourceLimitations,
    limitationGlossary: Object.fromEntries(
      Object.keys(limitationGlossary)
        .sort()
        .map((key) => [key, limitationGlossary[key]!]),
    ),
  });

  const manifestJson = JSON.stringify(manifest, null, 2) + "\n";
  await writeFile(path.join(outputDir, MANIFEST_FILE), manifestJson, "utf8");

  const total =
    writer.files.reduce((sum, file) => sum + file.bytes, 0) +
    Buffer.byteLength(manifestJson, "utf8");

  return {
    outputDir,
    appDir: path.join(outputDir, APP_DIR),
    manifest,
    layoutVerification,
    ownership,
    files: writer.files,
    bytes: {
      total,
      runtimeData: runtimeBytes,
      css: styleBytes + cssBytes,
      source: sourceBytes,
    },
  };
}

/**
 * Read the exact resolved versions of the packages the generated app declares.
 *
 * Reading them rather than hardcoding is what keeps `"latest"` out of the
 * generated `package.json` (item 206) while still describing a build somebody
 * can reproduce: the version in the file is the version this machine actually
 * resolved, not one a human typed and hoped was current.
 */
export async function resolveDependencyVersions(
  repoRoot: string,
): Promise<GenerateAppOptions["versions"]> {
  const read = async (name: string): Promise<string> => {
    const file = path.join(repoRoot, "node_modules", ...name.split("/"), "package.json");
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    if (!parsed.version) throw new Error(`${name} has no version in its package.json`);
    return parsed.version;
  };
  const [next, react, reactDom, typescript, typesNode, typesReact, typesReactDom, serverOnly] =
    await Promise.all([
      read("next"),
      read("react"),
      read("react-dom"),
      read("typescript"),
      read("@types/node"),
      read("@types/react"),
      read("@types/react-dom"),
      read("server-only"),
    ]);
  return {
    next,
    react,
    reactDom,
    typescript,
    typesNode,
    typesReact,
    typesReactDom,
    serverOnly,
  };
}
