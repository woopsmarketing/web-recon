/**
 * Online inquiry validation (interior-01 1.6.2, carried into 1.6.3):
 *   1. a site may declare ONE inquiry endpoint (data/sites/<siteId>/inquiry.json): an exact,
 *      canonical https URL — validated fail-closed, part of the snapshot only when present;
 *   2. package QA allows that URL as page DATA only, matched whole, and only where a page's flight
 *      payload lives (a .txt file, a <script> body of an .html page) — never a host, a prefix, an
 *      attribute value of any kind, or any other emitted file; nothing else is loosened;
 *   3. Template code reaches the network only through the platform door
 *      (@platform/site/inquiry-client): fixed method / headers / body, no credentials, text
 *      normalised and the phone rule enforced before any request, "ok" only for HTTP 200 +
 *      { received: true }, never a throw. 1.6.3 adds a `submission_id` to the body (one per
 *      logical inquiry, made by the door, never the Template) and a closed failure vocabulary
 *      (InquiryFailure) in place of the old bare "failed" — this file (D1-D6) still asserts the
 *      fixed request shape, the never-throws contract and the normaliser/phone-rule gate against
 *      `createInquirySender`; the full sender LIFECYCLE (one id per logical inquiry, joining a
 *      press, the rate-limit pause, every failure reason, the per-endpoint sender cache) is
 *      platform/test/inquiry163.test.ts;
 *   4. the demo's /contact submits online: consent + trap field + phone rule (8 digits) in the
 *      server HTML, the button DISABLED there (enabled only once the island is mounted) with a
 *      noscript line, the failure alert above the button, online props only (none of the mail
 *      hand-off's labels), no success or failure wording before a submit; a site without an
 *      endpoint renders the mail hand-off byte-for-byte as release 1.6.1 did; the removed "not
 *      connected" copy and the old terminology are gone from every emitted file / every
 *      customer-facing string. 1.6.3 adds five optional failure-text slots and two optional
 *      fallback-link slots (contact.page) and lists the site's other contact channels after
 *      every failure but a conflict; the demo sets the five texts and authors no fallback links
 *      (so its only fallback contact is the business email) — the Template/Template-render and
 *      built-package assertions for those additions are also inquiry163.test.ts.
 * Client behaviour (validation, failure keeps the input, retry, confirmation) is exercised in a
 * browser by publish-e2e.test.ts D; this file asserts the contract, the gates and the built output.
 *
 * Run AFTER `site:build boost-interior-demo`:
 *   tsx --tsconfig platform/tsconfig.json platform/test/inquiry162.test.ts
 */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, cp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import React, { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { qaStaticPackage } from "../build/qa";
import { scanTemplateSource } from "../release/release";
import { createSiteContext } from "../site/context";
import { INQUIRY_FILE, SiteInquiryDocSchema, inquiryEndpointProblem, inquiryTarget } from "../site/inquiry";
import { INQUIRY_PHONE_PATTERN, INQUIRY_TIMEOUT_MS, createInquirySender, isInquiryPhone, normalizeInquiryText, type InquiryFailure, type InquirySubmission } from "../site/inquiry-client";
import { SiteSnapshotSchema } from "../site/instance";
import { buildSiteSnapshot } from "../site/load";
import { frozenDemoRoot } from "./demo-frozen-dataset";
import { resolveSlots } from "../slots/slots";
import { hashJson } from "../util/hash";
import { InquiryForm } from "../../templates/interior-01/v1/components/InquiryForm";
import template from "../../templates/interior-01/v1/template";

const repoRoot = process.cwd();
const DEMO = "boost-interior-demo";
const AT = "2026-09-22T12:00:00Z";
const TEMPLATE_REL = "templates/interior-01/v1";
/** the demo's declared endpoint — literal: it is what the consumer's route is deployed at */
const DEMO_ENDPOINT = "https://boostchat.co.kr/api/widget/wgt_99kYYFOm7ABvdQbVh_8SdrnOlLrPqDI3/lead";
/** the demo's online copy (data/sites/boost-interior-demo/slots.json, contact.page) */
const COPY = {
  lead: "평형과 공사 범위, 원하시는 일정을 알려 주시면 내용을 확인한 뒤 상담을 이어갈 수 있습니다.",
  submit: "견적 문의 보내기",
  notice: "이 페이지는 BoostInterior 기능 시연용입니다.",
  consent: "개인정보 수집·이용에 동의합니다. (수집: 이름·연락처·입력한 문의 내용 / 이용: BoostInterior 시연 문의 확인 / 보관: 접수 후 90일 / 동의하지 않으면 접수되지 않습니다.)",
  phoneHint: "숫자 8자리 이상으로 입력해 주세요. (예: 010-1234-5678)",
  noScript: "문의 접수에는 JavaScript가 필요합니다. 이메일로 문의해 주세요.",
  submitting: "접수 중…",
  successTitle: "견적 문의가 접수되었습니다.",
  successBody: "입력해주신 내용을 확인한 뒤 상담을 이어갈 수 있습니다.",
  failure: "문의 접수 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.",
  messagePrefix: "[홈페이지 견적 문의]",
  /** 1.6.3 */
  invalid: "입력하신 내용을 다시 확인해 주세요.",
  conflict: "문의 내용이 변경되었습니다. 다시 보내 주세요.",
  rateLimited: "요청이 많아 잠시 접수가 어렵습니다. 약 {minutes}분 후 다시 시도해 주세요.",
  capacity: "지금은 온라인 문의 접수가 일시적으로 어렵습니다. 나중에 다시 시도해 주세요.",
  fallbackLead: "다른 방법으로 문의하실 수 있습니다.",
} as const;
/** 1.6.3: a door-made submission id — a random v4 UUID */
const SUBMISSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** copy the demo no longer carries anywhere (data or package) */
const REMOVED = ["연결되어 있지 않습니다", "메일 앱"] as const;
/** terminology: the official term is "시공사례"; these two spellings are no longer customer-facing */
const OLD_TERMS = ["포트폴리오", "시공 사례"] as const;
const ONLINE_SLOTS = ["onlineSubmitLabel", "consentLabel", "phoneHint", "noScriptText", "submittingLabel", "successTitle", "successBody", "failureText", "messagePrefix"] as const;
/** the phone rule, as the door exports it and as the phone field's `pattern` attribute carries it */
const PHONE_PATTERN = "(?=(?:[^0-9]*[0-9]){8})[0-9+\\-\\(\\) ]{8,20}";
/** the release the live demo is pinned to: the last one whose form is the mail hand-off only */
const RELEASE_161 = "interior-01-1.6.1-8da56de8d28f";
const MAIL_ONLY_SLOTS = ["afterSubmit", "mailSubject", "tooLong", "tooLongTextLabel", "selectTextLabel"] as const;

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
const stripScripts = (h: string) => h.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
const mainOf = (h: string) => /<main[\s\S]*<\/main>/.exec(h)?.[0] ?? "";
const count = (text: string, needle: string) => text.split(needle).length - 1;
const chr = (...codes: number[]) => String.fromCodePoint(...codes);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
/**
 * Every character the door removes from a text value: C0 controls (TAB, LF and CR are converted,
 * not removed), DEL and the C1 controls, the soft hyphen, zero-width / bidi format characters, the
 * line and paragraph separators, the Hangul filler, the BOM. Code points on purpose: no source file
 * of this change may contain one of them literally (T4).
 */
const REMOVED_CODES = [
  ...range(0x00, 0x08),
  0x0b,
  0x0c,
  ...range(0x0e, 0x1f),
  ...range(0x7f, 0x9f),
  0xad,
  ...range(0x200b, 0x200f),
  ...range(0x202a, 0x202e),
  0x2028,
  0x2029,
  ...range(0x2060, 0x2064),
  ...range(0x2066, 0x2069),
  0x3164,
  0xfeff,
];
const INVISIBLE = new RegExp(`[${REMOVED_CODES.map((c) => `\\u{${c.toString(16)}}`).join("")}]`, "u");

const demoDir = path.join(repoRoot, "data/sites", DEMO);
// The demo is copied / snapshotted through the frozen composition (demo-frozen-dataset.ts): its site directory is the live one byte for byte except the adoption marker, which makes the live directory refuse to load without a generated portfolio. Plain reads of site-owned files below stay on the live directory.
const frozen = await frozenDemoRoot(repoRoot);
const pin = (await readJson(path.join(demoDir, "site.json"))).template as { templateId: string; templateVersion: string; releaseId: string; releaseHash: string };
const pkg = path.join(repoRoot, (await readJson(path.join(repoRoot, "data/site-builds", DEMO, "current.json"))).packageDir);
const record = await readJson(path.join(pkg, "build-record.json"));
const TEXT_FILE = /\.(html|txt|js|mjs|css|json|svg|xml|map|webmanifest)$/i;
const packageFiles = await walkFiles(path.join(pkg, "site"));
const packageText = new Map<string, string>();
for (const f of packageFiles) if (TEXT_FILE.test(f)) packageText.set(f, await readFile(path.join(pkg, "site", f), "utf8"));
const html = new Map([...packageText].filter(([f]) => f.endsWith(".html")));

// --------------------------------------------------------------- schema --
console.log("\n[schema] inquiry.json: one exact https endpoint, fail-closed");
await check("S1 the demo's document parses; the target handed to the Template is exactly { endpoint }; no document → no target", async () => {
  const doc = SiteInquiryDocSchema.parse(await readJson(path.join(demoDir, INQUIRY_FILE)));
  eq(doc, { schemaVersion: 1, endpoint: DEMO_ENDPOINT }, "demo inquiry.json");
  eq(inquiryTarget(doc), { endpoint: DEMO_ENDPOINT }, "target");
  eq(inquiryTarget(undefined) ?? null, null, "no document");
  eq(inquiryEndpointProblem(DEMO_ENDPOINT) ?? null, null, "demo endpoint");
  for (const ok of ["https://api.example.com/lead", "https://a-b.example.co.kr:8443/v1/sites/abc_DEF-1.2~3/lead", "https://example.com/"]) eq(inquiryEndpointProblem(ok) ?? null, null, ok);
});
await check("S2 refused: http, relative, protocol-relative, javascript:/data:, credentials, a query, a fragment, a non-canonical spelling, an IP or bare host, reserved path characters, a control / bidi character, an over-long URL", () => {
  const bad = [
    "http://api.example.com/lead",
    "/api/lead",
    "//api.example.com/lead",
    "javascript:alert(1)",
    "data:text/plain,x",
    "https://user:pw@api.example.com/lead",
    "https://api.example.com/lead?site=1",
    "https://api.example.com/lead?",
    "https://api.example.com/lead#x",
    "https://api.example.com/lead#",
    "https://API.example.com/lead",
    "https://api.example.com:443/lead",
    "https://api.example.com/a/../lead",
    "https://api.example.com",
    "https://127.0.0.1/lead",
    "https://[::1]/lead",
    "https://localhost/lead",
    "https://api.example.com/lead(1)",
    "https://api.example.com/lead'x",
    "https://api.example.com/a b",
    `https://api.example.com/le${String.fromCodePoint(0x202e)}ad`,
    "https://api.example.com/le\u0007ad",
    `https://api.example.com/${"a".repeat(600)}`,
    "",
  ];
  for (const endpoint of bad) assert(!SiteInquiryDocSchema.safeParse({ schemaVersion: 1, endpoint }).success, `accepted: ${JSON.stringify(endpoint)}`);
});
await check("S3 strict: no other key (method / headers / credentials / a second endpoint), no other schemaVersion, no missing endpoint", () => {
  for (const doc of [
    { schemaVersion: 1, endpoint: DEMO_ENDPOINT, method: "PUT" },
    { schemaVersion: 1, endpoint: DEMO_ENDPOINT, headers: { authorization: "x" } },
    { schemaVersion: 1, endpoint: DEMO_ENDPOINT, credentials: "include" },
    { schemaVersion: 1, endpoint: DEMO_ENDPOINT, endpoints: [DEMO_ENDPOINT] },
    { schemaVersion: 2, endpoint: DEMO_ENDPOINT },
    { schemaVersion: 1 },
    { endpoint: DEMO_ENDPOINT },
    { schemaVersion: 1, endpoint: [DEMO_ENDPOINT] },
  ]) assert(!SiteInquiryDocSchema.safeParse(doc).success, `accepted: ${JSON.stringify(doc)}`);
});

// ------------------------------------------------------------- snapshot --
console.log("\n[snapshot] present only when declared; a malformed document stops the build");
async function siteRoot(mutate: (dir: string) => Promise<void>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "inquiry162-"));
  const dir = path.join(root, "data/sites", DEMO);
  await mkdir(path.dirname(dir), { recursive: true });
  await cp(frozen.siteDir, dir, { recursive: true });
  await mutate(dir);
  return root;
}
const demoSnap = (await buildSiteSnapshot({ repoRoot: frozen.root, siteId: DEMO, mode: "public", at: AT })).snapshot;
await check("L1 the demo's snapshot carries exactly its document; without inquiry.json there is NO inquiry key and the snapshot is otherwise identical (absent ≠ empty)", async () => {
  eq(demoSnap.inquiry, { schemaVersion: 1, endpoint: DEMO_ENDPOINT }, "snapshot.inquiry");
  const root = await siteRoot((dir) => rm(path.join(dir, INQUIRY_FILE)));
  try {
    const without = (await buildSiteSnapshot({ repoRoot: root, siteId: DEMO, mode: "public", at: AT })).snapshot;
    assert(!("inquiry" in without), "an inquiry key without the document");
    const { inquiry: _inquiry, ...rest } = demoSnap;
    eq(hashJson(without), hashJson(rest), "the document is the whole difference");
    assert(hashJson(without) !== hashJson(demoSnap), "the endpoint is a build input (it moves the snapshot hash)");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  for (const s of ["fixture-large", "fixture-small", "fixture-empty"]) {
    assert(!("inquiry" in (await buildSiteSnapshot({ repoRoot, siteId: s, mode: "public", at: AT })).snapshot), `${s}: declares no endpoint, snapshots as before`);
  }
});
await check("L2 a malformed inquiry.json fails the snapshot (never degrades to the mail hand-off): http, unknown key, not JSON; the snapshot schema itself refuses a bad endpoint", async () => {
  for (const [what, text] of [
    ["http", JSON.stringify({ schemaVersion: 1, endpoint: "http://boostchat.co.kr/lead" })],
    ["unknown key", JSON.stringify({ schemaVersion: 1, endpoint: DEMO_ENDPOINT, method: "GET" })],
    ["not JSON", "{"],
  ] as const) {
    const root = await siteRoot((dir) => writeFile(path.join(dir, INQUIRY_FILE), text));
    try {
      let message = "";
      await buildSiteSnapshot({ repoRoot: root, siteId: DEMO, mode: "public", at: AT }).catch((e: Error) => (message = e.message));
      assert(/inquiry\.json/.test(message), `${what}: built (${message})`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
  assert(!SiteSnapshotSchema.safeParse({ ...demoSnap, inquiry: { schemaVersion: 1, endpoint: "https://boostchat.co.kr/lead?x=1" } }).success, "snapshot schema accepted a query");
  assert(!SiteSnapshotSchema.safeParse({ ...demoSnap, inquiry: { schemaVersion: 1, endpoint: DEMO_ENDPOINT, extra: 1 } }).success, "snapshot schema accepted an unknown key");
});
await check("L3 SiteContext.inquiry = the declared endpoint; undefined without the document", () => {
  const input = { siteId: DEMO, template, templateRelease: pin, mode: "public" as const, at: AT };
  eq(createSiteContext({ ...input, snapshot: demoSnap }).inquiry, { endpoint: DEMO_ENDPOINT }, "ctx.inquiry");
  const { inquiry: _inquiry, ...rest } = demoSnap;
  eq(createSiteContext({ ...input, snapshot: rest }).inquiry ?? null, null, "no document");
});

// ------------------------------------------------------------ package QA --
console.log("\n[package QA] the declared endpoint is allowed only as page data (a .txt flight file, a <script> body of an .html page), matched whole");
const E = "https://api.example.com/v1/lead";
const OUTSIDE = `declared inquiry endpoint ${E} outside page data`;
/** a page whose inlined flight payload carries the endpoint; `extra` goes into <main>, `head` into <head> */
const qaPage = (extra = "", head = "") =>
  `<!doctype html><html lang="en"><head><title>t</title>${head}</head><body><main><form></form>${extra}</main><script>self.__next_f.push([1,"{\\"endpoint\\":\\"${E}\\"}"])</script></body></html>`;
type QaOpts = { declaredScriptSrcs?: string[] };
type Whys = (declared: string[], opts?: QaOpts) => Promise<string[]>;
/** a package of one page + its flight file, both carrying the endpoint as data */
async function inQaDir(run: (dir: string, whys: Whys) => Promise<void>): Promise<void> {
  const d = await mkdtemp(path.join(os.tmpdir(), "inquiry162-qa-"));
  try {
    await writeFile(path.join(d, "index.html"), qaPage());
    await writeFile(path.join(d, "index.txt"), `1:{"endpoint":"${E}"}\n`);
    await run(d, async (declared, opts = {}) =>
      (await qaStaticPackage({ outDir: d, routes: [{ path: "/" }], forbiddenTerms: [], publicOrigin: "https://site.example", declaredEndpoints: declared, ...opts })).failures.map((f) => `${f.file}: ${f.why}`),
    );
  } finally {
    await rm(d, { recursive: true, force: true });
  }
}
await check("Q1 an undeclared endpoint fails; declared → passes where a page's data lives (the flight script and a JSON data script of an .html page, a .txt payload); a longer URL, another path on its host, another host, another scheme still fail; a declared script does not allow it", async () => {
  await inQaDir(async (d, whys) => {
    const undeclared = await whys([]);
    eq(undeclared.length, 2, "undeclared: one failure per file");
    assert(undeclared.every((w) => w.includes(`absolute URL ${E}`)), "undeclared: named");
    eq(await whys([E]), [], "declared: allowed in the html script body and the txt");
    await writeFile(path.join(d, "index.html"), qaPage(`<script type="application/json" id="x">{"endpoint":"${E}"}</script>`));
    eq(await whys([E]), [], "declared: a JSON data script body");
    await writeFile(path.join(d, "index.html"), qaPage(`<SCRIPT TYPE="application/json" data-note="a > b">{"endpoint":"${E}"}</SCRIPT >`));
    eq(await whys([E]), [], "declared: a script body is found whatever the tag's case and attributes");
    await writeFile(path.join(d, "index.html"), qaPage());
    // exact match only
    for (const near of [`${E}/extra`, `${E}2`, "https://api.example.com/v1/other", "https://api.example.com/", "https://evil.example.com/v1/lead", "http://api.example.com/v1/lead"]) {
      await writeFile(path.join(d, "index.txt"), `1:{"endpoint":"${near}"}\n`);
      const w = await whys([E]);
      assert(w.length === 1 && w[0]!.includes(`absolute URL ${near}`), `not refused: ${near} (${w.join("; ")})`);
    }
    await writeFile(path.join(d, "index.txt"), `1:{"endpoint":"${E}"}\n`);
    // the two allowances do not leak into each other
    eq((await whys([], { declaredScriptSrcs: ["https://cdn.example.com/w.js"] })).length, 2, "a declared script does not allow the endpoint");
    await writeFile(path.join(d, "index.html"), qaPage(`<script src="${E}"></script>`));
    eq(await whys([E], { declaredScriptSrcs: [E] }), [], "declared as BOTH a script and an endpoint: that site's own choice");
  });
});
await check("Q2 declared, it is still refused as ANY attribute value of an .html page — action, formaction, src, href, ping, data, xlink:href, srcset, poster, a data-* attribute, an inline handler, a meta refresh, a script's own tag — quoted with \" or ', or unquoted", async () => {
  // [what, markup, where it goes, whether QA's reference check (src / href / srcset / poster / action, quoted) names it too]
  const cases: [what: string, markup: string, where: "main" | "head", reference: boolean][] = [
    ["form action", `<form action="${E}" method="post"></form>`, "main", true],
    ["form action, single quotes", `<form action='${E}' method='post'></form>`, "main", true],
    ["form action, unquoted", `<form action=${E} method=post></form>`, "main", false],
    ["form action, unquoted, last attribute", `<form method=post action=${E}></form>`, "main", false],
    ["button formaction", `<form><button formaction="${E}">x</button></form>`, "main", false],
    ["input formaction, unquoted", `<form><input type=submit formaction=${E}></form>`, "main", false],
    ["link href", `<a href="${E}">x</a>`, "main", true],
    ["link href, unquoted", `<a href=${E}>x</a>`, "main", false],
    ["link ping", `<a href="/" ping="${E}">x</a>`, "main", false],
    ["image src", `<img src="${E}" alt="">`, "main", true],
    ["image srcset", `<img srcset="${E} 2x" alt="">`, "main", true],
    ["video poster", `<video poster="${E}"></video>`, "main", true],
    ["iframe src", `<iframe src="${E}"></iframe>`, "main", true],
    ["embed src", `<embed src="${E}">`, "main", true],
    ["object data", `<object data="${E}"></object>`, "main", false],
    ["svg xlink:href", `<svg><use xlink:href="${E}"></use></svg>`, "main", false],
    ["data-* attribute", `<div data-endpoint="${E}"></div>`, "main", false],
    ["inline handler", `<button type="button" onclick="fetch('${E}')">x</button>`, "main", false],
    ["script src", `<script src="${E}"></script>`, "main", true],
    ["script tag attribute", `<script data-endpoint='${E}'>var a = 1;</script>`, "main", false],
    ["script tag attribute after a quoted >", `<script data-x=">" data-endpoint="${E}"></script>`, "main", false],
    ["noscript form", `<noscript><form action="${E}" method="post"></form></noscript>`, "main", true],
    ["meta refresh", `<meta http-equiv="refresh" content="0;url=${E}">`, "head", false],
    ["meta refresh, quoted url", `<meta http-equiv="refresh" content="0; url='${E}'">`, "head", false],
    ["meta refresh, unquoted", `<meta http-equiv=refresh content=0;url=${E}>`, "head", false],
    ["link rel", `<link rel="prefetch" href="${E}">`, "head", true],
    ["base href", `<base href="${E}">`, "head", true],
  ];
  await inQaDir(async (d, whys) => {
    for (const [what, markup, where, reference] of cases) {
      await writeFile(path.join(d, "index.html"), where === "head" ? qaPage("", markup) : qaPage(markup));
      const w = await whys([E]);
      assert(w.length > 0 && w.every((x) => x.startsWith("index.html: ")), `${what}: passed, or blamed another file (${w.join("; ")})`);
      eq(w.filter((x) => x.includes(OUTSIDE)).length, 1, `${what}: refused as an endpoint outside page data, once — the payload's own copy stays allowed (${w.join("; ")})`);
      eq(w.some((x) => x.includes(`remote reference ${E}`)), reference, `${what}: remote reference (${w.join("; ")})`);
    }
  });
});
await check("Q3 declared, it is still refused in an .html page anywhere outside a script body (text, a comment, a <style>, a comment / textarea / noscript / title / attribute / unclosed tag that merely spells a script) and in EVERY other emitted file: .js, .mjs, .css, .json, .xml, .map, .webmanifest, .svg, and files QA does not read as text; a .txt stays allowed", async () => {
  await inQaDir(async (d, whys) => {
    for (const [what, markup, where] of [
      ["visible text", `<p>${E}</p>`, "main"],
      ["comment", `<!-- ${E} -->`, "main"],
      ["comment spelling a script", `<!-- <script>"${E}"</script> -->`, "main"],
      ["style", `<style>.a::after{content:"${E}"}</style>`, "main"],
      ["textarea spelling a script", `<textarea><script>"${E}"</script></textarea>`, "main"],
      ["noscript spelling a script", `<noscript><script>"${E}"</script></noscript>`, "main"],
      ["title spelling a script", `<title><script>"${E}"</script></title>`, "head"],
      ["an end tag's attribute spelling a script", `</p title="><script>'${E}'</script>">`, "main"],
      ["a tag never closed, spelling a script", `<p title="x><script>'${E}'</script>`, "tail"],
      ["a script never closed", `<script>"${E}"`, "tail"],
    ] as const) {
      await writeFile(path.join(d, "index.html"), where === "head" ? qaPage("", markup) : where === "tail" ? `${qaPage()}${markup}` : qaPage(markup));
      const w = await whys([E]);
      eq(w.filter((x) => x.startsWith("index.html: ") && x.includes(OUTSIDE)).length, 1, `${what} (${w.join("; ")})`);
    }
    await writeFile(path.join(d, "index.html"), qaPage());
    for (const [file, text] of [
      ["chunk.js", `const e="${E}";`],
      ["chunk.mjs", `export const e="${E}";`],
      ["style.css", `.a::after{content:"${E}"}`],
      ["data.json", `{"endpoint":"${E}"}`],
      ["sitemap.xml", `<urlset><url><loc>${E}</loc></url></urlset>`],
      ["chunk.js.map", `{"sources":["${E}"]}`],
      ["site.webmanifest", `{"start_url":"${E}"}`],
      ["icon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><title>${E}</title></svg>`],
      ["notes.md", `endpoint: ${E}\n`],
      ["blob.bin", `\0\0${E}\0`],
      ["page.htm", `<form action="${E}"></form>`],
    ] as const) {
      await writeFile(path.join(d, file), text);
      const w = await whys([E]);
      assert(w.length > 0 && w.every((x) => x.startsWith(`${file}: `)), `${file}: passed, or blamed another file (${w.join("; ")})`);
      eq(w.filter((x) => x.includes(OUTSIDE)).length, 1, `${file}: refused as an endpoint outside page data (${w.join("; ")})`);
      await rm(path.join(d, file));
    }
    eq(await whys([E]), [], "clean again");
    await writeFile(path.join(d, "other.txt"), `2:{"endpoint":"${E}"}\n`);
    eq(await whys([E]), [], "a second .txt payload");
  });
});

// ----------------------------------------------------------------- gates --
console.log("\n[gates] Template code reaches the network only through the door");
await check(
  "G1 the door is the one new allowed import; fetch / XMLHttpRequest / timers / window / navigator.sendBeacon / crypto stay banned in Template code (the Template may not make ids itself); the schema module and the loader are not importable",
  () => {
    const scan = (code: string) => scanTemplateSource(`${TEMPLATE_REL}/components/X.tsx`, code, []);
    eq(scan('import { createInquirySender } from "@platform/site/inquiry-client";\nexport const f = () => createInquirySender;'), [], "door import");
    for (const bad of [
      'export const f = () => fetch("/x");',
      "export const f = () => new XMLHttpRequest();",
      "export const f = () => setTimeout(() => {}, 1);",
      "export const f = () => window.location.href;",
      'export const f = () => navigator.sendBeacon("/x");',
      "export const f = () => new WebSocket(\"wss://x.example\");",
      "export const f = () => crypto.randomUUID();",
      'import { SiteInquiryDocSchema } from "@platform/site/inquiry";\nexport const s = SiteInquiryDocSchema;',
      'import { buildSiteSnapshot } from "@platform/site/load";\nexport const s = buildSiteSnapshot;',
      'export const f = () => import("@platform/site/head-scripts");',
    ]) assert(scan(bad).length > 0, `not caught: ${bad}`);
  },
);
await check("G2 the Template's own sources are gate-clean, only InquiryForm imports the door, and no Template file names the endpoint, its host or a widget key", async () => {
  const files = (await walkFiles(path.join(repoRoot, TEMPLATE_REL))).filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !/^(node_modules|\.next|out)\//.test(f));
  const importers: string[] = [];
  for (const f of files) {
    const text = await readFile(path.join(repoRoot, TEMPLATE_REL, f), "utf8");
    eq(scanTemplateSource(`${TEMPLATE_REL}/${f}`, text, [DEMO]), [], `${f}: gate findings`);
    if (text.includes("@platform/site/inquiry-client")) importers.push(f);
    assert(!/boostchat|wgt_|https?:\/\//i.test(text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), `${f}: names a host / key / URL in code`);
  }
  eq(importers, ["components/InquiryForm.tsx"], "door importers");
  const door = await readFile(path.join(repoRoot, "platform/site/inquiry-client.ts"), "utf8");
  assert(!/boostchat|wgt_/i.test(door) && !/https:\/\/[a-z0-9]/i.test(door.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), "the door names a vendor, key or host");
});

// ------------------------------------------------------------------ door --
console.log("\n[door] one fixed-shape POST; ok only for 200 + { received: true }; never throws");
const SUBMISSION: InquirySubmission = { consent: true, name: "홍길동", phone: "010-1234-5678", message: "[홈페이지 견적 문의]\n\n문의", hp: "" };
type FetchArgs = { url: string; init: RequestInit };
async function withFetch<T>(impl: (args: FetchArgs) => Promise<Response>, run: (calls: FetchArgs[]) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const calls: FetchArgs[] = [];
  globalThis.fetch = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    return impl({ url, init });
  }) as typeof fetch;
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}
const json = (status: number, body: string, type = "application/json") => new Response(body, { status, headers: { "content-type": type } });
await check(
  "D1 request shape: POST to exactly the endpoint, Content-Type application/json and no other header, no credentials, redirects refused, an abort signal, and NO cache mode (a POST is not cached; the option would only add request headers); body = exactly { consent: true, name, phone, message, hp, submission_id }, submission_id a random v4 UUID, and a smuggled extra key is still dropped",
  async () => {
    await withFetch(async () => json(200, '{"received":true}'), async (calls) => {
      const sender = createInquirySender(DEMO_ENDPOINT);
      eq(await sender({ ...SUBMISSION, hp: "bot" }), { status: "ok" }, "result");
      eq(calls.length, 1, "one request");
      const { url, init } = calls[0]!;
      eq([url, init.method, init.headers, init.credentials, init.mode, init.redirect, init.signal instanceof AbortSignal], [DEMO_ENDPOINT, "POST", { "Content-Type": "application/json" }, "omit", "cors", "error", true], "init");
      eq(Object.keys(init).sort(), ["body", "credentials", "headers", "method", "mode", "redirect", "signal"], "no other option");
      assert(!("cache" in init), "a cache mode");
      const body = JSON.parse(init.body as string);
      eq(Object.keys(body), ["consent", "name", "phone", "message", "hp", "submission_id"], "body keys");
      assert(SUBMISSION_ID_RE.test(body.submission_id), `submission_id shape: ${body.submission_id}`);
      const { submission_id: _id, ...rest } = body;
      eq(rest, { consent: true, name: "홍길동", phone: "010-1234-5678", message: "[홈페이지 견적 문의]\n\n문의", hp: "bot" }, "body");
      // a caller cannot smuggle a sixth key (an endpoint that validates strictly would refuse the inquiry)
      const sender2 = createInquirySender(DEMO_ENDPOINT);
      await sender2({ ...SUBMISSION, email: "a@b.example", extra: 1 } as unknown as InquirySubmission);
      eq(Object.keys(JSON.parse(calls[1]!.init.body as string)).sort(), ["consent", "hp", "message", "name", "phone", "submission_id"].sort(), "extra keys dropped");
    });
  },
);
await check(
  'D2 failed, never a throw, each with its own closed-vocabulary reason: 500 / 404 / 201 / 204 / a 200 that is not JSON / a 200 without received: true → "unknown"; 400 → "invalid"; a rejected fetch → "network"; a body that fails mid-read on a 200 → "unknown"',
  async () => {
    const cases: [string, InquiryFailure, () => Promise<Response>][] = [
      ["500", "unknown", async () => json(500, '{"received":true}')],
      ["400", "invalid", async () => json(400, '{"error":"bad"}')],
      ["404", "unknown", async () => json(404, "not found", "text/plain")],
      ["201", "unknown", async () => json(201, '{"received":true}')],
      ["204", "unknown", async () => new Response(null, { status: 204 })],
      ["200 html", "unknown", async () => json(200, "<html>ok</html>", "text/html")],
      ["200 empty", "unknown", async () => json(200, "")],
      ["200 null", "unknown", async () => json(200, "null")],
      ["200 received:false", "unknown", async () => json(200, '{"received":false}')],
      ['200 received:"true"', "unknown", async () => json(200, '{"received":"true"}')],
      ["200 other key", "unknown", async () => json(200, '{"ok":true}')],
      ["network error", "network", async () => Promise.reject(new TypeError("Failed to fetch"))],
      ["body read fails", "unknown", async () => ({ status: 200, json: () => Promise.reject(new Error("aborted")) }) as unknown as Response],
    ];
    for (const [what, reason, impl] of cases) {
      const sender = createInquirySender(DEMO_ENDPOINT);
      eq(await withFetch(impl, () => sender(SUBMISSION)), { status: "failed", reason }, what);
    }
  },
);
await check(
  `D3 no request at all: a non-https endpoint or a browser without fetch → "unknown"; no consent → "invalid"; an unanswered request is aborted after ${INQUIRY_TIMEOUT_MS} ms and reported "timeout"`,
  async () => {
    await withFetch(async () => json(200, '{"received":true}'), async (calls) => {
      for (const endpoint of ["http://boostchat.co.kr/lead", "/api/lead", "//boostchat.co.kr/lead", ""]) {
        const sender = createInquirySender(endpoint);
        eq(await sender(SUBMISSION), { status: "failed", reason: "unknown" }, endpoint);
      }
      const sender = createInquirySender(DEMO_ENDPOINT);
      eq(await sender({ ...SUBMISSION, consent: false } as unknown as InquirySubmission), { status: "failed", reason: "invalid" }, "no consent");
      eq(calls.length, 0, "requests");
    });
    eq(INQUIRY_TIMEOUT_MS, 15_000, "timeout");
    // the timer is captured instead of waited for: firing it must abort the pending request
    const originalSet = globalThis.setTimeout;
    const timers: { fn: () => void; ms: number }[] = [];
    globalThis.setTimeout = ((fn: () => void, ms: number) => {
      timers.push({ fn, ms });
      return 0;
    }) as unknown as typeof setTimeout;
    try {
      const sender = createInquirySender(DEMO_ENDPOINT);
      const pending = withFetch(
        ({ init }) => new Promise<Response>((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
        () => sender(SUBMISSION),
      );
      eq(timers.map((t) => t.ms), [INQUIRY_TIMEOUT_MS], "one timer, at the timeout");
      timers[0]!.fn();
      eq(await pending, { status: "failed", reason: "timeout" }, "timed out");
    } finally {
      globalThis.setTimeout = originalSet;
    }
  },
);

await check("D4 normaliser: a TAB becomes one space; a line break becomes \\n in a message and a space in a one-line value; every C0 / C1 control, DEL, soft hyphen, zero-width and bidi format character, line / paragraph separator, Hangul filler and BOM is removed; then trimmed; neighbouring characters are kept; idempotent", () => {
  eq(REMOVED_CODES.length, 86, "characters removed");
  for (const c of REMOVED_CODES) {
    const hex = `U+${c.toString(16).toUpperCase().padStart(4, "0")}`;
    eq(normalizeInquiryText(`가${chr(c)}나`), "가나", `${hex} in a one-line value`);
    eq(normalizeInquiryText(`가${chr(c)}나`, true), "가나", `${hex} in a message`);
  }
  // the class this file builds from the code points and the door's own agree on every BMP character
  for (let c = 0; c <= 0xffff; c++) {
    if (c === 0x09 || c === 0x0a || c === 0x0d || (c >= 0xd800 && c <= 0xdfff)) continue;
    const out = normalizeInquiryText(`a${chr(c)}b`, true);
    assert(out === (INVISIBLE.test(chr(c)) ? "ab" : `a${chr(c)}b`), `U+${c.toString(16)}: ${JSON.stringify(out)}`);
  }
  eq([normalizeInquiryText("홍\t길동"), normalizeInquiryText("a\t\tb"), normalizeInquiryText("a\t\tb", true)], ["홍 길동", "a  b", "a  b"], "TAB");
  eq(normalizeInquiryText("a\r\nb\rc\nd"), "a b c d", "line breaks, one-line value");
  eq(normalizeInquiryText("a\r\nb\rc\nd\r\n\r\ne", true), "a\nb\nc\nd\n\ne", "line breaks, message");
  eq([normalizeInquiryText("  \t 홍길동 \n"), normalizeInquiryText("\r\n\n 첫 줄\n둘째 줄 \t\r\n", true)], ["홍길동", "첫 줄\n둘째 줄"], "trimmed");
  eq([normalizeInquiryText(`${chr(0x200b, 0xfeff, 0x3164)} \t`), normalizeInquiryText(`${chr(0x200b)}\r\n${chr(0x2060)}`, true)], ["", ""], "nothing but invisible characters is an empty value");
  for (const c of [0x20, 0x21, 0x7e, 0xa0, 0xac, 0xae, 0x200a, 0x2010, 0x2027, 0x202f, 0x205f, 0x2065, 0x206a, 0x3163, 0x3165, 0xac00, 0xff01, 0x1f600]) {
    eq(normalizeInquiryText(`가${chr(c)}나`, true), `가${chr(c)}나`, `U+${c.toString(16)} kept`);
  }
  eq(normalizeInquiryText(`${chr(0x1f600)}${chr(0x200b)}${chr(0x1f600)}`), chr(0x1f600, 0x1f600), "astral characters survive");
  const messy = ` \t홍${chr(0x200d)}길\r\n동${chr(0x202e)}\t${chr(0x00)}! ${chr(0xfeff)}`;
  for (const multiline of [false, true]) {
    const once = normalizeInquiryText(messy, multiline);
    eq(normalizeInquiryText(once, multiline), once, `idempotent (multiline ${multiline})`);
    assert(!INVISIBLE.test(once) && !/[\t\r]/.test(once), `left something behind: ${JSON.stringify(once)}`);
  }
  eq([normalizeInquiryText(messy), normalizeInquiryText(messy, true)], ["홍길 동 !", "홍길\n동 !"], "a pasted value");
});
await check("D5 phone rule: only digits, spaces, + - ( ), 8 to 20 characters, at least 8 of them digits — the same in the door's guard and as an HTML pattern attribute (compiled with the v flag, and the u flag of older browsers)", () => {
  eq(INQUIRY_PHONE_PATTERN, PHONE_PATTERN, "pattern source");
  const compiled = ["v", "u"].map((flag) => new RegExp(`^(?:${INQUIRY_PHONE_PATTERN})$`, flag));
  const judge = (value: string) => [isInquiryPhone(value), ...compiled.map((r) => r.test(value))];
  for (const ok of ["010-1234-5678", "01012345678", "+82 10 1234 5678", "+82 (10) 1234-5678", "(02) 123-4567", "12345678", "1234-5678", "1".repeat(20)]) eq(judge(ok), [true, true, true], `refused: ${ok}`);
  for (const bad of [
    "",
    "1234567",
    "010-12-34",
    "(02) 123-45",
    "+-() +-()",
    "        ",
    "1 2 3 4 5 6 7",
    "010-1234-5678-9012-34",
    "1".repeat(21),
    "전화주세요",
    "010.1234.5678",
    "abc12345678",
    "010\t1234\t5678",
    "010-1234-5678\n",
    "０１０１２３４５６７８",
    "010-1234-5678;ext=1",
  ]) eq(judge(bad), [false, false, false], `accepted: ${JSON.stringify(bad)}`);
});
await check(
  'D6 the door sends the NORMALISED text and makes no request at all (reason "invalid" in every case) for an empty name, an empty message or a phone number that fails the rule — each judged after normalisation; the trap value is forwarded as it is',
  async () => {
    await withFetch(async () => json(200, '{"received":true}'), async (calls) => {
      const dirty: InquirySubmission = {
        consent: true,
        name: `  홍\t길동${chr(0x200b)} `,
        phone: `${chr(0xfeff)}010-1234-5678${chr(0x200e)}\t`,
        message: `첫 줄\r\n둘째 줄\r${chr(0x202e)}\t끝${chr(0x00)}\n`,
        hp: " bot ",
      };
      const sender = createInquirySender(DEMO_ENDPOINT);
      eq(await sender(dirty), { status: "ok" }, "result");
      eq(calls.length, 1, "one request");
      const raw = calls[0]!.init.body as string;
      const { submission_id: _id, ...body } = JSON.parse(raw);
      eq(body, { consent: true, name: "홍 길동", phone: "010-1234-5678", message: "첫 줄\n둘째 줄\n 끝", hp: " bot " }, "body");
      assert(!INVISIBLE.test(raw) && !/\\[tr]|\\u00|\\u20|\\ufe/i.test(raw), `an invisible character in the request: ${raw}`);
      calls.length = 0;
      for (const [what, submission] of [
        ["empty name", { ...SUBMISSION, name: "" }],
        ["name of spaces", { ...SUBMISSION, name: " \t " }],
        ["name of invisible characters", { ...SUBMISSION, name: chr(0x200b, 0x3164, 0xfeff) }],
        ["empty message", { ...SUBMISSION, message: "" }],
        ["message of line breaks and invisible characters", { ...SUBMISSION, message: `\r\n${chr(0x2060)}\n\t` }],
        ["empty phone", { ...SUBMISSION, phone: "" }],
        ["7 digits", { ...SUBMISSION, phone: "1234567" }],
        ["8 characters, 7 digits", { ...SUBMISSION, phone: "010-12-34" }],
        ["no digit", { ...SUBMISSION, phone: "+-() +-()" }],
        ["letters", { ...SUBMISSION, phone: "전화주세요 01012345678" }],
        ["21 characters", { ...SUBMISSION, phone: "010-1234-5678-9012-34" }],
      ] as const) {
        const s2 = createInquirySender(DEMO_ENDPOINT);
        eq(await s2(submission), { status: "failed", reason: "invalid" }, what);
        eq(calls.length, 0, `${what}: requests`);
      }
    });
  },
);

// -------------------------------------------------------------- contract --
console.log("\n[contract] additive patch");
await check("T1 Template 1.6.2: nine optional contact.page slots with neutral defaults (no cap raised for the demo's copy); every earlier slot still declared; the fixtures' slots documents still resolve; the demo sets the online copy and none of the mail hand-off's (the 1.6.3 slots are inquiry163.test.ts's TPL-1/TPL-5)", async () => {
  eq(template.version, "1.6.3", "version (the template is at 1.6.3; this check is only about the nine 1.6.2 slots)");
  const slots = template.sections["contact.page"].slots as Record<string, { type: string; maxLength?: number; neutralDefault?: string; required?: boolean }>;
  for (const k of ONLINE_SLOTS) {
    eq([slots[k]?.type, typeof slots[k]?.neutralDefault, slots[k]?.required ?? false], ["text", "string", false], `slot ${k}`);
    assert(!/[가-힣]/.test(slots[k]!.neutralDefault!), `${k}: a neutral default is not site copy`);
  }
  eq(ONLINE_SLOTS.length, 9, "online slots");
  eq(ONLINE_SLOTS.map((k) => slots[k]!.maxLength), [32, 200, 80, 200, 32, 80, 200, 200, 40], "caps");
  for (const k of [...MAIL_ONLY_SLOTS, "submitLabel", "notice", "title", "lead", "emailLabel", "unavailable"]) assert(slots[k], `slot ${k} no longer declared`);
  const bindings = { "business.summary": "A summary." };
  for (const s of ["fixture-large", "fixture-small", "fixture-empty"]) resolveSlots(template, await readJson(path.join(repoRoot, "data/sites", s, "slots.json")), bindings);
  const demo = (await readJson(path.join(demoDir, "slots.json"))).values["contact.page"] as Record<string, unknown>;
  eq(
    [demo.submitLabel, demo.notice, demo.consentLabel, demo.phoneHint, demo.noScriptText, demo.submittingLabel, demo.successTitle, demo.successBody, demo.failureText, demo.messagePrefix, (demo.lead as { paragraphs: string[] }).paragraphs],
    [COPY.submit, COPY.notice, COPY.consent, COPY.phoneHint, COPY.noScript, COPY.submitting, COPY.successTitle, COPY.successBody, COPY.failure, COPY.messagePrefix, [COPY.lead]],
    "demo copy",
  );
  eq(MAIL_ONLY_SLOTS.filter((k) => k in demo), [], "mail hand-off slots still set by the demo");
  eq([COPY.consent.length, COPY.phoneHint.length, COPY.noScript.length], [107, 39, 40], "demo copy lengths (within the caps above)");
  const resolved = resolveSlots(template, await readJson(path.join(demoDir, "slots.json")), bindings)["contact.page"]!;
  eq([resolved.submitLabel!.source, resolved.notice!.source], ["site", "site"], "the demo authors its own button label and notice");
});
await check("T2 the folded message can never exceed the endpoint's 2,000-character cap: prefix + four labelled lines + the message, at every declared maximum; name ≤ 100 and phone ≤ 40 by the field caps", async () => {
  const form = await readFile(path.join(repoRoot, TEMPLATE_REL, "components/InquiryForm.tsx"), "utf8");
  const num = (name: string) => {
    const m = new RegExp(`const ${name} = (\\d+);`).exec(form);
    assert(m, `${name} not found`);
    return Number(m[1]);
  };
  const [messageMax, fieldMax, phoneMax, onlineMax] = [num("MESSAGE_MAX_LENGTH"), num("FIELD_MAX_LENGTH"), num("PHONE_MAX_LENGTH"), num("ONLINE_MESSAGE_MAX_LENGTH")];
  eq([messageMax, fieldMax, phoneMax, onlineMax], [500, 100, 20, 2000], "caps");
  assert(form.includes('const DETAIL_FIELDS: readonly Field[] = ["region", "area", "workType", "schedule"];'), "the folded fields");
  const slots = template.sections["contact.page"].slots as Record<string, { maxLength?: number; maxParagraphLength?: number }>;
  const labelMax = Math.max(...["regionLabel", "areaLabel", "workTypeLabel", "scheduleLabel"].map((k) => slots[k]!.maxLength!));
  // a select option (workTypeOptions) is shorter than a free-text field, so fieldMax bounds every value
  assert(slots.workTypeOptions!.maxParagraphLength! <= fieldMax, "a work-type option is longer than a field");
  const worst = slots.messagePrefix!.maxLength! + 1 + 4 * (labelMax + ": ".length + fieldMax + 1) + 1 + messageMax;
  assert(worst <= onlineMax, `worst case ${worst} > ${onlineMax}`);
  eq(worst, 1050, "worst case with today's caps");
  assert(fieldMax <= 100 && phoneMax <= 40, "name / phone caps");
  assert(form.includes(".slice(0, ONLINE_MESSAGE_MAX_LENGTH)"), "the cut of last resort");
});
await check(
  "T3 source shape: the online path never opens a mail link, normalises every field BEFORE it validates, checks the phone rule in script as well, claims success only on the door's ok, keeps the form mounted on failure without moving focus, renders the alert above a button that is disabled until mounted or paused, and guards a second press; the mail path does none of it",
  async () => {
    const form = await readFile(path.join(repoRoot, TEMPLATE_REL, "components/InquiryForm.tsx"), "utf8");
    const online = form.slice(form.indexOf("function OnlineInquiryForm("));
    const at = (needle: string) => {
      eq(count(online, needle), 1, `occurrences of ${needle}`);
      return online.indexOf(needle);
    };
    assert(online.length > 0 && !/mailto|link\.click|mailLink|encodeURIComponent/.test(online), "the online form touches the mail hand-off");
    // order of the submit handler: second-press guard → normalise → validate (browser + script) → consent → request
    const steps = [
      "if (inFlight.current) return;",
      'const text = normalizeInquiryText(c?.value ?? "", f === "message");',
      'if (c && !(c instanceof HTMLSelectElement) && c.value !== text) c.value = text;',
      'phone.setCustomValidity(values.phone === "" || isInquiryPhone(values.phone) ? "" : online.labels.phoneHint);',
      "if (!form.reportValidity()) return;",
      "if (!(consent instanceof HTMLInputElement) || !consent.checked) return;",
      'if (values.name === "" || values.message === "" || !isInquiryPhone(values.phone)) return;',
      "inFlight.current = true;",
      "await inquirySender(online.endpoint)({",
    ].map(at);
    eq(steps, [...steps].sort((x, y) => x - y), "order of the submit handler");
    assert(online.includes("for (const f of FIELDS) {") && form.includes('const FIELDS: readonly Field[] = ["name", "phone", "region", "area", "workType", "schedule", "message"];'), "every field is normalised");
    assert(online.includes("consent: true,") && online.includes("name: values.name,") && online.includes("phone: values.phone,") && online.includes('hp: control(TRAP_FIELD)?.value ?? "",'), "body fields");
    assert(/if \(result\.status === "ok"\) \{[\s\S]{0,200}phase: "done"/.test(online), "done only on ok");
    // the form: noValidate (so the normalised value is what gets validated), alert above the button, noscript after it
    at('<form className="i1-form" data-inquiry-form="" noValidate onSubmit={onSubmit} aria-busy={submitting ? true : undefined}>');
    const markup = ["{labels.notice ? <p className=\"i1-form__notice\">{labels.notice}</p> : null}", 'role="alert"', 'data-inquiry-submit=""', "<noscript>", 'role="status"'].map(at);
    eq(markup, [...markup].sort((x, y) => x - y), "notice → alert → button → noscript → status");
    assert(/\{done \? null : \(/.test(online), "fields unmounted only when done");
    // disabled in the server HTML and until the island is mounted; then only while sending or paused
    at("const [mounted, setMounted] = useState(false);");
    at("useEffect(() => {\n    setMounted(true);\n  }, []);");
    at("disabled={!mounted || submitting || paused}");
    assert(online.includes("{submitting ? online.labels.submitting : labels.submit}"), "button label while sending");
    // a failure (or a pause) never moves focus; only the confirmation takes it
    const failedBranch = online.slice(at('if (phase === "failed" || phase === "paused") {'), at('if (phase !== "done") return;'));
    assert(!/focus/.test(failedBranch.replace(/\/\/.*$/gm, "")) && failedBranch.includes('alertNode.current?.scrollIntoView({ block: "nearest" });'), "failure branch");
    eq(count(online, ".focus("), 1, "focus calls");
    at("node.focus({ preventScroll: true });");
    // the phone rule has one source: the door
    assert(
      form.includes('import { INQUIRY_PHONE_PATTERN, inquirySender, isInquiryPhone, normalizeInquiryText, type InquiryFailure } from "@platform/site/inquiry-client";'),
      "door import",
    );
    at("pattern: INQUIRY_PHONE_PATTERN, title: online.labels.phoneHint }");
    assert(!/new RegExp|\/\[0-9|PHONE_PATTERN = /.test(form), "a second phone rule or a regular expression in the Template");
    const mail = form.slice(form.indexOf("function MailInquiryForm("), form.indexOf("function OnlineInquiryForm("));
    assert(
      mail.length > 0 && !/inquirySender|normalizeInquiryText|isInquiryPhone|INQUIRY_PHONE_PATTERN|online\.|noValidate|noscript|disabled|mounted|useEffect/.test(mail.replace(/\/\*[\s\S]*?\*\//g, "")),
      "the mail form took something from the online path",
    );
    const page = await readFile(path.join(repoRoot, TEMPLATE_REL, "sections/ContactPage.tsx"), "utf8");
    const onlineProps = page.slice(page.indexOf("const online:"), page.indexOf("return {", page.indexOf("const online:")));
    for (const k of MAIL_ONLY_SLOTS) assert(!onlineProps.includes(`"${k}"`), `online props read the mail-only slot ${k}`);
    // 1.6.3: the business email reaches the online props only as a fallback contact link (onlineFallback), never a mail hand-off
    assert(onlineProps.includes('fallback: onlineFallback(ctx, email, t("emailLabel")),'), "the email reaches online props only through onlineFallback(...)");
    assert(!/\bemail\b/.test(onlineProps.replace('fallback: onlineFallback(ctx, email, t("emailLabel")),', "")), "online props carry the address outside onlineFallback(...)");
  },
);
await check("T4 no literal invisible character (and no CR) in any source of this change: the door, the Template's sources and styles, the demo's site data, package QA, this file — the door's character class is written as escapes", async () => {
  const files = [
    "platform/site/inquiry-client.ts",
    "platform/site/inquiry.ts",
    "platform/build/qa.ts",
    "platform/test/inquiry162.test.ts",
    ...(await walkFiles(path.join(repoRoot, TEMPLATE_REL))).filter((f) => /\.(ts|tsx|mjs|css|json)$/.test(f) && !/^(node_modules|\.next|out)\//.test(f)).map((f) => `${TEMPLATE_REL}/${f}`),
    ...(await walkFiles(demoDir)).filter((f) => f.endsWith(".json")).map((f) => `data/sites/${DEMO}/${f}`),
  ];
  assert(files.length > 20, `too few files: ${files.length}`);
  const dirty: string[] = [];
  for (const f of files) {
    const text = await readFile(path.join(repoRoot, f), "utf8");
    const m = new RegExp(INVISIBLE.source, "gu");
    for (const hit of text.matchAll(m)) dirty.push(`${f}: U+${hit[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")} at ${hit.index}`);
    if (text.includes("\r")) dirty.push(`${f}: CR`);
  }
  eq(dirty, [], "literal invisible characters");
  const door = await readFile(path.join(repoRoot, "platform/site/inquiry-client.ts"), "utf8");
  assert(
    door.includes('"[\\\\u0000-\\\\u0008\\\\u000B\\\\u000C\\\\u000E-\\\\u001F\\\\u007F-\\\\u009F\\\\u00AD\\\\u200B-\\\\u200F\\\\u202A-\\\\u202E\\\\u2028\\\\u2029\\\\u2060-\\\\u2064\\\\u2066-\\\\u2069\\\\u3164\\\\uFEFF]",\n  "gu",'),
    "the door's character class",
  );
});
/** the form rendered on the server, as static markup */
const FIELD_LABELS = { name: "N", phone: "P", region: "R", area: "A", workType: "W", select: "S", schedule: "Sc", message: "M", required: "* required", submit: "Send", notice: "Note" };
const MAIL_LABELS = { ...FIELD_LABELS, afterSubmit: "after", subject: "inquiry from {name}", tooLong: "too long: {email}", tooLongText: "text", selectText: "select", email: "Email" };
const ONLINE_LABELS = {
  consent: "Consent",
  phoneHint: "Hint",
  noScript: "No script",
  submitting: "Sending",
  successTitle: "Done",
  successBody: "Thanks",
  failure: "Failed",
  messagePrefix: "[p]",
  // 1.6.3
  invalid: "Invalid",
  conflict: "Conflict",
  rateLimited: "RateLimited {minutes}",
  capacity: "Capacity",
  fallbackLead: "FallbackLead",
};
await check("T5 mail-mode markup unchanged: a site without an endpoint renders the form byte-for-byte as release 1.6.1 did (with and without work types) — an ENABLED button, no noscript line, no noValidate, no consent box, no alert, no trap field; the online form's tail is notice → empty alert → DISABLED button → noscript → empty status, and an unset notice / noscript text leaves no element", async () => {
  // the 1.6.1 file is compiled outside the platform's tsconfig (classic JSX runtime): it needs React in scope
  (globalThis as { React?: unknown }).React = React;
  const released = path.join(repoRoot, "data/template-releases/interior-01", RELEASE_161, "files", TEMPLATE_REL, "components/InquiryForm.tsx");
  const before = ((await import(pathToFileURL(released).href)) as { InquiryForm: ComponentType<Record<string, unknown>> }).InquiryForm;
  for (const workTypes of [undefined, ["a", "b"]]) {
    const props = { email: "owner@site.example", workTypes, labels: MAIL_LABELS };
    const now = renderToStaticMarkup(createElement(InquiryForm, props));
    eq(now, renderToStaticMarkup(createElement(before, props)), `mail-mode markup (work types: ${JSON.stringify(workTypes)})`);
    assert(now.startsWith('<form class="i1-form" data-inquiry-form="">'), "mail-mode form tag");
    assert(
      now.endsWith('<p class="i1-form__notice">Note</p><button type="submit" class="i1-button i1-form__submit" data-inquiry-submit="">Send</button><a hidden="" aria-hidden="true" tabindex="-1" data-inquiry-mailto=""></a><p class="i1-form__status" role="status" data-inquiry-status=""></p></form>'),
      `mail-mode tail: ${now.slice(-300)}`,
    );
    assert(!/disabled|<noscript|noValidate|data-inquiry-error|data-inquiry-trap|i1-form__consent|pattern=/.test(now), "mail-mode markup took something from the online form");
  }
  const onlineOf = (labels: typeof FIELD_LABELS, online: typeof ONLINE_LABELS) =>
    renderToStaticMarkup(createElement(InquiryForm, { workTypes: ["a"], labels, online: { endpoint: E, labels: online, fallback: [] } }));
  const on = onlineOf(FIELD_LABELS, ONLINE_LABELS);
  assert(on.startsWith('<form class="i1-form" data-inquiry-form="" noValidate=""><p class="i1-form__required-note">* required</p>'), `online form tag: ${on.slice(0, 120)}`);
  assert(
    on.endsWith('<p class="i1-form__notice">Note</p><p class="i1-form__error" role="alert" data-inquiry-error=""></p><button type="submit" class="i1-button i1-form__submit" data-inquiry-submit="" disabled="">Send</button><noscript><p class="i1-form__noscript">No script</p></noscript><p class="i1-form__status" role="status" data-inquiry-status=""></p></form>'),
    `online tail: ${on.slice(-400)}`,
  );
  assert(on.includes(`pattern="${PHONE_PATTERN}" title="Hint"`), "phone rule and hint");
  assert(!on.includes(E) && !/Done|Thanks|Failed|Sending|\[p\]|Invalid|Conflict|RateLimited|Capacity|FallbackLead/.test(on), "the endpoint or an outcome in the rendered form");
  const bare = onlineOf({ ...FIELD_LABELS, notice: "" }, { ...ONLINE_LABELS, noScript: "" });
  assert(
    bare.endsWith('</label></div><p class="i1-form__error" role="alert" data-inquiry-error=""></p><button type="submit" class="i1-button i1-form__submit" data-inquiry-submit="" disabled="">Send</button><p class="i1-form__status" role="status" data-inquiry-status=""></p></form>'),
    `online tail without notice / noscript text: ${bare.slice(-300)}`,
  );
});

// --------------------------------------------------------------- package --
console.log("\n[package] the built demo");
const contact = html.get("contact.html")!;
const contactMain = mainOf(contact);
await check("P1 built with the pinned release (the template's current version, QA pass); the endpoint is in the snapshot the package was built from", () => {
  eq([pin.templateVersion, record.template.releaseId, record.template.releaseHash, record.status, record.qa.pass], [template.version, pin.releaseId, pin.releaseHash, "success", true], "build record");
  eq(record.parts.siteSnapshotHash, hashJson({ ...demoSnap }), "the package's snapshot = today's site data (the endpoint included)");
});
await check("P2 /contact server HTML: a noValidate form with no action / method; name, phone, message and the consent box required; phone type=tel, inputmode tel, the phone rule (8 digits) as pattern, the hint as title, cap 20; the trap field hidden by class (no inline style), out of the tab order and the accessibility tree; the EMPTY alert directly above a DISABLED button, the noscript line, an EMPTY status", () => {
  assert(contactMain.includes('<form class="i1-form" data-inquiry-form="" noValidate="">'), "form without action / method");
  eq(count(contact, "<form"), 1, "forms on the page");
  assert(!/<form[^>]*\s(action|method)=/.test(contact), "a form action / method");
  const controls = [...contactMain.matchAll(/<(input|select|textarea)\b[^>]*>/g)].map((m) => ({
    tag: m[1]!,
    id: /\sid="([^"]*)"/.exec(m[0])?.[1] ?? null,
    name: /\sname="([^"]*)"/.exec(m[0])?.[1] ?? null,
    type: /\stype="([^"]*)"/.exec(m[0])?.[1] ?? null,
    required: /\srequired=""/.test(m[0]),
    raw: m[0],
  }));
  eq(
    controls.map((c) => [c.name, c.tag, c.type, c.required]),
    [
      ["name", "input", "text", true],
      ["phone", "input", "tel", true],
      ["region", "input", "text", false],
      ["area", "input", "text", false],
      ["workType", "select", null, false],
      ["schedule", "input", "text", false],
      ["message", "textarea", null, true],
      ["topic", "input", "text", false],
      ["consent", "input", "checkbox", true],
    ],
    "controls",
  );
  const phone = controls.find((c) => c.name === "phone")!.raw;
  eq(phone, `<input id="i1-inquiry-phone" class="i1-form__input" type="tel" autoComplete="tel" inputMode="tel" required="" maxLength="20" pattern="${PHONE_PATTERN}" title="${COPY.phoneHint}" name="phone"/>`, "phone field");
  const pattern = new RegExp(`^(?:${/pattern="([^"]*)"/.exec(phone)![1]!})$`, "v");
  for (const ok of ["010-1234-5678", "01012345678", "+82 10 1234 5678", "(02) 123-4567", "12345678"]) assert(pattern.test(ok), `phone refused: ${ok}`);
  for (const bad of ["", "1234567", "010-12-34", "(02) 123-45", "+-() +-()", "010-1234-5678-9012-3456", "전화주세요", "010.1234.5678", "abc12345678"]) assert(!pattern.test(bad), `phone accepted: ${bad}`);
  assert(contactMain.includes('<div class="i1-sr" aria-hidden="true"><input type="text" tabindex="-1" autoComplete="off" aria-hidden="true" data-inquiry-trap="" name="topic"/></div>'), "trap field");
  assert(
    contactMain.includes(`<div class="i1-form__consent"><input id="i1-inquiry-consent" class="i1-form__check" type="checkbox" required="" name="consent"/><label class="i1-form__consent-label" for="i1-inquiry-consent">${COPY.consent}<span class="i1-form__req" aria-hidden="true"> *</span></label></div>`),
    "consent",
  );
  assert(!/\sstyle="/.test(contactMain), "an inline style in the form");
  assert(
    contactMain.endsWith(
      `</label></div><p class="i1-form__notice">${COPY.notice}</p><p class="i1-form__error" role="alert" data-inquiry-error=""></p><button type="submit" class="i1-button i1-form__submit" data-inquiry-submit="" disabled="">${COPY.submit}</button><noscript><p class="i1-form__noscript">${COPY.noScript}</p></noscript><p class="i1-form__status" role="status" data-inquiry-status=""></p></form></div></div></main>`,
    ),
    `consent → notice → empty alert → DISABLED button → noscript → empty status, close the form: ${contactMain.slice(-700)}`,
  );
  eq([...contactMain.matchAll(/<button\b[^>]*>/g)].map((m) => m[0]), ['<button type="submit" class="i1-button i1-form__submit" data-inquiry-submit="" disabled="">'], "the form's only button is disabled in the server HTML");
  eq([count(contact, "<noscript>"), count(contact, 'role="alert"')], [1, 1], "noscript lines / alerts on the page");
  assert(!/data-inquiry-mailto|data-inquiry-fallback|i1-inquiry-copy/.test(contact), "mail hand-off markup on an online form");
  assert(contactMain.includes(`<div class="i1-page__lead"><p>${COPY.lead}</p></div>`), "lead");
});
await check(
  "P3 online props only: the page payload carries the endpoint and the online copy once (including the five 1.6.3 failure-text props), and none of the mail hand-off's labels; the confirmation and every failure text exist ONLY inside the payload script — never in the rendered HTML of any page",
  () => {
    const visible = stripScripts(contact);
    for (const f of ["contact.html", "contact.txt"]) {
      const t = packageText.get(f)!;
      for (const key of ["afterSubmit", "tooLong", "tooLongText", "selectText", "subject"]) assert(!new RegExp(`\\\\?"${key}\\\\?":`).test(t), `${f}: mail-only prop ${key}`);
      for (const key of ["consent", "phoneHint", "noScript", "submitting", "successTitle", "successBody", "failure", "messagePrefix", "invalid", "conflict", "rateLimited", "capacity", "fallbackLead", "endpoint"])
        eq(count(t, `"${key}`) + count(t, `\\"${key}\\"`) > 0, true, `${f}: online prop ${key}`);
      eq(count(t, DEMO_ENDPOINT), 1, `${f}: endpoint occurrences`);
    }
    for (const text of [COPY.successTitle, COPY.successBody, COPY.failure, COPY.submitting, COPY.messagePrefix, COPY.invalid, COPY.conflict, COPY.rateLimited, COPY.capacity, COPY.fallbackLead]) {
      assert(!visible.includes(text), `rendered before a submit: ${text}`);
      assert(contact.includes(text), `not in the payload: ${text}`);
    }
    for (const [f, h] of html) assert(!/접수되었|접수 완료|전송되었|전송 완료|완료되었|문제가 발생/.test(stripScripts(h)), `${f}: outcome wording in the rendered HTML`);
  },
);
await check("P4 the endpoint appears only in /contact's document and payloads, as data — in the page only inside a script body, never an attribute, never in a JS / CSS file; today's package QA passes the built package with the endpoint declared and refuses it undeclared; no other foreign URL joined it (the declared widget script aside)", async () => {
  const withEndpoint = [...packageText].filter(([, t]) => t.includes("boostchat.co.kr/api")).map(([f]) => f);
  eq(withEndpoint, ["contact.html", "contact.txt", "contact/__next._full.txt", "contact/__next.contact.__PAGE__.txt"].sort(), "files naming the endpoint");
  for (const f of withEndpoint) eq(count(packageText.get(f)!, "boostchat.co.kr/api"), count(packageText.get(f)!, DEMO_ENDPOINT), `${f}: only the exact endpoint`);
  assert(!new RegExp(`\\s(?:src|href|action|formaction|data-[a-z-]+)="[^"]*boostchat\\.co\\.kr/api`).test(contact), "the endpoint in an attribute");
  assert(!stripScripts(contact).includes("boostchat.co.kr/api"), "the endpoint outside a script body");
  const qaOf = async (declaredEndpoints: string[]) =>
    (await qaStaticPackage({ outDir: path.join(pkg, "site"), routes: [], forbiddenTerms: [], publicOrigin: demoSnap.site.identity.publicOrigin, declaredScriptSrcs: demoSnap.headScripts?.headScripts.map((x) => x.src) ?? [], declaredEndpoints })).failures.map((f) => `${f.file}: ${f.why}`);
  eq(await qaOf([DEMO_ENDPOINT]), [], "package QA, endpoint declared");
  const undeclared = await qaOf([]);
  eq([undeclared.length, undeclared.every((w) => w.includes(`absolute URL ${DEMO_ENDPOINT}`))], [4, true], `package QA, endpoint not declared: ${undeclared.join("; ")}`);
  const hosts = new Set<string>();
  for (const [f, t] of packageText) {
    if (!/\.(js|css)$/.test(f)) continue;
    assert(!t.includes("boostchat"), `${f}: names the vendor`);
    for (const m of t.matchAll(/https?:\/\/([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)) hosts.add(m[1]!);
  }
  eq([...hosts].filter((h) => !["www.w3.org", "nextjs.org", "react.dev", "github.com"].includes(h)), [], "hosts named by JS / CSS chunks");
});
await check('P5 removed copy: 0 occurrences of "연결되어 있지 않습니다" and "메일 앱" in every emitted text file and in the demo\'s site data', async () => {
  const hits: string[] = [];
  for (const [f, t] of packageText) for (const r of REMOVED) if (t.includes(r)) hits.push(`${f}: ${r}`);
  eq(hits, [], "package");
  const data: string[] = [];
  for (const f of (await walkFiles(demoDir)).filter((x) => x.endsWith(".json"))) {
    const t = await readFile(path.join(demoDir, f), "utf8");
    for (const r of REMOVED) if (t.includes(r)) data.push(`${f}: ${r}`);
  }
  eq(data, [], "site data");
});
await check('P6 terminology: 0 "포트폴리오" and 0 "시공 사례" in the rendered text, alt / aria-label / title / placeholder attributes and <head> metadata (title, description, og:*, twitter:*) of every page, in the RSC payloads and in the demo\'s slots; the official term is on the nav, the list, the 3D page and the footer', async () => {
  const hits: string[] = [];
  for (const [f, t] of packageText) for (const term of OLD_TERMS) if (t.includes(term)) hits.push(`${f}: ${term} ×${count(t, term)}`);
  eq(hits, [], "every emitted text file (rendered HTML, attributes, metadata, payloads, integration documents)");
  const slotsText = await readFile(path.join(demoDir, "slots.json"), "utf8");
  eq(OLD_TERMS.map((t) => count(slotsText, t)), [0, 0], "slots.json");
  const index = html.get("index.html")!;
  eq([...index.matchAll(/<a class="i1-header__link" data-nav="[^"]+"(?: aria-current="[^"]+")? href="[^"]+">([^<]*)<\/a>/g)].map((m) => m[1]), ["시공사례", "3D 시공사례", "소개"], "nav");
  assert(mainOf(html.get("3d-portfolio.html")!).includes('<h1 class="i1-page__title">3D 시공사례</h1><p class="i1-soon__body">공간을 더 입체적으로 확인할 수 있는 3D 시공사례를 준비하고 있습니다.</p>'), "3D page");
  assert(/<title>3D 시공사례 \| 부스트 인테리어<\/title>/.test(html.get("3d-portfolio.html")!) && /<title>시공사례 \| 부스트 인테리어<\/title>/.test(html.get("portfolio.html")!), "titles");
  for (const [f, h] of html) {
    if (f === "404.html" || f === "_not-found.html") continue;
    eq(count(stripScripts(h), "부스트 인테리어는 BoostInterior 기능 시연을 위한 가상 인테리어 브랜드입니다. 시공사례·후기는 데모용 예시이고, 사진은 AI로 생성한 예시 이미지입니다."), 1, `${f}: footer disclosure`);
  }
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
