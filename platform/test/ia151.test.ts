/**
 * IA review fixes validation (interior-01 1.5.1) — the open items of the 1.5.0 independent review
 * (docs/result/recon-template-platform-ia-final/02-review.md):
 *   M1 the inquiry form caps its fields (message 500, one-line fields 100) and never opens a mailto:
 *      link longer than 2,000 characters — the address + the composed text are shown to copy;
 *   m1 message line breaks are CRLF; m2 the status is re-announced on every press;
 *   m3 the < 900 px menu closed by a widening viewport returns focus to a visible header control;
 *   m4 a site without a contact channel does not list /contact in sitemap.xml (page still generated).
 * Client behaviour (M1 / m1 / m2 / m3) is exercised in a browser by
 * scripts/template-platform-ia151-smoke.ts; this file asserts the release, the site data, the
 * server-rendered output and the source shape.
 * Plus what must NOT have moved (against docs/result/static-deployment-foundation/proof-151/before.json,
 * captured before the 1.5.1 work): every earlier release, platform/ runtime, the demo's other files.
 *
 * Run AFTER `pnpm site:build boost-interior-demo`:
 *   tsx --tsconfig platform/tsconfig.json platform/test/ia151.test.ts
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { loadRelease, verifyRelease } from "../release/release";
import { resolveSlots } from "../slots/slots";
import { sha256 } from "../util/hash";
import template from "../../templates/interior-01/v1/template";
import { IA_HTML, IA_PATHS } from "./canonical-150";
import { sitemapIaPaths } from "./canonical-151";
import { demoBuiltRelease } from "./demo-rollout";
import { isIntegrationSurface } from "./integration-surface";
import { release160SurfaceBefore } from "./release-160-surface";

const repoRoot = process.cwd();
const DEMO = "boost-interior-demo";
const BEFORE_FILE = "docs/result/static-deployment-foundation/proof-151/before.json";
const RELEASE_150 = "interior-01-1.5.0-75f173939e77";
const TEMPLATE_REL = "templates/interior-01/v1";
/** the Template files 1.5.1 changed — nothing else in the release differs from 1.5.0 */
const CHANGED_TEMPLATE_FILES = [
  "app/sitemap.ts",
  "components/InquiryForm.tsx",
  "components/MobileMenu.tsx",
  "sections/ContactPage.tsx",
  "sections/links.ts",
  "styles/template.css",
  "template.ts",
].map((f) => `${TEMPLATE_REL}/${f}`);
const NEW_SLOTS = { tooLong: "문의 내용이 길어 메일 앱으로 열 수 없습니다. 아직 전송된 것은 아닙니다. 아래 내용을 복사해 {email}로 보내 주세요.", tooLongTextLabel: "문의 내용 (복사용)", selectTextLabel: "내용 전체 선택" };

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
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const readJson = async (f: string) => JSON.parse(await readFile(f, "utf8"));
const versionAtLeast = (v: string, min: string) => {
  const [a, b] = [v, min].map((x) => x.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (a![i] !== b![i]) return a![i]! > b![i]!;
  return true;
};
async function walkFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name === ".DS_Store") continue;
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkFiles(path.join(dir, e.name), r)));
    else out.push(r);
  }
  return out.sort();
}
const hashTree = async (dir: string, skip: (f: string) => boolean = () => false) =>
  Object.fromEntries(await Promise.all((await walkFiles(dir)).filter((f) => !skip(f)).map(async (f) => [f, sha256(await readFile(path.join(dir, f)))] as const)));
const stripScripts = (h: string) => h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
const mainOf = (h: string) => /<main[\s\S]*<\/main>/.exec(h)?.[0] ?? "";
const headerOf = (h: string) => /<header class="i1-header"[\s\S]*?<\/header>/.exec(h)?.[0] ?? "";
const footerOf = (h: string) => /<footer[\s\S]*<\/footer>/.exec(stripScripts(h))?.[0] ?? "";
const hrefsOf = (h: string) => [...h.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1]!);
const locsOf = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
/** the 1.5.1 server-HTML change on /contact: the field caps (set aside to compare the rest with 1.5.0) */
const withoutMaxLength = (h: string) => h.replace(/ maxLength="\d+"/g, "");

