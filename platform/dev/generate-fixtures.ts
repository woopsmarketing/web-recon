/**
 * Deterministic generator for the three CLEARLY FICTIONAL Slice 1 fixture sites.
 * Same code → byte-identical data/sites/fixture-* (no wall clock, seeded PRNG).
 * Dev tool: excluded from Template Releases.
 *
 *   pnpm fixtures:generate --release <releaseId>
 *
 * The release pin is explicit: fixtures are pinned to exactly that release.
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadRelease } from "../release/release";
import { SITES_DIR } from "../site/load";

const repoRoot = process.cwd();
const releaseArg = process.argv[process.argv.indexOf("--release") + 1];
if (!process.argv.includes("--release") || !releaseArg) {
  console.error("usage: pnpm fixtures:generate --release <releaseId>");
  process.exit(2);
}
const release = await loadRelease(repoRoot, "interior-01", releaseArg);
const pin = {
  templateId: release.templateId,
  templateVersion: release.templateVersion,
  releaseId: release.releaseId,
  releaseHash: release.releaseHash,
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
const pad = (n: number, w = 4) => String(n).padStart(w, "0");
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Abstract room illustration — generated, customer-owned, no text, no remote refs. */
function coverSvg(seed: number, palette: string[]): string {
  const r = mulberry32(seed);
  const pick = () => palette[Math.floor(r() * palette.length)]!;
  const wall = pick();
  const floor = pick();
  const accent = pick();
  const winX = 60 + Math.floor(r() * 420);
  const sofaX = 80 + Math.floor(r() * 360);
  const lampX = 100 + Math.floor(r() * 600);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">`,
    `<rect width="800" height="600" fill="${wall}"/>`,
    `<rect y="430" width="800" height="170" fill="${floor}"/>`,
    `<rect x="${winX}" y="90" width="220" height="200" fill="#ffffff" fill-opacity="0.55"/>`,
    `<rect x="${winX + 105}" y="90" width="10" height="200" fill="${wall}"/>`,
    `<rect x="${sofaX}" y="360" width="300" height="90" rx="14" fill="${accent}"/>`,
    `<rect x="${sofaX + 10}" y="330" width="280" height="50" rx="12" fill="${accent}" fill-opacity="0.8"/>`,
    `<rect x="${lampX}" y="200" width="6" height="230" fill="#2b2b2b" fill-opacity="0.6"/>`,
    `<circle cx="${lampX + 3}" cy="196" r="26" fill="#fff4d6"/>`,
    `</svg>`,
    "",
  ].join("\n");
}

function logoSvg(text: string, color: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="32" viewBox="0 0 220 32">`,
    `<rect x="0" y="4" width="24" height="24" fill="${color}"/>`,
    `<rect x="7" y="11" width="10" height="10" fill="#ffffff"/>`,
    `<text x="34" y="23" font-family="Helvetica, Arial, sans-serif" font-size="18" font-weight="700" fill="${color}">${text}</text>`,
    `</svg>`,
    "",
  ].join("\n");
}

/** Room photo — kind-specific layout, distinct base palette per kind so rooms look different. */
function roomSvg(seed: number, kind: "living" | "kitchen" | "bath" | "bedroom" | "entry", palette: string[]): string {
  const r = mulberry32(seed);
  const pick = () => palette[Math.floor(r() * palette.length)]!;
  const wall = pick();
  const floor = pick();
  const accent = pick();
  const winX = 60 + Math.floor(r() * 420);
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">`,
    `<rect width="800" height="600" fill="${wall}"/>`,
    `<rect y="430" width="800" height="170" fill="${floor}"/>`,
    `<rect x="${winX}" y="70" width="200" height="180" fill="#ffffff" fill-opacity="0.5"/>`,
    `<rect x="${winX + 95}" y="70" width="10" height="180" fill="${wall}"/>`,
  ];
  if (kind === "living") {
    const sofaX = 80 + Math.floor(r() * 360);
    parts.push(
      `<rect x="${sofaX}" y="360" width="300" height="90" rx="14" fill="${accent}"/>`,
      `<rect x="${sofaX + 10}" y="330" width="280" height="50" rx="12" fill="${accent}" fill-opacity="0.8"/>`,
      `<ellipse cx="${sofaX + 150}" cy="470" rx="220" ry="30" fill="${floor}" fill-opacity="0.6"/>`,
      `<rect x="${sofaX + 260}" y="220" width="6" height="210" fill="#2b2b2b" fill-opacity="0.6"/>`,
      `<circle cx="${sofaX + 263}" cy="216" r="24" fill="#fff4d6"/>`,
    );
  } else if (kind === "kitchen") {
    const counterX = 60 + Math.floor(r() * 300);
    parts.push(
      `<rect x="${counterX}" y="380" width="420" height="70" fill="${accent}"/>`,
      `<rect x="${counterX}" y="350" width="420" height="30" fill="${accent}" fill-opacity="0.7"/>`,
      `<circle cx="${counterX + 100}" cy="400" r="14" fill="#3a3a3a" fill-opacity="0.7"/>`,
      `<circle cx="${counterX + 150}" cy="400" r="14" fill="#3a3a3a" fill-opacity="0.7"/>`,
      `<rect x="${counterX + 320}" y="330" width="70" height="120" fill="#e9e9e9" fill-opacity="0.8"/>`,
    );
  } else if (kind === "bath") {
    const tubX = 90 + Math.floor(r() * 300);
    parts.push(
      `<ellipse cx="${tubX}" cy="420" rx="170" ry="60" fill="#ffffff" fill-opacity="0.85"/>`,
      `<rect x="${Math.max(0, tubX - 170)}" y="420" width="340" height="40" fill="${accent}" fill-opacity="0.6"/>`,
      `<rect x="500" y="120" width="120" height="160" fill="#ffffff" fill-opacity="0.4"/>`,
    );
  } else if (kind === "bedroom") {
    const bedX = 90 + Math.floor(r() * 260);
    parts.push(
      `<rect x="${bedX}" y="330" width="340" height="130" rx="10" fill="${accent}"/>`,
      `<rect x="${bedX + 20}" y="300" width="80" height="50" rx="10" fill="#ffffff" fill-opacity="0.8"/>`,
      `<rect x="${bedX + 360}" y="380" width="60" height="60" fill="${floor}" fill-opacity="0.8"/>`,
      `<circle cx="${bedX + 390}" cy="360" r="18" fill="#fff4d6"/>`,
    );
  } else {
    const doorX = 120 + Math.floor(r() * 380);
    parts.push(
      `<rect x="${doorX}" y="120" width="140" height="310" fill="${accent}"/>`,
      `<rect x="${doorX + 30}" y="470" width="200" height="20" fill="${floor}" fill-opacity="0.9"/>`,
      `<circle cx="${doorX + 20}" cy="280" r="8" fill="#2b2b2b" fill-opacity="0.5"/>`,
    );
  }
  parts.push(`</svg>`, "");
  return parts.join("\n");
}

/** "Before" photo — dull, greyish palette, no lamp; visibly distinct from the room pool. */
function beforeSvg(seed: number): string {
  const dull = ["#c9c9c6", "#bfbfbc", "#d3d1cb", "#b7b6b0", "#a9a9a4"];
  const r = mulberry32(seed);
  const pick = () => dull[Math.floor(r() * dull.length)]!;
  const wall = pick();
  const floor = pick();
  const winX = 60 + Math.floor(r() * 420);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">`,
    `<rect width="800" height="600" fill="${wall}"/>`,
    `<rect y="430" width="800" height="170" fill="${floor}"/>`,
    `<rect x="${winX}" y="90" width="200" height="180" fill="#e7e7e4" fill-opacity="0.6"/>`,
    `<rect x="${winX + 95}" y="90" width="10" height="180" fill="${wall}"/>`,
    `<rect x="220" y="380" width="260" height="70" rx="6" fill="${pick()}" fill-opacity="0.7"/>`,
    `</svg>`,
    "",
  ].join("\n");
}

