/**
 * Second-customer proof (interior-01 1.6.3 — online inquiry is reusable, not demo-only):
 *
 * The shared inquiry door (platform/site/inquiry-client.ts) and the shared Template component
 * (templates/interior-01/v1/components/InquiryForm.tsx) were built against ONE reference site,
 * boost-interior-demo. This file proves a second, unrelated customer — fixture-online-inquiry,
 * a clearly fictional config under data/sites/** with its OWN endpoint, OWN copy and no
 * scripts.json / integration.json — gets the SAME inquiry behaviour from the SAME Template
 * Release with ZERO code changes: only data/sites/fixture-online-inquiry/** differs.
 *
 * Checks (REUSE-1..8):
 *   1. both sites are pinned to the same Template Release (read from both site.json — never
 *      hard-coded here) and both build records report a successful QA pass;
 *   2. (FORM-ID-13) the emitted JS chunk(s) that carry `submission_id` are the SAME bytes in
 *      both packages — both were built --mode public from the same release, so Next's
 *      content-hashed chunk names and bytes are identical; no textual fallback was needed;
 *   3. each package's /contact payload carries exactly its OWN endpoint, never the other
 *      site's, never as an attribute and never in a .js/.css file;
 *   4. the fixture package names nothing demo-specific anywhere (host, widget key, vendor,
 *      brand, Korean brand name) — all read from the demo's own site data, never hard-coded;
 *   5. the shared sources (the door + every templates/interior-01/v1/** file) name neither
 *      site, neither endpoint/host, no widget key, no vendor;
 *   6. the fixture has no scripts.json and no integration.json, yet its /contact server HTML
 *      carries the same online-form structural markers as the demo's (same ordered list of
 *      name=/data-inquiry-* attributes inside the form);
 *   7. the fixture's payload carries its own authored copy for the slots it set, the
 *      Template's own neutral defaults for the two 1.6.3 slots it deliberately left unset
 *      (conflictText, capacityText — plus fallbackLinkB), its own tel: fallback link and its
 *      own business email — and none of the demo's distinctive copy;
 *   8. neither package names "turnstile" anywhere, and the door's request-body literal (found
 *      beside `submission_id` in the chunk) has no `source` key.
 *
 * Run AFTER `site:build` of BOTH sites:
 *   tsx --tsconfig platform/tsconfig.json platform/cli/site-build.ts boost-interior-demo --mode public
 *   tsx --tsconfig platform/tsconfig.json platform/cli/site-build.ts fixture-online-inquiry --mode public
 *   tsx --tsconfig platform/tsconfig.json platform/test/inquiry163-reuse.test.ts
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "../util/hash";
import template from "../../templates/interior-01/v1/template";

const repoRoot = process.cwd();
const DEMO = "boost-interior-demo";
const FIXTURE = "fixture-online-inquiry";

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
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const TEXT_FILE = /\.(html|txt|js|mjs|css|json|svg|xml|map|webmanifest)$/i;

interface LoadedPackage {
  siteId: string;
  siteDir: string;
  site: { identity: { publicOrigin?: string }; template: { templateId: string; templateVersion: string; releaseId: string; releaseHash: string } };
  pkgDir: string;
  record: { status: string; qa: { pass: boolean }; template: { releaseId: string; releaseHash: string } };
  text: Map<string, string>;
  html: Map<string, string>;
}

async function loadPackage(siteId: string): Promise<LoadedPackage> {
  const siteDir = path.join(repoRoot, "data/sites", siteId);
  const site = await readJson(path.join(siteDir, "site.json"));
  const current = (await readJson(path.join(repoRoot, "data/site-builds", siteId, "current.json"))) as { packageDir: string };
  const pkgDir = path.join(repoRoot, current.packageDir);
  const record = await readJson(path.join(pkgDir, "build-record.json"));
  const files = await walkFiles(path.join(pkgDir, "site"));
  const text = new Map<string, string>();
  for (const f of files) if (TEXT_FILE.test(f)) text.set(f, await readFile(path.join(pkgDir, "site", f), "utf8"));
  const html = new Map([...text].filter(([f]) => f.endsWith(".html")));
  return { siteId, siteDir, site, pkgDir, record, text, html };
}

const demo = await loadPackage(DEMO);
const fixture = await loadPackage(FIXTURE);
const demoInquiry = (await readJson(path.join(demo.siteDir, "inquiry.json"))) as { endpoint: string };
const fixtureInquiry = (await readJson(path.join(fixture.siteDir, "inquiry.json"))) as { endpoint: string };
const DEMO_ENDPOINT = demoInquiry.endpoint;
const FIXTURE_ENDPOINT = fixtureInquiry.endpoint;
/** read from the demo's own data, never hard-coded: its public host and its widget key */
const DEMO_HOST = new URL(demo.site.identity?.publicOrigin ?? "https://example.invalid").host;
const demoWidgetKeyMatch = /\/(wgt_[A-Za-z0-9_]+)\//.exec(DEMO_ENDPOINT);
assert(demoWidgetKeyMatch, "could not read the demo's widget key out of its own inquiry.json endpoint");
const DEMO_WIDGET_KEY = demoWidgetKeyMatch![1]!;
const demoSlotsDoc = (await readJson(path.join(demo.siteDir, "slots.json"))) as { values: Record<string, Record<string, unknown>> };
const fixtureSlotsDoc = (await readJson(path.join(fixture.siteDir, "slots.json"))) as { values: Record<string, Record<string, unknown>> };
const demoContact = demoSlotsDoc.values["contact.page"]!;
const fixtureContact = fixtureSlotsDoc.values["contact.page"]!;

