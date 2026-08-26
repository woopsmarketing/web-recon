/**
 * Asset inventory (Task 22 A) — read from STORED artifacts of the accepted
 * lineage only:
 *
 *   SiteSpec asset-catalog.json          img / srcset / picture-source /
 *                                        inline-svg / icon / video source /
 *                                        background-image references
 *   generated app generated-styles.css   CSS url() references (what the clone
 *                                        actually requests from stylesheets)
 *   observation run rendered.html        head evidence the SiteSpec never
 *                                        modelled: favicon links, og:image /
 *                                        twitter:image, font preloads
 *   template slots.json                  image-slot default src/srcset → slot
 *                                        keys (the Task 19 imageBrief join)
 *   content run generation-result.json   Task 19 imageBriefs (by slot key)
 *
 * No network access here. The ONLY live fetch in the whole inventory phase is
 * the bounded opt-in @font-face stylesheet fetch in fonts.ts.
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import type { AssetInventoryEntry } from "./types.js";

/* ------------------------------------------------------------------ *
 * Raw input shapes (narrow, tolerant reads of upstream artifacts)
 * ------------------------------------------------------------------ */

export interface CatalogAsset {
  assetId: string;
  kind: string;
  url?: string;
  mimeHint?: string;
  usageCount?: number;
  sourcePageIds?: string[];
}

export interface HeadEvidence {
  favicons: { url: string; pageIds: string[] }[];
  ogImages: { url: string; pageIds: string[] }[];
  fontPreloads: { url: string; typeHint: string | null; pageIds: string[] }[];
  stylesheetUrls: { url: string; preloaded: boolean; firstSeenOrder: number }[];
}

export interface InventorySources {
  catalogAssets: CatalogAsset[];
  cssUrls: Map<string, number>; // url -> occurrence count in generated CSS
  head: HeadEvidence;
  slotKeysByUrl: Map<string, string[]>;
  briefsBySlotKey: Map<string, { slotKey: string; action: string; warning: string | null }>;
}

/* ------------------------------------------------------------------ *
 * Readers
 * ------------------------------------------------------------------ */

export async function readAssetCatalog(siteSpecDir: string): Promise<CatalogAsset[]> {
  const raw = JSON.parse(
    await readFile(path.join(siteSpecDir, "asset-catalog.json"), "utf8"),
  ) as { assets: CatalogAsset[] };
  return raw.assets;
}

/**
 * CSS `url(#fragment)` SVG-internal references (filters, gradients, masks)
 * are NOT fetchable assets (Task 24 GED-C: nextjs' `url(#b)` reached the
 * inventory as the phantom entry `https://nextjs.org/%23b`). Two shapes:
 * the raw fragment-only value, and its browser-serialized form where the
 * percent-encoded `#` was resolved against the page URL as a path segment.
 */
export function isFragmentOnlyCssRef(url: string): boolean {
  if (url.startsWith("#")) return true;
  try {
    const pathname = new URL(url).pathname;
    const lastSegment = pathname.slice(pathname.lastIndexOf("/") + 1);
    return /^%23/i.test(lastSegment);
  } catch {
    return false;
  }
}