/** Abstract, textless hero band for the portfolio list page. */
function heroSvg(seed: number, palette: string[]): string {
  const r = mulberry32(seed);
  const pick = () => palette[Math.floor(r() * palette.length)]!;
  const c1 = pick();
  const c2 = pick();
  const c3 = pick();
  const cx = 300 + Math.floor(r() * 1000);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="500" viewBox="0 0 1600 500">`,
    `<defs>`,
    `<linearGradient id="heroGrad" x1="0" y1="0" x2="1" y2="0">`,
    `<stop offset="0" stop-color="${c1}"/>`,
    `<stop offset="1" stop-color="${c2}"/>`,
    `</linearGradient>`,
    `</defs>`,
    `<rect width="1600" height="500" fill="url(#heroGrad)"/>`,
    `<rect y="360" width="1600" height="140" fill="${c3}" fill-opacity="0.5"/>`,
    `<circle cx="${cx}" cy="180" r="90" fill="#ffffff" fill-opacity="0.25"/>`,
    `</svg>`,
    "",
  ].join("\n");
}

/**
 * Large-format abstract interior scene (Step 5 homepage media: hero slides, intro, review
 * banner, closing band) — any size, seeded, textless, inert SVG (gradient + shapes only).
 */
function sceneSvg(seed: number, w: number, h: number, palette: string[]): string {
  const r = mulberry32(seed);
  const pick = () => palette[Math.floor(r() * palette.length)]!;
  const wallA = pick();
  const wallB = pick();
  const floor = pick();
  const accent = pick();
  const accent2 = pick();
  const floorY = Math.round(h * (0.68 + r() * 0.08));
  const winW = Math.round(w * (0.18 + r() * 0.12));
  const winH = Math.round((floorY - h * 0.12) * 0.7);
  const winX = Math.round(w * (0.08 + r() * 0.6));
  const winY = Math.round(h * 0.1);
  const sofaW = Math.round(w * (0.3 + r() * 0.1));
  const sofaX = Math.round(Math.min(w - sofaW - w * 0.05, w * (0.12 + r() * 0.45)));
  const sofaH = Math.round(h * 0.11);
  const lampX = Math.round(w * (0.1 + r() * 0.8));
  const lampY = Math.round(h * (0.3 + r() * 0.12));
  const plantX = Math.round(w * (0.05 + r() * 0.9));
  const id = `sceneGrad${seed}`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">`,
    `<defs>`,
    `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">`,
    `<stop offset="0" stop-color="${wallA}"/>`,
    `<stop offset="1" stop-color="${wallB}"/>`,
    `</linearGradient>`,
    `</defs>`,
    `<rect width="${w}" height="${h}" fill="url(#${id})"/>`,
    `<rect y="${floorY}" width="${w}" height="${h - floorY}" fill="${floor}"/>`,
    `<rect x="${winX}" y="${winY}" width="${winW}" height="${winH}" fill="#ffffff" fill-opacity="0.55"/>`,
    `<rect x="${winX + Math.round(winW / 2) - 5}" y="${winY}" width="10" height="${winH}" fill="${wallB}" fill-opacity="0.8"/>`,
    `<polygon points="${winX},${winY + winH} ${winX + winW},${winY + winH} ${winX + winW + Math.round(w * 0.12)},${floorY + Math.round((h - floorY) * 0.8)} ${winX + Math.round(w * 0.08)},${floorY + Math.round((h - floorY) * 0.8)}" fill="#ffffff" fill-opacity="0.18"/>`,
    `<ellipse cx="${sofaX + Math.round(sofaW / 2)}" cy="${floorY + Math.round((h - floorY) * 0.35)}" rx="${Math.round(sofaW * 0.75)}" ry="${Math.round((h - floorY) * 0.22)}" fill="${accent2}" fill-opacity="0.45"/>`,
    `<rect x="${sofaX}" y="${floorY - sofaH}" width="${sofaW}" height="${sofaH}" rx="${Math.round(sofaH / 5)}" fill="${accent}"/>`,
    `<rect x="${sofaX + Math.round(sofaW * 0.03)}" y="${floorY - Math.round(sofaH * 1.55)}" width="${Math.round(sofaW * 0.94)}" height="${Math.round(sofaH * 0.7)}" rx="${Math.round(sofaH / 5)}" fill="${accent}" fill-opacity="0.8"/>`,
    `<rect x="${lampX}" y="0" width="3" height="${lampY}" fill="#2b2b2b" fill-opacity="0.5"/>`,
    `<circle cx="${lampX + 1}" cy="${lampY + Math.round(h * 0.03)}" r="${Math.round(h * 0.035)}" fill="#fff4d6"/>`,
    `<rect x="${plantX}" y="${floorY - Math.round(h * 0.09)}" width="${Math.round(w * 0.025)}" height="${Math.round(h * 0.09)}" fill="${wallB}"/>`,
    `<ellipse cx="${plantX + Math.round(w * 0.0125)}" cy="${floorY - Math.round(h * 0.14)}" rx="${Math.round(w * 0.03)}" ry="${Math.round(h * 0.07)}" fill="#7d8f6a" fill-opacity="0.85"/>`,
    `</svg>`,
    "",
  ].join("\n");
}

/** Fisher–Yates partial shuffle (seeded, deterministic): the first n distinct picks from pool. */
function pickUnique<T>(rand: () => number, pool: readonly T[], n: number): T[] {
  const arr = pool.slice();
  const count = Math.max(0, Math.min(n, arr.length));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
  return arr.slice(0, count);
}

/** Inclusive random integer in [lo, hi]. */
function int(rand: () => number, lo: number, hi: number): number {
  return lo + Math.floor(rand() * (hi - lo + 1));
}

/** "YYYY-MM" + `add` months (add may cross year boundaries). */
function monthAdd(year: number, month1to12: number, add: number): { y: number; m: number } {
  const total = year * 12 + (month1to12 - 1) + add;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}
function ym(y: number, m: number): string {
  return `${y}-${pad(m, 2)}`;
}

interface MediaRefLite {
  asset: string;
  alt?: string;
}
interface GalleryItem {
  image: MediaRefLite;
  before?: MediaRefLite;
}
interface GalleryGroup {
  name: string;
  items: GalleryItem[];
}
interface ProjectArea {
  value: number;
  unit: "m2" | "sqft" | "pyeong";
}
interface ProjectPeriod {
  start: string;
  end?: string;
}
interface ProjectPrice {
  amount: number;
  currency: string;
  unit: "m2" | "sqft" | "pyeong";
}
interface CustomerQuote {
  text: string;
  attribution?: string;
}

interface FixtureProject {
  id: string;
  slug: string;
  title: string;
  status: "published" | "draft";
  publishedAt: string;
  category: string;
  cover: MediaRefLite;

  // ---- optional detail fields (Step 4 schema; absent = unknown, never invented) ----
  summary?: string;
  body?: string[];
  location?: string;
  area?: ProjectArea;
  builtYear?: number;
  scope?: string[];
  period?: ProjectPeriod;
  durationWeeks?: number;
  keywords?: string[];
  pricePerArea?: ProjectPrice;
  galleryGroups?: GalleryGroup[];
  customerQuote?: CustomerQuote;
}

/**
 * Fail fast if the registry has an asset nothing references, or content
 * references an asset the registry doesn't have. Scans EVERY project
 * (published/draft/scheduled) since the invariant is about the registry
 * itself, not one build's visible snapshot.
 */