const demoDir = path.join(repoRoot, "data/sites", DEMO);
const pin = (await readJson(path.join(demoDir, "site.json"))).template as { templateVersion: string; releaseId: string; releaseHash: string };
const packageOf = async (siteId: string) => path.join(repoRoot, (await readJson(path.join(repoRoot, "data/site-builds", siteId, "current.json"))).packageDir);
const pkg = await packageOf(DEMO);
const record = await readJson(path.join(pkg, "build-record.json"));
const before = await readJson(path.join(repoRoot, BEFORE_FILE));
async function pagesOf(packageDir: string): Promise<Record<string, string>> {
  const site = path.join(packageDir, "site");
  const files = (await walkFiles(site)).filter((f) => f.endsWith(".html"));
  return Object.fromEntries(await Promise.all(files.map(async (f) => [f, await readFile(path.join(site, f), "utf8")] as const)));
}
const html = await pagesOf(pkg);
const emailOf = async (siteId: string) => (await readJson(path.join(repoRoot, "data/sites", siteId, "content/business.json"))).data?.contact?.email as string | undefined;

// ------------------------------------------------------------- contract --
console.log("\n[contract] additive patch");
await check("S1 Template ≥ 1.5.1, same routes as 1.5.0; three new optional contact.page slots with neutral defaults ({email} in tooLong); every 1.5.0 site's slots document still resolves", async () => {
  assert(versionAtLeast(template.version, "1.5.1"), template.version);
  const r150 = await loadRelease(repoRoot, "interior-01", RELEASE_150);
  const manifest150 = (await readFile(path.join(repoRoot, "data/template-releases/interior-01", RELEASE_150, "files", TEMPLATE_REL, "template.ts"), "utf8")).replace(/\s+/g, " ");
  assert(r150.templateVersion === "1.5.0", "1.5.0 release");
  for (const r of template.routes) assert(manifest150.includes(`{ key: "${r.key}", path: "${r.path}"`), `route ${r.key} not in 1.5.0`);
  eq(template.routes.length, 7, "route count");
  const slots = template.sections["contact.page"].slots as Record<string, { type: string; neutralDefault?: string }>;
  eq(
    ["tooLong", "tooLongTextLabel", "selectTextLabel"].map((k) => [slots[k]?.type, typeof slots[k]?.neutralDefault]),
    [["text", "string"], ["text", "string"], ["text", "string"]],
    "new slots",
  );
  assert(slots.tooLong!.neutralDefault!.includes("{email}") && slots.tooLong!.neutralDefault!.includes("Nothing has been sent"), "tooLong default: names the address, says nothing was sent");
  const bindings = { "business.summary": "A summary." };
  resolveSlots(template, before.slotsJson, bindings);
  for (const s of ["fixture-large", "fixture-small", "fixture-empty"]) resolveSlots(template, await readJson(path.join(repoRoot, "data/sites", s, "slots.json")), bindings);
});

