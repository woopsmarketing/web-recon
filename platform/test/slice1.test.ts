/**
 * Slice 1 validation — focused unit + integration checks (spec §24 A–Q).
 * Run AFTER `pnpm site:build` for the three fixtures:  pnpm test:platform
 * Lifecycle checks (previous package, failed build, up-to-date) run in a
 * throwaway repo root under the OS temp dir, never against data/sites.
 */
import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createContentReader } from "../content/reader";
import type { Project } from "../content/schema";
import { resolveEffectiveSettings, SettingsError } from "../settings/settings";
import { resolveEffectiveTheme } from "../theme/theme";
import { createSlotReader, resolveSlots } from "../slots/slots";
import { createSiteContext } from "../site/context";
import { buildSiteSnapshot } from "../site/load";
import { buildSite, prepareSiteInput } from "../build/site-build";
import { qaStaticPackage } from "../build/qa";
import { svgProblems } from "../assets/assets";
import { isValidTokenValue } from "../theme/theme";
import {
  collectReleaseSources,
  computeReleaseHash,
  createRelease,
  loadRelease,
  releaseDir,
  scanForbiddenTerms,
  scanTemplateSource,
  verifyRelease,
} from "../release/release";
import template from "../../templates/interior-01/v1/template";

const repoRoot = process.cwd();
const SITES = ["fixture-large", "fixture-small", "fixture-empty"] as const;
let passed = 0;
const failed: string[] = [];