function assertFullyReferenced(
  siteId: string,
  allProjects: readonly FixtureProject[],
  registryIds: readonly string[],
  extraRefs: readonly string[] = [],
) {
  const referenced = new Set<string>(extraRefs);
  for (const p of allProjects) {
    referenced.add(p.cover.asset);
    for (const g of p.galleryGroups ?? []) {
      for (const it of g.items) {
        referenced.add(it.image.asset);
        if (it.before) referenced.add(it.before.asset);
      }
    }
  }
  const registrySet = new Set(registryIds);
  const missingFromRegistry = [...referenced].filter((a) => !registrySet.has(a)).sort();
  const unreferenced = [...registrySet].filter((a) => !referenced.has(a)).sort();
  if (missingFromRegistry.length || unreferenced.length) {
    throw new Error(
      `${siteId}: asset registry mismatch — referenced but missing from registry: [${missingFromRegistry.join(", ")}]; ` +
        `in registry but never referenced: [${unreferenced.join(", ")}]`,
    );
  }
}

async function writeSite(siteId: string, files: Record<string, string>) {
  const dir = path.join(repoRoot, SITES_DIR, siteId);
  await rm(dir, { recursive: true, force: true });
  for (const [rel, text] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await writeFile(path.join(dir, rel), text);
  }
}