// -------------------------------------------------------------- release --
console.log("\n[release] every earlier release immutable, a Template-only patch");
await check("R1 every release dir captured before the cut (1.0.0 … 1.5.0) verifies and is byte-identical to the capture; the only new dirs are one 1.5.1 (+ later releases' own)", async () => {
  const dirs = (await readdir(path.join(repoRoot, "data/template-releases/interior-01"))).filter((d) => d.startsWith("interior-01-")).sort();
  const added = dirs.filter((d) => !before.releaseDirs.includes(d));
  // later cuts add their own dir (1.5.2: ia152.test.ts R1 holds it to exactly one); none may be another 1.5.1 or older
  const versionOf = (d: string) => d.split("-")[2]!;
  eq(added.filter((d) => versionOf(d) === "1.5.1").length, 1, "new 1.5.1 release dirs");
  for (const d of added) assert(versionAtLeast(versionOf(d), "1.5.1"), `${d}: an older version added after the capture`);
  for (const d of before.releaseDirs as string[]) {
    assert(dirs.includes(d), `${d} missing`);
    eq(await hashTree(path.join(repoRoot, "data/template-releases/interior-01", d)), before.releases[d], `${d} files`);
    await verifyRelease(repoRoot, await loadRelease(repoRoot, "interior-01", d));
  }
});
await check("R2 the 1.5.1 release = the 1.5.0 release except exactly the seven declared Template files (platform runtime, package.json, lockfile byte-identical); every platform/ file captured before the work is unchanged", async () => {
  const d151 = (await readdir(path.join(repoRoot, "data/template-releases/interior-01"))).find((d) => d.startsWith("interior-01-1.5.1-"))!;
  const r151 = await loadRelease(repoRoot, "interior-01", d151);
  await verifyRelease(repoRoot, r151);
  const a = await hashTree(path.join(repoRoot, "data/template-releases/interior-01", RELEASE_150, "files"));
  const b = await hashTree(path.join(repoRoot, "data/template-releases/interior-01", d151, "files"));
  eq(Object.keys(b), Object.keys(a), "same file list");
  eq(Object.keys(b).filter((f) => a[f] !== b[f]), CHANGED_TEMPLATE_FILES, "changed files");
  // platform/ outside test/: nothing captured before the 1.5.1 work changed (files added since by other
  // work — e.g. platform/publish, or the later first-party integration producer (platform/integration/**
  // + the builder seam, isIntegrationSurface) — are outside the release's runtime dirs, as the file list
  // above shows). Files the later 1.6.0 cut changed (V0.2 schema + widget seam) are judged at their
  // pre-1.6.0 hash (release-160-surface.ts); their current content is held by integration.test.ts I2b.
  const now = await hashTree(path.join(repoRoot, "platform"), (f) => f.startsWith("test/"));
  for (const [f, h] of Object.entries(await release160SurfaceBefore(repoRoot))) if (f in now) now[f] = h;
  const changed = Object.keys(before.platformFiles).filter((f) => now[f] !== before.platformFiles[f] && !isIntegrationSurface(f));
  eq(changed, [], "platform files changed");
});
await check("R3 boost-interior-demo pins a verified release ≥ 1.5.1 and its current package was built with it (QA pass) — pre-publish: with the V0.1 publish target (demo-rollout.ts); at the 1.5.1 pin, the 1.5.0 package is the rollback (previous)", async () => {
  assert(versionAtLeast(pin.templateVersion, "1.5.1"), pin.templateVersion);
  const rel = await loadRelease(repoRoot, "interior-01", pin.releaseId);
  await verifyRelease(repoRoot, rel);
  eq([rel.releaseHash, rel.templateVersion], [pin.releaseHash, pin.templateVersion], "pin");
  // = the pin once steady; in the Portfolio V0.2 pre-publish window, the frozen V0.1 package's release
  const built = await demoBuiltRelease(repoRoot, pin);
  assert(versionAtLeast(built.templateVersion, "1.5.1"), built.templateVersion);
  eq([record.template.releaseId, record.template.releaseHash, record.status, record.qa.pass], [built.releaseId, built.releaseHash, "success", true], "build record");
  if (pin.templateVersion !== "1.5.1") return; // a later re-pin rotates the rollback pointer: theirs to assert
  const previous = await readJson(path.join(repoRoot, "data/site-builds", DEMO, "previous.json"));
  eq(previous.buildInputId, before.currentPointer.buildInputId, "previous = the package that was current before the cut");
  const prevRecord = await readJson(path.join(repoRoot, previous.packageDir, "build-record.json"));
  eq(prevRecord.template.releaseId, RELEASE_150, "rollback package release");
});

