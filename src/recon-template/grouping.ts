import type { RuntimeRouteMap } from "../reconstruction/index.js";
import {
  TemplateCompileError,
  type Editability,
  type ImageSlotValue,
  type SlotRole,
  type SlotSurface,
  type SlotValue,
  type UrlKind,
} from "./types.js";
import type {
  ExtractionResult,
  ImageOccurrence,
  PageExtraction,
  Section,
  SvgTextOccurrence,
  TextOccurrence,
  UrlOccurrence,
  Viewport,
} from "./extract.js";
import { imageRole, linkRoles, textRole } from "./roles.js";

/**
 * Occurrence grouping — from "what exists where" to logical slots.
 *
 * The merge rules are conjunctions of EXACT equalities, never a similarity
 * score, because a false merge silently rewrites content the operator did not
 * touch (the same failure mode Task 07 refused for page families):
 *
 *   link unit   (page, section, href, every label segment byte-identical)
 *   text unit   (page, section, raw value byte-identical)
 *   image unit  (page, section, src, alt, srcset byte-identical)
 *
 * Merging spans viewports AND surfaces: the desktop static nav anchor and the
 * mobile portal-menu anchor with the same href + label become ONE logical slot
 * with bindings on both — the Task 18 requirement that editing a nav label can
 * never leave the mobile menu stale.
 *
 * GLOBAL promotion is deliberately conservative. Only header/footer content
 * qualifies, only across pages whose route carries no locale prefix (a `/fr/…`
 * header legitimately differs from the root header — merging them would be a
 * false merge, and a wrongly-global slot is worse than a duplicated page
 * slot), and only when the identical unit appears on EVERY such page that has
 * that landmark, with at least two pages. Everything else stays a page slot;
 * the manual `merge` override exists for the operator to widen a group.
 */

// ---------------------------------------------------------------------------
// Logical slots (pre-id, pre-key)
// ---------------------------------------------------------------------------

export interface BindingSpec {
  pageId: string;
  viewport: Viewport;
  surface: SlotSurface;
  nodeId: string;
  discoveryId?: string;
  templateNodeId?: string;
  target: "text" | "attribute" | "svg-text";
  attributeName?: string;
  childIndex?: number;
  textSegment?: number;
  /** svg-text targets (Slot V2 v2): run address inside the host's markup. */
  svgTextIndex?: number;
  svgTextPath?: string;
  expectedValue: string;
  field?: "src" | "alt" | "srcset";
  docOrder: number;
}

export interface LogicalSlot {
  type: "text" | "url" | "image";
  scope: "global" | "page";
  pageId?: string;
  route?: string;
  section: Section;
  role: SlotRole;
  editability: Editability;
  urlKind?: UrlKind;
  defaultValue: SlotValue;
  /** Key parts: [prefix].[section].[...name] — final key built after sorting. */
  nameParts: string[];
  /** Slots born from the same anchor / image share a groupRef. */
  groupRef?: string;
  bindings: BindingSpec[];
  evidence: string[];
  sort: { pageRank: number; sectionRank: number; docOrder: number };
}

export interface GroupingResult {
  slots: LogicalSlot[];
  /** pageId → canonical route path (first route serving that page). */
  routeByPage: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECTION_RANK: Record<Section, number> = { header: 0, nav: 1, main: 2, body: 3, footer: 4 };

const LOCALE_PREFIX = /^[a-z]{2}(-[a-z]{2})?$/i;

export function pathHasLocalePrefix(routePath: string): boolean {
  const first = routePath.split("/").filter(Boolean)[0];
  return first !== undefined && LOCALE_PREFIX.test(first);
}

export function slugify(value: string, max = 40): string {
  const slug = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/^-+|-+$/g, "");
  return slug;
}

