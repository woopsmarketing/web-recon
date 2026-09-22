/**
 * Step 6 (Demo Customer Content Proof) — boost-interior-demo asset registration / ingestion.
 *
 *   tsx scripts/template-platform-step6-assets.ts
 *
 * For every shot of the generation manifest (03-generation-manifest.json):
 *   - an APPROVED generated image exists in references/boost-interior/generated-approved/
 *     (<shotId>.jpg|png|webp) → centre-cropped to the seat aspect, resized, stored as
 *     data/sites/boost-interior-demo/assets/<shotId>.jpg and registered as image/jpeg;
 *   - otherwise → an ILLUSTRATED STAND-IN (inert SVG drawn here, never a photo, never a
 *     reference image) is stored as <shotId>.svg and registered as image/svg+xml.
 * Asset ids never change, so site content documents are untouched by ingestion: approving
 * images changes ONLY assets/ (files + registry.json).
 *
 * Also writes the logo, assets/registry.json and
 * docs/result/recon-template-platform-step6-demo/image-generation/04-asset-status.json.
 * Deterministic: the same inputs give byte-identical outputs. Reference images are never read.
 * Operator guards (warnings, never refusals): files in the approved folder that were NOT ingested
 * (wrong name / unaccepted extension such as .jpeg / shadowed) and approved images that had to be
 * upscaled or heavily cropped are printed and recorded in 04-asset-status.json.
 */
