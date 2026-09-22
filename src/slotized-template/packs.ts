import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ROUTE_MAP_FILE, RUNTIME_DATA_DIR, type RuntimePage, type RuntimeRouteMap } from "../reconstruction/index.js";
import { indexElements } from "./apply.js";
import { loadTemplate } from "./render.js";
import { loadThemeTokens } from "./theme-pack.js";
import {
  CONTENT_PACK_SCHEMA,
  CONTENT_PACKS_DIR,
  OVERRIDE_HEADER,
  SLOTIZED_TEMPLATE_SCHEMA_VERSION,
  SlotizedInputError,
  THEME_PACK_SCHEMA,
  THEME_PACKS_DIR,
  type Binding,
  type ContentPack,
  type ImageSlotValue,
  type RepeaterDefinition,
  type RepeaterItem,
  type SlotDefinition,
  type SlotValue,
  type ThemePack,
  type Variant,
  type VideoSlotValue,
} from "./types.js";

/**
 * Task 29 Phase E1 — CONTENT PACK / THEME PACK GENERATORS.
 *
 * Two packs, two different questions:
 *
 *   mechanical.json  Does every binding actually WRITE? It mutates EVERY slot
 *                    with a cheap, deterministic, length-similar marker, so a
 *                    surviving original value in the render is a proven dead
 *                    binding rather than an authoring gap. Shipped with
 *                    `mechanical.expectations.json` so the check is a machine
 *                    comparison, not a human squint.
 *
 *   realistic.json   Does the template carry a DIFFERENT SITE? Hand-authored
 *                    brand content for the validation routes plus a themed,
 *                    deterministic corpus for everything else. Its gate is the
 *                    source-leakage audit: nothing of the source's identity may
 *                    survive as if it were a fact about the new site.
 *
 * Both are pure functions of (template definitions + a reviewable fixture), so
 * the same inputs produce byte-identical packs.
 */

export const PACK_EXPECTATIONS_SCHEMA = "slotized-pack-expectations-v1";

// ---------------------------------------------------------------------------
// Deterministic primitives
// ---------------------------------------------------------------------------

function hash12(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 12);
}

function hashInt(value: string): number {
  return parseInt(createHash("sha256").update(value).digest("hex").slice(0, 8), 16);
}

/** JSON with object keys sorted — byte-identical output for equal inputs. */
export function stableStringify(value: unknown): string {
  const normalize = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(normalize);
    if (node && typeof node === "object") {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(node as Record<string, unknown>).sort()) {
        out[key] = normalize((node as Record<string, unknown>)[key]);
      }
      return out;
    }
    return node;
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

const WHITESPACE_RE = /^[\s​ ﻿]*$/;

/** Split a text value into (leading whitespace, core, trailing whitespace). */
function splitWhitespace(value: string): { lead: string; core: string; trail: string } {
  const lead = /^[\s​ ﻿]*/.exec(value)?.[0] ?? "";
  const trail = /[\s​ ﻿]*$/.exec(value.slice(lead.length))?.[0] ?? "";
  return { lead, core: value.slice(lead.length, value.length - trail.length), trail };
}