// ------------------------------------------------------------ site data --
console.log("\n[site data] only the pin and three contact.page slot values moved");
await check("D1 every demo site file is byte-identical to the pre-cut capture except site.json (pin only) and slots.json (exactly the three new contact.page values)", async () => {
  if (pin.templateVersion !== "1.5.1") return; // point-in-time proof of the 1.5.1 re-pin
  const files = await walkFiles(demoDir);
  eq(files, Object.keys(before.siteFiles).sort(), "file list");
  const changed = [];
  for (const f of files) if (sha256(await readFile(path.join(demoDir, f))) !== before.siteFiles[f]) changed.push(f);
  eq(changed.sort(), ["site.json", "slots.json"], "changed files");
  const site = await readJson(path.join(demoDir, "site.json"));
  eq({ ...site, template: null }, { ...before.siteJson, template: null }, "site.json outside the pin");
  const slots = await readJson(path.join(demoDir, "slots.json"));
  eq(slots.values["contact.page"], { ...before.slotsJson.values["contact.page"], ...NEW_SLOTS }, "contact.page");
  eq({ ...slots, values: { ...slots.values, "contact.page": null } }, { ...before.slotsJson, values: { ...before.slotsJson.values, "contact.page": null } }, "slots.json outside contact.page");
});

// -------------------------------------------------------------- package --
console.log("\n[package] the built demo pages");
await check("P1 same page set and sitemap as the 1.5.0 package (the demo has a contact channel: /contact listed); every page's <main>, header and footer identical to 1.5.0 — except /contact's field caps", async () => {
  const sitemap = await readFile(path.join(pkg, "site/sitemap.xml"), "utf8");
  const origin = (await readJson(path.join(demoDir, "site.json"))).identity.publicOrigin as string; // Site Data (1.5.2 moved it)
  eq(locsOf(sitemap).slice(-3), IA_PATHS.map((p) => `${origin}${p}`), "sitemap lists the three pages");
  if (pin.templateVersion !== "1.5.1") return; // point-in-time: compared with the 1.5.0 package (the 1.5.1 pin's rollback)
  const prevDir = path.join(repoRoot, before.currentPointer.packageDir);
  const prev = await pagesOf(prevDir);
  eq(Object.keys(html).sort(), Object.keys(prev).sort(), "HTML set");
  eq(sitemap, await readFile(path.join(prevDir, "site/sitemap.xml"), "utf8"), "sitemap");
  eq(await readFile(path.join(pkg, "site/robots.txt"), "utf8"), await readFile(path.join(prevDir, "site/robots.txt"), "utf8"), "robots");
  for (const [f, h] of Object.entries(html)) {
    const p = prev[f]!;
    const [m, pm] = f === "contact.html" ? [withoutMaxLength(mainOf(h)), mainOf(p)] : [mainOf(h), mainOf(p)];
    assert(m === pm, `${f}: <main> differs from 1.5.0`);
    assert(headerOf(h) === headerOf(p), `${f}: header differs`);
    assert(footerOf(h) === footerOf(p), `${f}: footer differs`);
  }
  assert(mainOf(html["contact.html"]!) !== mainOf(prev["contact.html"]!), "/contact: the caps are there");
});
await check("P2 /contact server HTML: message textarea maxlength 500, each one-line field 100, the select none; empty status; no fallback / copy markup before a press", () => {
  const m = mainOf(html["contact.html"]!);
  const caps = [...m.matchAll(/<(input|select|textarea) id="i1-inquiry-(\w+)"[^>]*?>/g)].map((x) => [x[2], /maxLength="(\d+)"/.exec(x[0])?.[1] ?? null]);
  eq(caps, [["name", "100"], ["phone", "100"], ["region", "100"], ["area", "100"], ["workType", null], ["schedule", "100"], ["message", "500"]], "caps");
  assert(m.includes('<p class="i1-form__status" role="status" data-inquiry-status=""></p>'), "empty status");
  assert(!/data-inquiry-fallback|data-inquiry-copy|i1-inquiry-copy/.test(stripScripts(m)), "fallback in the server HTML");
  for (const [f, h] of Object.entries(html)) assert(!/접수되었|접수 완료|전송되었|전송 완료|완료되었/.test(stripScripts(h)), `${f}: success wording`);
});