// ------------------------------------------------------------ fixture-large --
{
  const palette = ["#d9d4cc", "#c8cfd2", "#e6e0d4", "#b9c2b0", "#d8c7b5", "#a9b4bf", "#8f9a86", "#c4a98f"];
  const categories = [
    { id: "kitchen", name: "Kitchen" },
    { id: "living", name: "Living room" },
    { id: "bath", name: "Bathroom" },
  ];
  const places = ["Birch Lane", "Harbor Row", "Elm Court", "Quarry Hill", "Linden Walk", "Mill Street", "Aster Park", "Cedar Yard"];
  const kinds = ["Refresh", "Full renovation", "Open plan", "Compact remodel", "Light rework", "Family update"];
  const r = mulberry32(173);
  const assets: { id: string; file: string; mediaType: "image/svg+xml"; width: number; height: number }[] = [];
  const files: Record<string, string> = {};
  for (let i = 1; i <= 24; i++) {
    const id = `cover-${pad(i, 2)}`;
    assets.push({ id, file: `${id}.svg`, mediaType: "image/svg+xml", width: 800, height: 600 });
    files[`assets/${id}.svg`] = coverSvg(1000 + i, palette);
  }
  assets.push({ id: "logo", file: "logo.svg", mediaType: "image/svg+xml", width: 220, height: 32 });
  files["assets/logo.svg"] = logoSvg("Harbor &amp; Pine", "#1f2a2e");

  // ---- new detail-data asset pools: room photos (by kind), before photos, list hero ----
  const roomKinds = ["living", "kitchen", "bath", "bedroom", "entry"] as const;
  const roomPalettes: Record<(typeof roomKinds)[number], string[]> = {
    living: ["#d9d4cc", "#c4a98f", "#8f9a86"],
    kitchen: ["#e6e0d4", "#b9c2b0", "#a9b4bf"],
    bath: ["#c8cfd2", "#a9b4bf", "#8f9a86"],
    bedroom: ["#d8c7b5", "#c4a98f", "#d9d4cc"],
    entry: ["#b9c2b0", "#8f9a86", "#c8cfd2"],
  };
  let roomSeed = 2000;
  for (const kind of roomKinds) {
    for (let n = 1; n <= 6; n++) {
      const id = `room-${kind}-${pad(n, 2)}`;
      assets.push({ id, file: `${id}.svg`, mediaType: "image/svg+xml", width: 800, height: 600 });
      files[`assets/${id}.svg`] = roomSvg(roomSeed++, kind, roomPalettes[kind]);
    }
  }
  for (let n = 1; n <= 8; n++) {
    const id = `before-${pad(n, 2)}`;
    assets.push({ id, file: `${id}.svg`, mediaType: "image/svg+xml", width: 800, height: 600 });
    files[`assets/${id}.svg`] = beforeSvg(3000 + n);
  }
  assets.push({ id: "portfolio-hero", file: "portfolio-hero.svg", mediaType: "image/svg+xml", width: 1600, height: 500 });
  files["assets/portfolio-hero.svg"] = heroSvg(3900, palette);

  // ---- Step 5 homepage media (fictional scenes): hero slides, intro, review banner, closing band ----
  const homeMedia: [id: string, w: number, h: number, seed: number][] = [
    ["hero-01", 1920, 1080, 9101],
    ["hero-02", 1920, 1080, 9102],
    ["hero-03", 1920, 1080, 9103],
    ["hero-draft", 1920, 1080, 9104],
    ["intro-studio", 1020, 1200, 9105],
    ["reviews-banner", 1600, 480, 9106],
    ["band-closing", 1920, 760, 9107],
  ];
  for (const [id, w, h, seed] of homeMedia) {
    assets.push({ id, file: `${id}.svg`, mediaType: "image/svg+xml", width: w, height: h });
    files[`assets/${id}.svg`] = sceneSvg(seed, w, h, palette);
  }

  const projects: FixtureProject[] = [];
  const base = Date.UTC(2024, 0, 8, 9, 0, 0);
  for (let i = 1; i <= 176; i++) {
    const category = categories[i % 3]!;
    const place = places[Math.floor(r() * places.length)]!;
    const kind = kinds[Math.floor(r() * kinds.length)]!;
    const title = `${place} ${category.name} — ${kind}`;
    // Every 25th project shares its predecessor's publishedAt: exercises the id tie-breaker.
    const day = i % 25 === 0 ? i - 2 : i - 1;
    const status: FixtureProject["status"] = i === 40 || i === 90 ? "draft" : "published";
    const publishedAt = i === 176 ? "2031-01-01T00:00:00Z" : new Date(base + day * 3 * 86_400_000).toISOString().replace(".000Z", "Z");
    projects.push({
      id: `hp-${pad(i)}`,
      slug: `${slugify(`${place} ${category.name}`)}-${pad(i)}`,
      title,
      status,
      publishedAt,
      category: category.id,
      cover: { asset: `cover-${pad(((i - 1) % 24) + 1, 2)}`, alt: `Illustration of the ${category.name.toLowerCase()} at ${place}` },
    });
  }

  // ---- Step 4 detail data (separate seeded PRNG; `r` above stays untouched / unaffected). ----
  const SUMMARY_EN = [
    "A calm renovation that opens up everyday living without losing warmth.",
    "A considered refresh that balances soft light, natural materials, and quiet storage.",
    "A full remodel built around slow mornings and easy gatherings.",
    "A light-filled update that keeps the original character of the home.",
    "A practical remodel focused on function first, comfort close behind.",
    "A gentle refresh that lets natural textures do most of the talking.",
    "A considered layout change that gives the kitchen room to breathe.",
    "A warm, low-key remodel designed around a growing family's routine.",
    "A compact remodel that finds calm through careful editing.",
    "A bright update that trades clutter for a few honest materials.",
    "A patient renovation that reworks the flow without touching the bones of the house.",
    "A modest-budget remodel that still finds room for one good detail.",
  ];
  const BODY_EN = [
    "The brief was simple: keep what already worked and quietly fix what didn't. We started with the layout, moving one wall to let morning light reach the back of the room, then let the material choices follow from there.",
    "Storage was the first problem to solve. A run of built-in joinery now hides everyday clutter behind a single continuous face, so the room reads as calm even on a busy week.",
    "We kept the palette narrow on purpose: two wall tones, one floor finish, and a single accent colour repeated in small doses through the space.",
    "The kitchen moved to the far wall, opening a clear line of sight from the entry through to the living area. It is a small change that makes the whole floor feel larger.",
    "Existing windows were left untouched, but new interior sightlines were planned around them, so daylight now reaches rooms that used to stay dim through the afternoon.",
    "A previous renovation had chopped the plan into small, disconnected rooms. Removing two non-structural partitions gave the household one continuous space to live in.",
    "Lighting was treated as a layer of its own: a soft general wash for evenings, task lighting over the counters, and one warm accent lamp that stays on after everyone else has gone to bed.",
    "The client asked for a space that would still feel calm with children running through it, so surfaces were chosen for durability first and polish second.",
    "Original flooring was patched rather than replaced where it could be saved, which kept a little of the home's earlier life visible under the new furniture.",
    "A small reading nook was added into what used to be dead space beside the stairs, finished in the same tone as the joinery so it disappears into the plan.",
    "The bathroom was rebuilt around a single wet-room shower, trading a rarely used tub for a layout that actually suits how the household uses the space day to day.",
    "We worked in phases so the household could keep living in the home throughout, finishing common areas first and bedrooms last.",
  ];
  const LOCATIONS_EN = ["Harbor District", "North Quay", "Elm Heights", "Mill Quarter", "Aster Bay", "Linden Park"];
  const SCOPES_EN = ["Living room", "Kitchen", "Bathroom", "Bedroom", "Entry", "Balcony", "Study"];
  const KEYWORDS_EN = ["Warm wood", "Hidden storage", "Open kitchen", "Terrazzo", "Soft lighting", "Built-in joinery", "Natural stone", "Pale oak"];
  const GALLERY_GROUPS_EN: { name: string; kind: (typeof roomKinds)[number] }[] = [
    { name: "Living room", kind: "living" },
    { name: "Kitchen", kind: "kitchen" },
    { name: "Bathroom", kind: "bath" },
    { name: "Bedroom", kind: "bedroom" },
    { name: "Entry", kind: "entry" },
  ];
  const QUOTES_EN: Record<string, CustomerQuote> = {
    "hp-0174": {
      text: "We didn't expect a renovation to feel this calm. The team listened first and it shows in every room.",
      attribution: "A fictional client (fixture data)",
    },
    "hp-0150": {
      text: "Every small decision made the mornings easier, from where the light falls to where we keep our shoes.",
      attribution: "A fictional client (fixture data)",
    },
    "hp-0140": {
      text: "The house finally matches how we actually live in it, not how we thought we were supposed to.",
      attribution: "A fictional client (fixture data)",
    },
  };

  const d = mulberry32(4173);
  const kindCounters: Record<string, number> = { living: 0, kitchen: 0, bath: 0, bedroom: 0, entry: 0 };
  const nextRoomAsset = (kind: string) => {
    const n = (kindCounters[kind]! % 6) + 1;
    kindCounters[kind]! += 1;
    return `room-${kind}-${pad(n, 2)}`;
  };
  let beforeCounter = 0;
  const nextBeforeAsset = () => {
    const n = (beforeCounter % 8) + 1;
    beforeCounter += 1;
    return `before-${pad(n, 2)}`;
  };

  for (const p of projects) {
    if (p.id !== "hp-0172") p.summary = SUMMARY_EN[Math.floor(d() * SUMMARY_EN.length)]!;
    if (d() < 0.85) p.body = pickUnique(d, BODY_EN, 1 + Math.floor(d() * 3));
    if (d() < 0.9) p.location = LOCATIONS_EN[Math.floor(d() * LOCATIONS_EN.length)]!;
    if (d() < 0.9) p.area = { value: int(d, 45, 180), unit: "m2" };
    if (d() < 0.7) p.builtYear = int(d, 1978, 2022);
    if (d() < 0.8) p.scope = pickUnique(d, SCOPES_EN, int(d, 1, 5));
    if (d() < 0.7) {
      const so = Math.floor(d() * 36);
      const startY = 2023 + Math.floor(so / 12);
      const startM = (so % 12) + 1;
      const end = monthAdd(startY, startM, int(d, 1, 4));
      p.period = { start: ym(startY, startM), end: ym(end.y, end.m) };
    }
    if (d() < 0.7) p.durationWeeks = int(d, 3, 20);
    const kw = d();
    if (kw < 0.6) p.keywords = pickUnique(d, KEYWORDS_EN, int(d, 1, 4));
    else if (kw < 0.75) p.keywords = [];
    if (d() < 0.6) p.pricePerArea = { amount: int(d, 900, 3200), currency: "USD", unit: "m2" };
    if (d() < 0.9) {
      const groupDefs = pickUnique(d, GALLERY_GROUPS_EN, int(d, 2, 5));
      const groups: GalleryGroup[] = groupDefs.map((g) => {
        const itemCount = int(d, 2, 9);
        const items: GalleryItem[] = [];
        for (let k = 1; k <= itemCount; k++) items.push({ image: { asset: nextRoomAsset(g.kind), alt: `${g.name}, photo ${k}` } });
        return { name: g.name, items };
      });
      p.galleryGroups = groups;
      if (d() < 0.1667) {
        const flat: { item: GalleryItem; groupName: string; k: number }[] = [];
        for (const g of groups) g.items.forEach((it, idx) => flat.push({ item: it, groupName: g.name, k: idx + 1 }));
        for (const c of pickUnique(d, flat, Math.min(int(d, 1, 3), flat.length))) {
          c.item.before = { asset: nextBeforeAsset(), alt: `${c.groupName} before the renovation, photo ${c.k}` };
        }
      }
    }
  }

  // Exactly 3 customer quotes: hp-0174 (designated override below) + two others in the
  // first 60 by recency (hp-0150 is rank 28, hp-0140 is rank 37 of 176 by publishedAt desc).
  for (const id of ["hp-0150", "hp-0140"]) {
    const proj = projects.find((p) => p.id === id)!;
    proj.customerQuote = QUOTES_EN[id]!;
  }

  // ---- Designated overrides (apply AFTER random generation; replace fields entirely) ----
  {
    const p174 = projects.find((p) => p.id === "hp-0174")!;
    const living174: GalleryItem[] = [];
    for (let k = 1; k <= 10; k++) living174.push({ image: { asset: nextRoomAsset("living"), alt: `Living room, photo ${k}` } });
    living174[0]!.before = { asset: nextBeforeAsset(), alt: "Living room before the renovation, photo 1" };
    living174[2]!.before = { asset: nextBeforeAsset(), alt: "Living room before the renovation, photo 3" };
    const kitchen174: GalleryItem[] = [];
    for (let k = 1; k <= 6; k++) kitchen174.push({ image: { asset: nextRoomAsset("kitchen"), alt: `Kitchen, photo ${k}` } });
    kitchen174[1]!.before = { asset: nextBeforeAsset(), alt: "Kitchen before the renovation, photo 2" };
    const bath174: GalleryItem[] = [];
    for (let k = 1; k <= 3; k++) bath174.push({ image: { asset: nextRoomAsset("bath"), alt: `Bathroom, photo ${k}` } });
    const bedroom174: GalleryItem[] = [];
    for (let k = 1; k <= 4; k++) bedroom174.push({ image: { asset: nextRoomAsset("bedroom"), alt: `Bedroom, photo ${k}` } });

    p174.summary = "A full renovation that reopens the ground floor to daylight while keeping the home's original warmth.";
    p174.body = [
      "This project started as a modest refresh and grew into a full renovation once we opened the ceiling and found good bones worth keeping. The plan now reads as one continuous space from the entry to the kitchen.",
      "Every material choice was made to age well rather than to photograph well: solid oak, honed stone, and a single warm metal finish repeated throughout the home.",
    ];
    p174.location = "Harbor District";
    p174.area = { value: 128, unit: "m2" };
    p174.builtYear = 2004;
    p174.scope = ["Living room", "Kitchen", "Bathroom", "Bedroom", "Entry"];
    p174.period = { start: "2024-03", end: "2024-08" };
    p174.durationWeeks = 18;
    p174.keywords = ["Warm wood", "Open kitchen", "Natural stone"];
    p174.pricePerArea = { amount: 2400, currency: "USD", unit: "m2" };
    p174.galleryGroups = [
      { name: "Living room", items: living174 },
      { name: "Kitchen", items: kitchen174 },
      { name: "Bathroom", items: bath174 },
      { name: "Bedroom", items: bedroom174 },
    ];
    p174.customerQuote = QUOTES_EN["hp-0174"]!;

    const p175 = projects.find((p) => p.id === "hp-0175")!;
    const living175: GalleryItem[] = [];
    for (let k = 1; k <= 5; k++) living175.push({ image: { asset: nextRoomAsset("living"), alt: `Living room, photo ${k}` } });
    const kitchen175: GalleryItem[] = [];
    for (let k = 1; k <= 4; k++) kitchen175.push({ image: { asset: nextRoomAsset("kitchen"), alt: `Kitchen, photo ${k}` } });
    const entry175: GalleryItem[] = [];
    for (let k = 1; k <= 2; k++) entry175.push({ image: { asset: nextRoomAsset("entry"), alt: `Entry, photo ${k}` } });

    p175.summary = "A light structural refresh that reorganises storage without changing the footprint.";
    p175.body = [
      "The household needed more storage, not more square footage. We rebuilt the entry and kitchen joinery to absorb everything that used to live on the counters.",
    ];
    p175.location = "North Quay";
    p175.area = { value: 76, unit: "m2" };
    p175.scope = ["Living room", "Kitchen", "Entry"];
    p175.durationWeeks = 9;
    p175.galleryGroups = [
      { name: "Living room", items: living175 },
      { name: "Kitchen", items: kitchen175 },
      { name: "Entry", items: entry175 },
    ];
    delete p175.builtYear;
    delete p175.period;
    delete p175.keywords;
    delete p175.pricePerArea;
    delete p175.customerQuote;

    const p173 = projects.find((p) => p.id === "hp-0173")!;
    p173.summary = "A record kept to exercise the platform's tolerance for extreme, in-contract values.";
    p173.pricePerArea = { amount: 987654321.5, currency: "USD", unit: "m2" };
    p173.area = { value: 99999, unit: "m2" };
    p173.keywords = [];
    p173.galleryGroups = [
      {
        name: "Living room",
        items: [
          { image: { asset: nextRoomAsset("living"), alt: "Living room, photo 1" } },
          { image: { asset: nextRoomAsset("living"), alt: "Living room, photo 2" } },
        ],
      },
    ];
    delete p173.body;
    delete p173.location;
    delete p173.builtYear;
    delete p173.scope;
    delete p173.period;
    delete p173.durationWeeks;
    delete p173.customerQuote;

    const p172 = projects.find((p) => p.id === "hp-0172")!;
    delete p172.summary;
    delete p172.body;
    delete p172.location;
    delete p172.area;
    delete p172.builtYear;
    delete p172.scope;
    delete p172.period;
    delete p172.durationWeeks;
    delete p172.keywords;
    delete p172.pricePerArea;
    delete p172.galleryGroups;
    delete p172.customerQuote;
  }

  // ---- Step 5: PROVISIONAL hero slides (banners) + reviews. Clearly fictional fixture data. ----
  const banners = [
    {
      id: "calm-rooms",
      status: "published",
      image: { asset: "hero-01" },
      headline: "Calm rooms for everyday living",
      text: "Renovation stories from a fictional fixture studio.",
      cta: { label: "View the project", target: { kind: "project", project: "hp-0174" } },
    },
    {
      id: "planned-kitchens",
      status: "published",
      image: { asset: "hero-02" },
      headline: "Kitchens planned around how you cook",
      cta: { label: "Get in touch", target: { kind: "contact" } },
    },
    // image-only slide (no copy, no CTA)
    { id: "quiet-materials", status: "published", image: { asset: "hero-03", alt: "Illustration of a sunlit room with a low sofa" } },
    // leak probe: a draft slide must never reach a public build
    { id: "draft-slide", status: "draft", image: { asset: "hero-draft" }, headline: "Unpublished fixture slide" },
  ];
  const reviews = [
    { id: "rv-01", status: "published", text: "They listened before they drew anything, and the plan fit our routine from the first week.", attribution: "A fictional client (fixture data)" },
    { id: "rv-02", status: "published", text: "Weekly updates, no surprises on site, and a kitchen that finally has room for two cooks.", attribution: "A fictional client (fixture data)" },
    { id: "rv-03", status: "published", text: "Small flat, big difference. The storage wall alone changed how the whole place feels.", attribution: "A fictional client (fixture data)" },
    { id: "rv-04", status: "published", text: "We lived at home through the whole remodel and it never felt chaotic.", attribution: "A fictional client (fixture data)" },
    { id: "rv-05", status: "published", text: "The light in the living room is the best part. We did not know the house could feel this open.", attribution: "A fictional client (fixture data)" },
    { id: "rv-06", status: "published", text: "Clear budget, clear schedule, and a bathroom we actually enjoy using.", attribution: "A fictional client (fixture data)" },
    { id: "rv-07", status: "published", text: "A seventh fictional review that the homepage limit of six leaves out.", attribution: "A fictional client (fixture data)" },
    // leak probe: a draft review must never reach a public build
    { id: "rv-draft", status: "draft", text: "Unpublished fixture review awaiting the client's consent." },
  ];

  assertFullyReferenced(
    "fixture-large",
    projects,
    assets.map((a) => a.id),
    ["logo", "portfolio-hero", ...banners.map((b) => b.image.asset), "intro-studio", "reviews-banner", "band-closing"],
  );

  await writeSite("fixture-large", {
    "site.json": json({
      schemaVersion: 1,
      siteId: "fixture-large",
      identity: {
        brandName: "Harbor & Pine Studio",
        legalName: "Harbor & Pine Studio Ltd. (fictional fixture company)",
        publicOrigin: "https://fixture-large.example",
        locale: "en-US",
        logo: "logo",
      },
      template: pin,
      theme: { base: "template-default" },
    }),
    // Filters (1.2.0): the site's prices are USD per m² → the matching vertical price scale.
    // Homepage (1.3.0): projects A keeps the default (latest 8); projects B = a hand-picked
    // archive set from the SAME collection (manual ids, disjoint from A).
    "settings.json": json({
      schemaVersion: 1,
      templateId: "interior-01",
      overrides: {
        "home.projects-b": { enabled: true, limit: 6, selection: { mode: "manual", ids: ["hp-0150", "hp-0140", "hp-0125", "hp-0112", "hp-0101", "hp-0088"] } },
        "portfolio.index": { priceScale: "usd-m2" },
      },
    }),
    // Slot proof: title keeps the neutral default; description is a site value.
    "slots.json": json({
      schemaVersion: 1,
      templateId: "interior-01",
      values: {
        "home.intro": {
          title: "A small studio for calm, lived-in homes",
          body: {
            paragraphs: [
              "Harbor & Pine is a fictional residential studio used as a platform fixture. Every project, photo and review on this site is invented test data.",
              "We plan the layout first, then choose a few honest materials and let daylight do the rest.",
            ],
          },
          // an operator-chosen destination (§21), not a Template route: the studio's own inbox
          link: { label: "Write to the studio", href: "mailto:hello@fixture-large.example" },
          media: { asset: "intro-studio", alt: "Illustration of a bright living room with a tall window" },
        },
        "home.projects-a": {
          description: { paragraphs: ["Recent homes from our fictional fixture portfolio, newest first."] },
        },
        "home.projects-b": {
          title: "From the archive",
          description: { paragraphs: ["A hand-picked set of earlier fictional fixture projects."] },
        },
        "home.reviews": {
          media: { asset: "reviews-banner", alt: "" },
        },
        "home.image-band": {
          media: { asset: "band-closing", alt: "Illustration of a quiet living room at dusk" },
        },
        "portfolio.index": {
          description: { paragraphs: ["Every home in our fictional fixture portfolio, newest first."] },
          heroImage: { asset: "portfolio-hero", alt: "Abstract illustration of a calm, light interior" },
        },
      },
    }),
    "content/business.json": json({
      schema: "business@1",
      origin: "synthetic-fixture",
      data: {
        summary: "A fictional residential interior studio used as a platform fixture. Not a real business.",
        contact: { email: "hello@fixture-large.example" },
      },
    }),
    "content/categories.json": json({ schema: "categories@1", origin: "synthetic-fixture", items: categories }),
    "content/projects.json": json({ schema: "projects@1", origin: "synthetic-fixture", items: projects }),
    "content/banners.json": json({ schema: "banners@1", origin: "synthetic-fixture", items: banners }),
    "content/reviews.json": json({ schema: "reviews@1", origin: "synthetic-fixture", items: reviews }),
    "assets/registry.json": json({ schema: "assets@1", origin: "synthetic-fixture", items: assets }),
    ...files,
  });
}