async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(`  FAIL ${name}\n       ${(error as Error).message.split("\n").join("\n       ")}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
async function rejects(fn: () => unknown | Promise<unknown>, re: RegExp) {
  try {
    await fn();
  } catch (error) {
    assert(re.test((error as Error).message), `wrong error: ${(error as Error).message}`);
    return;
  }
  throw new Error(`expected failure matching ${re}`);
}
const readJson = async (f: string) => JSON.parse(await readFile(f, "utf8"));

async function walkFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkFiles(path.join(dir, e.name), r)));
    else out.push(r);
  }
  return out;
}

async function currentPackage(siteId: string) {
  const ptr = await readJson(path.join(repoRoot, "data/site-builds", siteId, "current.json"));
  const dir = path.join(repoRoot, ptr.packageDir);
  return {
    dir,
    record: await readJson(path.join(dir, "build-record.json")),
    html: await readFile(path.join(dir, "site/index.html"), "utf8"),
  };
}

// ------------------------------------------------------------------ units --
console.log("\n[unit] settings");
const pinOf = async (siteId: string) => (await readJson(path.join(repoRoot, "data/sites", siteId, "site.json"))).template;

await check("H unknown section key → FAIL", () =>
  rejects(() => resolveEffectiveSettings(template, { schemaVersion: 1, templateId: "interior-01", overrides: { "home.faq": { title: "x" } } }), /unknown site settings key "home.faq"/),
);
await check("H unknown field inside a declared section → FAIL", () =>
  rejects(() => resolveEffectiveSettings(template, { schemaVersion: 1, templateId: "interior-01", overrides: { "home.projects-a": { columns: 3 } } }), /home.projects-a.*columns|Unrecognized key/),
);
await check("H copy is not a setting: title in settings → FAIL (it is a slot)", () =>
  rejects(() => resolveEffectiveSettings(template, { schemaVersion: 1, templateId: "interior-01", overrides: { "home.projects-a": { title: "x" } } }), /Unrecognized key|title/),
);
await check("H out-of-range value → FAIL", () =>
  rejects(() => resolveEffectiveSettings(template, { schemaVersion: 1, templateId: "interior-01", overrides: { "home.projects-a": { limit: 99 } } }), /limit/),
);
await check("I settings for another template → FAIL", () =>
  rejects(() => resolveEffectiveSettings(template, { schemaVersion: 1, templateId: "other-01", overrides: {} }), /for template "other-01"/),
);
await check("defaults + sparse override = effective; selection REPLACES (no deep merge)", () => {
  const eff = resolveEffectiveSettings(template, {
    schemaVersion: 1,
    templateId: "interior-01",
    overrides: { "home.projects-a": { selection: { mode: "manual", ids: ["a", "b"] } } },
  });
  const s = eff["home.projects-a"];
  assert(s.limit === 8 && s.enabled === true, "defaults not kept");
  assert(JSON.stringify(s.selection) === JSON.stringify({ mode: "manual", ids: ["a", "b"] }), "selection not replaced");
  assert(eff["site.footer"].showSummary === true, "untouched section lost defaults");
});
await check("selection with an extra key (mode latest + category) → FAIL", () =>
  rejects(() => resolveEffectiveSettings(template, { schemaVersion: 1, templateId: "interior-01", overrides: { "home.projects-a": { selection: { mode: "latest", category: "x" } } } }), /selection/),
);
await check("SettingsError type is used", () =>
  rejects(async () => {
    try {
      resolveEffectiveSettings(template, { schemaVersion: 1, templateId: "interior-01", overrides: { nope: {} } });
    } catch (e) {
      assert(e instanceof SettingsError, "not SettingsError");
      throw e;
    }
  }, /nope/),
);

console.log("\n[unit] content reader");
const mk = (id: string, publishedAt: string, category = "c1", status: Project["status"] = "published"): Project => ({
  id,
  slug: id,
  title: id,
  status,
  publishedAt,
  category,
  cover: { asset: "a" },
});
const reader = createContentReader({
  business: {},
  categories: [{ id: "c1", name: "C1" }, { id: "c2", name: "C2" }],
  projects: [
    mk("p-b", "2025-01-02T00:00:00Z"),
    mk("p-a", "2025-01-02T00:00:00Z"),
    mk("p-c", "2025-01-03T00:00:00Z", "c2"),
    mk("p-d", "2025-01-01T00:00:00Z"),
    mk("p-x", "2025-02-01T00:00:00Z", "c1", "draft"),
  ],
});
await check("latest: publishedAt desc, id asc tie-breaker, drafts never served", () => {
  const ids = reader.list({ type: "projects", selection: { mode: "latest" }, limit: 10 }).items.map((p) => p.id);
  assert(ids.join() === "p-c,p-a,p-b,p-d", ids.join());
});
await check("latest orders by INSTANT, not string (offsets, fractional seconds)", () => {
  const r2 = createContentReader({
    business: {},
    categories: [{ id: "c1", name: "C1" }],
    projects: [mk("p-1", "2025-01-01T01:00:00Z"), mk("p-2", "2025-01-01T09:00:00+09:00"), mk("p-3", "2025-01-01T00:00:00.500Z"), mk("p-4", "2025-01-01T00:00:00Z")],
  });
  const ids = r2.list({ type: "projects", selection: { mode: "latest" }, limit: 10 }).items.map((p) => p.id);
  assert(ids.join() === "p-1,p-3,p-2,p-4", ids.join());
});
await check("manual ids must be unique", () =>
  rejects(() => resolveEffectiveSettings(template, { schemaVersion: 1, templateId: "interior-01", overrides: { "home.projects-a": { selection: { mode: "manual", ids: ["a", "a"] } } } }), /unique/),
);
await check("category + limit", () => {
  const ids = reader.list({ type: "projects", selection: { mode: "category", category: "c1" }, limit: 2 }).items.map((p) => p.id);
  assert(ids.join() === "p-a,p-b", ids.join());
});
await check("J manual: order kept, missing/unpublished ids skipped AND reported", () => {
  const r = reader.list({ type: "projects", selection: { mode: "manual", ids: ["p-d", "p-missing", "p-x", "p-c"] }, limit: 10 });
  assert(r.items.map((p) => p.id).join() === "p-d,p-c", r.items.map((p) => p.id).join());
  assert(r.warnings.length === 2 && r.warnings.every((w) => w.code === "manual-id-missing"), JSON.stringify(r.warnings));
});
await check("unknown collection type → FAIL (closed descriptors)", () =>
  rejects(() => reader.list({ type: "posts" } as never), /unknown collection type/),
);

console.log("\n[unit] theme");
await check("site theme token the template does not consume → FAIL", () =>
  rejects(() => resolveEffectiveTheme(template.theme.consumes, template.theme.defaults, { schemaVersion: 1, contract: "theme-contract-v1", tokens: { "decoration.shadow.large": "none" } }), /does not consume/),
);
await check("unknown token / unsafe value → FAIL", async () => {
  await rejects(() => resolveEffectiveTheme(template.theme.consumes, template.theme.defaults, { schemaVersion: 1, contract: "theme-contract-v1", tokens: { "layout.width": "1px" } }), /unknown theme token/);
  await rejects(() => resolveEffectiveTheme(template.theme.consumes, template.theme.defaults, { schemaVersion: 1, contract: "theme-contract-v1", tokens: { "color.canvas": "red;} body{display:none" } }), /unsafe/);
  await rejects(() => resolveEffectiveTheme(template.theme.consumes, template.theme.defaults, { schemaVersion: 1, contract: "theme-contract-v1", tokens: { "color.canvas": "url(https://x.test/a.png)" } }), /unsafe/);
  await rejects(() => resolveEffectiveTheme(template.theme.consumes, template.theme.defaults, { schemaVersion: 1, contract: "theme-contract-v1", tokens: { "color.canvas": 'image-set("https://evil.test/x.png" 1x)' } }), /unsafe/);
  await rejects(() => resolveEffectiveTheme(template.theme.consumes, template.theme.defaults, { schemaVersion: 1, contract: "theme-contract-v1", tokens: { "color.canvas": "red /* x" } }), /unsafe/);
  await rejects(() => resolveEffectiveTheme(template.theme.consumes, template.theme.defaults, { schemaVersion: 1, contract: "theme-contract-v1", tokens: { "decoration.radius.medium": "var(--x)" } }), /unsafe/);
});
await check("per-token grammar keeps every curated library theme + template default valid", async () => {
  const dir = path.join(repoRoot, "themes/library");
  for (const f of await readdir(dir)) {
    const t = await readJson(path.join(dir, f));
    for (const [k, v] of Object.entries(t.tokens as Record<string, string>)) assert(isValidTokenValue(k as never, v), `${f} ${k}=${v}`);
  }
});

console.log("\n[unit] assets / QA scanners");
await check("SVG assets must be inert + self-contained", () => {
  assert(svgProblems('<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(#g)"/></svg>').length === 0, "clean svg rejected");
  for (const bad of ['<svg><script>x</script></svg>', '<svg><image href="https://evil.test/a.png"/></svg>', '<svg onload="x()"></svg>', '<svg><style>@import "x.css";</style></svg>', '<svg><use xlink:href="//cdn.test/s.svg#a"/></svg>', "<svg><foreignObject/></svg>"]) {
    assert(svgProblems(bad).length > 0, `accepted: ${bad}`);
  }
});
await check("package QA catches remote refs in inline <style>, style=, @import, look-alike origins", async () => {
  const d = await mkdtemp(path.join(os.tmpdir(), "slice1-qa-"));
  try {
    await writeFile(path.join(d, "index.html"), `<html lang="en"><head><style>:root{--x:1}body{background:url(https://evil.test/a.png)}</style></head><body><div style="background-image:image-set('//cdn.test/b.png' 1x)"></div><a href="https://site.example.evil.com/">x</a><a href="https://site.example/ok">ok</a></body></html>`);
    await writeFile(path.join(d, "a.css"), `@import "https://evil.test/c.css";`);
    const qa = await qaStaticPackage({ outDir: d, routes: [{ path: "/" }], forbiddenTerms: [], publicOrigin: "https://site.example" });
    const why = qa.failures.map((f) => f.why).join(" | ");
    assert(!qa.pass, "passed");
    for (const needle of ["remote CSS url https://evil.test/a.png", "image-set", "remote reference https://site.example.evil.com/", "CSS @import"]) assert(why.includes(needle), `missing "${needle}" in ${why}`);
    assert(!why.includes("https://site.example/ok"), "own origin flagged");
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});

console.log("\n[unit] slots");
const slotDoc = (values: Record<string, Record<string, unknown>>, templateId = "interior-01") => ({ schemaVersion: 1, templateId, values });
const bind = { "business.summary": "Bound summary." };
await check("slot fallback: site value → binding → neutral default → hide", () => {
  const r = resolveSlots(template, slotDoc({ "home.projects-a": { title: "Custom" } }), bind);
  assert(r["home.projects-a"]!.title!.source === "site" && r["home.projects-a"]!.title!.value === "Custom", "site value");
  assert(r["site.footer"]!.summary!.source === "binding" && r["site.footer"]!.summary!.value === "Bound summary.", "binding");
  assert(r["site.header"]!.contactLabel!.source === "neutral-default" && r["site.header"]!.contactLabel!.value === "Contact", "neutral default");
  assert(r["home.projects-a"]!.description!.source === "hidden" && r["home.projects-a"]!.description!.value === undefined, "hide optional");
  const noBinding = resolveSlots(template, undefined, {});
  assert(noBinding["site.footer"]!.summary!.source === "hidden", "binding absent → hidden");
  const override = resolveSlots(template, slotDoc({ "site.footer": { summary: "Site copy wins." } }), bind);
  assert(override["site.footer"]!.summary!.value === "Site copy wins.", "site value must beat binding");
});
await check("slot fallback: required slot with no value → needs-input (build fails, nothing invented)", () => {
  const t = { id: "t", sections: { "s.a": { slots: { heading: { type: "text" as const, maxLength: 20, required: true }, cta: { type: "link" as const, required: true } } } } };
  return rejects(() => resolveSlots(t, undefined, {}), /needs-input: .*s\.a\.heading, s\.a\.cta/);
});
await check("unknown slot section / unknown slot key / other template → FAIL", async () => {
  await rejects(() => resolveSlots(template, slotDoc({ "home.faq": { title: "x" } }), bind), /unknown slot section "home.faq"/);
  await rejects(() => resolveSlots(template, slotDoc({ "home.projects-a": { moreLink: { label: "x", href: "/" } } }), bind), /unknown slot "home.projects-a.moreLink"/);
  await rejects(() => resolveSlots(template, slotDoc({}, "other-01"), bind), /for template "other-01"/);
});
await check("slot value types are narrow: wrong type, markup, over-length, arbitrary JSON, per-item arrays → FAIL", async () => {
  await rejects(() => resolveSlots(template, slotDoc({ "home.projects-a": { title: { text: "x" } } }), bind), /title/);
  await rejects(() => resolveSlots(template, slotDoc({ "home.projects-a": { title: "<b>x</b>" } }), bind), /plain text/);
  await rejects(() => resolveSlots(template, slotDoc({ "home.projects-a": { title: "x".repeat(41) } }), bind), /title/);
  await rejects(() => resolveSlots(template, slotDoc({ "home.projects-a": { description: { paragraphs: ["a"], html: "<p>" } } }), bind), /description/);
  await rejects(() => resolveSlots(template, slotDoc({ "home.projects-a": { title: ["card 1 title", "card 2 title"] } }), bind), /title/);
  await rejects(() => resolveSlots(template, slotDoc({ "home.projects-a": { "items.0.title": "x" } }), bind), /unknown slot/);
});
await check("link/media slot schemas: safe hrefs only; media = asset ref + alt", () => {
  const t = { id: "t", sections: { s: { slots: { l: { type: "link" as const }, m: { type: "media" as const } } } } };
  const ok = resolveSlots(t, { schemaVersion: 1, templateId: "t", values: { s: { l: { label: "Call", href: "tel:+82-2-000-0000" }, m: { asset: "cover-01", alt: "x" } } } }, {});
  const rd = createSlotReader(ok, t);
  assert(rd.link("s", "l")?.href === "tel:+82-2-000-0000" && rd.media("s", "m")?.asset === "cover-01", "values");
  for (const href of ["/about", "#projects", "mailto:a@b.example"]) resolveSlots(t, { schemaVersion: 1, templateId: "t", values: { s: { l: { label: "x", href } } } }, {});
  for (const href of ["javascript:alert(1)", "http://insecure.test/", "https://external.test/", "//cdn.test/x", "//evilcom", "data:text/html,x"]) {
    let threw = false;
    try {
      resolveSlots(t, { schemaVersion: 1, templateId: "t", values: { s: { l: { label: "x", href } } } }, {});
    } catch {
      threw = true;
    }
    assert(threw, `href accepted: ${href}`);
  }
  return rejects(() => rd.text("s", "l"), /is link, read as text/);
});
await check("neutral defaults and bound content are validated against the slot contract", async () => {
  const t1 = { id: "t", sections: { s: { slots: { a: { type: "text" as const, maxLength: 5, neutralDefault: "Much too long default" } } } } };
  await rejects(() => resolveSlots(t1, undefined, {}), /neutral default invalid/);
  const t2 = { id: "t", sections: { s: { slots: { a: { type: "text" as const, maxLength: 10, binding: "business.summary" as const } } } } };
  await rejects(() => resolveSlots(t2, undefined, { "business.summary": "<b>way too long for this slot</b>" }), /bound value invalid/);
});
await check("prototype keys in site JSON are refused at the store boundary", async () => {
  const d = await mkdtemp(path.join(os.tmpdir(), "slice1-proto-"));
  try {
    await cp(path.join(repoRoot, "data/sites/fixture-small"), path.join(d, "data/sites/fixture-small"), { recursive: true });
    await writeFile(path.join(d, "data/sites/fixture-small/slots.json"), '{"schemaVersion":1,"templateId":"interior-01","values":{"__proto__":{"x":"y"}}}');
    await rejects(() => buildSiteSnapshot({ repoRoot: d, siteId: "fixture-small", mode: "public", at: "2026-09-18T00:00:00Z" }), /forbidden key "__proto__"/);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});
await check("template code cannot read an undeclared slot", () =>
  rejects(() => createSlotReader(resolveSlots(template, undefined, bind), template).text("home.projects-a", "subtitle"), /undeclared slot/),
);

console.log("\n[unit] site context / release pin");
await check("I createSiteContext with a different release than the site pin → FAIL", async () => {
  const { snapshot } = await buildSiteSnapshot({ repoRoot, siteId: "fixture-small", mode: "public", at: "2026-09-18T00:00:00Z" });
  const pin = snapshot.site.template;
  await rejects(
    () => createSiteContext({ siteId: "fixture-small", template, mode: "public", at: "x", snapshot, templateRelease: { ...pin, releaseId: "interior-01-1.0.0-000000000000", releaseHash: "0".repeat(64) } }),
    /pinned to .* but is being built with release/,
  );
  await rejects(
    () => createSiteContext({ siteId: "fixture-small", template, mode: "public", at: "x", snapshot, templateRelease: { ...pin, templateVersion: "2.0.0" } }),
    /does not describe template code/,
  );
  await rejects(
    () => createSiteContext({ siteId: "fixture-large", template, mode: "public", at: "x", snapshot, templateRelease: pin }),
    /snapshot is for site/,
  );
  const ok = createSiteContext({ siteId: "fixture-small", template, mode: "public", at: "x", snapshot, templateRelease: pin });
  assert(ok.settings["home.projects-a"].limit === 4, "effective settings wrong");
});
await check("BLOCKER fix: releaseId is an id, never a path (traversal / id≠hash refused)", async () => {
  const pin = await pinOf("fixture-small");
  await rejects(() => releaseDir(repoRoot, "interior-01", "../../../tmp/x"), /invalid releaseId/);
  await rejects(() => loadRelease(repoRoot, "interior-01", "interior-01-1.0.0-../../x"), /invalid releaseId/);
  const d = await mkdtemp(path.join(os.tmpdir(), "slice1-pin-"));
  try {
    await mkdir(path.join(d, "data/sites/fixture-small"), { recursive: true });
    await cp(path.join(repoRoot, "data/sites/fixture-small"), path.join(d, "data/sites/fixture-small"), { recursive: true });
    await symlink(path.join(repoRoot, "data/template-releases"), path.join(d, "data/template-releases"));
    const f = path.join(d, "data/sites/fixture-small/site.json");
    const site = await readJson(f);
    site.template.releaseId = "../../../tmp/x";
    await writeFile(f, JSON.stringify(site));
    await rejects(() => prepareSiteInput({ repoRoot: d, siteId: "fixture-small", mode: "public", at: "2026-09-18T00:00:00Z" }), /releaseId/);
    site.template = { ...pin, releaseHash: "f".repeat(64) };
    await writeFile(f, JSON.stringify(site));
    await rejects(() => prepareSiteInput({ repoRoot: d, siteId: "fixture-small", mode: "public", at: "2026-09-18T00:00:00Z" }), /releaseId must equal/);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
});
await check("I settings selecting an unknown category → FAIL (no silently empty section)", async () => {
  const { snapshot } = await buildSiteSnapshot({ repoRoot, siteId: "fixture-small", mode: "public", at: "2026-09-18T00:00:00Z" });
  const bad = structuredClone(snapshot);
  (bad.settings.overrides["home.projects-a"] as { selection: unknown }).selection = { mode: "category", category: "residental" };
  await rejects(() => createSiteContext({ siteId: "fixture-small", template, mode: "public", at: "x", snapshot: bad, templateRelease: snapshot.site.template }), /unknown category "residental"/);
});
await check("preview mode includes drafts + scheduled; public does not", async () => {
  const pub = await prepareSiteInput({ repoRoot, siteId: "fixture-large", mode: "public", at: "2026-09-18T00:00:00Z" });
  const pre = await prepareSiteInput({ repoRoot, siteId: "fixture-large", mode: "preview", at: "2026-09-18T00:00:00Z" });
  assert(pub.snapshot.content.projects.length === 173 && pre.snapshot.content.projects.length === 176, `${pub.snapshot.content.projects.length}/${pre.snapshot.content.projects.length}`);
  const ctx = createSiteContext({ siteId: "fixture-large", template, mode: "preview", at: "x", snapshot: pre.snapshot, templateRelease: pre.snapshot.site.template });
  const ids = ctx.content.list({ type: "projects", selection: { mode: "latest" }, limit: 3 }).items.map((p) => p.id);
  assert(ids[0] === "hp-0176", `preview latest ${ids.join()}`);
});
await check("I site:build with an explicit different release → FAIL (no silent upgrade)", () =>
  rejects(() => prepareSiteInput({ repoRoot, siteId: "fixture-small", mode: "public", at: "2026-09-18T00:00:00Z", releaseId: "interior-01-9.9.9-abcdefabcdef" }), /release mismatch/),
);

console.log("\n[static] template source rules (L, M, N)");
const templateRoot = path.join(repoRoot, "templates");
const templateFiles = (await walkFiles(templateRoot)).filter((f) => !/(^|\/)(node_modules|\.next|out)\//.test(f));
await check("templates/ contains exactly one Template major (no per-site forks)", async () => {
  const majors = (await readdir(templateRoot)).flatMap((t) => [t]);
  assert(majors.join() === "interior-01", `templates: ${majors.join()}`);
  assert((await readdir(path.join(templateRoot, "interior-01"))).join() === "v1", "unexpected template dirs");
});
await check("L/M/N no fs/Supabase/DB/legacy imports, no siteId literals, no wall clock, no env reads", async () => {
  const siteIds = await readdir(path.join(repoRoot, "data/sites"));
  const findings = [];
  for (const f of templateFiles) findings.push(...scanTemplateSource(`templates/${f}`, await readFile(path.join(templateRoot, f), "utf8"), [...siteIds, "fixture-"]));
  assert(findings.length === 0, JSON.stringify(findings));
});
await check("scanner self-test catches each violation class", () => {
  const bad = [
    'import { readFileSync } from "node:fs";',
    'import { createClient } from "@supabase/supabase-js";',
    'import x from "../../../src/production/bake";',
    'const fs = await import("node:fs");',
    'import { buildSiteSnapshot } from "@platform/site/load";',
    'import { createRelease } from "@platform/release/release";',
    'import http from "node:http";',
    'const r = await fetch("https://x.test");',
    "const t = Date.now();",
    "const d = new Date;",
    "const e = Date();",
    'const s = "fixture-large";',
    "const k = process.env.KEY;",
    // bypasses reported by the second independent review — all must be caught (AST, not regex)
    'import { readFileSync /* x */ } from "node:fs";',
    'import {\n  readFileSync, // c\n} from "node:fs";',
    'import"node:fs";',
    'import snap from "../../../../.recon/snapshot.json";',
    'const fs = process.getBuiltinModule("node:fs");',
    'const k = process["env"].X;',
    "const n = new Intl.DateTimeFormat().format();",
    "const h = process.hrtime();",
    "const f = globalThis.fetch; f('https://x.test');",
    "const r = Math.random();",
    'export * from "@platform/site/load";',
    'type T = import("@platform/release/release").ReleaseRecord;',
    "const u = import.meta.url;",
  ];
  for (const line of bad) assert(scanTemplateSource("templates/interior-01/v1/sections/X.tsx", line, ["fixture-large"]).length > 0, `not caught: ${line}`);
  const good = 'import Link from "next/link";\nimport { getSiteContext } from "@platform/site/bound";\nimport t from "../template";\nimport "../styles/template.css";\nexport const x = { process: 1, Date: 2 }.process;';
  const g = scanTemplateSource("templates/interior-01/v1/sections/X.tsx", good, []);
  assert(g.length === 0, `false positive: ${JSON.stringify(g)}`);
});
await check("Q templates/**: forbidden source terms only in provenance.json", async () => {
  const release = await loadRelease(repoRoot, "interior-01", (await pinOf("fixture-large")).releaseId);
  const hits = [];
  for (const f of templateFiles) {
    if (f.endsWith("provenance.json")) continue;
    hits.push(...scanForbiddenTerms(f, await readFile(path.join(templateRoot, f), "utf8"), release.forbiddenTerms));
  }
  assert(hits.length === 0, JSON.stringify(hits));
});
/** True when an import specifier reaches the legacy repo-root src/ pipeline (relative paths resolved; not any "src/" segment). */
function legacySrc(base: string, file: string, spec: string): boolean {
  const target = spec.startsWith(".") ? path.resolve(repoRoot, base, path.dirname(file), spec) : spec;
  return spec.startsWith(".") ? target.startsWith(path.join(repoRoot, "src") + path.sep) : /^(\.\.\/)*src\//.test(spec);
}
await check("platform/ + templates/ never import the legacy src/ pipeline", async () => {
  const hits: string[] = [];
  for (const base of ["platform", "templates"]) {
    for (const f of await walkFiles(path.join(repoRoot, base))) {
      // platform/test holds deliberate negative samples for the scanner self-test.
      if (!/\.(ts|tsx|mjs)$/.test(f) || f.includes("node_modules") || (base === "platform" && f.startsWith("test/"))) continue;
      const text = await readFile(path.join(repoRoot, base, f), "utf8");
      for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
        if (legacySrc(base, f, m[1]!) || /^(playwright|parse5|pino|firecrawl)/.test(m[1]!)) hits.push(`${base}/${f}: ${m[1]}`);
      }
    }
  }
  assert(hits.length === 0, hits.join("\n"));
});

/** Outer HTML of the element carrying data-section="<id>" (section-nesting aware); "" when absent. */
function sectionHtml(html: string, id: string): string {
  const at = html.indexOf(`data-section="${id}"`);
  if (at < 0) return "";
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-z]+)/.exec(html.slice(start))?.[1] ?? "section";
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index + m[0].length);
  }
  return html.slice(start);
}

