import type { RuntimeElementNode, RuntimeRouteMap } from "../reconstruction/index.js";
import { scanSvgRuns } from "./apply.js";
import type { BackgroundImageRule } from "./css.js";
import { textChildren, VARIANTS, variantIndex, type PageIndex } from "./tree.js";
import {
  COVERAGE_CLASSES,
  SLOTIZED_COVERAGE_SCHEMA,
  SLOTIZED_TEMPLATE_SCHEMA_VERSION,
  type Binding,
  type CoverageClass,
  type CoverageFile,
  type UnslottedReason,
  type Variant,
} from "./types.js";
import type { LikelyGlobal } from "./globals.js";

/**
 * Honest coverage accounting.
 *
 * Eligibility is derived by THIS module's own scan of the page trees, not by
 * asking the compiler what it produced — otherwise coverage would be a
 * tautology ("everything we slotted is slotted"). Every eligible surface that
 * did NOT become a slot is listed individually with a reason code, so the gap
 * between "what a customer can edit" and "what the page contains" is a
 * readable list instead of a percentage.
 */

const TEXT_DENY_TAGS = new Set(["script", "style", "noscript", "template"]);

interface Row {
  class: CoverageClass;
  pageId: string;
  variant?: Variant;
  nodeId?: string;
  detail?: string;
  reason: UnslottedReason;
}

export interface CoverageInput {
  templateId: string;
  pages: Map<string, PageIndex>;
  routeMap: RuntimeRouteMap;
  bindings: readonly Binding[];
  backgroundRules: readonly BackgroundImageRule[];
  backgroundOccurrences: number;
  likelyGlobal: readonly LikelyGlobal[];
}