// ------------------------------------------------------------ fixture-small --
{
  const palette = ["#efe4d6", "#e2c9ae", "#c98f6b", "#8c5a3c", "#f6efe6", "#b67b56", "#d9b99b"];
  const categories = [
    { id: "residential", name: "주거" },
    { id: "commercial", name: "상업" },
  ];
  const titles = [
    ["residential", "가상의 한옥 거실 개조"],
    ["commercial", "가상의 골목 카페 인테리어"],
    ["residential", "가상의 아파트 주방 리모델링"],
    ["residential", "가상의 원룸 수납 설계"],
    ["commercial", "가상의 작은 서점 공간"],
    ["residential", "가상의 테라스 하우스 욕실"],
    ["commercial", "가상의 공유 오피스 라운지"],
    ["residential", "가상의 복층 침실 조명"],
    ["residential", "가상의 신혼집 전체 시공"],
    ["commercial", "가상의 베이커리 매장"],
    ["residential", "가상의 아이방 리뉴얼"],
    ["commercial", "가상의 요가 스튜디오"],
  ] as const;
  const assets: { id: string; file: string; mediaType: "image/svg+xml"; width: number; height: number }[] = [];
  const files: Record<string, string> = {};
  const projects: FixtureProject[] = titles.map(([category, title], idx) => {
    const i = idx + 1;
    const id = `cover-${pad(i, 2)}`;
    assets.push({ id, file: `${id}.svg`, mediaType: "image/svg+xml", width: 800, height: 600 });
    files[`assets/${id}.svg`] = coverSvg(5000 + i, palette);
    return {
      id: `maru-${pad(i, 3)}`,
      slug: `maru-project-${pad(i, 3)}`,
      title,
      status: "published",
      publishedAt: new Date(Date.UTC(2025, 2, 1) + i * 14 * 86_400_000).toISOString().replace(".000Z", "Z"),
      category,
      cover: { asset: id },
    };
  });

  // ---- new detail-data asset pools: mixed-kind room photos + before photos (own palette) ----
  const roomKindCycleKo = ["living", "kitchen", "bath", "bedroom", "entry"] as const;
  for (let n = 1; n <= 15; n++) {
    const id = `room-${pad(n, 2)}`;
    const kind = roomKindCycleKo[(n - 1) % roomKindCycleKo.length]!;
    assets.push({ id, file: `${id}.svg`, mediaType: "image/svg+xml", width: 800, height: 600 });
    files[`assets/${id}.svg`] = roomSvg(6000 + n, kind, palette);
  }
  for (let n = 1; n <= 4; n++) {
    const id = `before-${pad(n, 2)}`;
    assets.push({ id, file: `${id}.svg`, mediaType: "image/svg+xml", width: 800, height: 600 });
    files[`assets/${id}.svg`] = beforeSvg(7000 + n);
  }
  // ---- Step 5 homepage media (warm palette): two hero slides, intro, closing band ----
  const homeMediaKo: [id: string, w: number, h: number, seed: number][] = [
    ["hero-01", 1920, 1080, 9201],
    ["hero-02", 1920, 1080, 9202],
    ["intro-media", 1020, 1200, 9203],
    ["band", 1920, 760, 9204],
  ];
  for (const [id, w, h, seed] of homeMediaKo) {
    assets.push({ id, file: `${id}.svg`, mediaType: "image/svg+xml", width: w, height: h });
    files[`assets/${id}.svg`] = sceneSvg(seed, w, h, palette);
  }

  // ---- Step 4 detail data (own separate seeded PRNG). ----
  const SUMMARY_KO = [
    "군더더기를 덜어내고 채광을 살린 가상의 리모델링입니다.",
    "가족의 아침 루틴에 맞춰 동선을 다시 짠 가상의 공간입니다.",
    "기존 구조를 살리면서 수납을 새로 정리한 가상의 프로젝트입니다.",
    "따뜻한 마감재로 톤을 통일한 가상의 리노베이션입니다.",
    "좁은 면적을 넓어 보이게 재구성한 가상의 시공 사례입니다.",
    "오래된 자재를 최대한 살려 완성한 가상의 리모델링입니다.",
    "작은 서재 공간을 더해 완성한 가상의 인테리어입니다.",
    "차분한 색감으로 정리한 가상의 상업 공간 사례입니다.",
    "동선을 단순화해 일상이 편해진 가상의 리모델링입니다.",
    "빛이 잘 들도록 창가 배치를 바꾼 가상의 프로젝트입니다.",
  ];
  const BODY_KO = [
    "처음에는 작은 보수로 시작했지만, 구조를 살펴보니 벽 하나를 옮기는 편이 훨씬 낫겠다는 판단이 섰습니다. 그 결과 현관에서 거실까지 이어지는 동선이 한결 자연스러워졌습니다.",
    "수납 공간이 가장 큰 고민이었습니다. 벽면을 따라 붙박이 가구를 새로 짜 넣어, 평소에는 보이지 않는 곳에 살림을 정리할 수 있게 했습니다.",
    "색은 최대한 아끼기로 했습니다. 벽 두 가지, 바닥 한 가지, 포인트 색 하나만으로 공간 전체의 톤을 맞췄습니다.",
    "기존 창호는 그대로 두되, 그 빛이 안쪽 공간까지 닿을 수 있도록 내부 배치를 다시 짰습니다.",
    "예전 리모델링에서 나뉘어 있던 작은 방들을 정리해, 비내력벽 두 곳을 없애고 하나의 열린 공간으로 만들었습니다.",
    "조명은 따로 층을 나눠 계획했습니다. 저녁에는 은은한 전체 조명을, 작업대 위에는 집중 조명을, 모두가 잠든 뒤에는 따뜻한 보조등 하나만 남깁니다.",
    "아이가 뛰어다녀도 편안한 공간을 원한다는 요청에 맞춰, 마감재는 멋보다 내구성을 먼저 고려해 골랐습니다.",
    "기존 바닥재는 살릴 수 있는 만큼 보수해서 그대로 사용했습니다. 덕분에 새 가구 아래로 이전 공간의 흔적이 조금 남아 있습니다.",
    "계단 옆 자투리 공간에 작은 서재를 더했습니다. 가구와 같은 톤으로 마감해 전체 동선에서 자연스럽게 묻히도록 했습니다.",
    "공사 기간에도 가족이 계속 지낼 수 있도록 구역을 나눠 순서대로 진행했습니다. 공용 공간을 먼저 마치고 침실은 마지막에 정리했습니다.",
  ];
  const LOCATION_KO = ["가상시 동구", "가상시 해안로", "가상시 중앙로", "가상시 서구", "가상시 신도심", "가상시 하늘길"];
  const SCOPE_KO = ["거실", "주방", "욕실", "침실", "현관", "발코니"];
  const KEYWORDS_KO = ["원목 마감", "숨은 수납", "밝은 조명", "대리석", "미니멀"];
  const GALLERY_GROUP_NAMES_KO = ["거실", "주방", "욕실", "침실", "현관"];
  const QUOTE_KO_012: CustomerQuote = {
    text: "우리 가족이 실제로 사는 방식에 맞춰 공간을 다시 짜 주셔서 매일이 훨씬 편해졌습니다.",
    attribution: "가상의 의뢰인 (픽스처)",
  };

  const d = mulberry32(8173);
  let smallRoomCounter = 0;
  const nextSmallRoomAsset = () => {
    const n = (smallRoomCounter % 15) + 1;
    smallRoomCounter += 1;
    return `room-${pad(n, 2)}`;
  };
  let smallBeforeCounter = 0;
  const nextSmallBeforeAsset = () => {
    const n = (smallBeforeCounter % 4) + 1;
    smallBeforeCounter += 1;
    return `before-${pad(n, 2)}`;
  };

  // Exactly 3 projects use "pyeong" (deterministic seeded pick, not a fixed id list).
  const pyeongIds = new Set(pickUnique(d, projects.map((p) => p.id), 3));
  // Forced (not left to chance): the two designated projects, plus two extras that
  // guarantee full before-01..04 coverage together with maru-012's 2 pairs below.
  const forcedGalleryIds = new Set(["maru-004", "maru-008", "maru-011", "maru-012"]);

  for (const p of projects) {
    p.summary = SUMMARY_KO[Math.floor(d() * SUMMARY_KO.length)]!;
    if (d() < 0.85) p.body = pickUnique(d, BODY_KO, 1 + Math.floor(d() * 3));
    if (d() < 0.85) p.location = LOCATION_KO[Math.floor(d() * LOCATION_KO.length)]!;
    if (pyeongIds.has(p.id)) {
      p.area = { value: int(d, 18, 40), unit: "pyeong" };
    } else if (d() < 0.9) {
      p.area = { value: int(d, 59, 135), unit: "m2" };
    }
    if (d() < 0.8) p.scope = pickUnique(d, SCOPE_KO, int(d, 1, 5));
    const kw = d();
    if (p.id === "maru-006") p.keywords = [];
    else if (kw < 0.5) p.keywords = pickUnique(d, KEYWORDS_KO, int(d, 1, 4));
    if (d() < 0.8) p.pricePerArea = { amount: int(d, 1_800_000, 3_500_000), currency: "KRW", unit: "pyeong" };
    if (d() < 0.7) p.durationWeeks = int(d, 3, 20);
    if (d() < 0.5) {
      const so = Math.floor(d() * 36);
      const startY = 2023 + Math.floor(so / 12);
      const startM = (so % 12) + 1;
      const end = monthAdd(startY, startM, int(d, 1, 4));
      p.period = { start: ym(startY, startM), end: ym(end.y, end.m) };
    }
    if (d() < 0.85 || forcedGalleryIds.has(p.id)) {
      const groupNames = pickUnique(d, GALLERY_GROUP_NAMES_KO, int(d, 2, 4));
      const groups: GalleryGroup[] = groupNames.map((name) => {
        const itemCount = int(d, 2, 6);
        const items: GalleryItem[] = [];
        for (let k = 1; k <= itemCount; k++) items.push({ image: { asset: nextSmallRoomAsset(), alt: `${name} 사진 ${k}` } });
        return { name, items };
      });
      p.galleryGroups = groups;
      if (p.id === "maru-004" || p.id === "maru-008") {
        const g0 = groups[0]!;
        g0.items[0]!.before = { asset: nextSmallBeforeAsset(), alt: `${g0.name} 리모델링 전 사진 1` };
      }
    }
  }

  // Designated: maru-012 (newest) — 2 before/after pairs + Korean quote.
  // maru-011 — no before anywhere, no customerQuote. No other project has a quote.
  {
    const p012 = projects.find((p) => p.id === "maru-012")!;
    let groups012 = p012.galleryGroups;
    if (!groups012 || groups012.length === 0) {
      groups012 = [{ name: "거실", items: [] }];
      p012.galleryGroups = groups012;
    }
    const flat012: { item: GalleryItem; groupName: string; k: number }[] = [];
    for (const g of groups012) g.items.forEach((it, idx) => flat012.push({ item: it, groupName: g.name, k: idx + 1 }));
    while (flat012.length < 2) {
      const g0 = groups012[0]!;
      const extra: GalleryItem = { image: { asset: nextSmallRoomAsset(), alt: `${g0.name} 사진 ${g0.items.length + 1}` } };
      g0.items.push(extra);
      flat012.push({ item: extra, groupName: g0.name, k: g0.items.length });
    }
    flat012[0]!.item.before = { asset: nextSmallBeforeAsset(), alt: `${flat012[0]!.groupName} 리모델링 전 사진 ${flat012[0]!.k}` };
    flat012[1]!.item.before = { asset: nextSmallBeforeAsset(), alt: `${flat012[1]!.groupName} 리모델링 전 사진 ${flat012[1]!.k}` };
    p012.customerQuote = QUOTE_KO_012;

    const p011 = projects.find((p) => p.id === "maru-011")!;
    for (const g of p011.galleryGroups ?? []) for (const it of g.items) delete it.before;
    delete p011.customerQuote;
  }

  // ---- Step 5: PROVISIONAL hero slides (banners) + reviews, Korean, clearly fictional. ----
  const bannersKo = [
    {
      id: "warm-light",
      status: "published",
      image: { asset: "hero-01" },
      headline: "빛이 오래 머무는 가상의 집",
      text: "플랫폼 검증용 가상 스튜디오의 작업을 소개합니다.",
      cta: { label: "프로젝트 보기", target: { kind: "project", project: "maru-011" } },
    },
    {
      id: "talk-first",
      status: "published",
      image: { asset: "hero-02" },
      headline: "공간 고민을 먼저 들려주세요",
      cta: { label: "상담 문의", target: { kind: "contact" } },
    },
  ];
  const reviewsKo = [
    { id: "rv-01", status: "published", text: "처음 상담부터 우리 가족의 생활 방식을 먼저 물어봐 주셔서 믿음이 갔습니다.", attribution: "가상의 의뢰인 (픽스처)" },
    { id: "rv-02", status: "published", text: "공사 기간 내내 진행 상황을 꼼꼼히 알려 주셔서 걱정 없이 기다릴 수 있었습니다.", attribution: "가상의 의뢰인 (픽스처)" },
    { id: "rv-03", status: "published", text: "작은 카페였는데 동선이 정리되니 손님도 직원도 훨씬 편해졌어요.", attribution: "가상의 의뢰인 (픽스처)" },
  ];

  assertFullyReferenced(
    "fixture-small",
    projects,
    assets.map((a) => a.id),
    [...bannersKo.map((b) => b.image.asset), "intro-media", "band"],
  );

  await writeSite("fixture-small", {
    "site.json": json({
      schemaVersion: 1,
      siteId: "fixture-small",
      identity: {
        brandName: "마루 아틀리에 (가상)",
        legalName: "가상 마루 아틀리에 (픽스처 회사)",
        publicOrigin: "https://fixture-small.example",
        locale: "ko-KR",
      },
      template: pin,
      theme: { base: "template-default" },
    }),
    "settings.json": json({
      schemaVersion: 1,
      templateId: "interior-01",
      overrides: {
        "home.projects-a": { limit: 4, selection: { mode: "category", category: "residential" } },
        // Homepage (1.3.0): projects B = the other category of the SAME collection.
        "home.projects-b": { enabled: true, limit: 4, selection: { mode: "category", category: "commercial" } },
        "home.reviews": { limit: 4 },
        // Filters (1.2.0): Korean market units — 평 area buckets, KRW per 평 price buckets.
        "portfolio.index": { areaScale: "pyeong", priceScale: "krw-pyeong" },
      },
    }),
    "slots.json": json({
      schemaVersion: 1,
      templateId: "interior-01",
      values: {
        "site.header": { homeLinkLabel: "홈", projectsNavLabel: "프로젝트", contactLabel: "문의하기" },
        "site.footer": { companyLabel: "상호", emailLabel: "이메일" },
        "home.hero": {
          label: "주요 소식",
          previousLabel: "이전 슬라이드",
          nextLabel: "다음 슬라이드",
          pauseLabel: "자동 넘김 멈춤",
          playLabel: "자동 넘김 재생",
          slideLabelFormat: "{total}장 중 {n}번째",
        },
        "home.intro": {
          title: "생활에 맞춘 공간을 함께 그립니다",
          body: {
            paragraphs: [
              "마루 아틀리에는 플랫폼 검증을 위한 가상의 스튜디오입니다. 이 사이트의 프로젝트, 사진, 후기는 모두 픽스처 데이터입니다.",
              "먼저 생활 동선을 살피고, 꼭 필요한 재료만 골라 차분한 공간을 만듭니다.",
            ],
          },
          link: { label: "메일로 문의하기", href: "mailto:studio@fixture-small.example" },
          media: { asset: "intro-media", alt: "따뜻한 색감의 거실을 그린 일러스트" },
        },
        "home.projects-a": {
          title: "주거 공간 프로젝트",
          description: { paragraphs: ["가상의 주거 공간 작업 중 최근 네 곳을 소개합니다."] },
          moreLabel: "전체 프로젝트 보기",
          previousLabel: "이전 프로젝트",
          nextLabel: "다음 프로젝트",
        },
        "home.projects-b": {
          title: "상업 공간 프로젝트",
          description: { paragraphs: ["가상의 카페, 서점, 스튜디오 작업을 모았습니다."] },
          moreLabel: "전체 프로젝트 보기",
          previousLabel: "이전 프로젝트",
          nextLabel: "다음 프로젝트",
        },
        "home.reviews": { title: "고객 후기", previousLabel: "이전 후기", nextLabel: "다음 후기" },
        "home.image-band": { media: { asset: "band", alt: "" } },
        "site.floating-cta": { label: "상담 문의" },
        "portfolio.index": {
          title: "프로젝트",
          description: { paragraphs: ["가상의 스튜디오가 완성한 공간을 모두 모았습니다."] },
          pageLabel: "페이지",
          previousLabel: "이전 페이지",
          nextLabel: "다음 페이지",
          paginationLabel: "페이지 이동",
          filterLabel: "필터",
          searchLabel: "프로젝트 검색",
          searchPlaceholder: "프로젝트명, 지역, 스타일 검색",
          typeLabel: "유형",
          areaLabel: "평형",
          styleLabel: "스타일",
          priceLabel: "평당 비용",
          sortLabel: "정렬",
          sortNewest: "최신 순",
          sortOldest: "오래된 순",
          sortAreaDesc: "넓은 평형 순",
          sortAreaAsc: "좁은 평형 순",
          sortPriceDesc: "높은 가격 순",
          sortPriceAsc: "낮은 가격 순",
          resetLabel: "초기화",
          resultCountFormat: "프로젝트 {n}개",
          resultCountFormatOne: "프로젝트 {n}개",
          emptyTitle: "조건에 맞는 프로젝트가 없습니다",
          emptyBody: "필터를 줄이거나 다른 검색어를 입력해 보세요.",
        },
        "portfolio.detail": {
          backLabel: "프로젝트 목록",
          roomsLabel: "공간",
          beforeLabel: "시공 전",
          afterLabel: "시공 후",
          showMoreLabel: "사진 모두 보기",
          showLessLabel: "사진 접기",
          bodyTitle: "프로젝트 이야기",
          quoteTitle: "의뢰인의 말",
          locationLabel: "지역",
          areaLabel: "면적",
          categoryLabel: "유형",
          builtYearLabel: "건물 준공",
          scopeLabel: "작업 공간",
          periodLabel: "진행 기간",
          durationLabel: "공사 기간",
          durationFormat: "{n}주",
          durationFormatOne: "{n}주",
          keywordsLabel: "스타일",
          priceLabel: "면적당 비용",
          ctaPrompt: "비슷한 공간을 계획 중이신가요?",
          ctaLabel: "문의하기",
        },
        "site.not-found": {
          title: "페이지를 찾을 수 없습니다",
          message: "요청하신 페이지가 없거나 다른 주소로 옮겨졌습니다.",
          homeLabel: "홈으로 가기",
        },
      },
    }),
    "theme.json": json({
      schemaVersion: 1,
      contract: "theme-contract-v1",
      tokens: {
        "color.canvas": "rgb(250, 245, 238)",
        "color.surface.secondary": "rgb(239, 228, 214)",
        "color.text.primary": "rgb(58, 38, 26)",
        "color.text.secondary": "rgb(110, 84, 66)",
        "color.text.muted": "rgb(150, 126, 108)",
        "color.action.primary": "rgb(182, 92, 52)",
        "color.border.default": "rgb(226, 211, 194)",
        "decoration.radius.medium": "14px",
        "typography.heading": "Georgia, \"Times New Roman\", serif",
      },
    }),
    "content/business.json": json({
      schema: "business@1",
      origin: "synthetic-fixture",
      data: {
        summary: "플랫폼 검증용 가상 인테리어 스튜디오입니다. 실제 회사가 아닙니다.",
        contact: { email: "studio@fixture-small.example" },
      },
    }),
    "content/categories.json": json({ schema: "categories@1", origin: "synthetic-fixture", items: categories }),
    "content/projects.json": json({ schema: "projects@1", origin: "synthetic-fixture", items: projects }),
    "content/banners.json": json({ schema: "banners@1", origin: "synthetic-fixture", items: bannersKo }),
    "content/reviews.json": json({ schema: "reviews@1", origin: "synthetic-fixture", items: reviewsKo }),
    "assets/registry.json": json({ schema: "assets@1", origin: "synthetic-fixture", items: assets }),
    ...files,
  });
}