// ---------------------------------------------------------- integration --
console.log("\n[integration] three fixture packages");
const pkgs = Object.fromEntries(await Promise.all(SITES.map(async (s) => [s, await currentPackage(s)] as const)));

await check("A all three sites pin and were built with the SAME exact release", async () => {
  const pins = await Promise.all(SITES.map(pinOf));
  const ids = new Set(pins.map((p) => `${p.releaseId}|${p.releaseHash}`));
  const built = new Set(SITES.map((s) => `${pkgs[s].record.template.releaseId}|${pkgs[s].record.template.releaseHash}`));
  assert(ids.size === 1 && built.size === 1 && [...ids][0] === [...built][0], `${[...ids]} vs ${[...built]}`);
  const rel = await loadRelease(repoRoot, pins[0].templateId, pins[0].releaseId);
  await verifyRelease(repoRoot, rel);
});
await check("B all three used the SAME Template source (templateSourceHash)", async () => {
  const hashes = new Set(SITES.map((s) => pkgs[s].record.template.templateSourceHash));
  const rel = await loadRelease(repoRoot, "interior-01", (await pinOf("fixture-large")).releaseId);
  assert(hashes.size === 1 && hashes.has(rel.templateSourceHash), [...hashes].join());
});
await check("C fixture-large renders the default count (8) of the latest 173 visible projects", async () => {
  const p = pkgs["fixture-large"];
  const all = (await readJson(path.join(repoRoot, "data/sites/fixture-large/content/projects.json"))).items as Project[];
  const expected = all
    .filter((x) => x.status === "published" && x.publishedAt <= "2026-09-18T00:00:00Z")
    .sort((a, b) => (a.publishedAt !== b.publishedAt ? (a.publishedAt < b.publishedAt ? 1 : -1) : a.id < b.id ? -1 : 1));
  assert(expected.length === 173, `visible ${expected.length}`);
  const ids = [...sectionHtml(p.html, "home.projects-a").matchAll(/data-project-card="([^"]+)"/g)].map((m) => m[1]);
  assert(ids.join() === expected.slice(0, 8).map((x) => x.id).join(), ids.join());
  assert(p.html.includes(">Selected projects</h2>"), "default title missing");
  assert(!p.html.includes("hp-0176") && !p.html.includes("hp-0040"), "scheduled/draft leaked");
});
await check("D fixture-small renders 4 residential projects + custom title", async () => {
  const p = pkgs["fixture-small"];
  const ids = [...sectionHtml(p.html, "home.projects-a").matchAll(/data-project-card="([^"]+)"/g)].map((m) => m[1]);
  const all = (await readJson(path.join(repoRoot, "data/sites/fixture-small/content/projects.json"))).items as Project[];
  const byId = new Map(all.map((x) => [x.id, x]));
  assert(ids.length === 4, `count ${ids.length}`);
  assert(ids.every((id) => byId.get(id!)?.category === "residential"), "non-residential card");
  assert(p.html.includes(">주거 공간 프로젝트</h2>"), "custom title missing");
  assert(p.html.includes(">프로젝트</a>") && p.html.includes(">문의하기</a>"), "header label overrides missing");
});
await check("E fixture-empty: NO projects section, NO wrapper, NO anchor, NO fake card", () => {
  const h = pkgs["fixture-empty"].html;
  for (const needle of ['data-section="home.projects-a"', 'data-section="home.projects-b"', 'id="projects"', 'id="projects-more"', "i1-projects", "i1-track", "data-project-card", 'href="#projects"']) {
    assert(!h.includes(needle), `found ${needle}`);
  }
  // 1.3.0: the homepage keeps only the sections this site has data for (hero + text intro) —
  // nothing else sits in <main>, so no empty projects wrapper can hide there.
  const main = /<main class="i1-main">([\s\S]*)<\/main>/.exec(h)?.[1] ?? "";
  const inMain = [...main.matchAll(/data-section="([^"]+)"/g)].map((m) => m[1]);
  assert(inMain.join() === "home.hero,home.intro", `main sections: ${inMain.join()}`);
  assert(h.includes('data-section="site.header"') && h.includes('data-section="site.footer"'), "header/footer missing");
});
await check("F theme differs where expected (small overrides; large/empty = template default)", () => {
  const css = (h: string) => /<style id="site-theme">([^<]*)<\/style>/.exec(h)?.[1] ?? "";
  const [l, s, e] = SITES.map((x) => css(pkgs[x].html));
  assert(l.includes("--color-canvas:rgb(255, 255, 255)") && s.includes("--color-canvas:rgb(250, 245, 238)"), "canvas");
  assert(s.includes("--typography-heading:Georgia") && s.includes("--decoration-radius-medium:14px"), "small overrides");
  assert(l === e, "large and empty should share the default theme");
  assert(l !== s, "small theme identical to default");
});
await check("G identity/content differ where expected", () => {
  const t = (h: string) => [/<title>([^<]*)<\/title>/.exec(h)?.[1], /<html[^>]*lang="([^"]+)"/.exec(h)?.[1]];
  assert(t(pkgs["fixture-large"].html).join() === "Harbor &amp; Pine Studio,en-US", t(pkgs["fixture-large"].html).join());
  assert(t(pkgs["fixture-small"].html).join() === "마루 아틀리에 (가상),ko-KR", t(pkgs["fixture-small"].html).join());
  assert(t(pkgs["fixture-empty"].html).join() === "Quiet Room Works,en-GB", t(pkgs["fixture-empty"].html).join());
  assert(pkgs["fixture-large"].html.includes('class="i1-header__logo"'), "large logo missing");
  assert(pkgs["fixture-small"].html.includes('class="i1-header__wordmark"'), "small wordmark fallback missing");
  assert(!pkgs["fixture-empty"].html.includes("mailto:"), "empty has no email → no contact link");
});
await check("header/footer/card links are real <a href> and all resolve (no dead links)", async () => {
  for (const s of SITES) {
    const hrefs = [...pkgs[s].html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]!);
    assert(hrefs.includes("/"), `${s}: no home link`);
    for (const h of hrefs) {
      if (h === "/" || h.startsWith("mailto:")) continue;
      if (h.startsWith("#")) {
        assert(pkgs[s].html.includes(`id="${h.slice(1)}"`), `${s}: dangling anchor ${h}`);
        continue;
      }
      // Template routes (Step 4): /portfolio and /portfolio/<slug>; (1.5.0) the static pages
      // /3d-portfolio, /about, /contact — each must be an emitted page of this package
      assert(/^\/portfolio(\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(h) || /^\/(3d-portfolio|about|contact)$/.test(h), `${s}: unexpected link ${h}`);
      const file = path.join(pkgs[s].dir, "site", `${h.slice(1)}.html`);
      assert(await stat(file).then(() => true, () => false), `${s}: link ${h} has no page`);
    }
  }
});
await check("Q packages: no source host/API/brand/assets/runtime (all emitted files) + no remote refs", async () => {
  const rel = await loadRelease(repoRoot, "interior-01", (await pinOf("fixture-large")).releaseId);
  const terms = [...rel.forbiddenTerms, "amazonaws.com", "_next/data", "__NEXT_DATA__", "karrot", "kakao"];
  for (const s of SITES) {
    const qa = await qaStaticPackage({ outDir: path.join(pkgs[s].dir, "site"), routes: [{ path: "/" }], forbiddenTerms: terms, publicOrigin: `https://${s}.example` });
    assert(qa.pass, `${s}: ${JSON.stringify(qa.failures.slice(0, 5))}`);
  }
});
await check("package assets are content-addressed and byte-identical to the snapshot", async () => {
  const { sha256 } = await import("../util/hash");
  for (const s of SITES) {
    const { snapshot } = await buildSiteSnapshot({ repoRoot, siteId: s, mode: "public", at: pkgs[s].record.at });
    const dir = path.join(pkgs[s].dir, "site/assets");
    const files = (await readdir(path.join(pkgs[s].dir, "site"))).includes("assets") ? (await readdir(dir)).sort() : [];
    assert(files.join() === snapshot.assets.map((a) => a.publicPath.slice("/assets/".length)).sort().join(), `${s}: file set differs`);
    for (const a of snapshot.assets) {
      const h = sha256(await readFile(path.join(dir, a.publicPath.slice("/assets/".length))));
      assert(h === a.sha256 && a.publicPath.includes(h.slice(0, 20)), `${s}: ${a.id} bytes differ`);
    }
  }
});
await check("pinned release == current working-tree template/platform runtime (no drift since release)", async () => {
  const pin = await pinOf("fixture-large");
  const rel = await loadRelease(repoRoot, "interior-01", pin.releaseId);
  const { sources } = await collectReleaseSources(repoRoot, "interior-01", 1);
  const { sha256 } = await import("../util/hash");
  const files = [];
  for (const [p, abs] of sources) files.push({ path: p, sha256: sha256(await readFile(abs)) });
  assert(computeReleaseHash({ ...rel, files }) === pin.releaseHash, "working tree differs from the pinned release (re-release + re-pin needed)");
});