export function buildCoverage(input: CoverageInput): CoverageFile {
  const textBound = new Set<string>();
  const attrBound = new Set<string>();
  const nodeBound = new Set<string>();
  const svgBound = new Set<string>();
  const fieldBound = new Set<string>();
  const metaBound = new Set<string>();
  const cssBound = new Set<string>();
  for (const b of input.bindings) {
    const base = `${b.pageId}|${b.variant ?? ""}|${b.nodeId ?? ""}`;
    if (b.nodeId !== undefined) nodeBound.add(base);
    if (b.address.svgTextIndex !== undefined) svgBound.add(`${base}|${b.address.svgTextIndex}`);
    else if (b.target === "textContent") textBound.add(`${base}|${b.address.childIndex ?? ""}`);
    if (b.target === "attribute" && b.property !== undefined) attrBound.add(`${base}|${b.property}`);
    if (b.field !== undefined) fieldBound.add(`${base}|${b.field}`);
    if (b.address.routeId !== undefined) metaBound.add(b.address.routeId);
    if (b.address.cssSelector !== undefined) cssBound.add(b.address.cssSelector);
  }

  const eligible: Record<CoverageClass, number> = {
    visibleText: 0,
    links: 0,
    images: 0,
    backgroundMedia: 0,
    video: 0,
    alt: 0,
    ariaLabel: 0,
    titlePlaceholder: 0,
    metadata: 0,
  };
  const slotted: Record<CoverageClass, number> = { ...eligible };
  const rows: Row[] = [];

  const account = (
    cls: CoverageClass,
    isSlotted: boolean,
    row: Omit<Row, "class" | "reason">,
    reason: () => UnslottedReason,
  ): void => {
    eligible[cls]++;
    if (isSlotted) {
      slotted[cls]++;
      return;
    }
    rows.push({ class: cls, reason: reason(), ...row });
  };

  for (const [pageId, page] of input.pages) {
    for (const variant of VARIANTS) {
      const index = variantIndex(page, variant);
      for (const nodeId of index.order) {
        const info = index.byId.get(nodeId)!;
        const node: RuntimeElementNode = info.node;
        const tag = node.t.toLowerCase();
        const props = (node.p ?? {}) as Record<string, unknown>;
        const base = `${pageId}|${variant}|${nodeId}`;
        const hiddenReason = (): UnslottedReason => (info.ariaHidden ? "aria-hidden" : "not-represented");

        // visible text runs
        if (!TEXT_DENY_TAGS.has(tag)) {
          for (const child of textChildren(node)) {
            if (child.value.trim() === "") continue;
            account(
              "visibleText",
              textBound.has(`${base}|${child.childIndex}`),
              { pageId, variant, nodeId, detail: `childIndex=${child.childIndex}` },
              hiddenReason,
            );
          }
        } else {
          for (const child of textChildren(node)) {
            if (child.value.trim() === "") continue;
            eligible.visibleText++;
            rows.push({
              class: "visibleText",
              pageId,
              variant,
              nodeId,
              detail: `childIndex=${child.childIndex}`,
              reason: "script-style",
            });
          }
        }

        // inline SVG character runs
        if (typeof node.v === "string" && node.v.includes("<text")) {
          for (const run of scanSvgRuns(node.v)) {
            account(
              "visibleText",
              svgBound.has(`${base}|${run.index}`),
              { pageId, variant, nodeId, detail: `svgRun=${run.index}` },
              () => "svg-internal",
            );
          }
        }

        if ((tag === "a" || tag === "area") && typeof props["href"] === "string") {
          const href = props["href"] as string;
          account("links", attrBound.has(`${base}|href`), { pageId, variant, nodeId, detail: href }, () => {
            if (href.startsWith("javascript:")) return "infrastructure";
            if (href === "#" || href === "") return "decorative";
            return info.ariaHidden ? "aria-hidden" : "not-represented";
          });
        }

        if (tag === "img") {
          const src = props["src"];
          account("images", nodeBound.has(base), { pageId, variant, nodeId }, () =>
            typeof src === "string" ? hiddenReason() : "unresolved",
          );
          if (typeof props["alt"] === "string") {
            account("alt", fieldBound.has(`${base}|alt`) || attrBound.has(`${base}|alt`), {
              pageId,
              variant,
              nodeId,
            }, hiddenReason);
          }
        }

        if (tag === "video" || tag === "audio" || tag === "source") {
          account("video", nodeBound.has(base), { pageId, variant, nodeId, detail: tag }, hiddenReason);
        }

        if (typeof props["aria-label"] === "string" && (props["aria-label"] as string).trim() !== "") {
          account("ariaLabel", attrBound.has(`${base}|aria-label`), { pageId, variant, nodeId }, () =>
            tag === "iframe" ? "infrastructure" : hiddenReason(),
          );
        }
        for (const attribute of ["title", "placeholder"] as const) {
          const value = props[attribute];
          if (typeof value !== "string" || value.trim() === "") continue;
          account(
            "titlePlaceholder",
            attrBound.has(`${base}|${attribute}`),
            { pageId, variant, nodeId, detail: attribute },
            () => (tag === "iframe" ? "infrastructure" : hiddenReason()),
          );
        }
      }
    }
  }

  // background media: node occurrences are all slotted by construction; rules
  // whose selector is not a single class cannot be addressed to a node.
  eligible.backgroundMedia += input.backgroundOccurrences;
  slotted.backgroundMedia += input.backgroundOccurrences;
  for (const rule of input.backgroundRules) {
    if (/^\.[A-Za-z0-9_-]+$/.test(rule.selector.trim())) continue;
    eligible.backgroundMedia++;
    rows.push({
      class: "backgroundMedia",
      pageId: "*",
      detail: rule.selector,
      reason: "not-represented",
    });
  }

  for (const route of input.routeMap.routes) {
    const hasTitle = typeof route.title === "string" && route.title.trim() !== "";
    eligible.metadata++;
    if (hasTitle && metaBound.has(route.routeId)) slotted.metadata++;
    else {
      rows.push({
        class: "metadata",
        pageId: route.pageSourceId,
        detail: `${route.path} title`,
        reason: hasTitle ? "not-represented" : "unresolved",
      });
    }
  }

  return {
    schemaVersion: SLOTIZED_TEMPLATE_SCHEMA_VERSION,
    schemaName: SLOTIZED_COVERAGE_SCHEMA,
    templateId: input.templateId,
    classes: COVERAGE_CLASSES.map((cls) => ({
      class: cls,
      eligible: eligible[cls],
      slotted: slotted[cls],
      unslotted: Math.max(0, eligible[cls] - slotted[cls]),
    })),
    unslotted: rows.sort((a, b) =>
      `${a.class}|${a.pageId}|${a.variant ?? ""}|${a.nodeId ?? ""}|${a.detail ?? ""}`.localeCompare(
        `${b.class}|${b.pageId}|${b.variant ?? ""}|${b.nodeId ?? ""}|${b.detail ?? ""}`,
      ),
    ),
    likelyGlobal: [...input.likelyGlobal].sort((a, b) => a.signature.localeCompare(b.signature)),
  };
}
