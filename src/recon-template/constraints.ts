import type { LoadedSiteSpec } from "../sitespec/index.js";
import type {
  ImageConstraints,
  SlotConstraints,
  TextConstraints,
} from "./types.js";
import type { LogicalSlot } from "./grouping.js";

/**
 * Constraint recording — observed references only.
 *
 * No `maxCharacters` is invented anywhere in this module. What a later content
 * stage needs is the ORIGINAL's measured reality ("desktop rendered this in 2
 * lines inside a 620×64 box, white-space was normal, no line clamp"), and all
 * of that already exists in the SiteSpec: bounding boxes on element nodes and
 * computed declarations behind `styleTokenId`. This pass joins a slot's static
 * occurrences back to those measurements. Dynamic-template occurrences carry
 * no static geometry and contribute none — a slot with only dynamic bindings
 * simply has no constraint block.
 */

interface SpecNodeJoin {
  /** x/y carried for the Task 19.1 paint-twin overlap evidence. */
  boundingBox?: { x: number; y: number; width: number; height: number };
  styleTokenId?: string;
}

export interface ConstraintContext {
  /** `${pageId}|${viewport}|${nodeId}` → geometry + style token. */
  nodeIndex: Map<string, SpecNodeJoin>;
  /** styleTokenId → computed declarations. */
  styleIndex: Map<string, Record<string, string>>;
}

export function buildConstraintContext(siteSpec: LoadedSiteSpec): ConstraintContext {
  const nodeIndex = new Map<string, SpecNodeJoin>();
  for (const page of siteSpec.pages) {
    for (const viewport of ["desktop", "mobile"] as const) {
      const vp = page.viewports[viewport];
      for (const node of vp.nodes) {
        if (node.type !== "element") continue;
        nodeIndex.set(`${page.pageId}|${viewport}|${node.nodeId}`, {
          boundingBox: node.boundingBox
            ? {
                x: node.boundingBox.x,
                y: node.boundingBox.y,
                width: node.boundingBox.width,
                height: node.boundingBox.height,
              }
            : undefined,
          styleTokenId: node.styleTokenId,
        });
      }
    }
  }
  const styleIndex = new Map<string, Record<string, string>>();
  for (const token of siteSpec.styleCatalog.styles) {
    styleIndex.set(token.styleTokenId, token.properties);
  }
  return { nodeIndex, styleIndex };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function pixelValue(value: string | undefined): number | undefined {
  if (!value || !value.endsWith("px")) return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function firstStaticBinding(slot: LogicalSlot, viewport: "desktop" | "mobile") {
  return slot.bindings.find((b) => b.surface === "static" && b.viewport === viewport);
}

function words(value: string): number {
  return value.trim() === "" ? 0 : value.trim().split(/\s+/).length;
}

export function computeConstraints(
  slot: LogicalSlot,
  ctx: ConstraintContext,
): SlotConstraints | undefined {
  if (slot.type === "text") {
    const value = slot.defaultValue as string;
    const constraints: TextConstraints = {
      sourceCharacterCount: [...value].length,
      sourceWordCount: words(value),
    };
    let styleProps: Record<string, string> | undefined;
    for (const viewport of ["desktop", "mobile"] as const) {
      const binding = firstStaticBinding(slot, viewport);
      if (!binding) continue;
      const join = ctx.nodeIndex.get(`${binding.pageId}|${viewport}|${binding.nodeId}`);
      if (!join?.boundingBox) continue;
      const props = join.styleTokenId ? ctx.styleIndex.get(join.styleTokenId) : undefined;
      if (props && !styleProps) styleProps = props;
      const lineHeight = pixelValue(props?.["line-height"]);
      const height = join.boundingBox.height;
      constraints[viewport] = {
        width: round2(join.boundingBox.width),
        height: round2(height),
        lineCount:
          lineHeight !== undefined && height > 0
            ? Math.max(1, Math.round(height / lineHeight))
            : undefined,
      };
    }
    if (styleProps) {
      if (styleProps["white-space"]) constraints.whiteSpace = styleProps["white-space"];
      const clamp = styleProps["-webkit-line-clamp"];
      if (clamp && clamp !== "none") constraints.lineClamp = clamp;
      if (styleProps["overflow"] && styleProps["overflow"] !== "visible") {
        constraints.overflow = styleProps["overflow"];
      }
    }
    if (!constraints.desktop && !constraints.mobile) {
      // Dynamic-only slot: keep the source counts, drop viewport boxes.
      return constraints;
    }
    return constraints;
  }

  if (slot.type === "image") {
    const constraints: ImageConstraints = {};
    let styleProps: Record<string, string> | undefined;
    for (const viewport of ["desktop", "mobile"] as const) {
      const binding = firstStaticBinding(slot, viewport);
      if (!binding) continue;
      const join = ctx.nodeIndex.get(`${binding.pageId}|${viewport}|${binding.nodeId}`);
      if (!join?.boundingBox) continue;
      const props = join.styleTokenId ? ctx.styleIndex.get(join.styleTokenId) : undefined;
      if (props && !styleProps) styleProps = props;
      const { width, height } = join.boundingBox;
      constraints[viewport] = {
        renderedWidth: round2(width),
        renderedHeight: round2(height),
        aspectRatio: height > 0 ? Math.round((width / height) * 10000) / 10000 : undefined,
      };
    }
    if (styleProps) {
      if (styleProps["object-fit"]) constraints.objectFit = styleProps["object-fit"];
      if (styleProps["object-position"]) constraints.objectPosition = styleProps["object-position"];
    }
    if (!constraints.desktop && !constraints.mobile && !constraints.objectFit) return undefined;
    return constraints;
  }

  // URL slots need no layout constraint.
  return undefined;
}