await check("SLOT override proof: same Template code renders different slot copy per site", () => {
  const l = pkgs["fixture-large"].html;
  const s = pkgs["fixture-small"].html;
  const e = pkgs["fixture-empty"].html;
  // home.projects-a.title: neutral default (large) vs site value (small)
  assert(l.includes(">Selected projects</h2>") && !s.includes("Selected projects"), "title");
  assert(s.includes(">주거 공간 프로젝트</h2>"), "small title slot");
  // home.projects-a.description: site values differ; hidden when absent
  assert(l.includes("Recent homes from our fictional fixture portfolio, newest first.") && s.includes("가상의 주거 공간 작업 중 최근 네 곳을 소개합니다."), "description");
  assert(!e.includes("i1-projects__intro"), "empty must not render description");
  // site.header labels: neutral default (large) vs site value (small)
  assert(l.includes(">Projects</a>") && l.includes(">Contact</a>") && s.includes(">프로젝트</a>") && s.includes(">문의하기</a>"), "header labels");
  assert(l.includes("<dt>Company</dt>") && s.includes("<dt>상호</dt>") && s.includes("<dt>이메일</dt>"), "footer label slots");
  assert(l.includes('aria-label="Harbor &amp; Pine Studio — Home"') && s.includes('aria-label="마루 아틀리에 (가상) — 홈"'), "home link label slot");
  // site.footer.summary: binding to business.summary in every site (no duplicated copy)
  assert(l.includes("A fictional residential interior studio") && e.includes("A fictional, newly opened studio"), "footer binding");
  const src = (x: string) => pkgs[x].record.preflight.slotSources;
  assert(src("fixture-large")["home.projects-a"].title === "neutral-default" && src("fixture-small")["home.projects-a"].title === "site", "recorded title sources");
  assert(src("fixture-large")["site.footer"].summary === "binding" && src("fixture-empty")["home.projects-a"].description === "hidden", "recorded binding/hidden");
});

