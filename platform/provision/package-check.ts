import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { BuildRecord } from "../build/site-build";
import { RUNTIME_FILE, RuntimeDocSchema, pageFile } from "../portfolio-runtime/contract";
import { SITES_DIR } from "../site/load";
import { ProvisionError, type ProvisionSpec } from "./spec";
import { phoneOf } from "./starter";

/**
 * What a provisioned site's package must be before anything is uploaded — checked on the built
 * files themselves, not on what the builder was asked for:
 *
 *   - it is the SHELL package of THIS site and THIS release (_runtime/portfolio/runtime.json);
 *   - it was built for the spec's origin (robots.txt "Sitemap:" — the line the publisher reads too);
 *   - the home page carries this site's widget key and brand name;
 *   - the portfolio list page is a shell page with its runtime slot (an empty portfolio is then
 *     composed by BoostChat's publisher), and no page shows a project;
 *   - no page prints a phone number or an e-mail address the spec does not have;
 *   - no page carries a trace of ANOTHER site of this checkout (its id, hostname, brand name or
 *     e-mail address), nor an unresolved starter token.
 */

export interface PackageFacts {
  packageHash: string;
  buildInputId: string;
  fileCount: number;
  bytes: number;
  htmlPages: string[];
}

/** React's escaping of text and attribute values — how a brand name appears in the HTML. */
export function escapeHtmlText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export interface ForeignMarker {
  kind: "site id" | "hostname" | "brand name" | "e-mail";
  value: string;
  /** the site it belongs to */
  of: string;
}

/**
 * What identifies every OTHER site of this checkout. A marker that is part of this site's own
 * values (its brand name contains another brand, say) is dropped: it could not be told apart.
 */
export async function foreignMarkers(repoRoot: string, spec: ProvisionSpec): Promise<ForeignMarker[]> {
  const root = path.join(repoRoot, SITES_DIR);
  const own = [spec.siteId, spec.hostname, spec.identity.brandName, spec.contact.email ?? ""].map((v) => v.toLowerCase());
  const markers: ForeignMarker[] = [];
  const add = (kind: ForeignMarker["kind"], value: unknown, of: string) => {
    if (typeof value !== "string" || value.trim().length < 6) return;
    const v = value.trim();
    if (own.some((o) => o.includes(v.toLowerCase()))) return;
    markers.push({ kind, value: v, of });
  };
  const readJson = async (file: string): Promise<any> => JSON.parse(await readFile(file, "utf8").catch(() => "null"));
  for (const e of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    if (!e.isDirectory() || e.name === spec.siteId) continue;
    add("site id", e.name, e.name);
    const site = await readJson(path.join(root, e.name, "site.json")).catch(() => null);
    add("brand name", site?.identity?.brandName, e.name);
    try {
      add("hostname", new URL(String(site?.identity?.publicOrigin)).hostname, e.name);
    } catch {
      // no origin: nothing to look for
    }
    const business = await readJson(path.join(root, e.name, "content/business.json")).catch(() => null);
    add("e-mail", business?.data?.contact?.email, e.name);
  }
  return markers;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Is the marker in the text? Ids and hostnames only as whole names ("demo" is not found in "demo-04"). */
export function hasMarker(text: string, marker: ForeignMarker): boolean {
  if (marker.kind === "site id" || marker.kind === "hostname") return new RegExp(`(?<![a-z0-9.-])${escapeRe(marker.value)}(?![a-z0-9-]|\\.[a-z0-9])`, "i").test(text);
  return text.includes(marker.value) || text.includes(escapeHtmlText(marker.value));
}

async function htmlFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await htmlFiles(path.join(dir, e.name), r)));
    else if (e.name.endsWith(".html")) out.push(r);
  }
  return out.sort();
}

export async function verifyBuiltPackage(opts: { repoRoot: string; packageDir: string; spec: ProvisionSpec }): Promise<PackageFacts> {
  const { spec } = opts;
  const siteRoot = path.join(opts.packageDir, "site");
  const fail = (what: string): never => {
    throw new ProvisionError("package_check_failed", `the built package is not what was asked for: ${what}`);
  };
  const read = async (rel: string) => (await readFile(path.join(siteRoot, rel), "utf8").catch(() => fail(`it has no ${rel}`))) as string;

  const record = JSON.parse((await readFile(path.join(opts.packageDir, "build-record.json"), "utf8").catch(() => fail("it has no build record"))) as string) as BuildRecord;
  if (record.siteId !== spec.siteId || record.status !== "success" || record.qa?.pass !== true) fail("its build record is for another site or did not pass package QA");
  if (record.template.releaseId !== spec.template.releaseId || record.template.releaseHash !== spec.template.releaseHash) fail(`it was built with ${record.template.releaseId}, not ${spec.template.releaseId}`);
  if (!record.portfolioRuntime) fail("it is not a portfolio shell package");

  const runtime = RuntimeDocSchema.safeParse(JSON.parse(await read(RUNTIME_FILE)));
  if (!runtime.success) return fail(`${RUNTIME_FILE} is not a runtime document`);
  const r = runtime.data;
  if (r.siteId !== spec.siteId) fail(`${RUNTIME_FILE} names site "${r.siteId}"`);
  if (r.template.templateId !== spec.template.templateId || r.template.releaseId !== spec.template.releaseId || r.template.releaseHash !== spec.template.releaseHash) fail(`${RUNTIME_FILE} names release ${r.template.releaseId}`);
  if (r.publicOrigin !== spec.publicOrigin) fail(`${RUNTIME_FILE} names origin ${r.publicOrigin}`);

  const baked = /^Sitemap:\s*(https?:\/\/[^/\s]+)\//im.exec(await read("robots.txt"))?.[1];
  if (baked !== spec.publicOrigin) fail(`robots.txt names ${baked ?? "no sitemap origin"}, not ${spec.publicOrigin}`);

  const home = await read("index.html");
  if (!home.includes(spec.boostchat.widgetKey)) fail("index.html does not carry the site's widget key");
  if (!home.includes(escapeHtmlText(spec.identity.brandName))) fail("index.html does not carry the brand name");
  await read("404.html");
  const list = await read(pageFile("/portfolio"));
  if (!/data-portfolio-slot="portfolio\.index"/.test(list)) fail(`${pageFile("/portfolio")} is not a shell page (no portfolio.index runtime slot)`);

  const markers = await foreignMarkers(opts.repoRoot, spec);
  const phone = phoneOf(spec.contact.phone);
  const pages = await htmlFiles(siteRoot);
  for (const page of pages) {
    const html = await read(page);
    const foreign = markers.find((m) => hasMarker(html, m));
    if (foreign) fail(`${page} carries the ${foreign.kind} of another site (${foreign.of})`);
    if (!spec.identity.brandName.includes("{{") && /\{\{(?:brandName|phone|phoneHref|email)\}\}/.test(html)) fail(`${page} carries an unresolved starter token`);
    if (/data-project-card=|href="\/portfolio\/(?!page\/)[a-z0-9]/.test(html)) fail(`${page} shows a project`);
    const tels = [...html.matchAll(/href="(tel:[^"]*)"/g)].map((m) => m[1]!);
    if (tels.some((t) => t !== phone?.href)) fail(`${page} links a phone number the spec does not have`);
    const mails = [...html.matchAll(/href="mailto:([^"?]*)/g)].map((m) => m[1]!);
    if (mails.some((m) => m !== spec.contact.email)) fail(`${page} links an e-mail address the spec does not have`);
  }
  return { packageHash: record.packageHash, buildInputId: record.buildInputId, fileCount: record.qa.files, bytes: record.qa.bytes, htmlPages: pages };
}