export function pageKeyPrefix(routePath: string): string {
  if (routePath === "/" || routePath === "") return "home";
  return slugify(routePath.replace(/^\//, "").replace(/\//g, "-"), 48) || "page";
}

export function classifyHref(href: string, rootUrl: string): UrlKind {
  const value = href.trim();
  if (value.startsWith("#")) return "hash";
  if (value.toLowerCase().startsWith("tel:")) return "tel";
  if (value.toLowerCase().startsWith("mailto:")) return "mailto";
  if (value.startsWith("/")) return "internal";
  try {
    const url = new URL(value, rootUrl);
    const rootHost = new URL(rootUrl).hostname;
    return url.hostname === rootHost ? "internal" : "external";
  } catch {
    return "external";
  }
}

function hrefSlug(href: string, kind: UrlKind): string {
  if (kind === "hash") return slugify(href.replace(/^#/, ""), 32) || "hash";
  if (kind === "tel") return "tel-" + (slugify(href.slice(4), 24) || "number");
  if (kind === "mailto") return "mailto-" + (slugify(href.slice(7).split("@")[0] ?? "", 24) || "address");
  try {
    const url = new URL(href, "https://x.invalid/");
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return url.hostname === "x.invalid" ? "root" : slugify(url.hostname, 32) || "root";
    const tail = segments.slice(-2).join("-");
    const slug = slugify(tail, 40);
    if (slug) return slug;
    return slugify(url.hostname, 32) || "root";
  } catch {
    return slugify(href, 32) || "link";
  }
}

const REVIEW_REPETITION_THRESHOLD = 16;

function editabilityOf(maxRepetition: number): Editability {
  return maxRepetition >= REVIEW_REPETITION_THRESHOLD ? "review" : "editable";
}

const SURFACE_RANK: Record<SlotSurface, number> = {
  static: 0,
  "paint-twin": 1,
  "dynamic-template": 2,
};

function bindingRank(b: BindingSpec): string {
  const vp = b.viewport === "desktop" ? 0 : 1;
  const surface = SURFACE_RANK[b.surface];
  return `${b.pageId}|${vp}|${surface}|${String(b.docOrder).padStart(8, "0")}`;
}

export function sortBindings(bindings: BindingSpec[]): BindingSpec[] {
  return [...bindings].sort((a, b) => (bindingRank(a) < bindingRank(b) ? -1 : 1));
}

function textBinding(occ: TextOccurrence): BindingSpec {
  return {
    pageId: occ.pageId,
    viewport: occ.viewport,
    surface: occ.surface,
    nodeId: occ.surface === "static" ? occ.ownerNodeId : occ.triggerNodeId!,
    discoveryId: occ.discoveryId,
    templateNodeId: occ.surface === "dynamic-template" ? occ.ownerNodeId : undefined,
    target: "text",
    childIndex: occ.childIndex,
    textSegment: occ.textSegment,
    expectedValue: occ.value,
    docOrder: occ.docOrder,
  };
}

function svgTextBinding(occ: SvgTextOccurrence): BindingSpec {
  return {
    pageId: occ.pageId,
    viewport: occ.viewport,
    surface: occ.surface,
    nodeId: occ.surface === "static" ? occ.hostNodeId : occ.triggerNodeId!,
    discoveryId: occ.discoveryId,
    templateNodeId: occ.surface === "dynamic-template" ? occ.hostNodeId : undefined,
    target: "svg-text",
    svgTextIndex: occ.svgTextIndex,
    svgTextPath: occ.svgTextPath,
    expectedValue: occ.value,
    docOrder: occ.docOrder,
  };
}

function attributeBinding(
  occ: UrlOccurrence | ImageOccurrence,
  attributeName: string,
  expectedValue: string,
  field?: "src" | "alt" | "srcset",
): BindingSpec {
  return {
    pageId: occ.pageId,
    viewport: occ.viewport,
    surface: occ.surface,
    nodeId: occ.surface === "static" ? occ.nodeId : occ.triggerNodeId!,
    discoveryId: occ.discoveryId,
    templateNodeId: occ.surface === "dynamic-template" ? occ.nodeId : undefined,
    target: "attribute",
    attributeName,
    expectedValue,
    field,
    docOrder: occ.docOrder,
  };
}

// ---------------------------------------------------------------------------
// Unit building
// ---------------------------------------------------------------------------

interface LinkUnit {
  pageIds: Set<string>;
  section: Section;
  href: string;
  labelSegments: string[];
  urlOccurrences: UrlOccurrence[];
  /** Per anchor occurrence, its label text occurrences in segment order. */
  labelOccurrences: TextOccurrence[][];
  inNav: boolean;
  maxRepetition: number;
  minDocOrder: number;
  firstPageId: string;
}

interface TextUnit {
  pageIds: Set<string>;
  section: Section;
  value: string;
  occurrences: TextOccurrence[];
  maxRepetition: number;
  minDocOrder: number;
  firstPageId: string;
}

interface ImageUnit {
  pageIds: Set<string>;
  section: Section;
  src: string;
  alt?: string;
  srcset?: string;
  occurrences: ImageOccurrence[];
  anchorHrefIsRoot: boolean;
  maxRepetition: number;
  minDocOrder: number;
  firstPageId: string;
}

/** Anchor identity within one surface instance. */
function anchorInstanceKey(occ: { pageId: string; viewport: Viewport; surface: SlotSurface; discoveryId?: string; triggerNodeId?: string }, anchorNodeId: string): string {
  return [occ.pageId, occ.viewport, occ.surface, occ.triggerNodeId ?? "", occ.discoveryId ?? "", anchorNodeId].join("|");
}

/**
 * Unit-key separator: an escaped control character no observed value can
 * plausibly contain, so joined identity keys can never collide by
 * concatenation ("a|b"+"c" vs "a"+"b|c").
 */
const JOIN = "\u0000";

export function groupOccurrences(
  extraction: ExtractionResult,
  routeMap: RuntimeRouteMap,
): GroupingResult {
  const routeByPage = new Map<string, string>();
  const pageRank = new Map<string, number>();
  for (const route of routeMap.routes) {
    if (!routeByPage.has(route.pageSourceId)) {
      routeByPage.set(route.pageSourceId, route.path);
      pageRank.set(route.pageSourceId, pageRank.size);
    }
  }

  // -- label texts per anchor instance --------------------------------------
  const labelsByAnchor = new Map<string, TextOccurrence[]>();
  const anchorTexts = new Set<TextOccurrence>();
  for (const page of extraction.pages.values()) {
    for (const text of page.texts) {
      if (!text.anchorNodeId) continue;
      const key = anchorInstanceKey(text, text.anchorNodeId);
      const list = labelsByAnchor.get(key) ?? [];
      list.push(text);
      labelsByAnchor.set(key, list);
      anchorTexts.add(text);
    }
  }
  for (const list of labelsByAnchor.values()) list.sort((a, b) => a.docOrder - b.docOrder);

  // -- svg text runs per anchor instance (Task 19.1 §10 co-binding) ----------
  const svgByAnchor = new Map<string, SvgTextOccurrence[]>();
  const svgUsed = new Set<SvgTextOccurrence>();
  const allSvgTexts: SvgTextOccurrence[] = [];
  for (const page of extraction.pages.values()) {
    for (const svg of page.svgTexts) {
      allSvgTexts.push(svg);
      if (!svg.anchorNodeId) continue;
      const key = anchorInstanceKey(svg, svg.anchorNodeId);
      const list = svgByAnchor.get(key) ?? [];
      list.push(svg);
      svgByAnchor.set(key, list);
    }
  }

  // -- hero containers ------------------------------------------------------
  const heroContainer = new Map<string, string>(); // pageId|viewport → container node id
  const heroHeadlineOcc = new Set<TextOccurrence>();
  for (const page of extraction.pages.values()) {
    for (const viewport of ["desktop", "mobile"] as const) {
      const h1 = page.heroHeadline[viewport];
      const ancestors = page.heroAncestors[viewport];
      if (!h1 || !ancestors) continue;
      heroHeadlineOcc.add(h1);
      const container = ancestors[Math.min(2, ancestors.length - 1)];
      if (container) heroContainer.set(`${page.pageId}|${viewport}`, container);
    }
  }
  const inHero = (occ: { pageId: string; viewport: Viewport; ancestorIds: string[]; surface: SlotSurface }): boolean => {
    if (occ.surface !== "static") return false;
    const container = heroContainer.get(`${occ.pageId}|${occ.viewport}`);
    return container !== undefined && occ.ancestorIds.includes(container);
  };

  // -- link units -----------------------------------------------------------
  const linkUnits = new Map<string, LinkUnit>();
  for (const page of extraction.pages.values()) {
    for (const url of page.urls) {
      const labels = labelsByAnchor.get(anchorInstanceKey(url, url.nodeId)) ?? [];
      const segments = labels.map((l) => l.value);
      const key = [url.pageId, url.section, url.href, segments.join(JOIN)].join(JOIN);
      let unit = linkUnits.get(key);
      if (!unit) {
        unit = {
          pageIds: new Set(),
          section: url.section,
          href: url.href,
          labelSegments: segments,
          urlOccurrences: [],
          labelOccurrences: [],
          inNav: false,
          maxRepetition: 1,
          minDocOrder: Number.MAX_SAFE_INTEGER,
          firstPageId: url.pageId,
        };
        linkUnits.set(key, unit);
      }
      unit.pageIds.add(url.pageId);
      unit.urlOccurrences.push(url);
      unit.labelOccurrences.push(labels);
      unit.inNav = unit.inNav || url.section === "nav" || url.section === "header";
      unit.maxRepetition = Math.max(unit.maxRepetition, url.maxRepetition);
      unit.minDocOrder = Math.min(unit.minDocOrder, url.docOrder);
    }
  }

  // -- text units (non-anchor text only) ------------------------------------
  const textUnits = new Map<string, TextUnit>();
  for (const page of extraction.pages.values()) {
    for (const text of page.texts) {
      if (anchorTexts.has(text)) continue;
      const key = [text.pageId, text.section, text.value].join(JOIN);
      let unit = textUnits.get(key);
      if (!unit) {
        unit = {
          pageIds: new Set(),
          section: text.section,
          value: text.value,
          occurrences: [],
          maxRepetition: 1,
          minDocOrder: Number.MAX_SAFE_INTEGER,
          firstPageId: text.pageId,
        };
        textUnits.set(key, unit);
      }
      unit.pageIds.add(text.pageId);
      unit.occurrences.push(text);
      unit.maxRepetition = Math.max(unit.maxRepetition, text.maxRepetition);
      unit.minDocOrder = Math.min(unit.minDocOrder, text.docOrder);
    }
  }

  // -- image units ----------------------------------------------------------
  const imageUnits = new Map<string, ImageUnit>();
  for (const page of extraction.pages.values()) {
    for (const image of page.images) {
      const key = [image.pageId, image.section, image.src, image.alt ?? "", image.srcset ?? ""].join(JOIN);
      let unit = imageUnits.get(key);
      if (!unit) {
        unit = {
          pageIds: new Set(),
          section: image.section,
          src: image.src,
          alt: image.alt,
          srcset: image.srcset,
          occurrences: [],
          anchorHrefIsRoot: false,
          maxRepetition: 1,
          minDocOrder: Number.MAX_SAFE_INTEGER,
          firstPageId: image.pageId,
        };
        imageUnits.set(key, unit);
      }
      unit.pageIds.add(image.pageId);
      unit.occurrences.push(image);
      unit.anchorHrefIsRoot = unit.anchorHrefIsRoot || image.anchorHref === "/" || image.anchorHref === routeMap.rootUrl;
      unit.maxRepetition = Math.max(unit.maxRepetition, image.maxRepetition);
      unit.minDocOrder = Math.min(unit.minDocOrder, image.docOrder);
    }
  }

  // -- global promotion pool ------------------------------------------------
  const poolPages = new Set<string>();
  for (const pageId of extraction.pages.keys()) {
    const route = routeByPage.get(pageId);
    if (route !== undefined && !pathHasLocalePrefix(route)) poolPages.add(pageId);
  }
  const poolPagesWithSection = new Map<Section, Set<string>>();
  for (const [pageId, page] of extraction.pages) {
    if (!poolPages.has(pageId)) continue;
    for (const section of page.sectionsPresent) {
      let set = poolPagesWithSection.get(section);
      if (!set) poolPagesWithSection.set(section, (set = new Set()));
      set.add(pageId);
    }
  }

  function promote<T extends { pageIds: Set<string>; section: Section; firstPageId: string }>(
    units: Map<string, T>,
    identity: (unit: T) => string,
    mergeInto: (target: T, source: T) => void,
  ): Map<string, { unit: T; global: boolean }> {
    const out = new Map<string, { unit: T; global: boolean }>();
    const byIdentity = new Map<string, { key: string; unit: T }[]>();
    for (const [key, unit] of units) {
      if (
        (unit.section === "header" || unit.section === "footer") &&
        [...unit.pageIds].every((p) => poolPages.has(p))
      ) {
        const id = identity(unit);
        const list = byIdentity.get(id) ?? [];
        list.push({ key, unit });
        byIdentity.set(id, list);
      } else {
        out.set(key, { unit, global: false });
      }
    }
    for (const list of byIdentity.values()) {
      const section = list[0].unit.section;
      const required = poolPagesWithSection.get(section) ?? new Set();
      const covered = new Set<string>();
      for (const { unit } of list) for (const p of unit.pageIds) covered.add(p);
      const coversAll = required.size >= 2 && [...required].every((p) => covered.has(p));
      if (coversAll && list.length >= 1 && covered.size >= 2) {
        const target = list[0].unit;
        for (let i = 1; i < list.length; i++) mergeInto(target, list[i].unit);
        out.set(`global${JOIN}${identity(target)}`, { unit: target, global: true });
      } else {
        for (const { key, unit } of list) out.set(key, { unit, global: false });
      }
    }
    return out;
  }

  const promotedLinks = promote(
    linkUnits,
    (u) => ["link", u.section, u.href, u.labelSegments.join(JOIN)].join(JOIN),
    (t, s) => {
      for (const p of s.pageIds) t.pageIds.add(p);
      t.urlOccurrences.push(...s.urlOccurrences);
      t.labelOccurrences.push(...s.labelOccurrences);
      t.inNav = t.inNav || s.inNav;
      t.maxRepetition = Math.max(t.maxRepetition, s.maxRepetition);
      t.minDocOrder = Math.min(t.minDocOrder, s.minDocOrder);
    },
  );
  const promotedTexts = promote(
    textUnits,
    (u) => ["text", u.section, u.value].join(JOIN),
    (t, s) => {
      for (const p of s.pageIds) t.pageIds.add(p);
      t.occurrences.push(...s.occurrences);
      t.maxRepetition = Math.max(t.maxRepetition, s.maxRepetition);
      t.minDocOrder = Math.min(t.minDocOrder, s.minDocOrder);
    },
  );
  const promotedImages = promote(
    imageUnits,
    (u) => ["image", u.section, u.src, u.alt ?? "", u.srcset ?? ""].join(JOIN),
    (t, s) => {
      for (const p of s.pageIds) t.pageIds.add(p);
      t.occurrences.push(...s.occurrences);
      t.anchorHrefIsRoot = t.anchorHrefIsRoot || s.anchorHrefIsRoot;
      t.maxRepetition = Math.max(t.maxRepetition, s.maxRepetition);
      t.minDocOrder = Math.min(t.minDocOrder, s.minDocOrder);
    },
  );

  // -- slot assembly --------------------------------------------------------
  const slots: LogicalSlot[] = [];

  const scopeOf = (global: boolean, firstPageId: string) => {
    if (global) return { scope: "global" as const, pageId: undefined, route: undefined, pageRankValue: -1 };
    return {
      scope: "page" as const,
      pageId: firstPageId,
      route: routeByPage.get(firstPageId),
      pageRankValue: pageRank.get(firstPageId) ?? 9999,
    };
  };

  for (const { unit, global } of promotedTexts.values()) {
    const first = [...unit.occurrences].sort((a, b) => a.docOrder - b.docOrder)[0];
    const isHeroHeadline = unit.occurrences.some((o) => heroHeadlineOcc.has(o));
    const unitInHero = unit.occurrences.some(inHero);
    const role = textRole({
      section: unit.section,
      ownerTag: first.ownerTag,
      headingLevel: first.headingLevel,
      isHeroHeadline,
      inHeroContainer: unitInHero,
      isHeroDescription: false, // resolved below (needs cross-unit ordering)
    });
    const s = scopeOf(global, unit.firstPageId);
    slots.push({
      type: "text",
      scope: s.scope,
      pageId: s.pageId,
      route: s.route,
      section: unit.section,
      role,
      editability: editabilityOf(unit.maxRepetition),
      defaultValue: unit.value,
      nameParts: [],
      bindings: sortBindings(unit.occurrences.map(textBinding)),
      evidence: dedupeEvidence([
        `landmark:${unit.section}`,
        `tag:${first.ownerTag}`,
        ...(first.headingLevel ? [`heading:h${first.headingLevel}`] : []),
        ...unitSurfaceEvidence(unit.occurrences),
        ...(unitInHero ? ["in-hero-container"] : []),
        ...(unit.maxRepetition >= REVIEW_REPETITION_THRESHOLD
          ? [`sibling-repetition:${unit.maxRepetition}`]
          : []),
      ]),
      sort: { pageRank: s.pageRankValue, sectionRank: SECTION_RANK[unit.section], docOrder: unit.minDocOrder },
    });
  }

  // hero.description: the first main-section paragraph unit inside the hero
  // container of each page, chosen deterministically by document order.
  const heroDescriptionCandidates = new Map<string, LogicalSlot>();
  for (const slot of slots) {
    if (slot.type !== "text" || slot.scope !== "page" || slot.section !== "main") continue;
    if (slot.role !== "content.text") continue;
    if (!slot.evidence.includes("tag:p")) continue;
    const pageId = slot.pageId!;
    const container = heroContainer.get(`${pageId}|desktop`) ?? heroContainer.get(`${pageId}|mobile`);
    if (!container) continue;
    const existing = heroDescriptionCandidates.get(pageId);
    if (slot.evidence.includes("in-hero-container") && (!existing || slot.sort.docOrder < existing.sort.docOrder)) {
      heroDescriptionCandidates.set(pageId, slot);
    }
  }
  for (const slot of heroDescriptionCandidates.values()) slot.role = "hero.description";

  for (const { unit, global } of promotedLinks.values()) {
    const kind = classifyHref(unit.href, routeMap.rootUrl);
    const s = scopeOf(global, unit.firstPageId);
    const anyInHero = unit.urlOccurrences.some(inHero);
    const roles = linkRoles({ section: unit.section, inNav: unit.inNav, inHeroContainer: anyInHero });
    const groupRef = `link:${s.scope}:${s.pageId ?? "global"}:${unit.section}:${unit.href}:${unit.labelSegments.join(JOIN)}`;
    const editability = editabilityOf(unit.maxRepetition);
    const evidence = dedupeEvidence([
      `landmark:${unit.section}`,
      "tag:a",
      `url-kind:${kind}`,
      ...unitSurfaceEvidence(unit.urlOccurrences),
      ...(anyInHero ? ["in-hero-container"] : []),
      ...(unit.maxRepetition >= REVIEW_REPETITION_THRESHOLD
        ? [`sibling-repetition:${unit.maxRepetition}`]
        : []),
    ]);
    const nameSlugBase =
      unit.labelSegments.length > 0 ? slugify(unit.labelSegments.join(" "), 40) : "";
    const nameSlug = nameSlugBase || hrefSlug(unit.href, kind);
    const namePrefix = unit.section === "header" || unit.section === "nav" || (unit.section === "footer" && unit.inNav)
      ? "nav"
      : anyInHero
        ? "cta"
        : "link";

    // href slot — always present.
    slots.push({
      type: "url",
      scope: s.scope,
      pageId: s.pageId,
      route: s.route,
      section: unit.section,
      role: roles.href,
      editability,
      urlKind: kind,
      defaultValue: unit.href,
      nameParts: [namePrefix, nameSlug, "href"],
      groupRef,
      bindings: sortBindings(unit.urlOccurrences.map((o) => attributeBinding(o, "href", unit.href))),
      evidence,
      sort: { pageRank: s.pageRankValue, sectionRank: SECTION_RANK[unit.section], docOrder: unit.minDocOrder },
    });

    // label slot(s) — one per text segment; segment structure is identical
    // across occurrences by unit identity.
    for (let seg = 0; seg < unit.labelSegments.length; seg++) {
      const segmentOccurrences = unit.labelOccurrences
        .map((labels) => labels[seg])
        .filter((o): o is TextOccurrence => o !== undefined);
      if (segmentOccurrences.length !== unit.labelOccurrences.length) {
        throw new TemplateCompileError(
          `link unit ${unit.href} lost a label segment during grouping (segment ${seg})`,
        );
      }
      const suffix = unit.labelSegments.length === 1 ? ["label"] : ["label", String(seg + 1).padStart(2, "0")];
      // Task 19.1 §10: an SVG text run under the SAME anchor host whose
      // decoded value byte-equals this label segment is the same UI control's
      // other visual representation — an additional occurrence, not a new
      // slot. Anything weaker than exact host + exact text stays standalone.
      const svgCobound: BindingSpec[] = [];
      for (const url of unit.urlOccurrences) {
        for (const svg of svgByAnchor.get(anchorInstanceKey(url, url.nodeId)) ?? []) {
          if (svgUsed.has(svg) || svg.value !== unit.labelSegments[seg]) continue;
          svgUsed.add(svg);
          svgCobound.push(svgTextBinding(svg));
        }
      }
      slots.push({
        type: "text",
        scope: s.scope,
        pageId: s.pageId,
        route: s.route,
        section: unit.section,
        role: roles.label,
        editability,
        defaultValue: unit.labelSegments[seg],
        nameParts: [namePrefix, nameSlug, ...suffix],
        groupRef,
        bindings: sortBindings([...segmentOccurrences.map(textBinding), ...svgCobound]),
        evidence: dedupeEvidence([
          ...evidence,
          "anchor-label",
          ...(svgCobound.length > 0 ? ["surface:svg-text", `svg-cobound:${svgCobound.length}`] : []),
        ]),
        sort: {
          pageRank: s.pageRankValue,
          sectionRank: SECTION_RANK[unit.section],
          docOrder: unit.minDocOrder + seg + 1,
        },
      });
    }
  }

  for (const { unit, global } of promotedImages.values()) {
    const s = scopeOf(global, unit.firstPageId);
    const role = imageRole({ section: unit.section, anchorHrefIsRoot: unit.anchorHrefIsRoot });
    const value: ImageSlotValue = { src: unit.src };
    if (unit.alt !== undefined) value.alt = unit.alt;
    if (unit.srcset !== undefined) value.srcset = unit.srcset;
    const bindings: BindingSpec[] = [];
    for (const occ of unit.occurrences) {
      bindings.push(attributeBinding(occ, occ.propNames.src, unit.src, "src"));
      if (occ.propNames.alt !== undefined && unit.alt !== undefined) {
        bindings.push(attributeBinding(occ, occ.propNames.alt, unit.alt, "alt"));
      }
      if (occ.propNames.srcset !== undefined && unit.srcset !== undefined) {
        bindings.push(attributeBinding(occ, occ.propNames.srcset, unit.srcset, "srcset"));
      }
    }
    slots.push({
      type: "image",
      scope: s.scope,
      pageId: s.pageId,
      route: s.route,
      section: unit.section,
      role,
      editability: editabilityOf(unit.maxRepetition),
      defaultValue: value,
      nameParts: ["image", imageNameSlug(unit.src)],
      groupRef: `image:${s.scope}:${s.pageId ?? "global"}:${unit.section}:${unit.src}`,
      bindings: sortBindings(bindings),
      evidence: dedupeEvidence([
        `landmark:${unit.section}`,
        "tag:img",
        ...unitSurfaceEvidence(unit.occurrences),
        ...(unit.anchorHrefIsRoot ? ["anchor-href-root"] : []),
        ...(unit.maxRepetition >= REVIEW_REPETITION_THRESHOLD
          ? [`sibling-repetition:${unit.maxRepetition}`]
          : []),
      ]),
      sort: { pageRank: s.pageRankValue, sectionRank: SECTION_RANK[unit.section], docOrder: unit.minDocOrder },
    });
  }

  // -- standalone svg-text slots (Task 19.1 §9) ------------------------------
  // Runs that could not be co-bound to an existing anchor-label slot become
  // their own PAGE-scope text slots. Role stays the generic `content.text`
  // (an SVG run does not need a new semantic role, and guessing one would
  // violate the conservative-role rule); merging spans viewports by exact
  // (page, section, value) identity like every other text unit.
  {
    const svgUnits = new Map<
      string,
      { section: Section; value: string; occurrences: SvgTextOccurrence[]; maxRepetition: number; minDocOrder: number; firstPageId: string }
    >();
    for (const svg of allSvgTexts) {
      if (svgUsed.has(svg)) continue;
      const key = [svg.pageId, svg.section, svg.value].join(JOIN);
      let unit = svgUnits.get(key);
      if (!unit) {
        unit = {
          section: svg.section,
          value: svg.value,
          occurrences: [],
          maxRepetition: 1,
          minDocOrder: Number.MAX_SAFE_INTEGER,
          firstPageId: svg.pageId,
        };
        svgUnits.set(key, unit);
      }
      unit.occurrences.push(svg);
      unit.maxRepetition = Math.max(unit.maxRepetition, svg.maxRepetition);
      unit.minDocOrder = Math.min(unit.minDocOrder, svg.docOrder);
    }
    for (const unit of svgUnits.values()) {
      const s = scopeOf(false, unit.firstPageId);
      const paths = [...new Set(unit.occurrences.map((o) => o.svgTextPath))];
      slots.push({
        type: "text",
        scope: s.scope,
        pageId: s.pageId,
        route: s.route,
        section: unit.section,
        role: "content.text",
        editability: editabilityOf(unit.maxRepetition),
        defaultValue: unit.value,
        nameParts: ["svg", textNameSlug(unit.value)],
        bindings: sortBindings(unit.occurrences.map(svgTextBinding)),
        evidence: dedupeEvidence([
          `landmark:${unit.section}`,
          "surface:svg-text",
          ...paths.map((p) => `svg-path:${p}`),
          ...(unit.maxRepetition >= REVIEW_REPETITION_THRESHOLD
            ? [`sibling-repetition:${unit.maxRepetition}`]
            : []),
        ]),
        sort: { pageRank: s.pageRankValue, sectionRank: SECTION_RANK[unit.section], docOrder: unit.minDocOrder },
      });
    }
  }

  // Text slot names (assigned late so role reassignment above is reflected).
  for (const slot of slots) {
    if (slot.nameParts.length > 0) continue;
    if (slot.role === "hero.headline") slot.nameParts = ["hero", "headline"];
    else if (slot.role === "hero.description") slot.nameParts = ["hero", "description"];
    else if (slot.role === "navigation.label") slot.nameParts = ["nav", textNameSlug(slot.defaultValue as string)];
    else if (slot.role === "heading.primary" || slot.role === "heading.secondary") {
      slot.nameParts = ["heading", textNameSlug(slot.defaultValue as string)];
    } else slot.nameParts = ["text", textNameSlug(slot.defaultValue as string)];
  }

  slots.sort(compareLogicalSlots);

  return { slots, routeByPage };
}

/**
 * The one stable slot ordering: global first, then page order, then section
 * order (header → nav → main → body → footer), then document order. Used both
 * for the automatic pass and for re-sorting after manual overrides.
 */
export function compareLogicalSlots(a: LogicalSlot, b: LogicalSlot): number {
  const ka = [a.scope === "global" ? 0 : 1, a.sort.pageRank, a.sort.sectionRank, a.sort.docOrder];
  const kb = [b.scope === "global" ? 0 : 1, b.sort.pageRank, b.sort.sectionRank, b.sort.docOrder];
  for (let i = 0; i < ka.length; i++) {
    if (ka[i] !== kb[i]) return ka[i] - kb[i];
  }
  const na = a.nameParts.join(".");
  const nb = b.nameParts.join(".");
  return na < nb ? -1 : na > nb ? 1 : 0;
}

function unitSurfaceEvidence(occurrences: { surface: SlotSurface }[]): string[] {
  const out: string[] = [];
  if (occurrences.some((o) => o.surface === "static")) out.push("surface:static");
  if (occurrences.some((o) => o.surface === "dynamic-template")) out.push("surface:dynamic-template");
  return out;
}

function dedupeEvidence(evidence: string[]): string[] {
  return [...new Set(evidence)];
}

function textNameSlug(value: string): string {
  return slugify(value, 32) || "content";
}

function imageNameSlug(src: string): string {
  try {
    const url = new URL(src, "https://x.invalid/");
    const base = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const withoutExt = base.replace(/\.[a-z0-9]+$/i, "");
    return slugify(withoutExt, 40) || slugify(base, 40) || "asset";
  } catch {
    return slugify(src, 32) || "asset";
  }
}