console.log("\n[integration] build identity");
await check("O same inputs → same buildInputId (and = recorded package id)", async () => {
  for (const s of SITES) {
    const a = await prepareSiteInput({ repoRoot, siteId: s, mode: "public", at: "2026-09-18T12:00:00Z" });
    const b = await prepareSiteInput({ repoRoot, siteId: s, mode: "public", at: "2026-09-19T12:00:00Z" });
    assert(a.buildInputId === b.buildInputId, `${s}: id changed with a visibility-neutral time`);
    assert(a.buildInputId === pkgs[s].record.buildInputId, `${s}: differs from built package`);
  }
});
await check("mode is part of the identity (public ≠ preview)", async () => {
  const a = await prepareSiteInput({ repoRoot, siteId: "fixture-small", mode: "public", at: "2026-09-18T12:00:00Z" });
  const b = await prepareSiteInput({ repoRoot, siteId: "fixture-small", mode: "preview", at: "2026-09-18T12:00:00Z" });
  assert(a.buildInputId !== b.buildInputId, "same id");
});
await check("visibility time only matters through content: scheduled item appears after its date", async () => {
  const before = await prepareSiteInput({ repoRoot, siteId: "fixture-large", mode: "public", at: "2030-12-31T00:00:00Z" });
  const after = await prepareSiteInput({ repoRoot, siteId: "fixture-large", mode: "public", at: "2031-01-02T00:00:00Z" });
  assert(before.snapshot.content.projects.length === 173 && after.snapshot.content.projects.length === 174, "visibility");
  assert(before.buildInputId !== after.buildInputId, "id should change when visible content changes");
});