function chars(value: string): string[] {
  return [...value];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hslToHex(h: number, s: number, l: number): string {
  const a = (s / 100) * Math.min(l / 100, 1 - l / 100);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const color = l / 100 - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function luminance(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255);
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * A LOCAL placeholder image — no network, no asset pipeline, no CDN.
 *
 * The whole point of a swapped content pack is that it must be renderable with
 * nothing but this repo; an http placeholder service would reintroduce exactly
 * the external dependency Task 22 removed.
 */
export function svgPlaceholderDataUri(options: {
  width: number;
  height: number;
  background: string;
  foreground: string;
  label: string;
}): string {
  const w = Math.round(clamp(options.width, 40, 1600));
  const h = Math.round(clamp(options.height, 40, 1600));
  const fontSize = Math.round(clamp(Math.min(w, h) / 7, 11, 46));
  const label = escapeXml(chars(options.label).slice(0, 28).join(""));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" fill="${options.background}"/>` +
    `<text x="${w / 2}" y="${h / 2}" fill="${options.foreground}" font-family="sans-serif" font-size="${fontSize}"` +
    ` text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}

function placeholderSize(slot: SlotDefinition): { width: number; height: number } {
  const hints = slot.fitHints;
  if (hints?.recommendedWidth !== undefined && hints.recommendedHeight !== undefined) {
    return { width: hints.recommendedWidth, height: hints.recommendedHeight };
  }
  if (hints?.aspectRatio !== undefined && hints.aspectRatio > 0) {
    return { width: 800, height: 800 / hints.aspectRatio };
  }
  if (slot.role === "background.image") return { width: 1200, height: 800 };
  return { width: 800, height: 600 };
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)(\?|#|$)/i;

/** Does this url slot actually address MEDIA (a repeater media field, an image file)? */
function isMediaUrl(slot: SlotDefinition, value: string): boolean {
  if (slot.role === "repeater.media" || slot.role === "image.content" || slot.role === "background.image") return true;
  return IMAGE_EXT_RE.test(value);
}

function slugAscii(value: string, max = 32): string {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return ascii === "" ? "" : ascii.slice(0, max);
}

function urlParts(value: string): { scheme: "absolute" | "relative"; segments: string[] } {
  if (/^(https?:)?\/\//i.test(value)) {
    try {
      const url = new URL(value.startsWith("//") ? `https:${value}` : value);
      return { scheme: "absolute", segments: url.pathname.split("/").filter((s) => s !== "") };
    } catch {
      return { scheme: "absolute", segments: [] };
    }
  }
  return { scheme: "relative", segments: value.split("?")[0]!.split("/").filter((s) => s !== "") };
}

// ---------------------------------------------------------------------------
// Shared loading
// ---------------------------------------------------------------------------

export type LoadedTemplateForPacks = Awaited<ReturnType<typeof loadTemplate>>;

export interface PackContext {
  template: LoadedTemplateForPacks;
  /** Slots sorted by id — the index used by every deterministic marker. */
  ordered: SlotDefinition[];
  indexOf: Map<string, number>;
  bindingsBySlot: Map<string, Binding[]>;
  repeaterByKey: Map<string, RepeaterDefinition>;
  slotById: Map<string, SlotDefinition>;
}

export async function loadPackContext(manifestFile: string): Promise<PackContext> {
  const template = await loadTemplate(manifestFile);
  const ordered = [...template.slots].sort((a, b) => a.id.localeCompare(b.id));
  const indexOf = new Map(ordered.map((slot, i) => [slot.id, i] as const));
  const bindingsBySlot = new Map<string, Binding[]>();
  for (const binding of [...template.bindings].sort((a, b) => a.id.localeCompare(b.id))) {
    const list = bindingsBySlot.get(binding.slotId) ?? [];
    list.push(binding);
    bindingsBySlot.set(binding.slotId, list);
  }
  return {
    template,
    ordered,
    indexOf,
    bindingsBySlot,
    repeaterByKey: new Map(template.repeaters.map((r) => [r.key, r] as const)),
    slotById: new Map(template.slots.map((s) => [s.id, s] as const)),
  };
}

function emptyPack(ctx: PackContext, label: string): ContentPack {
  return {
    schemaVersion: SLOTIZED_TEMPLATE_SCHEMA_VERSION,
    schemaName: CONTENT_PACK_SCHEMA,
    templateId: ctx.template.manifest.templateId,
    templateVersion: ctx.template.manifest.templateVersion,
    label,
    slots: {},
    repeaters: {},
  };
}

/** Field slots live in `repeaters[].items[].values`, never in `pack.slots`. */
function isFieldSlot(slot: SlotDefinition): boolean {
  return slot.scope === "repeater-item";
}

// ---------------------------------------------------------------------------
// MECHANICAL PACK
// ---------------------------------------------------------------------------

const MECH_PHONE = "+82-10-0000-0001";
const MECH_EMAIL = "mech@mech.example";
const MECH_HOST = "mech.example";

/**
 * Length-similar, obviously-different, reversible-by-eye text marker.
 * `진료시간·위치` → `M1423·진료시간·위`. Leading/trailing whitespace is
 * preserved because it is layout, not content.
 */
export function mechanicalText(original: string, index: number): string {
  const { lead, core, trail } = splitWhitespace(original);
  if (core === "") return original;
  // The cap is the ORIGINAL length (floor 4): a marker that doubles a 2-char
  // label would trip CONTENT_FIT_WARNING on thousands of slots and drown the
  // fit signal the realistic pack actually needs.
  const cap = Math.max(chars(core).length, 4);
  const candidate = `M${index.toString(36)}·${chars(core).slice(0, 6).join("")}`;
  return `${lead}${chars(candidate).slice(0, cap).join("")}${trail}`;
}

export function mechanicalUrl(original: string, index: number): string {
  if (original.startsWith("javascript:")) return original;
  if (original.startsWith("tel:")) return `tel:${MECH_PHONE}`;
  if (original.startsWith("mailto:")) return `mailto:${MECH_EMAIL}`;
  if (original.startsWith("#")) return `#mech-${hash12(original)}`;
  if (original.startsWith("data:")) return original;
  const { segments } = urlParts(original);
  const slug = slugAscii(segments.join("-")) || `p${index}`;
  return `https://${MECH_HOST}/${slug}`;
}

function mechanicalImage(slot: SlotDefinition, index: number): ImageSlotValue {
  const size = placeholderSize(slot);
  const background = hslToHex(hashInt(slot.id) % 360, 38, 62);
  return {
    src: svgPlaceholderDataUri({
      ...size,
      background,
      foreground: luminance(background) > 0.6 ? "#101010" : "#ffffff",
      label: `M${index}`,
    }),
    alt: `mech alt ${index}`,
  };
}

/** Every slot type's mechanical rule, in one place. */
export function mechanicalValue(slot: SlotDefinition, index: number): SlotValue {
  const value = slot.defaultValue;
  switch (slot.type) {
    case "image": {
      return mechanicalImage(slot, index);
    }
    case "video": {
      const current = (value ?? {}) as VideoSlotValue;
      const poster =
        typeof current.poster === "string" && current.poster !== ""
          ? svgPlaceholderDataUri({
              ...placeholderSize(slot),
              background: "#3a3a3a",
              foreground: "#ffffff",
              label: `M${index} poster`,
            })
          : (current.poster ?? null);
      // The video FILE is dropped, not replaced: no local placeholder video
      // exists and inventing an http one would reintroduce the network.
      return { src: null, poster };
    }
    case "phone":
      return typeof value === "string" && value.startsWith("tel:") ? `tel:${MECH_PHONE}` : MECH_PHONE;
    case "email":
      return typeof value === "string" && value.startsWith("mailto:") ? `mailto:${MECH_EMAIL}` : MECH_EMAIL;
    case "url": {
      if (typeof value !== "string") return value;
      if (isMediaUrl(slot, value)) {
        const background = hslToHex(hashInt(slot.id) % 360, 38, 62);
        return svgPlaceholderDataUri({
          ...placeholderSize(slot),
          background,
          foreground: luminance(background) > 0.6 ? "#101010" : "#ffffff",
          label: `M${index}`,
        });
      }
      return mechanicalUrl(value, index);
    }
    default: {
      if (typeof value !== "string") return value;
      if (slot.role === "meta.title") return `MECH · ${splitWhitespace(value).core}`;
      return mechanicalText(value, index);
    }
  }
}

interface RepeaterPlanEntry {
  repeaterKey: string;
  /** `remove-add-reorder` or `reorder` (fixed containers keep their count). */
  operation: "remove-add-reorder" | "reorder";
}

/** The representative repeaters Phase C named, per site (matched by key). */
export const MECHANICAL_REPEATERS: readonly string[] = [
  "17.main.div.repeater-29",
  "34.main.main.repeater-29",
  "34.body.ul.repeater-01",
  "kr-pricing.body.div.repeater-08",
  "kr-pricing.body.div.repeater-16",
];

export interface MechanicalExpectations {
  schemaVersion: typeof SLOTIZED_TEMPLATE_SCHEMA_VERSION;
  schemaName: typeof PACK_EXPECTATIONS_SCHEMA;
  templateId: string;
  templateVersion: string;
  pack: string;
  slots: ExpectedSlot[];
  repeaters: ExpectedRepeater[];
}

export interface ExpectedSlot {
  slotId: string;
  key: string;
  type: string;
  pageId: string;
  variant?: Variant;
  nodeId?: string;
  bindingId: string;
  kind: "text" | "attribute" | "metadata" | "css";
  childIndex?: number;
  svgTextIndex?: number;
  property?: string;
  routeId?: string;
  cssSelector?: string;
  mediaCondition?: string;
  /** Full expected value, or (css) a substring the override rule must carry. */
  value: string;
}

export interface ExpectedRepeater {
  repeaterId: string;
  key: string;
  pageId: string;
  variants: Variant[];
  defaultCount: number;
  expectedCount: number;
  expectedOrder: string[];
  addedItemIds: string[];
  removedItemIds: string[];
  reordered: boolean;
  fieldSamples: Array<{ itemId: string; fieldSlotId: string; value: string }>;
}

function valueForExpectation(value: SlotValue, field: string | undefined): string | undefined {
  if (field !== undefined) {
    if (typeof value !== "object" || value === null) return undefined;
    const raw = (value as Record<string, unknown>)[field];
    return typeof raw === "string" ? raw : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function pickExpectations(ctx: PackContext, pack: ContentPack, drivenRepeaters: Set<string>): ExpectedSlot[] {
  const out: ExpectedSlot[] = [];
  const budget = new Map<string, Map<string, number>>();
  const take = (pageId: string, bucket: string, max: number): boolean => {
    const perPage = budget.get(pageId) ?? new Map<string, number>();
    const used = perPage.get(bucket) ?? 0;
    if (used >= max) return false;
    perPage.set(bucket, used + 1);
    budget.set(pageId, perPage);
    return true;
  };

  for (const slot of ctx.ordered) {
    if (isFieldSlot(slot)) continue;
    if (slot.repeaterId !== undefined && drivenRepeaters.has(slot.repeaterId)) continue;
    const value = pack.slots[slot.id];
    if (value === undefined) continue;
    for (const binding of ctx.bindingsBySlot.get(slot.id) ?? []) {
      const expected = valueForExpectation(value, binding.field);
      if (expected === undefined || expected === "") continue;
      const pageId = binding.pageId;
      if (binding.address.surface === "route-map") {
        if (!take(pageId, "metadata", 2)) break;
        out.push({
          slotId: slot.id,
          key: slot.key,
          type: slot.type,
          pageId,
          bindingId: binding.id,
          kind: "metadata",
          routeId: binding.address.routeId!,
          value: expected,
        });
        break;
      }
      if (binding.address.surface === "css-rule") {
        if (!take(pageId, "css", 1)) break;
        out.push({
          slotId: slot.id,
          key: slot.key,
          type: slot.type,
          pageId,
          bindingId: binding.id,
          kind: "css",
          cssSelector: binding.address.cssSelector!,
          ...(binding.address.mediaCondition === undefined
            ? {}
            : { mediaCondition: binding.address.mediaCondition }),
          value: expected,
        });
        break;
      }
      if (binding.address.svgTextIndex !== undefined) continue; // svg runs: verified by the leak scan, not by address
      if (binding.nodeId === undefined || binding.variant === undefined) continue;
      if (binding.target === "textContent" && binding.address.childIndex !== undefined) {
        if (!take(pageId, `text.${slot.type}`, slot.type === "text" ? 3 : 1)) break;
        out.push({
          slotId: slot.id,
          key: slot.key,
          type: slot.type,
          pageId,
          variant: binding.variant,
          nodeId: binding.nodeId,
          bindingId: binding.id,
          kind: "text",
          childIndex: binding.address.childIndex,
          value: expected,
        });
        break;
      }
      if (binding.target === "attribute" && binding.property !== undefined) {
        const bucket = `attr.${slot.type}`;
        if (!take(pageId, bucket, slot.type === "image" ? 2 : 2)) break;
        out.push({
          slotId: slot.id,
          key: slot.key,
          type: slot.type,
          pageId,
          variant: binding.variant,
          nodeId: binding.nodeId,
          bindingId: binding.id,
          kind: "attribute",
          property: binding.property,
          value: expected,
        });
        break;
      }
    }
  }
  return out.sort((a, b) => `${a.pageId}|${a.kind}|${a.slotId}`.localeCompare(`${b.pageId}|${b.kind}|${b.slotId}`));
}

function planRepeaters(ctx: PackContext): RepeaterPlanEntry[] {
  const plan: RepeaterPlanEntry[] = [];
  for (const key of MECHANICAL_REPEATERS) {
    const repeater = ctx.repeaterByKey.get(key);
    if (repeater === undefined) continue;
    plan.push({
      repeaterKey: key,
      // A `fixed` container declares minItems === maxItems === count; asking it
      // for a different count is a contradiction, so it only proves REORDER.
      operation: repeater.growthPolicy === "fixed" || !repeater.operations.add ? "reorder" : "remove-add-reorder",
    });
  }
  return plan;
}

function mechanicalFieldValue(ctx: PackContext, fieldSlotId: string, original: SlotValue, index: number): SlotValue {
  const slot = ctx.slotById.get(fieldSlotId);
  if (slot === undefined) return original;
  // Field values are scalars; reuse the page rules against the ACTUAL item
  // value rather than the prototype's default.
  const shadow: SlotDefinition = { ...slot, defaultValue: original };
  return mechanicalValue(shadow, index);
}

export function buildMechanicalPack(ctx: PackContext): {
  pack: ContentPack;
  expectations: MechanicalExpectations;
} {
  const pack = emptyPack(ctx, "mechanical (Task 29 E1 — binding proof)");
  for (const slot of ctx.ordered) {
    if (isFieldSlot(slot)) continue;
    pack.slots[slot.id] = mechanicalValue(slot, ctx.indexOf.get(slot.id)!);
  }

  const expectedRepeaters: ExpectedRepeater[] = [];
  const driven = new Set<string>();
  for (const entry of planRepeaters(ctx)) {
    const repeater = ctx.repeaterByKey.get(entry.repeaterKey)!;
    const defaults = repeater.defaultItems;
    if (defaults.length < 2) continue;
    driven.add(repeater.id);

    const kept = entry.operation === "reorder" ? [...defaults] : defaults.slice(0, defaults.length - 1);
    const removed = entry.operation === "reorder" ? [] : [defaults[defaults.length - 1]!.id];
    const items: RepeaterItem[] = kept.map((item, i) => ({
      id: item.id,
      values: Object.fromEntries(
        Object.entries(item.values).map(([fieldId, value], f) => [
          fieldId,
          mechanicalFieldValue(ctx, fieldId, value, hashInt(`${repeater.id}|${i}|${f}`) % 9000),
        ]),
      ),
      ...(item.sourceIndex === undefined ? {} : { sourceIndex: item.sourceIndex }),
    }));

    const added: string[] = [];
    if (entry.operation === "remove-add-reorder") {
      const newId = `item_${hash12("mechanical-add", repeater.id)}`;
      added.push(newId);
      items.push({
        id: newId,
        values: Object.fromEntries(
          Object.entries(defaults[0]!.values).map(([fieldId, value], f) => [
            fieldId,
            mechanicalFieldValue(ctx, fieldId, value, 9000 + (hashInt(`${repeater.id}|add|${f}`) % 999)),
          ]),
        ),
      });
    }
    // Reorder: swap the first two items so order is provable independently of
    // the add/remove counts.
    [items[0], items[1]] = [items[1]!, items[0]!];

    pack.repeaters[repeater.id] = { items };
    expectedRepeaters.push({
      repeaterId: repeater.id,
      key: repeater.key,
      pageId: repeater.pageId ?? "",
      variants: (repeater.variants ?? ["desktop", "mobile"]) as Variant[],
      defaultCount: defaults.length,
      expectedCount: items.length,
      expectedOrder: items.map((i) => i.id),
      addedItemIds: added,
      removedItemIds: removed,
      reordered: true,
      fieldSamples: items.slice(0, 2).flatMap((item) =>
        Object.entries(item.values)
          .filter(([, v]) => typeof v === "string" && v !== "" && !String(v).startsWith("data:"))
          .slice(0, 2)
          .map(([fieldSlotId, value]) => ({ itemId: item.id, fieldSlotId, value: String(value) })),
      ),
    });
  }

  const expectations: MechanicalExpectations = {
    schemaVersion: SLOTIZED_TEMPLATE_SCHEMA_VERSION,
    schemaName: PACK_EXPECTATIONS_SCHEMA,
    templateId: ctx.template.manifest.templateId,
    templateVersion: ctx.template.manifest.templateVersion,
    pack: "mechanical",
    slots: pickExpectations(ctx, pack, driven),
    repeaters: expectedRepeaters.sort((a, b) => a.key.localeCompare(b.key)),
  };
  return { pack, expectations };
}

// ---------------------------------------------------------------------------
// REALISTIC PACK — corpus fixture
// ---------------------------------------------------------------------------

export const CorpusSchema = z
  .object({
    site: z.string(),
    brand: z
      .object({
        name: z.string(),
        nameEn: z.string(),
        tagline: z.string(),
        domain: z.string(),
        email: z.string(),
        phoneDisplay: z.string(),
        phoneTel: z.string(),
        address: z.string(),
        businessNumber: z.string(),
        representative: z.string(),
        colors: z.object({ ink: z.string(), accent: z.string(), surface: z.string(), muted: z.string() }).strict(),
      })
      .strict(),
    /** slot key → authored value (validation routes, footer, metadata). */
    overrides: z.record(z.string(), z.string()),
    pools: z
      .object({
        navModifier: z.array(z.string()).min(2),
        navNoun: z.array(z.string()).min(4),
        label: z.array(z.string()).min(4),
        phrase: z.array(z.string()).min(4),
        sentence: z.array(z.string()).min(4),
        heading: z.array(z.string()).min(2),
        footer: z.array(z.string()).min(2),
        caption: z.array(z.string()).min(2),
      })
      .strict(),
    /** The site's theme mutation, addressed by token KEY so it is reviewable. */
    theme: z.object({ label: z.string(), byKey: z.record(z.string(), z.string()) }).strict(),
    /** repeater key → authored items (field-key suffix → value). */
    repeaters: z.record(
      z.string(),
      z
        .object({
          items: z.array(z.record(z.string(), z.string())),
        })
        .strict(),
    ),
  })
  .strict();
export type Corpus = z.infer<typeof CorpusSchema>;

export async function loadCorpus(file: string): Promise<Corpus> {
  const parsed = CorpusSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
  if (!parsed.success) throw new SlotizedInputError(`corpus fixture is invalid: ${file}\n${parsed.error.message}`);
  return parsed.data;
}

/**
 * Quantitative values (prices, counts, ranges, times) are KEPT.
 *
 * They carry no company identity — a pricing table that still reads
 * "1,001 ~ 5,000 · 20원" after the swap is the most plausible outcome for a
 * fictional SaaS, and rewriting digits would only manufacture numbers nobody
 * authored. Anything that looks like a PHONE or a BUSINESS-REGISTRATION number
 * is explicitly excluded: those are identity, not quantity.
 */
const IDENTITY_NUMBER_RE = /\d{2,4}-\d{2,4}-\d{4,5}/;
/**
 * CONTACT IDENTITY shapes. A phone number, a business-registration number or an
 * email address is identity, never quantity — keeping one because "it is only
 * digits" republishes the source company's switchboard.
 * STRONG shapes are identity on their own; the WEAK one (a 4-4 service number
 * such as `1644-4052`) is indistinguishable from a year range, so it counts as
 * identity ONLY when its digits match a phone/tel value of the DEFAULT pack.
 */
const EMAIL_TEXT_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const BUSINESS_NUMBER_TEXT_RE = /\d{3}-\d{2}-\d{5}/g;
const STRONG_PHONE_TEXT_RES: readonly RegExp[] = [
  /\+?82[-\s.]?\(?\d{1,3}\)?[-\s.]?\d{3,4}[-\s.]?\d{4}/g,
  /\d{2,4}-\d{3,4}-\d{4}/g,
];
/** Digit run with formatting characters, used for digit-sequence matching. */
const DIGIT_RUN_RE = /\d[\d\s.\-()+]*\d/g;
const MIN_CONTACT_DIGITS = 7;

export function digitsOf(value: string): string {
  return value.replace(/\D+/g, "");
}

/** Phone/tel digit sequences of the DEFAULT pack — the needles to never keep. */
export function sourceContactDigits(ctx: PackContext): string[] {
  const out = new Set<string>();
  const consider = (slot: SlotDefinition | undefined, value: SlotValue): void => {
    if (typeof value !== "string") return;
    const isPhoneSlot = slot?.type === "phone" || value.startsWith("tel:");
    if (isPhoneSlot) {
      const digits = digitsOf(value);
      if (digits.length >= MIN_CONTACT_DIGITS) out.add(digits);
      return;
    }
    for (const re of STRONG_PHONE_TEXT_RES) {
      re.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = re.exec(value)) !== null) {
        const digits = digitsOf(match[0]);
        if (digits.length >= MIN_CONTACT_DIGITS) out.add(digits);
      }
    }
  };
  for (const slot of ctx.template.slots) consider(slot, slot.defaultValue as SlotValue);
  for (const repeater of ctx.template.repeaters) {
    for (const item of repeater.defaultItems) {
      for (const [slotId, value] of Object.entries(item.values)) consider(ctx.slotById.get(slotId), value);
    }
  }
  return [...out].sort();
}

function matchesSourcePhone(candidate: string, contactDigits: readonly string[]): boolean {
  const digits = digitsOf(candidate);
  if (digits.length < MIN_CONTACT_DIGITS) return false;
  return contactDigits.some((known) => digits.includes(known) || known.includes(digits));
}

/** Does this text carry contact identity (phone / business number / email)? */
export function containsContactIdentity(value: string, contactDigits: readonly string[] = []): boolean {
  if (EMAIL_TEXT_RE.test(value)) {
    EMAIL_TEXT_RE.lastIndex = 0;
    return true;
  }
  EMAIL_TEXT_RE.lastIndex = 0;
  if (new RegExp(BUSINESS_NUMBER_TEXT_RE.source).test(value)) return true;
  for (const re of STRONG_PHONE_TEXT_RES) {
    if (new RegExp(re.source).test(value)) return true;
  }
  DIGIT_RUN_RE.lastIndex = 0;
  let run: RegExpExecArray | null;
  while ((run = DIGIT_RUN_RE.exec(value)) !== null) {
    if (matchesSourcePhone(run[0], contactDigits)) {
      DIGIT_RUN_RE.lastIndex = 0;
      return true;
    }
  }
  return false;
}

/**
 * Replace every contact-identity substring with the fictional brand's own
 * value. Label prefixes survive because only the matched substring is swapped
 * ("대표번호 :1644-4052" → "대표번호 :<fictional phone>").
 */
function rewriteContactIdentity(value: string, corpus: Corpus, contactDigits: readonly string[]): string | undefined {
  let out = value;
  let changed = false;
  const swap = (re: RegExp, replacement: string, guard?: (match: string) => boolean): void => {
    out = out.replace(new RegExp(re.source, "g"), (match) => {
      if (guard !== undefined && !guard(match)) return match;
      changed = true;
      return replacement;
    });
  };
  swap(EMAIL_TEXT_RE, corpus.brand.email);
  swap(BUSINESS_NUMBER_TEXT_RE, corpus.brand.businessNumber);
  for (const re of STRONG_PHONE_TEXT_RES) swap(re, corpus.brand.phoneDisplay);
  swap(DIGIT_RUN_RE, corpus.brand.phoneDisplay, (match) => matchesSourcePhone(match, contactDigits));
  return changed ? out : undefined;
}

const QUANTITATIVE_RE = /^[0-9\s,.:~\-+%()/원명개분초건회년월일시간만억천배위·]*[0-9][0-9\s,.:~\-+%()/원명개분초건회년월일시간만억천배위·]*$/;
const UNIT_WORD_RE = /^(?:[0-9][0-9,.\s~\-]*)?\s*(?:PU|CU|AU|MU|GB|MB|KB|%|원|명|개|시트|분|초|건|회|일|주|월|년|시간)?\s*~?$/i;

export function isQuantitative(value: string, contactDigits: readonly string[] = []): boolean {
  const core = splitWhitespace(value).core;
  if (core === "") return false;
  if (IDENTITY_NUMBER_RE.test(core)) return false;
  // A phone / business number / email is identity, not quantity — never kept.
  if (containsContactIdentity(core, contactDigits)) return false;
  if (!/\d/.test(core)) return false;
  return QUANTITATIVE_RE.test(core) || UNIT_WORD_RE.test(core);
}

interface CorpusPicker {
  next(pool: readonly string[], salt: string, maxChars?: number): string;
}

/**
 * Sequential, collision-avoiding pool assignment. Sequential (not hashed)
 * because a hash spreads 200 nav labels over 40 words with heavy repeats,
 * while a counter walks the pool and only then starts combining.
 */
function makePicker(): CorpusPicker {
  const counters = new Map<string, number>();
  return {
    next(pool, salt, maxChars) {
      const key = `${salt}|${pool.length}`;
      const i = counters.get(key) ?? 0;
      counters.set(key, i + 1);
      const candidates: string[] = [];
      for (let k = 0; k < pool.length; k++) candidates.push(pool[(i + k) % pool.length]!);
      if (maxChars !== undefined) {
        const fitting = candidates.filter((c) => chars(c).length <= maxChars);
        if (fitting.length > 0) return fitting[0]!;
        const shortest = [...candidates].sort((a, b) => chars(a).length - chars(b).length)[0]!;
        return chars(shortest).slice(0, Math.max(2, maxChars)).join("");
      }
      return candidates[0]!;
    },
  };
}

function fitBudget(slot: SlotDefinition): number | undefined {
  const hints = slot.fitHints;
  if (hints?.recommendedMaxChars !== undefined) return hints.recommendedMaxChars;
  if (hints?.sourceChars !== undefined) return Math.max(4, Math.round(hints.sourceChars * 1.5));
  return undefined;
}

/**
 * ASCII path segments for rewritten external urls. Generic on purpose: a
 * source path segment (`/beomeorosee`) IS identity, so it is replaced rather
 * than transliterated, and the replacement must not invent a brand either.
 */
const URL_SLUGS = [
  "about",
  "collection",
  "showroom",
  "journal",
  "studio",
  "contact",
  "projects",
  "catalog",
  "news",
  "support",
] as const;

function realisticUrl(original: string, corpus: Corpus, picker: CorpusPicker): string {
  if (original.startsWith("javascript:")) return original;
  if (original.startsWith("data:")) return original;
  if (original.startsWith("#")) return original; // in-page anchor: structure, not identity
  if (original.startsWith("tel:")) return `tel:${corpus.brand.phoneTel}`;
  if (original.startsWith("mailto:")) return `mailto:${corpus.brand.email}`;
  const { scheme, segments } = urlParts(original);
  // Relative paths ARE the template's own route structure. Rewriting them would
  // 404 the new site; they carry no source identity, so they stay.
  if (scheme === "relative") return original;
  const rewritten = segments.map((segment) =>
    /^\d+$/.test(segment) ? segment : picker.next(URL_SLUGS, "url-segment"),
  );
  return `https://${corpus.brand.domain}${rewritten.length === 0 ? "/" : `/${rewritten.join("/")}`}`;
}

function realisticImage(slot: SlotDefinition, corpus: Corpus, picker: CorpusPicker): ImageSlotValue {
  const colors = [corpus.brand.colors.ink, corpus.brand.colors.accent, corpus.brand.colors.muted, corpus.brand.colors.surface];
  const background = colors[hashInt(slot.id) % colors.length]!;
  const caption = picker.next(corpus.pools.caption, "image-caption");
  return {
    src: svgPlaceholderDataUri({
      ...placeholderSize(slot),
      background,
      foreground: luminance(background) > 0.6 ? corpus.brand.colors.ink : "#ffffff",
      label: caption,
    }),
    alt: `${corpus.brand.name} ${caption}`,
  };
}

function realisticText(
  slot: SlotDefinition,
  corpus: Corpus,
  picker: CorpusPicker,
  contactDigits: readonly string[],
): string {
  const original = typeof slot.defaultValue === "string" ? slot.defaultValue : "";
  const { lead, core, trail } = splitWhitespace(original);
  if (core === "") return original; // invisible spacer: adding words would ADD content
  const contactRewrite = rewriteContactIdentity(core, corpus, contactDigits);
  if (contactRewrite !== undefined) return `${lead}${contactRewrite}${trail}`;
  if (isQuantitative(core, contactDigits)) return original;
  const budget = fitBudget(slot);
  const length = chars(core).length;
  const pools = corpus.pools;
  const pick = (pool: readonly string[], salt: string): string => picker.next(pool, salt, budget);

  let value: string;
  switch (slot.role) {
    case "meta.title":
      value = `${pick(pools.heading, "meta")} | ${corpus.brand.name}`;
      break;
    case "heading.primary":
      value = pick(pools.heading, "heading.primary");
      break;
    case "heading.secondary":
      value = pick(pools.phrase, "heading.secondary");
      break;
    case "footer.text":
      value = pick(pools.footer, "footer");
      break;
    case "navigation.label":
    case "link.label":
    case "repeater.text":
      value = `${picker.next(pools.navModifier, "nav.mod")} ${picker.next(pools.navNoun, "nav.noun")}`;
      if (budget !== undefined && chars(value).length > budget) value = pick(pools.label, "nav.short");
      break;
    case "attribute.title":
    case "attribute.aria-label":
    case "form.placeholder":
      value = pick(pools.label, "label");
      break;
    default:
      value = length <= 6 ? pick(pools.label, "short") : length <= 24 ? pick(pools.phrase, "phrase") : pick(pools.sentence, "sentence");
  }
  if (budget !== undefined && chars(value).length > budget) value = chars(value).slice(0, budget).join("");
  return `${lead}${value}${trail}`;
}

export function realisticValue(
  slot: SlotDefinition,
  corpus: Corpus,
  picker: CorpusPicker,
  contactDigits: readonly string[] = [],
): SlotValue {
  const authored = corpus.overrides[slot.key];
  if (authored !== undefined) {
    if (slot.type === "image") {
      const size = placeholderSize(slot);
      const background = corpus.brand.colors.accent;
      return {
        src: svgPlaceholderDataUri({ ...size, background, foreground: "#ffffff", label: authored }),
        alt: authored,
      };
    }
    return authored;
  }
  switch (slot.type) {
    case "image":
      return realisticImage(slot, corpus, picker);
    case "video": {
      const current = (slot.defaultValue ?? {}) as VideoSlotValue;
      return {
        src: null,
        poster:
          typeof current.poster === "string" && current.poster !== ""
            ? svgPlaceholderDataUri({
                ...placeholderSize(slot),
                background: corpus.brand.colors.ink,
                foreground: "#ffffff",
                label: picker.next(corpus.pools.caption, "video-poster"),
              })
            : (current.poster ?? null),
      };
    }
    case "phone":
      return typeof slot.defaultValue === "string" && slot.defaultValue.startsWith("tel:")
        ? `tel:${corpus.brand.phoneTel}`
        : corpus.brand.phoneDisplay;
    case "email":
      return typeof slot.defaultValue === "string" && slot.defaultValue.startsWith("mailto:")
        ? `mailto:${corpus.brand.email}`
        : corpus.brand.email;
    case "url": {
      if (typeof slot.defaultValue !== "string") return slot.defaultValue;
      if (isMediaUrl(slot, slot.defaultValue)) {
        const background = corpus.brand.colors.muted;
        return svgPlaceholderDataUri({
          ...placeholderSize(slot),
          background,
          foreground: luminance(background) > 0.6 ? corpus.brand.colors.ink : "#ffffff",
          label: picker.next(corpus.pools.caption, "media-url"),
        });
      }
      return realisticUrl(slot.defaultValue, corpus, picker);
    }
    default:
      return typeof slot.defaultValue === "string" ? realisticText(slot, corpus, picker, contactDigits) : slot.defaultValue;
  }
}

export function buildRealisticPack(ctx: PackContext, corpus: Corpus): ContentPack {
  const pack = emptyPack(ctx, `realistic — ${corpus.brand.name} (Task 29 E1)`);
  const picker = makePicker();
  const contactDigits = sourceContactDigits(ctx);
  // Sorted by KEY so the corpus walks the site in reading order and sibling
  // labels land next to each other; ids are hashes and would scatter them.
  for (const slot of [...ctx.ordered].sort((a, b) => a.key.localeCompare(b.key))) {
    if (isFieldSlot(slot)) continue;
    pack.slots[slot.id] = realisticValue(slot, corpus, picker, contactDigits);
  }

  for (const [key, authored] of Object.entries(corpus.repeaters).sort()) {
    const repeater = ctx.repeaterByKey.get(key);
    if (repeater === undefined) continue;
    const fieldSlots = repeater.itemSlots
      .map((id) => ctx.slotById.get(id))
      .filter((s): s is SlotDefinition => s !== undefined);
    const suffixOf = (slot: SlotDefinition): string => slot.key.split(".item.")[1] ?? slot.key;
    const items: RepeaterItem[] = authored.items.map((authoredItem, i) => {
      const reuse = repeater.defaultItems[i];
      const isNew = authoredItem["_id"] === "new" || reuse === undefined;
      const id = isNew ? `item_${hash12("realistic-add", repeater.id, String(i))}` : reuse!.id;
      const values: Record<string, SlotValue> = {};
      for (const slot of fieldSlots) {
        const suffix = suffixOf(slot);
        const authoredValue = authoredItem[suffix];
        const fallback = (reuse ?? repeater.defaultItems[0]!).values[slot.id] ?? "";
        if (authoredValue !== undefined) {
          values[slot.id] =
            slot.role === "repeater.media" || (typeof fallback === "string" && isMediaUrl(slot, fallback))
              ? svgPlaceholderDataUri({
                  ...placeholderSize(slot),
                  background: corpus.brand.colors.muted,
                  foreground: "#ffffff",
                  label: authoredValue,
                })
              : authoredValue;
        } else {
          values[slot.id] = realisticValue({ ...slot, defaultValue: fallback }, corpus, picker, contactDigits);
        }
      }
      return { id, values };
    });
    // REORDER proof: adds and removes alone never exercise the order path, so
    // swap the first two SURVIVING default items. Counts are untouched and the
    // render report answers `reordered: true` for this repeater.
    const defaultIds = new Set(repeater.defaultItems.map((d) => d.id));
    const kept = items.map((item, i) => (defaultIds.has(item.id) ? i : -1)).filter((i) => i >= 0);
    if (kept.length >= 2) {
      const [a, b] = [kept[0]!, kept[1]!];
      [items[a], items[b]] = [items[b]!, items[a]!];
    }
    pack.repeaters[repeater.id] = { items };
  }
  return pack;
}

// ---------------------------------------------------------------------------
// THEME PACK
// ---------------------------------------------------------------------------

export interface ThemeMutation {
  label: string;
  /** token key (`color.01`) → replacement value. Keys, not ids: reviewable. */
  byKey: Record<string, string>;
}

export async function buildMutatedThemePack(
  ctx: PackContext,
  mutation: ThemeMutation,
): Promise<{ pack: ThemePack; resolved: Array<{ key: string; id: string; from: string; to: string }>; missing: string[] }> {
  const tokens = await loadThemeTokens(ctx.template.dir);
  const byKey = new Map(tokens.map((t) => [t.key, t] as const));
  const pack: ThemePack = {
    schemaVersion: SLOTIZED_TEMPLATE_SCHEMA_VERSION,
    schemaName: THEME_PACK_SCHEMA,
    templateId: ctx.template.manifest.templateId,
    templateVersion: ctx.template.manifest.templateVersion,
    label: mutation.label,
    tokens: {},
  };
  const resolved: Array<{ key: string; id: string; from: string; to: string }> = [];
  const missing: string[] = [];
  for (const [key, value] of Object.entries(mutation.byKey).sort()) {
    const token = byKey.get(key);
    if (token === undefined) {
      missing.push(key);
      continue;
    }
    pack.tokens[token.id] = value;
    resolved.push({ key, id: token.id, from: token.value, to: value });
  }
  return { pack, resolved, missing };
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export async function writePackFiles(
  outDir: string,
  files: Array<{ relPath: string; content: unknown }>,
): Promise<string[]> {
  const written: string[] = [];
  for (const file of files) {
    const target = path.join(outDir, file.relPath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, stableStringify(file.content), "utf8");
    written.push(target);
  }
  return written;
}

export const PACK_PATHS = {
  mechanical: `${CONTENT_PACKS_DIR}/mechanical.json`,
  mechanicalExpectations: `${CONTENT_PACKS_DIR}/mechanical.expectations.json`,
  realistic: `${CONTENT_PACKS_DIR}/realistic.json`,
  themeMutated: `${THEME_PACKS_DIR}/mutated.json`,
} as const;

// ---------------------------------------------------------------------------
// Expectation verification against a RENDERED app
// ---------------------------------------------------------------------------

export interface ExpectationVerification {
  schemaVersion: typeof SLOTIZED_TEMPLATE_SCHEMA_VERSION;
  schemaName: "slotized-pack-verification-v1";
  renderDir: string;
  templateId: string;
  slots: { checked: number; passed: number; failed: number };
  repeaters: { checked: number; passed: number; failed: number };
  failures: Array<{ kind: string; id: string; detail: string }>;
  pass: boolean;
}

function collectTextChild(node: unknown, childIndex: number): string | undefined {
  const children = (node as { c?: unknown[] }).c ?? [];
  const child = children[childIndex] as { k?: string; v?: string } | undefined;
  if (child === undefined || child.k !== "t") return undefined;
  return child.v;
}

export async function verifyExpectations(
  expectationsFile: string,
  renderDir: string,
): Promise<ExpectationVerification> {
  const expectations = JSON.parse(await readFile(expectationsFile, "utf8")) as MechanicalExpectations;
  const failures: ExpectationVerification["failures"] = [];
  const dataDir = path.join(renderDir, RUNTIME_DATA_DIR);
  const pages = new Map<string, RuntimePage>();
  const loadPage = async (pageId: string): Promise<RuntimePage | undefined> => {
    if (pages.has(pageId)) return pages.get(pageId);
    try {
      const page = JSON.parse(await readFile(path.join(dataDir, "pages", `${pageId}.json`), "utf8")) as RuntimePage;
      pages.set(pageId, page);
      return page;
    } catch {
      return undefined;
    }
  };
  const routeMap = JSON.parse(await readFile(path.join(dataDir, ROUTE_MAP_FILE), "utf8")) as RuntimeRouteMap;
  const cssFile = path.join(renderDir, "public/wr/generated-styles.css");
  const css = await readFile(cssFile, "utf8");
  const overlay = css.includes(OVERRIDE_HEADER) ? css.slice(css.lastIndexOf(OVERRIDE_HEADER)) : "";

  let slotsPassed = 0;
  for (const expected of expectations.slots) {
    const fail = (detail: string): void => {
      failures.push({ kind: `slot.${expected.kind}`, id: expected.key, detail });
    };
    if (expected.kind === "metadata") {
      const route = routeMap.routes.find((r) => r.routeId === expected.routeId);
      if (route?.title === expected.value) slotsPassed++;
      else fail(`route ${expected.routeId} title is ${JSON.stringify(route?.title)}`);
      continue;
    }
    if (expected.kind === "css") {
      const selector = expected.cssSelector!;
      const hit = overlay.includes(`${selector}{background-image:`) && overlay.includes(expected.value.slice(0, 48));
      if (hit) slotsPassed++;
      else fail(`no override for ${selector} carrying the new value in the stylesheet overlay`);
      continue;
    }
    const page = await loadPage(expected.pageId);
    if (page === undefined) {
      fail(`page ${expected.pageId} missing from the render`);
      continue;
    }
    const variant = expected.variant === "mobile" ? page.mobile : page.desktop;
    const node = indexElements(variant.doc).get(expected.nodeId!);
    if (node === undefined) {
      fail(`node ${expected.nodeId} not found in ${expected.variant}`);
      continue;
    }
    if (expected.kind === "text") {
      const actual = collectTextChild(node, expected.childIndex!);
      if (actual === expected.value) slotsPassed++;
      else fail(`text child ${expected.childIndex} is ${JSON.stringify(actual)} want ${JSON.stringify(expected.value)}`);
      continue;
    }
    const actual = (node.p ?? {})[expected.property!];
    if (actual === expected.value) slotsPassed++;
    else
      fail(
        `prop ${expected.property} is ${JSON.stringify(String(actual ?? "")).slice(0, 60)} want ${JSON.stringify(expected.value).slice(0, 60)}`,
      );
  }

  let repeatersPassed = 0;
  for (const expected of expectations.repeaters) {
    const page = await loadPage(expected.pageId);
    if (page === undefined) {
      failures.push({ kind: "repeater", id: expected.key, detail: `page ${expected.pageId} missing` });
      continue;
    }
    let ok = true;
    for (const variant of expected.variants) {
      const root = variant === "mobile" ? page.mobile.doc : page.desktop.doc;
      const order: string[] = [];
      const walk = (node: unknown): void => {
        const element = node as { k?: string; p?: Record<string, unknown>; c?: unknown[] };
        if (element.k !== "e") return;
        if (element.p?.["data-wr-repeater"] === expected.repeaterId) {
          order.push(String(element.p["data-wr-item"]));
        }
        for (const child of element.c ?? []) walk(child);
      };
      walk(root);
      if (order.length === 0) {
        ok = false;
        failures.push({ kind: "repeater", id: `${expected.key}/${variant}`, detail: "no rendered items carry data-wr-repeater" });
        continue;
      }
      if (order.join(",") !== expected.expectedOrder.join(",")) {
        ok = false;
        failures.push({
          kind: "repeater",
          id: `${expected.key}/${variant}`,
          detail: `order ${order.join(",")} want ${expected.expectedOrder.join(",")}`,
        });
      }
      for (const removedId of expected.removedItemIds) {
        if (order.includes(removedId)) {
          ok = false;
          failures.push({ kind: "repeater", id: `${expected.key}/${variant}`, detail: `removed item ${removedId} still rendered` });
        }
      }
      for (const addedId of expected.addedItemIds) {
        if (!order.includes(addedId)) {
          ok = false;
          failures.push({ kind: "repeater", id: `${expected.key}/${variant}`, detail: `added item ${addedId} not rendered` });
        }
      }
    }
    if (ok) repeatersPassed++;
  }

  const slotFailures = expectations.slots.length - slotsPassed;
  const repeaterFailures = expectations.repeaters.length - repeatersPassed;
  return {
    schemaVersion: SLOTIZED_TEMPLATE_SCHEMA_VERSION,
    schemaName: "slotized-pack-verification-v1",
    renderDir: path.resolve(renderDir),
    templateId: expectations.templateId,
    slots: { checked: expectations.slots.length, passed: slotsPassed, failed: slotFailures },
    repeaters: { checked: expectations.repeaters.length, passed: repeatersPassed, failed: repeaterFailures },
    failures: failures.slice(0, 50),
    pass: slotFailures === 0 && repeaterFailures === 0,
  };
}
