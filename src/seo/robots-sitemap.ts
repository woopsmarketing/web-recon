import type { ProductionSeoPlan } from "./types.js";

/**
 * robots.txt + sitemap generation (Task 21 F/G), consistent with domain state.
 *
 * Preview (no domain): robots.txt disallows everything and names no Sitemap
 * (a Sitemap line requires an absolute URL, and inventing a domain is
 * forbidden). The sitemap artifact is a path-only PLAN (`sitemap.preview.xml`
 * with <loc> values that are absolute-path references, explicitly marked
 * non-standard) — it documents which routes a real sitemap will carry, and
 * the serve boundary answers /sitemap.xml with 404 until a domain exists.
 *
 * Production (domain provided): robots allows crawling and names the absolute
 * sitemap URL; the sitemap carries absolute URLs on that domain.
 */

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateRobotsTxt(plan: ProductionSeoPlan): string {
  if (plan.domainState.mode === "preview") {
    return [
      "# web-recon production preview — no production domain provided (needs-input).",
      "# Preview policy: nothing may be indexed; no Sitemap line (it would require",
      "# an absolute URL and domains are never invented).",
      "User-agent: *",
      "Disallow: /",
      "",
    ].join("\n");
  }
  const domain = plan.domainState.productionDomain.value as string;
  return [
    "User-agent: *",
    "Allow: /",
    `Sitemap: https://${domain}/sitemap.xml`,
    "",
  ].join("\n");
}

export function generateSitemapXml(plan: ProductionSeoPlan): { filename: string; xml: string } {
  const preview = plan.domainState.mode === "preview";
  const origin = preview ? "" : `https://${plan.domainState.productionDomain.value as string}`;
  const lines: string[] = ['<?xml version="1.0" encoding="UTF-8"?>'];
  if (preview) {
    lines.push(
      "<!-- PREVIEW SITEMAP PLAN — NOT a standards-conformant sitemap. The sitemap",
      "     protocol requires fully-qualified URLs; the production domain is",
      "     needs-input, so <loc> values below are path-only placeholders. This file",
      "     is an artifact for review; /sitemap.xml is served 404 in preview. -->",
    );
  }
  lines.push('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
  for (const route of plan.routes) {
    lines.push(`  <url><loc>${xmlEscape(origin + route.path)}</loc></url>`);
  }
  lines.push("</urlset>", "");
  return { filename: preview ? "sitemap.preview.xml" : "sitemap.xml", xml: lines.join("\n") };
}