export function extractCssUrls(css: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const match of css.matchAll(/url\((['"]?)(https?:\/\/[^)'"\s]+)\1\)/g)) {
    const url = match[2];
    out.set(url, (out.get(url) ?? 0) + 1);
  }
  return out;
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i"));
  return match ? decodeHtmlEntities(match[1]) : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Scan every stored rendered.html of the observation run for head-level asset
 * evidence. Regex over <link>/<meta> tags is sufficient here: the files are
 * browser-serialized DOM (attribute-quoted), and we only read them.
 */
export async function scanHeadEvidence(observationPagesDir: string): Promise<HeadEvidence> {
  const favicons = new Map<string, Set<string>>();
  const ogImages = new Map<string, Set<string>>();
  const fontPreloads = new Map<string, { typeHint: string | null; pageIds: Set<string> }>();
  const stylesheets = new Map<string, { preloaded: boolean; firstSeenOrder: number }>();
  let order = 0;

  const pageIds = (await readdir(observationPagesDir)).filter((p) => p.startsWith("p")).sort();
  for (const pageId of pageIds) {
    for (const viewport of ["desktop", "mobile"]) {
      const file = path.join(observationPagesDir, pageId, "viewports", viewport, "rendered.html");
      if (!existsSync(file)) continue;
      const html = await readFile(file, "utf8");
      const headEnd = html.indexOf("</head>");
      const head = headEnd === -1 ? html : html.slice(0, headEnd);

      for (const match of head.matchAll(/<link\b[^>]*>/gi)) {
        const tag = match[0];
        const rel = (attr(tag, "rel") ?? "").toLowerCase();
        const href = attr(tag, "href");
        if (!href || !href.startsWith("http")) continue;
        if (rel.includes("icon")) {
          if (!favicons.has(href)) favicons.set(href, new Set());
          favicons.get(href)?.add(pageId);
        } else if (rel === "preload" && (attr(tag, "as") ?? "").toLowerCase() === "font") {
          const existing = fontPreloads.get(href);
          if (existing) existing.pageIds.add(pageId);
          else fontPreloads.set(href, { typeHint: attr(tag, "type"), pageIds: new Set([pageId]) });
        } else if (rel === "stylesheet" || (rel === "preload" && (attr(tag, "as") ?? "").toLowerCase() === "style")) {
          const preloaded = rel === "preload";
          const existing = stylesheets.get(href);
          if (!existing) stylesheets.set(href, { preloaded, firstSeenOrder: order++ });
          else if (preloaded && !existing.preloaded) existing.preloaded = true;
        }
      }
      for (const match of head.matchAll(/<meta\b[^>]*>/gi)) {
        const tag = match[0];
        const property = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
        if (property !== "og:image" && property !== "twitter:image") continue;
        const content = attr(tag, "content");
        if (!content || !content.startsWith("http")) continue;
        if (!ogImages.has(content)) ogImages.set(content, new Set());
        ogImages.get(content)?.add(pageId);
      }
    }
  }

  return {
    favicons: [...favicons.entries()]
      .map(([url, pages]) => ({ url, pageIds: [...pages].sort() }))
      .sort((a, b) => a.url.localeCompare(b.url)),
    ogImages: [...ogImages.entries()]
      .map(([url, pages]) => ({ url, pageIds: [...pages].sort() }))
      .sort((a, b) => a.url.localeCompare(b.url)),
    fontPreloads: [...fontPreloads.entries()]
      .map(([url, info]) => ({ url, typeHint: info.typeHint, pageIds: [...info.pageIds].sort() }))
      .sort((a, b) => a.url.localeCompare(b.url)),
    stylesheetUrls: [...stylesheets.entries()]
      .map(([url, info]) => ({ url, preloaded: info.preloaded, firstSeenOrder: info.firstSeenOrder }))
      .sort((a, b) => a.firstSeenOrder - b.firstSeenOrder),
  };
}

/** Parse a srcset attribute value into its candidate URLs. */
export function srcsetUrls(srcset: string): string[] {
  return srcset
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((u) => u.length > 0);
}

/** Template image slots: defaultValue {src, alt, srcset} → URL → slot keys. */
export async function readTemplateImageSlotJoin(
  templateRunDir: string,
): Promise<Map<string, string[]>> {
  const slots = JSON.parse(
    await readFile(path.join(templateRunDir, "slots.json"), "utf8"),
  ) as { slots?: unknown[] } | unknown[];
  const list = Array.isArray(slots) ? slots : (slots.slots ?? []);
  const byUrl = new Map<string, string[]>();
  const add = (url: string | undefined, key: string): void => {
    if (!url || !url.startsWith("http")) return;
    const existing = byUrl.get(url);
    if (existing) {
      if (!existing.includes(key)) existing.push(key);
    } else byUrl.set(url, [key]);
  };
  for (const raw of list) {
    const slot = raw as {
      type?: string;
      key?: string;
      defaultValue?: { src?: string; srcset?: string } | string;
    };
    if (slot.type !== "image" || typeof slot.key !== "string") continue;
    if (typeof slot.defaultValue === "object" && slot.defaultValue !== null) {
      add(slot.defaultValue.src, slot.key);
      for (const url of srcsetUrls(slot.defaultValue.srcset ?? "")) add(url, slot.key);
    }
  }
  return byUrl;
}

/** Task 19 imageBriefs, keyed by slot key. Absent file → empty map. */
export async function readImageBriefs(
  contentRunDir: string | null,
): Promise<Map<string, { slotKey: string; action: string; warning: string | null }>> {
  const out = new Map<string, { slotKey: string; action: string; warning: string | null }>();
  if (!contentRunDir) return out;
  const file = path.join(contentRunDir, "generation-result.json");
  if (!existsSync(file)) return out;
  const raw = JSON.parse(await readFile(file, "utf8")) as {
    imageBriefs?: { slotKey: string; action: string; warning?: string }[];
  };
  for (const brief of raw.imageBriefs ?? []) {
    out.set(brief.slotKey, {
      slotKey: brief.slotKey,
      action: brief.action,
      warning: brief.warning ?? null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Entry assembly
 * ------------------------------------------------------------------ */

function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Truncation detection: the Observer caps attribute values at 500 chars, so a
 * sliced srcset leaves a URL that is a strict PREFIX of some longer inventory
 * URL (`https://images.st/`, `…/fzn2n1nzq`). A legitimate URL can also prefix
 * its own query variants (`…/wave.png` vs `…/wave.png?w=2784`), so a prefix
 * counts as truncated only when EVERY longer continuation starts mid-token —
 * a continuation starting at `?`, `&` or `#` is a query/fragment variant, not
 * a cut. Deterministic, evidence-based — no host allowlist involved.
 */
export function findTruncatedUrls(urls: string[]): Set<string> {
  const truncated = new Set<string>();
  const unique = [...new Set(urls)];
  const sorted = [...unique].sort();
  const VARIANT_BOUNDARY = new Set(["?", "&", "#"]);
  for (let i = 0; i < sorted.length; i++) {
    let hasLonger = false;
    let allMidToken = true;
    for (let j = i + 1; j < sorted.length && sorted[j].startsWith(sorted[i]); j++) {
      hasLonger = true;
      const continuation = sorted[j].charAt(sorted[i].length);
      if (VARIANT_BOUNDARY.has(continuation)) allMidToken = false;
    }
    if (hasLonger && allMidToken) truncated.add(sorted[i]);
  }
  // Host-level truncation: URL normalization appends "/" to a cut hostname
  // ("https://images.st" → "https://images.st/"), hiding it from the string-
  // prefix rule. A hostname that is a MID-TOKEN strict prefix of another
  // observed hostname (continuation not at a "." label boundary) is a cut.
  const hostnames = new Set<string>();
  for (const url of unique) {
    try {
      hostnames.add(new URL(url).hostname);
    } catch {
      /* unparseable — left to the fetcher's scheme rejection */
    }
  }
  const hostList = [...hostnames].sort();
  const truncatedHosts = new Set<string>();
  for (let i = 0; i < hostList.length; i++) {
    for (let j = i + 1; j < hostList.length && hostList[j].startsWith(hostList[i]); j++) {
      if (hostList[j].charAt(hostList[i].length) !== ".") {
        truncatedHosts.add(hostList[i]);
      }
    }
  }
  if (truncatedHosts.size > 0) {
    for (const url of unique) {
      try {
        if (truncatedHosts.has(new URL(url).hostname)) truncated.add(url);
      } catch {
        /* ignore */
      }
    }
  }
  return truncated;
}

export function buildInventoryEntries(sources: InventorySources): AssetInventoryEntry[] {
  const entries: AssetInventoryEntry[] = [];
  let sequence = 0;
  const nextId = (): string => `ai${String(++sequence).padStart(6, "0")}`;
  const catalogUrls = new Set(
    sources.catalogAssets.map((a) => a.url).filter((u): u is string => typeof u === "string"),
  );
  const allUrls = [
    ...catalogUrls,
    ...sources.cssUrls.keys(),
    ...sources.head.favicons.map((f) => f.url),
    ...sources.head.ogImages.map((o) => o.url),
    ...sources.head.fontPreloads.map((f) => f.url),
  ];
  const truncated = findTruncatedUrls(allUrls);

  const joins = (url: string | null): Pick<AssetInventoryEntry, "slotKeys" | "imageBrief"> => {
    const slotKeys = url ? (sources.slotKeysByUrl.get(url) ?? []) : [];
    let imageBrief: AssetInventoryEntry["imageBrief"] = null;
    for (const key of slotKeys) {
      const brief = sources.briefsBySlotKey.get(key);
      if (brief) {
        imageBrief = brief;
        break;
      }
    }
    return { slotKeys: [...slotKeys].sort(), imageBrief };
  };

  for (const asset of sources.catalogAssets) {
    const url = asset.url ?? null;
    entries.push({
      inventoryId: nextId(),
      origin: "asset-catalog",
      kind: asset.kind,
      assetId: asset.assetId,
      url,
      host: hostOf(url),
      mimeHint: asset.mimeHint ?? null,
      usageCount: asset.usageCount ?? 1,
      sourcePageIds: asset.sourcePageIds ?? [],
      truncated: url !== null && truncated.has(url),
      ...joins(url),
    });
  }
  for (const [url, count] of [...sources.cssUrls.entries()].sort()) {
    if (catalogUrls.has(url)) continue; // already inventoried via the catalog
    entries.push({
      inventoryId: nextId(),
      origin: "generated-css-url",
      kind: "css-background",
      assetId: null,
      url,
      host: hostOf(url),
      mimeHint: null,
      usageCount: count,
      sourcePageIds: [],
      truncated: truncated.has(url),
      ...joins(url),
    });
  }
  const known = new Set(entries.map((e) => e.url).filter((u) => u !== null));
  const pushHead = (
    origin: AssetInventoryEntry["origin"],
    kind: string,
    url: string,
    pageIds: string[],
    mimeHint: string | null,
  ): void => {
    if (known.has(url)) {
      // Same URL already inventoried (e.g. favicon.ico is also catalog `icon`)
      return;
    }
    known.add(url);
    entries.push({
      inventoryId: nextId(),
      origin,
      kind,
      assetId: null,
      url,
      host: hostOf(url),
      mimeHint,
      usageCount: pageIds.length,
      sourcePageIds: pageIds,
      truncated: truncated.has(url),
      ...joins(url),
    });
  };
  for (const favicon of sources.head.favicons) {
    pushHead("head-favicon", "favicon", favicon.url, favicon.pageIds, null);
  }
  for (const og of sources.head.ogImages) {
    pushHead("head-og-image", "og-image", og.url, og.pageIds, null);
  }
  for (const font of sources.head.fontPreloads) {
    pushHead("head-font-preload", "font", font.url, font.pageIds, font.typeHint);
  }
  return entries;
}