function neutralDefault(key: string): string {
  const slots = (template.sections["contact.page"] as { slots: Record<string, { neutralDefault?: string }> }).slots;
  const value = slots[key]?.neutralDefault;
  assert(typeof value === "string" && value.length > 0, `Template contact.page.${key} has no neutralDefault`);
  return value!;
}

function formSignature(html: string): string[] {
  const form = /<form\b[\s\S]*?<\/form>/.exec(html)?.[0] ?? "";
  return form.match(/data-inquiry-[a-z]+|name="[^"]*"/g) ?? [];
}

async function exists(file: string): Promise<boolean> {
  try {
    await readFile(file);
    return true;
  } catch {
    return false;
  }
}

// --------------------------------------------------------------------------
console.log("\n[REUSE] a second, unrelated customer gets the same inquiry behaviour as config, not code");

await check("REUSE-1 both sites are pinned to the same Template Release (read from both site.json, no hard-coded release id); both build records report a successful QA pass", () => {
  eq(fixture.site.template, demo.site.template, "the two sites' template pin must be identical");
  for (const pkg of [demo, fixture]) {
    eq(pkg.record.status, "success", `${pkg.siteId}: build status`);
    eq(pkg.record.qa.pass, true, `${pkg.siteId}: qa.pass`);
    eq(pkg.record.template.releaseId, pkg.site.template.releaseId, `${pkg.siteId}: build record release matches the site's own pin`);
  }
});

await check("REUSE-2 (FORM-ID-13) the client code implementing the submission_id idempotency key is the SAME bytes in both packages' emitted JS chunks", async () => {
  async function submissionIdChunkHashes(pkg: LoadedPackage): Promise<Map<string, string>> {
    const dir = path.join(pkg.pkgDir, "site", "_next", "static");
    const files = (await walkFiles(dir)).filter((f) => /\.m?js$/.test(f));
    const hits = new Map<string, string>();
    for (const f of files) {
      const buf = await readFile(path.join(dir, f));
      if (buf.toString("utf8").includes("submission_id")) hits.set(f, sha256(buf));
    }
    return hits;
  }
  const demoChunks = await submissionIdChunkHashes(demo);
  const fixtureChunks = await submissionIdChunkHashes(fixture);
  assert(demoChunks.size > 0, "demo: no emitted chunk mentions submission_id");
  assert(fixtureChunks.size > 0, "fixture: no emitted chunk mentions submission_id");
  const demoHashes = [...new Set(demoChunks.values())].sort();
  const fixtureHashes = [...new Set(fixtureChunks.values())].sort();
  // both sites were built --mode public from the exact same release, so Next's content-hashed
  // chunk names AND bytes come out identical: exact equality holds, no textual fallback needed.
  eq(fixtureHashes, demoHashes, `sha256 hash set of submission_id-bearing chunks must match exactly (demo files=${[...demoChunks.keys()]}; fixture files=${[...fixtureChunks.keys()]})`);
});