// ------------------------------------------------------------ fixture-empty --
await writeSite("fixture-empty", {
  "site.json": json({
    schemaVersion: 1,
    siteId: "fixture-empty",
    identity: {
      brandName: "Quiet Room Works",
      publicOrigin: "https://fixture-empty.example",
      locale: "en-GB",
    },
    template: pin,
    theme: { base: "template-default" },
  }),
  "settings.json": json({ schemaVersion: 1, templateId: "interior-01", overrides: {} }),
  // Homepage (1.3.0): sections are independently data-driven — ONE hero slide (no carousel
  // controls) and a text-only intro; reviews exist as an EMPTY collection (section absent);
  // no image band media and no contact destination (band + floating CTA absent).
  "slots.json": json({
    schemaVersion: 1,
    templateId: "interior-01",
    values: {
      "home.intro": {
        title: "A new studio, just getting started",
        body: {
          paragraphs: [
            "Quiet Room Works is a fictional, newly opened studio used as a platform fixture. There are no published projects yet.",
          ],
        },
      },
    },
  }),
  "content/business.json": json({
    schema: "business@1",
    origin: "synthetic-fixture",
    data: { summary: "A fictional, newly opened studio with no published projects yet. Platform fixture." },
  }),
  "content/categories.json": json({ schema: "categories@1", origin: "synthetic-fixture", items: [] }),
  "content/projects.json": json({ schema: "projects@1", origin: "synthetic-fixture", items: [] }),
  "content/banners.json": json({
    schema: "banners@1",
    origin: "synthetic-fixture",
    items: [{ id: "opening", status: "published", image: { asset: "hero-opening" }, headline: "A fictional studio, newly opened" }],
  }),
  "content/reviews.json": json({ schema: "reviews@1", origin: "synthetic-fixture", items: [] }),
  "assets/registry.json": json({
    schema: "assets@1",
    origin: "synthetic-fixture",
    items: [{ id: "hero-opening", file: "hero-opening.svg", mediaType: "image/svg+xml", width: 1920, height: 1080 }],
  }),
  "assets/hero-opening.svg": sceneSvg(9301, 1920, 1080, ["#dcdad5", "#c9ccc8", "#eeebe4", "#b8bdb6", "#a7aca6"]),
});

console.log(`fixtures written: fixture-large (176 records: 173 published, 2 draft, 1 scheduled), fixture-small (12), fixture-empty (0 projects; homepage: 1 hero slide + text intro) → pinned ${pin.releaseId}`);