import { access, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import type { ManifestEntry, Scene } from "./template-platform-step6-image-pack.js";

const repoRoot = process.cwd();
const SITE_ASSETS = path.join(repoRoot, "data/sites/boost-interior-demo/assets");
const DOCS = path.join(repoRoot, "docs/result/recon-template-platform-step6-demo/image-generation");
const APPROVED = path.join(repoRoot, "references/boost-interior/generated-approved");

// ------------------------------------------------------------ colour utils --
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const toHex = (rgb: number[]) => `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: string, b: string, t: number) => toHex(hex(a).map((v, i) => v + (hex(b)[i]! - v) * t));
const dark = (c: string, t: number) => mix(c, "#000000", t);
const light = (c: string, t: number) => mix(c, "#ffffff", t);
const n = (v: number) => (Math.round(v * 10) / 10).toString();
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function seedOf(id: string): number {
  let h = 2166136261;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// ------------------------------------------------------ stand-in renderer --
interface Palette { wall: string; floor: string; wood: string; soft: string }
const BEFORE: Palette = { wall: "#e7dfc9", floor: "#c4a574", wood: "#8a4a30", soft: "#cdbf9f" };

/** One-point-perspective room illustration. Only allow-listed SVG: the site build refuses anything else (platform/assets svgProblems). */
function renderRoom(id: string, scene: Scene, W: number, H: number, pal: Palette, opts: { before: boolean; evening: boolean }): string {
  const seed = seedOf(id);
  const wide = W / H > 1.6;
  const half = (wide ? 0.13 : 0.2) + ((seed >> 3) % 5) * 0.008;
  const cx = 0.5 + (((seed >> 7) % 7) - 3) * 0.012;
  const narrow = scene === "hallway" || scene === "kitchen" || scene === "entrance";
  const hw = narrow ? half * 0.8 : half;
  const bx0 = W * (cx - hw), bx1 = W * (cx + hw);
  const by0 = H * (wide ? 0.2 : 0.27), by1 = H * (wide ? 0.72 : 0.69);
  /** depth 0 (camera) … 1 (back wall), foreshortened */
  const dep = (d: number) => (1 - 1 / (1 + d)) / 0.5;
  const topY = (t: number) => lerp(0, by0, t), botY = (t: number) => lerp(H, by1, t);
  const leftX = (t: number) => lerp(0, bx0, t), rightX = (t: number) => lerp(W, bx1, t);
  const wallH = (t: number) => botY(t) - topY(t);
  const fl = (u: number, d: number): [number, number] => { const t = dep(d); return [lerp(leftX(t), rightX(t), u), botY(t)]; };
  const ce = (u: number, d: number): [number, number] => { const t = dep(d); return [lerp(leftX(t), rightX(t), u), topY(t)]; };
  const up = (u: number, d: number, h: number): [number, number] => { const [x, y] = fl(u, d); return [x, y - h * wallH(dep(d))]; };
  const side = (s: "L" | "R", d: number, v: number): [number, number] => { const t = dep(d); return [s === "L" ? leftX(t) : rightX(t), lerp(topY(t), botY(t), v)]; };
  const pts = (p: [number, number][]) => p.map(([x, y]) => `${n(x)},${n(y)}`).join(" ");
  const poly = (p: [number, number][], fill: string, extra = "") => `<polygon points="${pts(p)}" fill="${fill}"${extra}/>`;
  const line = (a: [number, number], b: [number, number], stroke: string, w: number, o = 1) => `<line x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}" stroke="${stroke}" stroke-width="${n(w)}" stroke-opacity="${n(o)}"/>`;
  const wallQuad = (s: "L" | "R", d0: number, d1: number, v0: number, v1: number, fill: string, extra = "") => poly([side(s, d0, v0), side(s, d1, v0), side(s, d1, v1), side(s, d0, v1)], fill, extra);
  const back = (u0: number, u1: number, v0: number, v1: number, fill: string, extra = "") => `<rect x="${n(lerp(bx0, bx1, u0))}" y="${n(lerp(by0, by1, v0))}" width="${n((bx1 - bx0) * (u1 - u0))}" height="${n((by1 - by0) * (v1 - v0))}" fill="${fill}"${extra}/>`;
  /** box on the floor: footprint u0..u1 × d0..d1, height h (fraction of wall height); `open` = which vertical side faces the room */
  const box = (u0: number, u1: number, d0: number, d1: number, h: number, c: string, open: "L" | "R") => {
    const us = open === "L" ? u0 : u1;
    return [
      poly([up(u0, d0, h), up(u1, d0, h), up(u1, d1, h), up(u0, d1, h)], light(c, 0.35)),
      poly([fl(us, d0), fl(us, d1), up(us, d1, h), up(us, d0, h)], dark(c, 0.1)),
      poly([fl(u0, d0), fl(u1, d0), up(u1, d0, h), up(u0, d0, h)], c),
    ].join("");
  };

  const o: string[] = [];
  const glow: string[] = [];
  const wall = pal.wall, floor = pal.floor;
  const isBath = scene === "bathroom";
  const floorC = isBath ? (opts.before ? "#b9ad98" : "#9d9d9a") : scene === "entrance" ? "#c9c5be" : floor;
  const wallC = isBath ? (opts.before ? "#dcc9a6" : pal.soft) : wall;

  o.push(`<defs>`);
  o.push(`<linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${light(pal.soft, 0.55)}"/></linearGradient>`);
  o.push(`<linearGradient id="gl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${dark(wallC, 0.1)}"/><stop offset="1" stop-color="${dark(wallC, 0.03)}"/></linearGradient>`);
  o.push(`<linearGradient id="gr" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="${dark(wallC, 0.13)}"/><stop offset="1" stop-color="${dark(wallC, 0.05)}"/></linearGradient>`);
  o.push(`<linearGradient id="gf" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${dark(floorC, 0.08)}"/><stop offset="1" stop-color="${light(floorC, 0.25)}"/></linearGradient>`);
  o.push(`<linearGradient id="gn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe7bd"/><stop offset="1" stop-color="${pal.wood}"/></linearGradient>`);
  o.push(`<linearGradient id="gm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#eef2f3"/><stop offset="0.5" stop-color="#cfd8da"/><stop offset="1" stop-color="#e6ecee"/></linearGradient>`);
  o.push(`<linearGradient id="gs" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9bcbd"/><stop offset="0.5" stop-color="#e3e5e5"/><stop offset="1" stop-color="#a9adae"/></linearGradient>`);
  o.push(`</defs>`);

  // shell
  o.push(`<rect width="${W}" height="${H}" fill="${wallC}"/>`);
  o.push(poly([[0, 0], [W, 0], [bx1, by0], [bx0, by0]], light(wall, 0.6)));
  o.push(poly([[0, 0], [bx0, by0], [bx0, by1], [0, H]], "url(#gl)"));
  o.push(poly([[W, 0], [bx1, by0], [bx1, by1], [W, H]], "url(#gr)"));
  o.push(back(0, 1, 0, 1, light(wallC, 0.25)));
  o.push(poly([[0, H], [W, H], [bx1, by1], [bx0, by1]], "url(#gf)"));

  // floor pattern
  const joint = dark(floorC, 0.22);
  const tiles = isBath || scene === "entrance" || opts.before;
  const cols = tiles ? 6 : wide ? 12 : 8;
  for (let i = 1; i < cols; i++) o.push(line(fl(i / cols, 0), fl(i / cols, 1), joint, 1, 0.45));
  const rows = tiles ? 7 : 5;
  for (let j = 1; j < rows; j++) {
    const d = j / rows;
    if (tiles) o.push(line(fl(0, d), fl(1, d), joint, 1, 0.45));
    else for (let i = 0; i < cols; i++) if ((i + j) % 2 === 0) o.push(line(fl(i / cols, d), fl((i + 1) / cols, d), joint, 1, 0.4));
  }
  // wall tiles (bathroom)
  if (isBath) {
    const g = dark(wallC, 0.16);
    const step = opts.before ? 0.07 : 0.125;
    for (let v = step; v < 1; v += step) {
      o.push(line(side("L", 0, v), side("L", 1, v), g, 1, 0.5), line(side("R", 0, v), side("R", 1, v), g, 1, 0.5));
      o.push(line([bx0, lerp(by0, by1, v)], [bx1, lerp(by0, by1, v)], g, 1, 0.5));
    }
    for (let d = 0.2; d < 1; d += opts.before ? 0.1 : 0.2) o.push(line(side("L", d, 0), side("L", d, 1), g, 1, 0.4), line(side("R", d, 0), side("R", d, 1), g, 1, 0.4));
    for (let u = 0.25; u < 1; u += opts.before ? 0.125 : 0.25) o.push(line([lerp(bx0, bx1, u), by0], [lerp(bx0, bx1, u), by1], g, 1, 0.4));
  } else {
    // skirting
    o.push(line(side("L", 0, 0.985), side("L", 1, 0.975), "#ffffff", 3, 0.9), line(side("R", 0, 0.985), side("R", 1, 0.975), "#ffffff", 3, 0.9));
    o.push(back(0, 1, 0.965, 1, "#ffffff", ` fill-opacity="0.9"`));
  }

  // ---- shared pieces
  const downlights = (count: number, u: number) => {
    for (let i = 0; i < count; i++) {
      const [x, y] = ce(u, 0.2 + (0.7 * i) / Math.max(1, count - 1));
      const r = lerp(7, 3, i / Math.max(1, count - 1)) * (W / 800);
      o.push(`<ellipse cx="${n(x)}" cy="${n(y)}" rx="${n(r)}" ry="${n(r * 0.45)}" fill="#fffdf4" stroke="${dark(wall, 0.12)}" stroke-width="1"/>`);
    }
  };
  const tray = () => {
    const q: [number, number][] = [ce(0.2, 0.3), ce(0.8, 0.3), ce(0.78, 0.9), ce(0.22, 0.9)];
    o.push(poly(q, "#ffffff"));
    glow.push(`<polygon points="${pts(q)}" fill="none" stroke="#ffd59a" stroke-width="${n(4 * (W / 800))}" stroke-opacity="0.95" stroke-linejoin="round"/>`);
    o.push(poly([ce(0.4, 0.5), ce(0.6, 0.5), ce(0.59, 0.72), ce(0.41, 0.72)], "#fffef8", ` stroke="${dark(wall, 0.08)}" stroke-width="1"`));
  };
  const panelLight = () => o.push(poly([ce(0.42, 0.45), ce(0.58, 0.45), ce(0.57, 0.7), ce(0.43, 0.7)], "#fffef8", ` stroke="${dark(wall, 0.1)}" stroke-width="1"`));
  const windowWall = (u0: number, u1: number, drape: string | undefined, kind: "sheer" | "blind" | "drape") => {
    const v0 = 0.08, v1 = kind === "blind" ? 0.62 : 0.965;
    o.push(back(u0, u1, v0, v1, kind === "drape" ? drape! : "url(#gw)"));
    const count = kind === "blind" ? 9 : 16;
    for (let i = 1; i < count; i++) {
      if (kind === "blind") { const y = lerp(by0, by1, lerp(v0, v1, i / count)); o.push(line([lerp(bx0, bx1, u0), y], [lerp(bx0, bx1, u1), y], dark(pal.soft, 0.1), 1, 0.6)); }
      else { const x = lerp(bx0, bx1, lerp(u0, u1, i / count)); o.push(line([x, lerp(by0, by1, v0)], [x, lerp(by0, by1, v1)], kind === "drape" ? dark(drape!, 0.18) : "#ffffff", 1.2, kind === "drape" ? 0.55 : 0.8)); }
    }
    if (kind === "sheer" && drape) {
      const dw = (u1 - u0) * 0.1;
      for (const [a, b] of [[u0, u0 + dw], [u1 - dw, u1]] as const) {
        o.push(back(a, b, v0, v1, drape));
        for (let i = 1; i < 4; i++) { const x = lerp(bx0, bx1, lerp(a, b, i / 4)); o.push(line([x, lerp(by0, by1, v0)], [x, lerp(by0, by1, v1)], dark(drape, 0.2), 1, 0.6)); }
      }
    }
    o.push(back(u0, u1, 0.04, v0, "#ffffff"));
  };
  const cabinetWall = (s: "L" | "R", d0: number, d1: number, doors: number, c: string, niche: boolean, gloss = false) => {
    o.push(wallQuad(s, d0, d1, 0, 0.985, c));
    if (gloss) o.push(wallQuad(s, lerp(d0, d1, 0.15), lerp(d0, d1, 0.3), 0, 0.985, "#ffffff", ` fill-opacity="0.45"`));
    for (let i = 1; i < doors; i++) { const d = lerp(d0, d1, i / doors); o.push(line(side(s, d, 0), side(s, d, 0.985), dark(c, 0.3), 1.2, 0.9)); }
    o.push(line(side(s, d0, 0), side(s, d0, 0.985), dark(c, 0.3), 1.2, 0.9), line(side(s, d1, 0), side(s, d1, 0.985), dark(c, 0.3), 1.2, 0.9));
    if (niche) {
      const a = lerp(d0, d1, 0.12), b = lerp(d0, d1, 0.88);
      o.push(wallQuad(s, a, b, 0.44, 0.58, "url(#gn)"));
      glow.push(`<polygon points="${pts([side(s, a, 0.44), side(s, b, 0.44), side(s, b, 0.47), side(s, a, 0.47)])}" fill="#fff1cf" fill-opacity="0.95"/>`);
    } else o.push(line(side(s, d0, 0.5), side(s, d1, 0.5), dark(c, 0.2), 1, 0.5));
  };
  const door = (u0: number, u1: number) => {
    o.push(back(u0, u1, 0.1, 0.965, "#ffffff", ` stroke="${dark(wall, 0.14)}" stroke-width="2"`));
    const x = lerp(bx0, bx1, lerp(u0, u1, 0.14)), y = lerp(by0, by1, 0.56);
    o.push(`<rect x="${n(x)}" y="${n(y)}" width="${n((bx1 - bx0) * 0.06)}" height="${n(3 * (H / 600))}" fill="#9a9c9c"/>`);
  };
  const pendant = (u: number, d: number) => {
    const [x, y0] = ce(u, d); const y = y0 + wallH(dep(d)) * 0.34; const r = wallH(dep(d)) * 0.09;
    o.push(line([x, y0], [x, y - r * 0.8], "#d8d8d6", 1.5));
    o.push(`<path d="M ${n(x - r)} ${n(y)} A ${n(r)} ${n(r * 0.9)} 0 0 1 ${n(x + r)} ${n(y)} Z" fill="${opts.before ? "#e9e2cf" : "#fbfbfa"}" stroke="${dark(wall, 0.15)}" stroke-width="1"/>`);
    glow.push(`<ellipse cx="${n(x)}" cy="${n(y + r * 0.1)}" rx="${n(r * 0.85)}" ry="${n(r * 0.16)}" fill="#fff3d2" fill-opacity="0.95"/>`);
  };
  const sofa = (s: "L" | "R", c: string) => {
    const [u0, u1] = s === "R" ? [0.7, 0.97] : [0.03, 0.3];
    const open = s === "R" ? "L" : "R";
    const [b0, b1] = s === "R" ? [0.9, 0.97] : [0.03, 0.1];
    const [sx, sy] = fl((u0 + u1) / 2, 0.55);
    o.push(`<ellipse cx="${n(sx)}" cy="${n(sy + 6)}" rx="${n(W * 0.17)}" ry="${n(H * 0.03)}" fill="#000000" fill-opacity="0.08"/>`);
    o.push(box(b0, b1, 0.32, 0.78, 0.33, dark(c, 0.04), open));
    o.push(box(u0, u1, 0.32, 0.78, 0.17, c, open));
    for (const d of [0.47, 0.62]) o.push(line(up(open === "L" ? u0 : u1, d, 0.17), up(open === "L" ? b0 : b1, d, 0.17), dark(c, 0.2), 1, 0.6));
  };
  const bed = (s: "L" | "R") => {
    const [u0, u1] = s === "R" ? [0.5, 0.97] : [0.03, 0.5];
    const open = s === "R" ? "L" : "R";
    o.push(box(u0, u1, 0.3, 0.85, 0.14, "#f6f5f2", open));
    o.push(box(s === "R" ? 0.86 : 0.03, s === "R" ? 0.97 : 0.14, 0.3, 0.85, 0.3, light(pal.soft, 0.1), open));
    o.push(box(s === "R" ? 0.76 : 0.14, s === "R" ? 0.86 : 0.24, 0.4, 0.75, 0.19, "#ffffff", open));
  };
  const table = (u0: number, u1: number, d0: number, d1: number, c: string) => {
    for (const [u, d] of [[u0 + 0.02, d0 + 0.02], [u1 - 0.02, d0 + 0.02], [u0 + 0.02, d1 - 0.02], [u1 - 0.02, d1 - 0.02]] as const) o.push(line(fl(u, d), up(u, d, 0.3), dark(c, 0.25), 3 * (W / 800)));
    o.push(poly([up(u0, d0, 0.3), up(u1, d0, 0.3), up(u1, d1, 0.3), up(u0, d1, 0.3)], light(c, 0.2)));
    o.push(poly([up(u0, d0, 0.3), up(u1, d0, 0.3), up(u1, d0, 0.275), up(u0, d0, 0.275)], dark(c, 0.12)));
  };
  const cab = opts.before ? BEFORE.wood : scene === "kitchen" || scene === "dining" ? "#f7f7f5" : mix("#f7f7f5", pal.wood, pal.wood === "#b9ad9c" || pal.wood === "#8f6d4e" ? 0.35 : 0);

  // ---- scenes
  // Variety: most scenes are mirrored as a whole; the bathroom (no mirror) swaps its sides instead.
  const flip = (seed & 1) === 1;
  const A: "L" | "R" = flip && scene === "bathroom" ? "R" : "L";
  const B: "L" | "R" = A === "L" ? "R" : "L";
  switch (scene) {
    case "living": {
      tray();
      downlights(3, 0.12);
      windowWall(0.04, 0.96, dark(pal.soft, 0.12), "sheer");
      cabinetWall(A, 0.62, 0.95, 2, "#f7f7f5", true);
      sofa(B, light(pal.soft, 0.25));
      const [hx, hy] = side(B, 0.55, 0.3);
      glow.push(`<circle cx="${n(hx)}" cy="${n(hy)}" r="${n(H * 0.022)}" fill="#fff3d2" stroke="#ffffff" stroke-width="3"/>`);
      break;
    }
    case "kitchen": {
      downlights(4, 0.5);
      windowWall(0.2, 0.8, undefined, "blind");
      // tall cabinet wall
      o.push(wallQuad(A, 0.12, 0.92, 0, 0.985, cab));
      for (const d of [0.3, 0.52, 0.72]) o.push(line(side(A, d, 0), side(A, d, 0.985), dark(cab, 0.25), 1, 0.7));
      o.push(wallQuad(A, 0.52, 0.72, 0.08, 0.95, opts.before ? "#d9d6cf" : "#cfc6b9"));
      o.push(line(side(A, 0.62, 0.08), side(A, 0.62, 0.95), "#55514b", 1.2, 0.8));
      if (!opts.before) { o.push(wallQuad(A, 0.32, 0.5, 0.36, 0.58, "url(#gn)")); o.push(wallQuad(A, 0.335, 0.485, 0.39, 0.55, "#e9e4dc")); o.push(wallQuad(A, 0.35, 0.47, 0.43, 0.53, "#3a3936")); }
      // counter + fluted wall + hood
      if (!opts.before) for (let i = 0; i < 46; i++) { const d = 0.1 + (0.85 * i) / 46; o.push(line(side(B, d, 0.02), side(B, d, 0.6), dark(wall, 0.12), 1, 0.5)); }
      else { o.push(wallQuad(B, 0.1, 0.95, 0.08, 0.34, cab)); for (const d of [0.3, 0.5, 0.7]) o.push(line(side(B, d, 0.08), side(B, d, 0.34), dark(cab, 0.3), 1, 0.8)); }
      o.push(wallQuad(B, 0.58, 0.7, opts.before ? 0.34 : 0.1, opts.before ? 0.4 : 0.36, "url(#gs)"));
      const [cu0, cu1] = B === "R" ? [0.74, 1] : [0, 0.26];
      o.push(box(cu0, cu1, 0.1, 0.95, 0.4, cab, A));
      const edge = B === "R" ? cu0 : cu1;
      for (const d of [0.3, 0.48, 0.64, 0.8]) o.push(line(fl(edge, d), up(edge, d, 0.4), dark(cab, 0.25), 1, 0.7));
      o.push(line(up(edge, 0.1, 0.31), up(edge, 0.95, 0.31), opts.before ? dark(cab, 0.3) : "#b4b7b8", 2, 0.9));
      o.push(poly([up(cu0, 0.1, 0.4), up(cu1, 0.1, 0.4), up(cu1, 0.95, 0.4), up(cu0, 0.95, 0.4)], opts.before ? "#d8cdb6" : "#fbfbfa"));
      const [fx, fy] = up((cu0 + cu1) / 2, 0.5, 0.4);
      o.push(`<path d="M ${n(fx)} ${n(fy)} v ${n(-H * 0.06)} h ${n(H * 0.025 * (B === "R" ? -1 : 1))}" fill="none" stroke="#9fa3a3" stroke-width="${n(2.5 * (W / 800))}" stroke-linecap="round"/>`);
      if (!opts.before) pendant(A === "L" ? 0.2 : 0.8, 0.15);
      break;
    }
    case "entrance": {
      downlights(2, 0.5);
      // three-panel (or single) sliding glass door on the back wall
      o.push(back(0.02, 0.98, 0.06, 1, "#fbfbfa"));
      const panels = pal.wood === "#c8a06c" ? 1 : 3;
      for (let i = 0; i < panels; i++) {
        const a = 0.06 + (0.88 * i) / panels, b = 0.06 + (0.88 * (i + 1)) / panels;
        o.push(back(a + 0.025, b - 0.025, 0.14, 0.84, "url(#gm)", ` stroke="#ffffff" stroke-width="3"`));
        o.push(back(a + 0.05, a + 0.09, 0.3, 0.8, "#ffffff", ` fill-opacity="0.4"`));
      }
      glow.push(back(0.58, 0.72, 0.44, 0.52, "url(#gn)", ` fill-opacity="0.85"`));
      o.push(back(0.9, 0.915, 0.46, 0.56, "#a9adae"));
      o.push(poly([fl(0, 0.82), fl(1, 0.82), fl(1, 1), fl(0, 1)], "#4a3d35"));
      o.push(line(fl(0.2, 0.84), fl(0.5, 0.98), "#e8e2da", 1, 0.5), line(fl(0.6, 0.83), fl(0.85, 0.97), "#e8e2da", 1, 0.4));
      cabinetWall(A, 0.1, 0.8, 3, "#f3efe6", false, true);
      o.push(wallQuad(B, 0.15, 0.8, 0.03, 0.97, "url(#gm)", ` stroke="#ffffff" stroke-width="2"`));
      break;
    }
    case "hallway": {
      downlights(3, 0.5);
      door(0.18, 0.62);
      cabinetWall(A, 0.1, 0.9, 5, "#f7f7f5", false);
      o.push(wallQuad(B, 0.55, 0.78, 0.1, 0.985, "#ffffff", ` stroke="${dark(wall, 0.14)}" stroke-width="2"`));
      break;
    }
    case "bedroom": {
      panelLight();
      windowWall(0.18, 0.82, dark(pal.soft, 0.15), "drape");
      bed(B);
      cabinetWall(A, 0.5, 0.95, 3, "#f7f7f5", false);
      break;
    }
    case "bathroom": {
      downlights(2, 0.5);
      o.push(back(0.12, 0.88, 0.16, 0.44, "url(#gm)", ` stroke="#ffffff" stroke-width="2"`));
      o.push(back(0.12, 0.88, 0.46, 0.475, "#b4b7b8"));
      o.push(back(0, 1, 0.6, 0.63, opts.before ? "#d6c6a3" : "#e9e6e0"));
      const bxm = lerp(bx0, bx1, 0.4), bym = lerp(by0, by1, 0.66), br = (bx1 - bx0) * 0.14;
      o.push(`<path d="M ${n(bxm - br)} ${n(bym)} h ${n(br * 2)} a ${n(br)} ${n(br * 0.9)} 0 0 1 ${n(-br * 2)} 0 Z" fill="#fdfdfc" stroke="${dark(wallC, 0.2)}" stroke-width="1"/>`);
      o.push(`<path d="M ${n(bxm)} ${n(bym)} v ${n(-br * 0.7)} h ${n(br * 0.35)}" fill="none" stroke="#9fa3a3" stroke-width="${n(2.5 * (W / 800))}" stroke-linecap="round"/>`);
      const [t0, t1] = B === "R" ? [0.62, 1] : [0, 0.38];
      o.push(box(t0, t1, 0.35, 1, 0.24, "#fbfbfa", A));
      o.push(line(side(B, 0.7, 0.18), side(B, 0.7, 0.6), "#a9adae", 2.5));
      break;
    }
    case "dining": {
      downlights(3, 0.15);
      o.push(back(0.05, 0.95, 0.62, 0.965, cab, ` stroke="${dark(cab, 0.18)}" stroke-width="1"`));
      o.push(back(0.05, 0.95, 0.6, 0.625, "#fbfbfa"));
      o.push(back(0.1, 0.9, 0.3, 0.325, pal.wood));
      for (const u of [0.35, 0.65]) o.push(line([lerp(bx0, bx1, u), lerp(by0, by1, 0.625)], [lerp(bx0, bx1, u), lerp(by0, by1, 0.965)], dark(cab, 0.2), 1, 0.7));
      table(0.3, 0.7, 0.3, 0.7, pal.wood);
      pendant(0.5, 0.5);
      cabinetWall(A, 0.6, 0.95, 2, "#f7f7f5", false);
      break;
    }
    case "storage": {
      downlights(3, 0.5);
      cabinetWall(A, 0.08, 0.92, 4, mix("#f7f7f5", pal.wood, pal.wood === "#b9ad9c" ? 0.4 : 0), true);
      windowWall(0.35, 0.96, dark(pal.soft, 0.12), "sheer");
      if (id.includes("balcony")) o.push(box(B === "R" ? 0.6 : 0.03, B === "R" ? 0.97 : 0.4, 0.55, 0.9, 0.16, pal.wood, A));
      break;
    }
  }

  const evening = opts.evening ? `<rect width="${W}" height="${H}" fill="#2a2f3a" fill-opacity="0.3"/>` : "";
  const body = flip && scene !== "bathroom" ? `<g transform="translate(${W},0) scale(-1,1)">${o.slice(o.indexOf("</defs>") + 1).join("")}${evening}${glow.join("")}</g>` : `${o.slice(o.indexOf("</defs>") + 1).join("")}${evening}${glow.join("")}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${o.slice(0, o.indexOf("</defs>") + 1).join("")}${body}</svg>\n`;
}