await check("REUSE-3 each package's /contact payload carries exactly its OWN declared endpoint, never the other site's, never as an attribute and never in a .js/.css file", () => {
  const filesNaming = (pkg: LoadedPackage, endpoint: string) => [...pkg.text].filter(([, t]) => t.includes(endpoint)).map(([f]) => f).sort();
  const expected = ["contact.html", "contact.txt", "contact/__next._full.txt", "contact/__next.contact.__PAGE__.txt"].sort();
  eq(filesNaming(demo, DEMO_ENDPOINT), expected, "demo: files naming its own endpoint");
  eq(filesNaming(fixture, FIXTURE_ENDPOINT), expected, "fixture: files naming its own endpoint");
  eq(filesNaming(fixture, DEMO_ENDPOINT), [], "fixture package must never carry the demo's endpoint");
  eq(filesNaming(demo, FIXTURE_ENDPOINT), [], "demo package must never carry the fixture's endpoint");
  for (const [pkg, endpoint] of [[demo, DEMO_ENDPOINT], [fixture, FIXTURE_ENDPOINT]] as const) {
    const contact = pkg.html.get("contact.html")!;
    assert(!new RegExp(`\\s(?:src|href|action|formaction|data-[a-z-]+)="[^"]*${escapeRe(endpoint)}`).test(contact), `${pkg.siteId}: its own endpoint leaked into an attribute`);
    for (const [f, t] of pkg.text) if (/\.(js|mjs|css)$/.test(f)) assert(!t.includes(endpoint), `${pkg.siteId}: ${f} names the endpoint outside page data`);
  }
});

await check("REUSE-4 the fixture package names NOTHING demo-specific, anywhere: the demo's host, its widget key, the vendor name, the demo's Korean brand", () => {
  const forbidden = [DEMO_HOST, DEMO_WIDGET_KEY, "boostchat", "BoostInterior", "부스트 인테리어"];
  const hits: string[] = [];
  for (const [f, t] of fixture.text) for (const term of forbidden) if (t.toLowerCase().includes(term.toLowerCase())) hits.push(`${f}: ${term}`);
  eq(hits, [], "fixture package");
});

await check("REUSE-5 the shared sources (the inquiry door + every templates/interior-01/v1/** file) name nothing site-specific: no site id, no endpoint, no host, no widget key, no vendor", async () => {
  const sharedRoots = [
    { label: "platform/site/inquiry-client.ts", abs: path.join(repoRoot, "platform/site/inquiry-client.ts") },
  ];
  const templatesDir = path.join(repoRoot, "templates/interior-01/v1");
  for (const f of await walkFiles(templatesDir)) sharedRoots.push({ label: `templates/interior-01/v1/${f}`, abs: path.join(templatesDir, f) });
  const forbidden = [demo.siteId, fixture.siteId, DEMO_ENDPOINT, FIXTURE_ENDPOINT, DEMO_HOST, new URL(FIXTURE_ENDPOINT).host, DEMO_WIDGET_KEY, "wgt_", "boostchat"];
  const hits: string[] = [];
  for (const { label, abs } of sharedRoots) {
    const text = await readFile(abs, "utf8");
    for (const term of forbidden) if (text.toLowerCase().includes(term.toLowerCase())) hits.push(`${label}: ${term}`);
  }
  eq(hits, [], "shared Template Release sources");
});

await check("REUSE-6 the fixture declares no scripts.json and no integration.json, yet its /contact server HTML carries the same online-form structural markers as the demo's (identical ordered name=/data-inquiry-* signature; noValidate, consent, disabled submit, honeypot)", async () => {
  eq(await exists(path.join(fixture.siteDir, "scripts.json")), false, "fixture must declare no scripts.json");
  eq(await exists(path.join(fixture.siteDir, "integration.json")), false, "fixture must declare no integration.json");
  const demoContactHtml = demo.html.get("contact.html")!;
  const fixtureContactHtml = fixture.html.get("contact.html")!;
  eq(formSignature(fixtureContactHtml), formSignature(demoContactHtml), "structural signature (ordered name=/data-inquiry-* attributes inside the form)");
  for (const contact of [demoContactHtml, fixtureContactHtml]) {
    assert(/<form class="i1-form" data-inquiry-form="" noValidate="">/.test(contact), "noValidate online form");
    assert(/type="checkbox" required="" name="consent"\/>/.test(contact), "required consent checkbox");
    assert(/data-inquiry-submit="" disabled=""/.test(contact), "submit button disabled in the server HTML");
    assert(/data-inquiry-trap=""/.test(contact), "honeypot trap field");
  }
});