// ------------------------------------------------------------- fixtures --
console.log("\n[fixtures] m4: /contact listed only with a contact channel");
await check("F1 every fixture's sitemap = its pages exactly, and lists /contact iff the site has a business email; fixture-empty still generates /contact (the unavailable line) and links to it nowhere", async () => {
  for (const s of ["fixture-large", "fixture-small", "fixture-empty"]) {
    const dir = await packageOf(s);
    const rec = await readJson(path.join(dir, "build-record.json"));
    assert(versionAtLeast(rec.template.templateVersion, "1.5.1"), `${s}: built with ${rec.template.templateVersion}`);
    const email = await emailOf(s);
    const pages = await pagesOf(dir);
    const origin = `https://${s}.example`;
    const locs = locsOf(await readFile(path.join(dir, "site/sitemap.xml"), "utf8"));
    const rels = locs.map((l) => l.slice(origin.length) || "/");
    for (const r of rels) assert(pages[r === "/" ? "index.html" : `${r.slice(1)}.html`], `${s}: sitemap lists missing page ${r}`);
    eq(rels.filter((r) => IA_PATHS.includes(r)), sitemapIaPaths(rec.template.templateVersion, Boolean(email)), `${s}: static pages listed`);
    eq(rels.includes("/contact"), Boolean(email), `${s}: /contact listed`);
    for (const f of IA_HTML) assert(pages[f], `${s}: ${f} still generated`);
    if (!email) {
      assert(mainOf(pages["contact.html"]!).includes('<p class="i1-contact__unavailable">Contact details are not available yet.</p>'), `${s}: unavailable line`);
      for (const [f, h] of Object.entries(pages)) assert(!hrefsOf(h).includes("/contact"), `${s}/${f}: links to /contact`);
    }
  }
  eq((await emailOf("fixture-empty")) ?? null, null, "fixture-empty has no email (the negative control)");
});

// --------------------------------------------------------------- source --
console.log("\n[source] client behaviour shape (exercised in the browser by the ia151 smoke)");
await check("J1 InquiryForm: CRLF message lines, the 2,000-character guard BEFORE the hand-off (no click, no success when too long), the status in a per-press keyed node; MobileMenu: focus returns to the button only when rendered, else a rendered header control / the header", async () => {
  const form = await readFile(path.join(repoRoot, TEMPLATE_REL, "components/InquiryForm.tsx"), "utf8");
  assert(form.includes('value("message").replace(/\\r?\\n/g, "\\r\\n")'), "CRLF");
  assert(/const MAILTO_MAX_LENGTH = 2000;/.test(form) && /const MESSAGE_MAX_LENGTH = 500;/.test(form), "caps");
  const guard = form.indexOf("if (href.length > MAILTO_MAX_LENGTH)");
  const click = form.indexOf("link.click()");
  assert(guard > 0 && click > guard, "guard before the hand-off");
  const guardBlock = form.slice(guard, form.indexOf("return;", guard));
  assert(!guardBlock.includes("click") && guardBlock.includes('kind: "tooLong"'), "too long: no hand-off");
  assert(form.includes("<span key={status.n}>"), "keyed status node");
  const menu = await readFile(path.join(repoRoot, TEMPLATE_REL, "components/MobileMenu.tsx"), "utf8");
  assert(menu.includes("returnFocus(button.current)") && !menu.includes("button.current?.focus()"), "returnFocus");
  assert(/if \(isRendered\(button\)\) \{\s*button\.focus\(\);/.test(menu) && menu.includes('button.closest("header")'), "rendered-only restore");
});
await check("C1 stylesheet: the fallback block, its address and select button (44 px target) are styled; nothing of 1.5.0 removed", async () => {
  const css = (await readFile(path.join(repoRoot, TEMPLATE_REL, "styles/template.css"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
  const css150 = (await readFile(path.join(repoRoot, "data/template-releases/interior-01", RELEASE_150, "files", TEMPLATE_REL, "styles/template.css"), "utf8")).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ");
  assert(css.includes(".i1-form__fallback {") && css.includes(".i1-form__fallback-to {") && /\.i1-form__select-text \{[^}]*min-height: 44px;/.test(css), "rules");
  const added = css.replace(/ \.i1-form__fallback \{[^}]*\}| \.i1-form__fallback-to \{[^}]*\}| \.i1-form__fallback-to a \{[^}]*\}| \.i1-form__select-text \{[^}]*\}/g, "");
  eq(added, css150, "stylesheet = 1.5.0 + the four fallback rules");
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