/** Low-contrast fluted-wall elevation for the portfolio title banner. */
function renderFluted(W: number, H: number): string {
  const o = [`<rect width="${W}" height="${H}" fill="#eeedea"/>`];
  for (let x = 6; x < W; x += 9) o.push(`<line x1="${x}" y1="0" x2="${x}" y2="${n(H * 0.8)}" stroke="#d9d8d4" stroke-width="2"/>`);
  o.push(`<rect y="${n(H * 0.8)}" width="${W}" height="${n(H * 0.04)}" fill="#fbfbfa"/>`, `<rect y="${n(H * 0.84)}" width="${W}" height="${n(H * 0.16)}" fill="#f4f4f2"/>`);
  o.push(`<path d="M ${n(W * 0.8)} ${n(H * 0.8)} v ${n(-H * 0.42)} h ${n(H * 0.2)} v ${n(H * 0.08)}" fill="none" stroke="#a5a9a9" stroke-width="${n(H * 0.03)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${o.join("")}</svg>\n`;
}

/** Wordmark logo: a small warm-orange mark + the brand name. Text is rendered by the viewer's fonts. */
const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="188" height="32" viewBox="0 0 188 32"><title>부스트 인테리어</title><rect x="0" y="2" width="28" height="28" rx="7" fill="#d9691f"/><path d="M 7 19 L 14 10 L 21 19" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M 10 23 H 18" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/><text x="38" y="22.5" font-family="Pretendard, Apple SD Gothic Neo, Malgun Gothic, Noto Sans KR, sans-serif" font-size="19" font-weight="700" letter-spacing="-0.4" fill="#232220">부스트 인테리어</text></svg>\n`;

/** sharp is a transitive dependency (pnpm store): loaded only when an approved image must be ingested. */
interface SharpPipeline {
  metadata(): Promise<{ width?: number; height?: number; orientation?: number }>;
  rotate(): SharpPipeline;
  resize(width: number, height: number, options: { fit: "cover"; position: "centre" }): SharpPipeline;
  jpeg(options: { quality: number; mozjpeg: boolean }): SharpPipeline;
  toFile(file: string): Promise<unknown>;
}
async function loadSharp(): Promise<(input: string) => SharpPipeline> {
  const store = path.join(repoRoot, "node_modules/.pnpm");
  const dir = (await readdir(store)).filter((d) => d.startsWith("sharp@")).sort().at(-1);
  if (!dir) throw new Error("sharp not found in node_modules/.pnpm — cannot ingest approved images");
  return createRequire(import.meta.url)(path.join(store, dir, "node_modules/sharp")) as (input: string) => SharpPipeline;
}

// ------------------------------------------------------------------- main --
const exists = (f: string) => access(f).then(() => true, () => false);
const manifest = JSON.parse(await readFile(path.join(DOCS, "03-generation-manifest.json"), "utf8")) as { acceptedExtensions: string[]; shots: ManifestEntry[] };

await mkdir(SITE_ASSETS, { recursive: true });
// the directory is fully derived: drop files of a previous run (e.g. a stand-in replaced by a photo)
for (const f of await readdir(SITE_ASSETS)) await rm(path.join(SITE_ASSETS, f));

const items: { id: string; file: string; mediaType: string; width: number; height: number }[] = [];
const status: { shotId: string; source: "approved-generated" | "illustrated-stand-in"; file: string }[] = [];
const consumed = new Set<string>();
const approvedEntries = (await exists(APPROVED)) ? await readdir(APPROVED) : [];
const inputWarnings: { shotId: string; file: string; kind: "upscaled" | "heavy-crop"; detail: string }[] = [];

await writeFile(path.join(SITE_ASSETS, "logo.svg"), LOGO);
items.push({ id: "logo", file: "logo.svg", mediaType: "image/svg+xml", width: 188, height: 32 });

for (const shot of manifest.shots) {
  const { id, width, height } = shot.siteAsset;
  let approved: string | undefined;
  for (const ext of manifest.acceptedExtensions) if (await exists(path.join(APPROVED, `${id}.${ext}`))) approved ??= path.join(APPROVED, `${id}.${ext}`);
  if (approved) {
    const file = `${id}.jpg`;
    const sharp = await loadSharp();
    // the real directory entry: on a case-insensitive volume BI01-X.JPG is found as bi01-x.jpg
    consumed.add(approvedEntries.find((e) => e === path.basename(approved)) ?? approvedEntries.find((e) => e.toLowerCase() === path.basename(approved).toLowerCase()) ?? path.basename(approved));
    // operator guards: ingestion never refuses an approved file, but it must not be silent about quality loss
    const meta = await sharp(approved).metadata();
    const turned = (meta.orientation ?? 1) >= 5;
    const srcW = (turned ? meta.height : meta.width) ?? 0, srcH = (turned ? meta.width : meta.height) ?? 0;
    if (srcW < width || srcH < height) inputWarnings.push({ shotId: id, file: path.basename(approved), kind: "upscaled", detail: `source ${srcW}x${srcH} is smaller than the seat ${width}x${height}` });
    const kept = srcW && srcH ? Math.min(srcW / srcH / (width / height), width / height / (srcW / srcH)) : 1;
    if (kept < 0.8) inputWarnings.push({ shotId: id, file: path.basename(approved), kind: "heavy-crop", detail: `source aspect ${srcW}x${srcH} keeps only ${Math.round(kept * 100)}% of the image in the ${width}x${height} seat` });
    await sharp(approved).rotate().resize(width, height, { fit: "cover", position: "centre" }).jpeg({ quality: 84, mozjpeg: true }).toFile(path.join(SITE_ASSETS, file));
    items.push({ id, file, mediaType: "image/jpeg", width, height });
    status.push({ shotId: id, source: "approved-generated", file });
  } else {
    const w = Math.round(width / 2), h = Math.round(height / 2);
    const svg = shot.seat === "plist" ? renderFluted(w, h) : renderRoom(id, shot.standIn.scene, w, h, shot.standIn.before ? { ...BEFORE } : shot.standIn.palette, { before: shot.standIn.before, evening: id === "site-band" });
    const file = `${id}.svg`;
    await writeFile(path.join(SITE_ASSETS, file), svg);
    items.push({ id, file, mediaType: "image/svg+xml", width: w, height: h });
    status.push({ shotId: id, source: "illustrated-stand-in", file });
  }
}

items.sort((a, b) => (a.id < b.id ? -1 : 1));
await writeFile(path.join(SITE_ASSETS, "registry.json"), `${JSON.stringify({ schema: "assets@1", origin: "synthetic-fixture", items }, null, 2)}\n`);
const approvedCount = status.filter((s) => s.source === "approved-generated").length;
// Files in the approved folder that ingestion did NOT use (wrong name, extension outside
// acceptedExtensions such as .jpeg, or shadowed by an earlier extension of the same shot).
const shotIds = new Set(manifest.shots.map((s) => s.siteAsset.id));
const unmatchedApprovedFiles = approvedEntries
  .filter((f) => f !== "manifest.json" && !f.startsWith(".") && !consumed.has(f))
  .sort()
  .map((f) => {
    const ext = path.extname(f).slice(1), base = path.basename(f, path.extname(f));
    const reason = !shotIds.has(base) ? "file name is not a shotId" : !manifest.acceptedExtensions.includes(ext) ? `extension .${ext} is not accepted (${manifest.acceptedExtensions.join("/")})` : "shadowed by another extension of the same shot";
    return { file: f, reason };
  });
const summary = {
  schema: "step6-asset-status@1",
  shots: status.length,
  approvedGenerated: approvedCount,
  illustratedStandIns: status.length - approvedCount,
  AI_PORTFOLIO_ASSETS: approvedCount === status.length ? "PASS" : approvedCount === 0 ? "WAITING_FOR_GENERATION" : "PARTIAL",
  // only present when non-empty, so a clean run stays byte-identical to earlier runs
  ...(unmatchedApprovedFiles.length ? { unmatchedApprovedFiles } : {}),
  ...(inputWarnings.length ? { inputWarnings } : {}),
  status,
};
await writeFile(path.join(DOCS, "04-asset-status.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify({ ...summary, status: undefined }, null, 2));
for (const u of unmatchedApprovedFiles) console.warn(`WARNING unmatched approved file (NOT ingested): ${u.file} — ${u.reason}`);
for (const w of inputWarnings) console.warn(`WARNING ${w.kind}: ${w.file} — ${w.detail}`);