await check("REUSE-7 the fixture payload carries its OWN authored copy, the Template's own neutral defaults for the 1.6.3 slots it left unset, its own tel: fallback link and its own email — none of the demo's distinctive copy", () => {
  // the fixture deliberately left these 1.6.3 slots unset, to exercise the Template's neutral defaults
  for (const unset of ["conflictText", "capacityText", "fallbackLinkB"]) assert(!(unset in fixtureContact), `this test's premise requires contact.page.${unset} to be UNSET in the fixture's slots.json`);

  const fixtureText = [fixture.text.get("contact.html")!, fixture.text.get("contact.txt")!].join("\n");
  for (const [key, value] of Object.entries(fixtureContact)) {
    if (typeof value === "string") assert(fixtureText.includes(value), `fixture payload missing its own authored contact.page.${key}`);
    else if (value && typeof value === "object" && "paragraphs" in (value as object)) {
      for (const p of (value as { paragraphs: string[] }).paragraphs) assert(fixtureText.includes(p), `fixture payload missing its own authored paragraph of contact.page.${key}`);
    } else if (value && typeof value === "object" && "href" in (value as object)) {
      const link = value as { label: string; href: string };
      assert(fixtureText.includes(link.href), `fixture payload missing its own authored contact.page.${key}.href`);
      assert(fixtureText.includes(link.label), `fixture payload missing its own authored contact.page.${key}.label`);
    }
  }
  assert(fixtureText.includes("tel:02-000-0000"), "fixture payload missing its own phone fallback link");
  assert(fixtureText.includes("hello@fixture-online-inquiry.example"), "fixture payload missing its own business email");

  // the Template's own neutral defaults for the two slots deliberately left unset
  assert(fixtureText.includes(neutralDefault("conflictText")), "fixture payload missing the Template's neutral default for conflictText");
  assert(fixtureText.includes(neutralDefault("capacityText")), "fixture payload missing the Template's neutral default for capacityText");

  // none of the demo's own, distinctive (not generic one/two-word field label) copy
  const DEMO_DISTINCTIVE_KEYS = [
    "title",
    "requiredNote",
    "submitLabel",
    "notice",
    "consentLabel",
    "phoneHint",
    "noScriptText",
    "submittingLabel",
    "successTitle",
    "successBody",
    "failureText",
    "messagePrefix",
    "invalidText",
    "conflictText",
    "rateLimitedText",
    "capacityText",
    "fallbackLead",
    "selectPlaceholder",
  ] as const;
  for (const key of DEMO_DISTINCTIVE_KEYS) {
    const value = demoContact[key];
    if (typeof value === "string" && value.length > 0) assert(!fixtureText.includes(value), `fixture payload leaked the demo's contact.page.${key}: ${JSON.stringify(value)}`);
  }
  const demoLead = (demoContact.lead as { paragraphs: string[] } | undefined)?.paragraphs ?? [];
  for (const p of demoLead) assert(!fixtureText.includes(p), `fixture payload leaked the demo's lead paragraph: ${JSON.stringify(p)}`);
});

await check('REUSE-8 neither package names "turnstile" anywhere (case-insensitive), and the door\'s request-body literal (beside submission_id in the chunk) has no `source` key', async () => {
  for (const pkg of [demo, fixture]) {
    for (const [f, t] of pkg.text) assert(!/turnstile/i.test(t), `${pkg.siteId}: ${f} names turnstile`);
  }
  for (const pkg of [demo, fixture]) {
    const dir = path.join(pkg.pkgDir, "site", "_next", "static");
    const files = (await walkFiles(dir)).filter((f) => /\.m?js$/.test(f));
    let found = false;
    for (const f of files) {
      const t = await readFile(path.join(dir, f), "utf8");
      const m = /JSON\.stringify\(\{[^)]*?submission_id[^)]*?\}\)/.exec(t);
      if (!m) continue;
      found = true;
      assert(!/\bsource\s*:/.test(m[0]), `${pkg.siteId}: ${f}: the door's request body literal carries a source key: ${m[0]}`);
    }
    assert(found, `${pkg.siteId}: could not find the door's submission_id body-construction literal in any chunk`);
  }
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
