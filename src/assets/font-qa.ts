/**
 * Fallback font QA (Task 22 H) — metrics, not vibes.
 *
 * The clone carries NO @font-face (the Observer records computed styles, and
 * @font-face never made it into any stored artifact), so every
 * `font-family: sohne-var, "Helvetica Neue", …` declaration already renders
 * its FALLBACK today. This QA measures what that fallback costs:
 *
 *  1. App-level reflow: load the served route (fallback state), measure text
 *     elements and document height; inject the source @font-face rules
 *     (fonts load FROM THE SOURCE FONT HOST — authorized recon of observed
 *     hosts; the font bytes are never stored, license stays needs-review);
 *     wait for document.fonts.ready; re-measure the same elements. The
 *     deltas ARE the fallback reflow impact.
 *
 *  2. Isolated sample metrics: a blank page measuring identical sample runs
 *     in webfont vs fallback stack at several sizes.
 *
 * A font that fails to load is reported `loaded: false` with its metrics
 * marked unobserved — nothing is extrapolated.
 */
import { chromium } from "playwright";

import { safeFetchAsset, DEFAULT_FETCH_POLICY } from "./safe-fetch.js";
import type { SafeFetchPolicy } from "./safe-fetch.js";
import type { FontInventory } from "./types.js";

const NAME_SHIM = "window.__name = window.__name || ((f) => f);";

export interface FontQaOptions {
  servedBaseUrl: string;
  route: string;
  fontInventory: FontInventory;
  settleMs?: number;
  maxElements?: number;
  /** TEST-ONLY passthroughs for local fixture font hosts. */
  fetchPolicyBase?: Partial<
    Pick<SafeFetchPolicy, "timeoutMs" | "maxBytes" | "maxRedirects" | "allowedPorts" | "allowPrivateHostPorts" | "lookup">
  >;
}

export interface FontLoadResult {
  family: string;
  url: string;
  loaded: boolean;
  detail: string | null;
}

export interface ReflowStats {
  elementsMeasured: number;
  elementsChanged: number;
  widthDelta: { p50: number; p95: number; max: number };
  heightDelta: { p50: number; p95: number; max: number };
  docHeightBefore: number;
  docHeightAfter: number;
  docHeightDelta: number;
}

export interface SampleMetric {
  family: string;
  fallbackStack: string;
  fontSizePx: number;
  webfontWidth: number | null;
  fallbackWidth: number;
  widthDeltaPct: number | null;
}

export interface FontQaReport {
  route: string;
  fontsAttempted: number;
  fonts: FontLoadResult[];
  appReflow: ReflowStats | null; // null when no font loaded (unobserved)
  samples: SampleMetric[];
  note: string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[index];
}