// ------------------------------------------- lifecycle in a throwaway root --
console.log("\n[integration] lifecycle (throwaway repo root)");
const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "slice1-root-"));
try {
  await mkdir(path.join(tmpRoot, "data/sites"), { recursive: true });
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(tmpRoot, "data/template-releases"));
  await symlink(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"));
  await cp(path.join(repoRoot, "data/sites/fixture-small"), path.join(tmpRoot, "data/sites/fixture-small"), { recursive: true });
  const site = (f: string) => path.join(tmpRoot, "data/sites/fixture-small", f);
  const at = "2026-09-18T00:00:00Z";
  const idOf = async () => (await prepareSiteInput({ repoRoot: tmpRoot, siteId: "fixture-small", mode: "public", at })).buildInputId;
  const base = await idOf();

  await check("P changed content → changed snapshot/buildInputId", async () => {
    const f = site("content/projects.json");
    const orig = await readFile(f, "utf8");
    const doc = JSON.parse(orig);
    doc.items[0].title = "가상의 한옥 거실 개조 (수정)";
    await writeFile(f, JSON.stringify(doc));
    assert((await idOf()) !== base, "content change not detected");
    await writeFile(f, orig);
    assert((await idOf()) === base, "revert did not restore the id");
  });
  await check("P changed settings → changed buildInputId", async () => {
    const f = site("settings.json");
    const orig = await readFile(f, "utf8");
    const doc = JSON.parse(orig);
    doc.overrides["home.projects-a"].limit = 3;
    await writeFile(f, JSON.stringify(doc));
    assert((await idOf()) !== base, "settings change not detected");
    await writeFile(f, orig);
  });
  await check("P changed theme → changed buildInputId", async () => {
    const f = site("theme.json");
    const orig = await readFile(f, "utf8");
    const doc = JSON.parse(orig);
    doc.tokens["color.canvas"] = "rgb(1, 2, 3)";
    await writeFile(f, JSON.stringify(doc));
    assert((await idOf()) !== base, "theme change not detected");
    await writeFile(f, orig);
  });
  await check("P changed slot value → changed buildInputId", async () => {
    const f = site("slots.json");
    const orig = await readFile(f, "utf8");
    const doc = JSON.parse(orig);
    doc.values["home.projects-a"].title = "주거 프로젝트 모음";
    await writeFile(f, JSON.stringify(doc));
    assert((await idOf()) !== base, "slot change not detected");
    await writeFile(f, orig);
    assert((await idOf()) === base, "revert did not restore the id");
  });
  await check("P changed asset bytes → changed buildInputId", async () => {
    const f = site("assets/cover-01.svg");
    const orig = await readFile(f, "utf8");
    await writeFile(f, orig.replace("</svg>", "<rect width='1' height='1'/></svg>"));
    assert((await idOf()) !== base, "asset change not detected");
    await writeFile(f, orig);
    assert((await idOf()) === base, "revert did not restore the id");
  });
  await check("K reference-fixture origin under data/sites → FAIL", async () => {
    const f = site("content/projects.json");
    const orig = await readFile(f, "utf8");
    await writeFile(f, orig.replace('"origin": "synthetic-fixture"', '"origin": "reference-fixture"'));
    await rejects(() => idOf(), /origin "reference-fixture" is not allowed/);
    await writeFile(f, orig);
  });
  await check("placement fields are rejected by the content model (isMainBannerDisplay)", async () => {
    const f = site("content/projects.json");
    const orig = await readFile(f, "utf8");
    const doc = JSON.parse(orig);
    doc.items[0].isMainBannerDisplay = true;
    await writeFile(f, JSON.stringify(doc));
    await rejects(() => idOf(), /isMainBannerDisplay|Unrecognized key/);
    await writeFile(f, orig);
  });
  await check("missing asset reference → FAIL", async () => {
    const f = site("assets/registry.json");
    const orig = await readFile(f, "utf8");
    const doc = JSON.parse(orig);
    doc.items = doc.items.filter((a: { id: string }) => a.id !== "cover-01");
    await writeFile(f, JSON.stringify(doc));
    await rejects(() => idOf(), /asset "cover-01" is referenced but not in/);
    await writeFile(f, orig);
  });

  let first = "";
  await check("build #1 in throwaway root succeeds", async () => {
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "fixture-small", at });
    assert(r.status === "built", r.status);
    first = r.record.buildInputId;
  });
  await check("O rebuild with identical inputs → up-to-date, no new package", async () => {
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "fixture-small", at: "2026-09-18T06:00:00Z" });
    assert(r.status === "up-to-date" && r.buildInputId === first, r.status);
  });
  await check("H unknown settings key → build FAILS and current package is untouched", async () => {
    const f = site("settings.json");
    const orig = await readFile(f, "utf8");
    const doc = JSON.parse(orig);
    doc.overrides["home.hero-z"] = { title: "x" };
    await writeFile(f, JSON.stringify(doc));
    await rejects(() => buildSite({ repoRoot: tmpRoot, siteId: "fixture-small", at }), /unknown site settings key "home.hero-z"/);
    await writeFile(f, orig);
    const cur = await readJson(path.join(tmpRoot, "data/site-builds/fixture-small/current.json"));
    assert(cur.buildInputId === first, "current moved after a failed build");
  });
  let second = "";
  await check("previous successful package retained when a new build replaces it", async () => {
    const f = site("content/projects.json");
    const doc = JSON.parse(await readFile(f, "utf8"));
    doc.items[2].title = "가상의 아파트 주방 리모델링 2차";
    await writeFile(f, JSON.stringify(doc));
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "fixture-small", at });
    assert(r.status === "built", r.status);
    second = r.record.buildInputId;
    const prev = await readJson(path.join(tmpRoot, "data/site-builds/fixture-small/previous.json"));
    assert(prev.buildInputId === first, "previous pointer wrong");
    const kept = await readdir(path.join(tmpRoot, "data/site-builds/fixture-small/packages"));
    assert(kept.sort().join() === [first, second].sort().join(), kept.join());
    const prevHtml = await readFile(path.join(tmpRoot, prev.packageDir, "site/index.html"), "utf8");
    assert(!prevHtml.includes("2차"), "previous package mutated");
  });
  await check("forced rebuild with the same id keeps a valid current package (atomic swap)", async () => {
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "fixture-small", at, force: true });
    assert(r.status === "built" && r.record.buildInputId === second, "forced rebuild");
    const cur = await readJson(path.join(tmpRoot, "data/site-builds/fixture-small/current.json"));
    const prev = await readJson(path.join(tmpRoot, "data/site-builds/fixture-small/previous.json"));
    assert(cur.buildInputId === second && prev.buildInputId === first, "pointers moved on a same-id rebuild");
    await readFile(path.join(tmpRoot, cur.packageDir, "site/index.html"));
    const kept = (await readdir(path.join(tmpRoot, "data/site-builds/fixture-small/packages"))).sort();
    assert(kept.join() === [first, second].sort().join(), kept.join());
  });
  await check("rollback-style rebuild back to the previous input (A→B→A) keeps both packages", async () => {
    const f = site("content/projects.json");
    const doc = JSON.parse(await readFile(f, "utf8"));
    doc.items[2].title = "가상의 아파트 주방 리모델링";
    await writeFile(f, JSON.stringify(doc));
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "fixture-small", at });
    assert(r.status === "built" && r.record.buildInputId === first, `expected id A again, got ${r.status}`);
    const prev = await readJson(path.join(tmpRoot, "data/site-builds/fixture-small/previous.json"));
    assert(prev.buildInputId === second, "previous should now be B");
    const kept = (await readdir(path.join(tmpRoot, "data/site-builds/fixture-small/packages"))).sort();
    assert(kept.join() === [first, second].sort().join(), kept.join());
    for (const id of kept) await readFile(path.join(tmpRoot, "data/site-builds/fixture-small/packages", id, "site/index.html"));
  });
  await check("third build prunes the oldest; keeps current + previous only", async () => {
    const f = site("content/projects.json");
    const doc = JSON.parse(await readFile(f, "utf8"));
    doc.items[2].title = "가상의 아파트 주방 리모델링 3차";
    await writeFile(f, JSON.stringify(doc));
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "fixture-small", at });
    assert(r.status === "built", r.status);
    const kept = await readdir(path.join(tmpRoot, "data/site-builds/fixture-small/packages"));
    assert(kept.sort().join() === [first, r.record.buildInputId].sort().join(), kept.join());
  });
  await check("concurrent build of the same site is refused (per-site lock held by a live pid)", async () => {
    const lock = path.join(tmpRoot, "data/site-builds/fixture-small/.build.lock");
    await writeFile(lock, `${process.pid}\n`);
    await rejects(() => buildSite({ repoRoot: tmpRoot, siteId: "fixture-small", at, force: true }), /already being built/);
    await rm(lock);
  });
  await check("stale lock (dead pid) + leftover staging dir from a crashed build are recovered", async () => {
    const root = path.join(tmpRoot, "data/site-builds/fixture-small");
    await writeFile(path.join(root, ".build.lock"), "999999\n");
    await mkdir(path.join(root, "packages/deadbeef.staging-999999/site"), { recursive: true });
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "fixture-small", at, force: true });
    assert(r.status === "built", r.status);
    const kept = await readdir(path.join(root, "packages"));
    assert(!kept.some((k) => k.includes(".staging-")) && kept.length === 2, kept.join());
    assert(!(await readdir(root)).includes(".build.lock"), "lock not released");
  });
  await check("damaged current package is rebuilt, never reported up-to-date, never made the rollback target", async () => {
    const root = path.join(tmpRoot, "data/site-builds/fixture-small");
    const cur = await readJson(path.join(root, "current.json"));
    const prevBefore = await readJson(path.join(root, "previous.json"));
    await writeFile(path.join(tmpRoot, cur.packageDir, "site/index.html"), "damaged");
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "fixture-small", at });
    assert(r.status === "built" && r.record.buildInputId === cur.buildInputId, `status ${r.status}`);
    const prevAfter = await readJson(path.join(root, "previous.json"));
    assert(prevAfter.buildInputId === prevBefore.buildInputId, "previous pointer changed");
    assert((await readFile(path.join(tmpRoot, cur.packageDir, "site/index.html"), "utf8")) !== "damaged", "not rebuilt");
  });

  await check("release immutability: stored files read-only; tampering is detected", async () => {
    const relId = (await pinOf("fixture-small")).releaseId;
    const rel = await loadRelease(repoRoot, "interior-01", relId);
    const fakeRoot = path.join(tmpRoot, "fake-root");
    const dst = releaseDir(fakeRoot, "interior-01", relId);
    await mkdir(path.dirname(dst), { recursive: true });
    await cp(releaseDir(repoRoot, "interior-01", relId), dst, { recursive: true });
    const victim = path.join(dst, "files/templates/interior-01/v1/app/page.tsx");
    await rejects(() => writeFile(victim, "x"), /EACCES|permission/i);
    await chmod(victim, 0o644);
    await writeFile(victim, (await readFile(victim, "utf8")) + "\n// tampered\n");
    await rejects(() => verifyRelease(fakeRoot, rel), /was modified/);
    // metadata tamper: weakening forbiddenTerms in release.json is detected too
    await chmod(victim, 0o444);
    const fresh = await readFile(path.join(releaseDir(repoRoot, "interior-01", relId), "files/templates/interior-01/v1/app/page.tsx"));
    await chmod(victim, 0o644);
    await writeFile(victim, fresh);
    await verifyRelease(fakeRoot, rel);
    await rejects(() => verifyRelease(fakeRoot, { ...rel, forbiddenTerms: [] }), /files\/metadata/);
  });
  await check("release re-run is idempotent in a throwaway root: same code → same release, verified, not overwritten", async () => {
    const root = path.join(tmpRoot, "release-root");
    await mkdir(root, { recursive: true });
    await cp(path.join(repoRoot, "templates"), path.join(root, "templates"), { recursive: true });
    await cp(path.join(repoRoot, "platform"), path.join(root, "platform"), { recursive: true, filter: (src) => !src.includes("node_modules") });
    const a = await createRelease({ repoRoot: root, templateId: "interior-01", major: 1, templateVersion: template.version, siteIds: SITES, now: "t1" });
    const b = await createRelease({ repoRoot: root, templateId: "interior-01", major: 1, templateVersion: template.version, siteIds: SITES, now: "t2" });
    assert(a.created && !b.created && a.record.releaseId === b.record.releaseId && b.record.createdAt === "t1", "not idempotent");
    assert(a.record.releaseId === (await pinOf("fixture-small")).releaseId, "throwaway release differs from pinned release");
  });
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}

console.log(`\nslice1: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  console.log(`FAILED: ${failed.join(" | ")}`);
  process.exit(1);
}