export async function runFontFallbackQa(options: FontQaOptions): Promise<FontQaReport> {
  const settleMs = options.settleMs ?? 1500;
  const maxElements = options.maxElements ?? 500;
  // Dedupe rules that differ only in font-display (measurement-irrelevant).
  const seenFaces = new Set<string>();
  const faces = options.fontInventory.fontFaceRules.filter((rule) => {
    if (rule.src.length === 0) return false;
    const key = JSON.stringify([rule.family, rule.src, rule.weight, rule.style]);
    if (seenFaces.has(key)) return false;
    seenFaces.add(key);
    return true;
  });
  const fallbackByFamily = new Map(
    options.fontInventory.fallbackPlan.map((plan) => [plan.family.toLowerCase(), plan.fallbackStack]),
  );

  // The source font CDN serves no Access-Control-Allow-Origin header, so a
  // cross-origin @font-face load from the local QA origin is CORS-blocked.
  // Fetch the bytes through the SSRF-hardened fetcher (font hosts are in the
  // inventory allowlist) and inject them as same-origin data: URLs —
  // measurement only, held in memory, NEVER stored (license-needs-review).
  const fontHosts = new Set<string>([
    ...options.fontInventory.fontUrls.map((f) => f.host),
    ...faces.flatMap((f) => f.src.map((s) => new URL(s.url).hostname)),
  ]);
  const fontDataUrls = new Map<string, { dataUrl: string | null; detail: string | null }>();
  for (const face of faces) {
    for (const src of face.src) {
      if (fontDataUrls.has(src.url)) continue;
      const result = await safeFetchAsset(src.url, {
        timeoutMs: options.fetchPolicyBase?.timeoutMs ?? DEFAULT_FETCH_POLICY.timeoutMs,
        maxBytes: options.fetchPolicyBase?.maxBytes ?? 10 * 1024 * 1024,
        maxRedirects: options.fetchPolicyBase?.maxRedirects ?? DEFAULT_FETCH_POLICY.maxRedirects,
        allowedPorts: options.fetchPolicyBase?.allowedPorts,
        allowPrivateHostPorts: options.fetchPolicyBase?.allowPrivateHostPorts,
        lookup: options.fetchPolicyBase?.lookup,
        allowedHosts: fontHosts,
        expectedKind: "font",
      });
      fontDataUrls.set(src.url, {
        dataUrl:
          result.status === "fetched" && result.body
            ? `data:${result.mime ?? "font/woff2"};base64,${result.body.toString("base64")}`
            : null,
        detail: result.status === "fetched" ? null : `${result.status}${result.detail ? `: ${result.detail}` : ""}`,
      });
    }
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(options.servedBaseUrl + options.route, {
      waitUntil: "load",
      timeout: 60_000,
    });
    await page.evaluate(NAME_SHIM);
    await page.waitForTimeout(settleMs);

    // Pass 1 — fallback state (today's clone): mark + measure text elements.
    const before = (await page.evaluate(
      `(() => {
        const selector = "h1,h2,h3,h4,h5,p,a,li,button,span,strong,td,th";
        const all = Array.from(document.querySelectorAll(selector));
        const picked = [];
        for (const el of all) {
          if (picked.length >= ${maxElements}) break;
          const hasDirectText = Array.from(el.childNodes).some(
            (n) => n.nodeType === 3 && n.textContent.trim().length > 2,
          );
          if (!hasDirectText) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          el.setAttribute("data-wr-fontqa", String(picked.length));
          picked.push({ w: rect.width, h: rect.height });
        }
        return {
          elements: picked,
          docHeight: document.documentElement.scrollHeight,
        };
      })()`,
    )) as { elements: { w: number; h: number }[]; docHeight: number };

    // Inject the source @font-face rules (src swapped to the fetched
    // same-origin data: URLs; original URL kept in the report).
    const injectableFaces = faces.filter((rule) =>
      rule.src.some((s) => fontDataUrls.get(s.url)?.dataUrl != null),
    );
    const fontFaceCss = injectableFaces
      .map((rule) => {
        const src = rule.src
          .filter((s) => fontDataUrls.get(s.url)?.dataUrl != null)
          .map(
            (s) =>
              `url("${fontDataUrls.get(s.url)?.dataUrl}")${s.format ? ` format("${s.format}")` : ""}`,
          )
          .join(", ");
        return (
          `@font-face { font-family: "${rule.family}"; src: ${src};` +
          (rule.weight ? ` font-weight: ${rule.weight};` : "") +
          (rule.style ? ` font-style: ${rule.style};` : "") +
          ` font-display: block; }`
        );
      })
      .join("\n");
    const fonts: FontLoadResult[] = [];
    let anyLoaded = false;
    if (faces.length > 0) {
      if (fontFaceCss !== "") await page.addStyleTag({ content: fontFaceCss });
      // Force a load request per family (font-display alone waits for use;
      // the page already uses the families, but be explicit and bounded).
      const loadResults = (await page.evaluate(
        `(async () => {
          const families = ${JSON.stringify(injectableFaces.map((f) => f.family))};
          const out = [];
          for (const family of families) {
            try {
              await Promise.race([
                document.fonts.load('16px "' + family + '"'),
                new Promise((_, reject) => setTimeout(() => reject(new Error("font load timeout")), 15000)),
              ]);
              out.push({ family, loaded: document.fonts.check('16px "' + family + '"'), detail: null });
            } catch (err) {
              out.push({ family, loaded: false, detail: String(err && err.message ? err.message : err) });
            }
          }
          return out;
        })()`,
      )) as { family: string; loaded: boolean; detail: string | null }[];
      for (const face of faces) {
        const url = face.src[0]?.url ?? "";
        const fetchInfo = fontDataUrls.get(url);
        if (fetchInfo?.dataUrl == null) {
          fonts.push({
            family: face.family,
            url,
            loaded: false,
            detail: `font fetch failed — ${fetchInfo?.detail ?? "no source"}`,
          });
          continue;
        }
        const result = loadResults.find((r) => r.family === face.family);
        fonts.push({
          family: face.family,
          url,
          loaded: result?.loaded ?? false,
          detail: result?.detail ?? null,
        });
        if (result?.loaded) anyLoaded = true;
      }
      await page.waitForTimeout(800);
    }

    let appReflow: ReflowStats | null = null;
    if (anyLoaded) {
      const after = (await page.evaluate(
        `(() => {
          const out = [];
          const marked = Array.from(document.querySelectorAll("[data-wr-fontqa]"));
          marked.sort((a, b) => Number(a.getAttribute("data-wr-fontqa")) - Number(b.getAttribute("data-wr-fontqa")));
          for (const el of marked) {
            const rect = el.getBoundingClientRect();
            out.push({ w: rect.width, h: rect.height });
          }
          return { elements: out, docHeight: document.documentElement.scrollHeight };
        })()`,
      )) as { elements: { w: number; h: number }[]; docHeight: number };
      const count = Math.min(before.elements.length, after.elements.length);
      const widthDeltas: number[] = [];
      const heightDeltas: number[] = [];
      let changed = 0;
      for (let i = 0; i < count; i++) {
        const dw = Math.abs(after.elements[i].w - before.elements[i].w);
        const dh = Math.abs(after.elements[i].h - before.elements[i].h);
        widthDeltas.push(dw);
        heightDeltas.push(dh);
        if (dw > 0.5 || dh > 0.5) changed++;
      }
      widthDeltas.sort((a, b) => a - b);
      heightDeltas.sort((a, b) => a - b);
      appReflow = {
        elementsMeasured: count,
        elementsChanged: changed,
        widthDelta: {
          p50: percentile(widthDeltas, 50),
          p95: percentile(widthDeltas, 95),
          max: widthDeltas[widthDeltas.length - 1] ?? 0,
        },
        heightDelta: {
          p50: percentile(heightDeltas, 50),
          p95: percentile(heightDeltas, 95),
          max: heightDeltas[heightDeltas.length - 1] ?? 0,
        },
        docHeightBefore: before.docHeight,
        docHeightAfter: after.docHeight,
        docHeightDelta: after.docHeight - before.docHeight,
      };
    }
    await page.close();

    // Pass 2 — isolated sample metrics on a blank page.
    const samples: SampleMetric[] = [];
    if (faces.length > 0) {
      const samplePage = await browser.newPage();
      await samplePage.goto("about:blank");
      await samplePage.evaluate(NAME_SHIM);
      if (fontFaceCss !== "") await samplePage.addStyleTag({ content: fontFaceCss });
      const sampleText =
        "Payments infrastructure for ambitious companies 0123456789";
      for (const face of faces) {
        const fallback =
          fallbackByFamily.get(face.family.toLowerCase()) ?? '"Helvetica Neue", Arial, sans-serif';
        for (const fontSizePx of [16, 32, 48]) {
          const measured = (await samplePage.evaluate(
            `(async () => {
              const mk = (ff) => {
                const span = document.createElement("span");
                span.textContent = ${JSON.stringify(sampleText)};
                span.style.fontFamily = ff;
                span.style.fontSize = "${fontSizePx}px";
                span.style.whiteSpace = "nowrap";
                span.style.position = "absolute";
                document.body.appendChild(span);
                const w = span.getBoundingClientRect().width;
                span.remove();
                return w;
              };
              let webfontWidth = null;
              try {
                await Promise.race([
                  document.fonts.load('${fontSizePx}px "${face.family}"'),
                  new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000)),
                ]);
                if (document.fonts.check('${fontSizePx}px "${face.family}"')) {
                  webfontWidth = mk('"${face.family}"');
                }
              } catch {}
              const fallbackWidth = mk(${JSON.stringify(fallback)});
              return { webfontWidth, fallbackWidth };
            })()`,
          )) as { webfontWidth: number | null; fallbackWidth: number };
          samples.push({
            family: face.family,
            fallbackStack: fallback,
            fontSizePx,
            webfontWidth: measured.webfontWidth,
            fallbackWidth: measured.fallbackWidth,
            widthDeltaPct:
              measured.webfontWidth !== null && measured.webfontWidth > 0
                ? ((measured.fallbackWidth - measured.webfontWidth) / measured.webfontWidth) * 100
                : null,
          });
        }
      }
      await samplePage.close();
    }

    return {
      route: options.route,
      fontsAttempted: faces.length,
      fonts,
      appReflow,
      samples,
      note:
        faces.length === 0
          ? "no @font-face rules in the font inventory (run assets:inventory with --live-font-css to recover them); fallback impact unobserved"
          : anyLoaded
            ? "app reflow = same elements measured before/after loading the SOURCE webfonts over today's fallback rendering; fonts were fetched from the source font host for measurement only and never stored"
            : "no source font could be loaded in the browser; app reflow unobserved",
    };
  } finally {
    await browser.close();
  }
}
