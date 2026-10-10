/**
 * Hosted site provisioning — `tsx --tsconfig platform/tsconfig.json platform/test/provision.test.ts`
 *
 * Offline: no network, no wrangler, no Cloudflare, no BoostChat. The site builds are REAL
 * (platform/build/site-build.ts over the stored interior-02 release), in a throwaway repository root
 * that links this checkout's release store, starters and node_modules — nothing is written into
 * data/sites or data/site-builds of the checkout.
 *
 *   A  spec            the fixture is accepted; every refusal has its code; strict (unknown field refused)
 *   B  starter         hygiene of the starter's own files; token rules
 *   C  scaffold        files, zero portfolio, idempotent, an existing other site is refused, nothing outside
 *   D  build           zero projects: /portfolio is a shell page, composed it is an EMPTY LIST with the
 *                      starter's empty-state copy; no project card; no trace of another site; noindex;
 *                      a hostile brand name is rendered literally and safely
 *   E  routes          ensureHostRoute; the Cloudflare client over a fake fetch; the merged deploy list
 *   F  BoostChat       the claim / event client over a fake fetch: the contract, the mapping, no token anywhere
 *   G  provisionSite   the whole sequence over a memory store, a fake announcer / publisher, a fake route
 *                      client: event order, the routing pointer is the LAST write and only under a valid
 *                      overlay; the real Worker then serves the empty list; a failure at each step sends
 *                      exactly one `failed` event with the right step and leaves no routing pointer;
 *                      no secret in any log line or event
 *   H  runner files    the workflow keeps its rules (inputs only through env, pinned actions, secrets on
 *                      one step); the CLIs refuse before doing anything when the environment is not usable
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { AnnounceError, type ShellAnnouncement, type ShellPackageAnnouncer } from "../publish/announce";
import { MemoryStore, type ObjectStore } from "../publish/store";
import { RENDERER_FILE, buildRuntimeKit } from "../portfolio-runtime/kit";
import { RUNTIME_FILE, SHELL_FILE, pageFile } from "../portfolio-runtime/contract";
import type { PortfolioSiteInput, PortfolioSiteResult } from "../portfolio-runtime/entry";
import { SOURCE_MARKER_FILE } from "../portfolio-sync/managed";
import { ProvisioningApiError, claimPath, createProvisioningClient, eventsPath, type ProvisioningClient } from "../provision/boostchat";
import { DeployRoutesError, configRoutes, mergeDeployRoutes } from "../provision/deploy-routes";
import { escapeHtmlText } from "../provision/package-check";
import { StepFailure, buildProvisionedSite, provisionSite, type ProvisionDeps, type ProvisionResources, type ProvisionResult } from "../provision/provision";
import { CLOUDFLARE_API, DEFAULT_RUNTIME_SCRIPT, RouteError, createCloudflareRouteClient, ensureHostRoute, runtimeScriptName, type WorkerRoute, type WorkerRouteClient } from "../provision/routes";
import { planScaffold, scaffoldSite } from "../provision/scaffold";
import { REDACTED, createScrubber } from "../provision/scrub";
import { ProvisionError, RunnerEventDataSchemas, parseProvisionSpec, validateProvisionSpec, type ProvisionSpec, type RunnerEventType } from "../provision/spec";
import { STARTERS_DIR, StarterError, listStarters, loadStarter, phoneOf, renderStarterDocument, type StarterValues } from "../provision/starter";
import { handle, type Env, type R2BucketLike, type R2ObjectBodyLike } from "../../workers/recon-runtime/src/index";
import { portfolioCurrentKey, portfolioPublicKey, routingKey, sealKey } from "../../workers/recon-runtime/src/contract";

const repoRoot = process.cwd();
const TEMPLATE = "interior-02";
const FIXTURE = "platform/provision/fixtures/smoke-spec.json";
const T0 = () => new Date("2026-10-10T00:00:00.000Z");
const JSON_META = { contentType: "application/json", cacheControl: "no-store" };

// secrets of the fakes — none of them may ever reach a log line, an event's data or a result
const PUBLISHER_TOKEN = "pub-tok-SECRET-4f7a1c0e9b2d48aa";
const EVENT_TOKEN = "evt-tok-SECRET-Zx81kQp0aLm3Vt9YbC2dE5fG7hJ4nR6s";
const CF_TOKEN = "cf-tok-SECRET-9c2e7d51b08f4a36";
const SECRETS = [PUBLISHER_TOKEN, EVENT_TOKEN, CF_TOKEN];
const JOB = "0b6c2f6e-3d1a-4f0b-9c55-7e2a1d9f4b10";
const RUN = { runId: "1234567890", runAttempt: 1 };

let passed = 0;
const failed: string[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(`  FAIL ${name}\n       ${String((error as Error)?.stack ?? error).split("\n").slice(0, 6).join("\n       ")}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, msg: string) {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  if (x !== y) throw new Error(`${msg}: ${x} ≠ ${y}`);
}
const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
const enc = (v: unknown) => new TextEncoder().encode(typeof v === "string" ? v : JSON.stringify(v));
const readJson = async (file: string) => JSON.parse(await readFile(file, "utf8"));
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** the code a promise is refused with (ProvisionError / RouteError / StepFailure / ProvisioningApiError) */
async function codeOf(p: Promise<unknown> | (() => unknown)): Promise<string> {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    if (e instanceof ProvisionError || e instanceof RouteError || e instanceof StepFailure || e instanceof ProvisioningApiError) return e.code;
    throw new Error(`not a typed refusal: ${(e as Error).name}: ${(e as Error).message}`);
  }
  return "(accepted)";
}

/** every file under a directory, relative, sorted */
async function walk(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(path.join(dir, rel), { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walk(dir, r)));
    else out.push(r);
  }
  return out.sort();
}
async function treeHash(dir: string): Promise<string> {
  const h = createHash("sha256");
  for (const f of await walk(dir)) h.update(`${f}\0${sha256(await readFile(path.join(dir, f)))}\n`);
  return h.digest("hex");
}

/** A throwaway repository root: this checkout's releases, starters and node_modules (linked), and what identifies every existing site. */
const tmpRoots: string[] = [];
async function makeRoot(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "provision-test-"));
  tmpRoots.push(root);
  await mkdir(path.join(root, "data/sites"), { recursive: true });
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(root, "data/template-releases"));
  await symlink(path.join(repoRoot, STARTERS_DIR), path.join(root, STARTERS_DIR));
  await symlink(path.join(repoRoot, "node_modules"), path.join(root, "node_modules"));
  // the other sites of a real checkout, as far as the package check reads them (site.json + business.json)
  for (const e of await readdir(path.join(repoRoot, "data/sites"), { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    for (const rel of ["site.json", "content/business.json"]) {
      const from = path.join(repoRoot, "data/sites", e.name, rel);
      if (!(await stat(from).catch(() => undefined))) continue;
      await mkdir(path.dirname(path.join(root, "data/sites", e.name, rel)), { recursive: true });
      await cp(from, path.join(root, "data/sites", e.name, rel));
    }
  }
  return root;
}

const fixture = (await readJson(path.join(repoRoot, FIXTURE))) as ProvisionSpec;
const spec = (over: (s: any) => void = () => {}): unknown => {
  const s = clone(fixture) as any;
  over(s);
  return s;
};
const HOST = fixture.hostname;
const SITE = fixture.siteId;

/**
 * What must never be in a new site, written here independently of the runner's own check: the
 * identity of every site this checkout holds, and the names the demo content was known by.
 */
const forbidden: { what: string; test: (text: string) => boolean }[] = [];
{
  const literals = new Set<string>(["부스트 인테리어", "BoostInterior", "Boost Interior", "interior-demo", "시연"]);
  for (const e of await readdir(path.join(repoRoot, "data/sites"), { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const site = await readJson(path.join(repoRoot, "data/sites", e.name, "site.json")).catch(() => undefined);
    const business = await readJson(path.join(repoRoot, "data/sites", e.name, "content/business.json")).catch(() => undefined);
    if (typeof site?.identity?.brandName === "string") literals.add(site.identity.brandName);
    if (typeof site?.identity?.publicOrigin === "string") literals.add(new URL(site.identity.publicOrigin).hostname);
    if (typeof business?.data?.contact?.email === "string") literals.add(business.data.contact.email);
    if (typeof business?.data?.contact?.phone === "string") literals.add(business.data.contact.phone);
  }
  for (const l of literals) if (l.length >= 4) forbidden.push({ what: `"${l.includes("@") ? "(an existing site's e-mail address)" : l}"`, test: (t) => t.includes(l) || t.includes(escapeHtmlText(l)) });
  forbidden.push({ what: "a demo project image (bi0N-…)", test: (t) => /\bbi0\d-/.test(t) });
  forbidden.push({ what: "a demo project id (bi-0N)", test: (t) => /\bbi-0\d\b/.test(t) });
}
const TEXT_FILE = /\.(html|js|css|json|txt|xml|map|svg|webmanifest)$/;
/** the first forbidden thing in the text files (and the file names) of a directory, or undefined */
async function firstForbidden(dir: string): Promise<string | undefined> {
  for (const f of await walk(dir)) {
    const hitName = forbidden.find((x) => x.test(f));
    if (hitName) return `${f} (file name): ${hitName.what}`;
    if (!TEXT_FILE.test(f)) continue;
    const text = await readFile(path.join(dir, f), "utf8");
    const hit = forbidden.find((x) => x.test(text));
    if (hit) return `${f}: ${hit.what}`;
  }
  return undefined;
}

try {
  // ══ A. spec ═══════════════════════════════════════════════════════════════════════════════════
  console.log("A. spec");
  await check("A1 the fixture is a valid spec: provision-smoke on provision-smoke.boostweb.co.kr, interior-02, a dummy widget key; the release it pins is in the store and listed by the starter", async () => {
    const parsed = parseProvisionSpec(fixture);
    eq([parsed.siteId, parsed.hostname, parsed.publicOrigin, parsed.identity.brandName], ["provision-smoke", "provision-smoke.boostweb.co.kr", "https://provision-smoke.boostweb.co.kr", "스모크 테스트 인테리어"], "fixture");
    const v = await validateProvisionSpec({ repoRoot, raw: fixture });
    eq([v.starter.templateId, v.release.releaseId, v.release.releaseHash], [TEMPLATE, fixture.template.releaseId, fixture.template.releaseHash], "starter + release");
    eq(parseProvisionSpec(spec((s) => (s.identity.brandName = "  가나다 인테리어  "))).identity.brandName, "가나다 인테리어", "the brand name is trimmed");
  });

  const refusals: [string, (s: any) => void, string][] = [
    ["a hostname outside the zone", (s) => ((s.hostname = "provision-smoke.example.com"), (s.publicOrigin = "https://provision-smoke.example.com")), "host_invalid"],
    ["the zone as a look-alike prefix", (s) => ((s.hostname = "x.boostweb.co.kr.evil.example"), (s.publicOrigin = "https://x.boostweb.co.kr.evil.example")), "host_invalid"],
    ["two labels in front of the suffix", (s) => ((s.hostname = "a.b.boostweb.co.kr"), (s.publicOrigin = "https://a.b.boostweb.co.kr")), "host_invalid"],
    ["the bare zone", (s) => ((s.hostname = "boostweb.co.kr"), (s.publicOrigin = "https://boostweb.co.kr")), "host_invalid"],
    ["an upper-case hostname", (s) => ((s.hostname = "Provision-Smoke.boostweb.co.kr"), (s.publicOrigin = "https://Provision-Smoke.boostweb.co.kr")), "host_invalid"],
    ["a wildcard hostname", (s) => ((s.hostname = "*.boostweb.co.kr"), (s.publicOrigin = "https://*.boostweb.co.kr")), "host_invalid"],
    ["an origin that is not https://<hostname>", (s) => (s.publicOrigin = "http://provision-smoke.boostweb.co.kr"), "origin_mismatch"],
    ["an origin of another host", (s) => (s.publicOrigin = "https://interior-demo.boostweb.co.kr"), "origin_mismatch"],
    ["a site id with upper case", (s) => (s.siteId = "Provision-Smoke"), "site_id_invalid"],
    ["a site id that is a path", (s) => (s.siteId = "../provision-smoke"), "site_id_invalid"],
    ["a template id that is a path", (s) => (s.template.templateId = "../interior-02"), "template_invalid"],
    ["a release id that does not carry the hash", (s) => (s.template.releaseId = "interior-02-1.1.0-000000000000"), "template_invalid"],
    ["a release hash that is not a sha256", (s) => (s.template.releaseHash = "be2c1e2d3850"), "template_invalid"],
    ["a widget key of another shape", (s) => (s.boostchat.widgetKey = "wgt_short"), "widget_key_invalid"],
    ["a widget key with markup", (s) => (s.boostchat.widgetKey = 'wgt_"><script>alert(1)</script>AAAAAAA'), "widget_key_invalid"],
    ["HTML in the brand name", (s) => (s.identity.brandName = "<b>가나다</b> 인테리어"), "brand_name_invalid"],
    ["a script tag in the brand name", (s) => (s.identity.brandName = "x</script><script>alert(1)</script>"), "brand_name_invalid"],
    ["a line break in the brand name", (s) => (s.identity.brandName = "가나다\n인테리어"), "brand_name_invalid"],
    ["an empty brand name", (s) => (s.identity.brandName = "   "), "brand_name_invalid"],
    ["a brand name of 81 characters", (s) => (s.identity.brandName = "가".repeat(81)), "brand_name_invalid"],
    ["a phone number with letters", (s) => (s.contact.phone = "02-CALL-NOW"), "phone_invalid"],
    ["a phone number that is a script URL", (s) => (s.contact.phone = "javascript:alert(1)"), "phone_invalid"],
    ["an e-mail address that is not one", (s) => (s.contact.email = "not an address"), "email_invalid"],
    ["a plain-http BoostChat", (s) => (s.boostchat.baseUrl = "http://boostchat.co.kr"), "base_url_invalid"],
    ["a BoostChat base URL with a path", (s) => (s.boostchat.baseUrl = "https://boostchat.co.kr/api"), "base_url_invalid"],
    ["a widget script on another origin", (s) => (s.boostchat.widgetScriptUrl = "https://evil.example/widget.js"), "widget_script_url_invalid"],
    ["a widget script on a look-alike origin", (s) => (s.boostchat.widgetScriptUrl = "https://boostchat.co.kr.evil.example/widget.js"), "widget_script_url_invalid"],
    ["a lead endpoint on another origin", (s) => (s.boostchat.leadEndpoint = "https://evil.example/api/widget/x/lead"), "lead_endpoint_invalid"],
    ["a lead endpoint with a query", (s) => (s.boostchat.leadEndpoint = `${s.boostchat.leadEndpoint}?to=evil`), "lead_endpoint_invalid"],
    ["a field the contract does not name", (s) => (s.workerScript = "another-worker"), "spec_invalid"],
    ["an unknown field inside contact", (s) => (s.contact.address = "서울시"), "spec_invalid"],
    ["a missing e-mail (absent instead of null)", (s) => delete s.contact.email, "spec_invalid"],
    ["another locale", (s) => (s.identity.locale = "en-US"), "spec_invalid"],
    ["another schema", (s) => (s.schema = "site-provision-spec@2"), "spec_invalid"],
  ];
  await check(`A2 ${refusals.length} refusals, each with its code — bad suffix, upper-case host, look-alike zone, bad widget key, HTML in the brand name, unknown fields, …`, async () => {
    for (const [name, edit, code] of refusals) eq(await codeOf(() => parseProvisionSpec(spec(edit))), code, name);
    for (const garbage of [undefined, null, 1, "x", [], {}]) eq(await codeOf(() => parseProvisionSpec(garbage)), "spec_invalid", `garbage ${JSON.stringify(garbage)}`);
  });
  await check("A3 the allowlist and the release store: an unknown template, a release the starter does not list, a hash that is not the stored release's", async () => {
    const h = fixture.template.releaseHash;
    eq(await codeOf(validateProvisionSpec({ repoRoot, raw: spec((s) => ((s.template.templateId = "interior-99"), (s.template.releaseId = `interior-99-1.0.0-${h.slice(0, 12)}`))) })), "template_not_allowed", "unknown template");
    // interior-01 exists as a Template and has releases — but no starter: still not allowed
    eq(await codeOf(validateProvisionSpec({ repoRoot, raw: spec((s) => ((s.template.templateId = "interior-01"), (s.template.releaseId = `interior-01-1.0.0-${h.slice(0, 12)}`))) })), "template_not_allowed", "a template without a starter");
    eq(await codeOf(validateProvisionSpec({ repoRoot, raw: spec((s) => (s.template.releaseId = `interior-02-9.9.9-${h.slice(0, 12)}`)) })), "release_not_allowed", "unknown release");
    const otherHash = h.slice(0, 12) + "0".repeat(52);
    eq(await codeOf(validateProvisionSpec({ repoRoot, raw: spec((s) => (s.template.releaseHash = otherHash)) })), "release_hash_mismatch", "hash mismatch");
    // a refusal never quotes a value of the document
    try {
      parseProvisionSpec(spec((s) => (s.identity.brandName = "<img src=x onerror=SECRETVALUE>")));
      throw new Error("accepted");
    } catch (e) {
      assert(e instanceof ProvisionError && !e.message.includes("SECRETVALUE"), `the message quotes the value: ${(e as Error).message}`);
    }
  });

  // ══ B. starter ════════════════════════════════════════════════════════════════════════════════
  console.log("B. starter");
  const starterRoot = path.join(repoRoot, STARTERS_DIR, TEMPLATE);
  await check("B1 starter.json is exactly { schema, templateId, releaseIds }; the starter is the only one; it carries no portfolio, no reviews, no identity, no script and no endpoint document", async () => {
    eq(await readJson(path.join(starterRoot, "starter.json")), { schema: "site-starter@1", templateId: TEMPLATE, releaseIds: [fixture.template.releaseId] }, "starter.json");
    eq((await listStarters(repoRoot)).map((s) => s.templateId), [TEMPLATE], "starters");
    eq((await loadStarter(repoRoot, "interior-99")) ?? null, null, "no starter");
    const files = await walk(starterRoot);
    for (const banned of ["site.json", "scripts.json", "inquiry.json", "integration.json", "content/projects.json", "content/categories.json", "content/reviews.json", SOURCE_MARKER_FILE]) assert(!files.includes(banned), `the starter carries ${banned}`);
  });
  await check("B2 hygiene of the starter's own files: no name, hostname, e-mail address or phone number of an existing site, no demo project image or id; every image is site-*; no review, no manual project pick, no logo", async () => {
    eq(await firstForbidden(starterRoot), undefined, "forbidden content");
    const files = await walk(starterRoot);
    const images = files.filter((f) => f.startsWith("assets/") && f !== "assets/registry.json");
    assert(images.length > 0 && images.every((f) => /^assets\/site-[a-z0-9-]+\.(jpg|png|webp)$/.test(f)), `images: ${images.join(", ")}`);
    const registry = await readJson(path.join(starterRoot, "assets/registry.json"));
    eq((registry.items as { file: string }[]).map((i) => `assets/${i.file}`).sort(), images, "registry = the image files");
    const all = (await Promise.all(files.filter((f) => f.endsWith(".json")).map((f) => readFile(path.join(starterRoot, f), "utf8")))).join("\n");
    assert(!/"mode"\s*:\s*"(manual|category)"/.test(all), "a project selection that is not latest");
    assert(!/"kind"\s*:\s*"project"/.test(all), "a CTA to a project");
    // review CONTENT never; the two UI labels of the per-project review block (shown only when a project of the customer has one) are the only words about it
    const reviewKeys = [...all.matchAll(/"([^"]*)"\s*:\s*"[^"]*"/g)].filter((m) => /review|후기|한마디/i.test(m[0])).map((m) => m[1]);
    eq(reviewKeys.sort(), ["reviewJumpLabel", "reviewTitle"], "keys that speak of a review");
    assert(!/review|후기|한마디/i.test(all.replace(/"review(JumpLabel|Title)"\s*:\s*"[^"]*"/g, "")), "a review");
    assert(!/"logo"/.test(all) && !/logoMark/.test(all), "a logo");
    eq((await readJson(path.join(starterRoot, "settings.json"))).overrides["site.seo"], { indexing: "noindex" }, "site.seo");
  });
  await check("B3 tokens: resolved on parsed values, single pass; phone / e-mail only inside the matching $if; the key is left out when the spec has none; an unknown token or directive is refused", () => {
    const values: StarterValues = { brandName: 'A "B" {{phone}} ${x} \\', phone: phoneOf("02-000-0000"), email: null };
    eq(phoneOf("02-000-0000"), { display: "02-000-0000", href: "tel:02-000-0000" }, "phone");
    eq(phoneOf("+82 2 000 0000"), { display: "+82 2 000 0000", href: "tel:+8220000000" }, "international phone");
    eq([phoneOf(null), phoneOf(""), phoneOf(" - ")], [null, null, null], "no phone");
    const doc = { a: "© {{brandName}}", call: { $if: "phone", then: { label: "{{phone}}", href: "{{phoneHref}}" } }, mail: { $if: "email", then: "{{email}}" }, list: ["x", { $if: "email", then: "y" }, { $if: "email", then: "y", else: "z" }] };
    eq(renderStarterDocument(doc, values, "t"), { a: `© ${values.brandName}`, call: { label: "02-000-0000", href: "tel:02-000-0000" }, list: ["x", "z"] }, "rendered");
    eq(renderStarterDocument(doc, { ...values, phone: null, email: "a@b.example" }, "t"), { a: `© ${values.brandName}`, mail: "a@b.example", list: ["x", "y", "y"] }, "rendered without a phone");
    const refused = (d: unknown, v = values) => {
      try {
        renderStarterDocument(d, v, "t");
      } catch (e) {
        return e instanceof StarterError;
      }
      return false;
    };
    assert(refused({ a: "전화 {{phone}}" }), "a phone outside $if");
    assert(refused({ a: { $if: "email", then: "{{phone}}" } }), "a phone inside the wrong $if");
    assert(refused({ a: "{{email}}" }, { ...values, email: "a@b.example" }), "an e-mail outside $if");
    assert(refused({ a: "{{siteId}}" }), "an unknown token");
    assert(refused({ a: { $if: "address", then: "x" } }), "an unknown condition");
    assert(refused({ $include: "x" }), "an unknown directive");
  });

  // ══ C. scaffold ═══════════════════════════════════════════════════════════════════════════════
  console.log("C. scaffold");
  const rootA = await makeRoot();
  const siteDirA = path.join(rootA, "data/sites", SITE);
  await check("C1 scaffold writes data/sites/<siteId>/ and nothing else: the starter's documents and images, site.json (the pin, no logo), scripts.json (the widget key), inquiry.json, integration.json, EMPTY projects and categories, no reviews", async () => {
    const before = [(await readdir(rootA)).sort(), (await readdir(path.join(rootA, "data"))).sort(), (await readdir(path.join(rootA, "data/sites"))).sort()];
    const r = await scaffoldSite({ repoRoot: rootA, spec: fixture });
    eq([r.status, path.resolve(rootA, r.siteDir)], ["written", siteDirA], "result");
    const after = [(await readdir(rootA)).sort(), (await readdir(path.join(rootA, "data"))).sort(), (await readdir(path.join(rootA, "data/sites"))).sort()];
    eq(after, [before[0], before[1], [...before[2]!, SITE].sort()], "the only new entry is the site directory");
    eq(await walk(siteDirA), r.files, "files");
    const site = await readJson(path.join(siteDirA, "site.json"));
    eq(site.identity, { brandName: fixture.identity.brandName, publicOrigin: fixture.publicOrigin, locale: "ko-KR" }, "identity (no legal name, no logo)");
    eq([site.siteId, site.template.templateId, site.template.releaseId, site.template.releaseHash], [SITE, TEMPLATE, fixture.template.releaseId, fixture.template.releaseHash], "pin");
    eq([(await readJson(path.join(siteDirA, "content/projects.json"))).items, (await readJson(path.join(siteDirA, "content/categories.json"))).items], [[], []], "no project, no category");
    assert(!r.files.includes("content/reviews.json"), "reviews");
    const scripts = JSON.stringify(await readJson(path.join(siteDirA, "scripts.json")));
    assert(scripts.includes(fixture.boostchat.widgetKey) && scripts.includes(fixture.boostchat.widgetScriptUrl), `scripts.json: ${scripts}`);
    assert(JSON.stringify(await readJson(path.join(siteDirA, "inquiry.json"))).includes(fixture.boostchat.leadEndpoint), "inquiry.json");
    eq(r.files.filter((f) => f.startsWith("assets/") && f !== "assets/registry.json").every((f) => /^assets\/site-/.test(f)), true, "images are site-*");
    for (const f of r.files.filter((x) => x.startsWith("assets/"))) eq(sha256(await readFile(path.join(siteDirA, f))), sha256(await readFile(path.join(starterRoot, f))), `${f} is the starter's file`);
    eq(await firstForbidden(siteDirA), undefined, "forbidden content in the scaffolded site");
    // phone: the call slot is a tel: link to the spec's number; e-mail: none in the spec → none in the site
    const text = (await Promise.all(r.files.filter((f) => f.endsWith(".json")).map((f) => readFile(path.join(siteDirA, f), "utf8")))).join("\n");
    eq([...new Set(text.match(/tel:[^"\\]*/g) ?? [])], ["tel:02-000-0000"], "tel links");
    assert(!/mailto:|@/.test(text.replace(/"(schema|\$schema)"\s*:\s*"[^"]*"/g, "")), "an e-mail address without one in the spec");
    assert(!/\{\{|"\$if"/.test(text), "an unresolved token");
    eq((await readJson(path.join(siteDirA, "slots.json"))).values["contact.page"].callLink, { label: "02-000-0000", href: "tel:02-000-0000" }, "call slot");
  });
  await check("C2 idempotent: the same spec again changes nothing (also once the managed marker is there); a planned file set is byte-identical across calls", async () => {
    const h = await treeHash(siteDirA);
    eq((await scaffoldSite({ repoRoot: rootA, spec: fixture })).status, "unchanged", "second call");
    eq(await treeHash(siteDirA), h, "bytes");
    const [p1, p2] = [await planScaffold({ repoRoot: rootA, spec: fixture }), await planScaffold({ repoRoot: rootA, spec: fixture })];
    eq([...p1.files].map(([k, v]) => [k, sha256(v)]), [...p2.files].map(([k, v]) => [k, sha256(v)]), "plan");
  });
  await check("C3 an existing site that is not this one is refused and left byte-identical: another brand under the same id, a changed file, an extra file, a hand-made site", async () => {
    const h = await treeHash(siteDirA);
    eq(await codeOf(scaffoldSite({ repoRoot: rootA, spec: spec((s) => (s.identity.brandName = "다른 인테리어")) })), "site_exists_different", "another brand, same id");
    eq(await codeOf(scaffoldSite({ repoRoot: rootA, spec: spec((s) => (s.contact.phone = null)) })), "site_exists_different", "another phone, same id");
    eq(await treeHash(siteDirA), h, "untouched after the refusals");

    const rootX = await makeRoot();
    await scaffoldSite({ repoRoot: rootX, spec: fixture });
    const dirX = path.join(rootX, "data/sites", SITE);
    await writeFile(path.join(dirX, "content/reviews.json"), "{}");
    const hx = await treeHash(dirX);
    eq(await codeOf(scaffoldSite({ repoRoot: rootX, spec: fixture })), "site_exists_different", "an extra file");
    eq(await treeHash(dirX), hx, "untouched");
    // a site somebody made by hand (an existing demo): never rewritten
    const seeded = "boost-interior-demo-02";
    const hs = await treeHash(path.join(rootX, "data/sites", seeded));
    eq(await codeOf(scaffoldSite({ repoRoot: rootX, spec: spec((s) => (s.siteId = seeded)) })), "site_exists_different", "an existing hand-made site");
    eq(await treeHash(path.join(rootX, "data/sites", seeded)), hs, "the existing site is byte-identical");
  });
  await check("C4 no phone and no e-mail → no call slot, no tel:, no mailto:, no invented value; with an e-mail → it is the business contact", async () => {
    const root = await makeRoot();
    const bare = spec((s) => ((s.siteId = "bare-site"), (s.hostname = "bare-site.boostweb.co.kr"), (s.publicOrigin = "https://bare-site.boostweb.co.kr"), (s.contact.phone = null)));
    const r = await scaffoldSite({ repoRoot: root, spec: bare });
    const dir = path.join(root, "data/sites/bare-site");
    const text = (await Promise.all(r.files.filter((f) => f.endsWith(".json")).map((f) => readFile(path.join(dir, f), "utf8")))).join("\n");
    // (the form shows the visitor an example of the FORMAT of a phone number — that is not a number of the business)
    assert(!/tel:|mailto:|\d{2,4}-\d{3,4}-\d{4}/.test(text.replaceAll("010-1234-5678", "")), "a phone number or a mail link without one in the spec");
    const contact = (await readJson(path.join(dir, "slots.json"))).values["contact.page"];
    eq([contact.callLabel ?? null, contact.callLink ?? null], [null, null], "call slot left out");
    eq((await readJson(path.join(dir, "content/business.json"))).data.contact ?? null, null, "business contact");
    const withMail = spec((s) => ((s.siteId = "mail-site"), (s.hostname = "mail-site.boostweb.co.kr"), (s.publicOrigin = "https://mail-site.boostweb.co.kr"), (s.contact.phone = null), (s.contact.email = "owner@customer.example")));
    await scaffoldSite({ repoRoot: root, spec: withMail });
    eq((await readJson(path.join(root, "data/sites/mail-site/content/business.json"))).data.contact, { email: "owner@customer.example" }, "business contact with the spec's e-mail");
  });

  // ══ D. build ══════════════════════════════════════════════════════════════════════════════════
  console.log("D. build (real site builds, zero projects)");
  const buildLog: string[] = [];
  let builtA!: Awaited<ReturnType<typeof buildProvisionedSite>>;
  let composedEmpty!: Extract<PortfolioSiteResult, { ok: true }>;
  let renderPortfolioSite!: (input: PortfolioSiteInput) => PortfolioSiteResult;
  const results: Record<string, unknown> = {};
  await check("D1 the starter builds with ZERO projects into a shell package: /portfolio exists and is a shell page (runtime slot portfolio.index), no page shows a project card or links a project", async () => {
    const t0 = Date.now();
    builtA = await buildProvisionedSite({ repoRoot: rootA, spec: fixture, log: (l) => buildLog.push(l) });
    results.build = { files: builtA.facts.fileCount, bytes: builtA.facts.bytes, htmlPages: builtA.facts.htmlPages.length, buildMs: builtA.durationMs, wallMs: Date.now() - t0 };
    const siteRoot = path.join(builtA.packageDir, "site");
    const list = await readFile(path.join(siteRoot, pageFile("/portfolio")), "utf8");
    assert(/<div[^>]*data-portfolio-slot="portfolio\.index"[^>]*hidden/.test(list), "/portfolio has no hidden portfolio.index runtime slot");
    for (const page of builtA.facts.htmlPages) {
      const html = await readFile(path.join(siteRoot, page), "utf8");
      assert(!/data-project-card/.test(html), `${page} shows a project card`);
      assert(!/href="\/portfolio\/(?!page\/)[^"]/.test(html), `${page} links a project`);
      assert(!/data-review/.test(html), `${page} shows a review`);
      assert(/<meta name="robots" content="noindex"/.test(html), `${page} is not noindex`);
    }
    // under portfolio/: the detail SHELL page and the route payloads of the two shell pages — no page of a project
    const under = (await walk(siteRoot)).filter((f) => f.startsWith("portfolio/"));
    eq(under.filter((f) => f.endsWith(".html")), ["portfolio/_shell.html"], "HTML pages under portfolio/");
    assert(under.every((f) => f === "portfolio/_shell.html" || f === "portfolio/_shell.txt" || /^portfolio\/(_shell\/)?__next\.[^/]+\.txt$/.test(f)), `a project page was built: ${under.join(", ")}`);
    eq(builtA.scaffold, "unchanged", "the scaffold of C1 was reused");
    const record = await readJson(path.join(builtA.packageDir, "build-record.json"));
    eq([record.siteId, record.template.releaseId, record.qa.pass], [SITE, fixture.template.releaseId, true], "build record");
  });
  await check("D2 composed with nothing published (the release's own runtime kit): /portfolio is an EMPTY LIST that says so in the starter's words, the home page has no project section left open, there is no project page", async () => {
    const siteRoot = path.join(builtA.packageDir, "site");
    const kit = await buildRuntimeKit({ repoRoot, templateId: TEMPLATE, releaseId: fixture.template.releaseId, sourceCommit: "test" });
    const kitDir = path.join(rootA, "kit");
    await mkdir(kitDir);
    await writeFile(path.join(kitDir, RENDERER_FILE), kit.files[RENDERER_FILE]);
    const mod = (await import(pathToFileURL(path.join(kitDir, RENDERER_FILE)).href)) as { renderPortfolioSite: typeof renderPortfolioSite };
    renderPortfolioSite = mod.renderPortfolioSite;
    const runtime = await readJson(path.join(siteRoot, RUNTIME_FILE));
    const shell = await readJson(path.join(siteRoot, SHELL_FILE));
    const shellPages: Record<string, string> = {};
    for (const file of runtime.shellPages as string[]) shellPages[file] = await readFile(path.join(siteRoot, file), "utf8");
    const r = mod.renderPortfolioSite({ runtime, shell, shellPages, portfolio: { categories: [], projects: [], assets: [] }, at: T0().toISOString() });
    if (!r.ok) throw new Error(`the kit refused an empty portfolio: ${JSON.stringify(r.problems)}`);
    composedEmpty = r;
    eq(r.files.map((f) => f.path), ["/", "/portfolio", "/sitemap.xml"], "composed files");
    eq([r.projects, r.assets], [[], []], "projects, assets");
    const list = r.files.find((f) => f.path === "/portfolio")!.body;
    const slots = (await readJson(path.join(starterRoot, "slots.json"))).values["portfolio.index"];
    assert(list.includes('data-section="portfolio.index"') && !list.includes("data-portfolio-slot"), "/portfolio is not composed");
    assert(list.includes(escapeHtmlText(slots.emptyTitle)) && list.includes(escapeHtmlText(slots.emptyBody)), "the empty-state copy of the starter is not on /portfolio");
    assert(!/data-project-card/.test(list) && !/href="\/portfolio\/(?!page\/)[^"]/.test(list), "a project on the empty list");
    const home = r.files.find((f) => f.path === "/")!.body;
    assert(!home.includes("data-portfolio-slot") && !/data-project-card/.test(home) && home.includes(escapeHtmlText(fixture.identity.brandName)), "the composed home page");
    assert((/<title>([^<]*)<\/title>/.exec(home)?.[1] ?? "").includes(fixture.identity.brandName) && /<meta name="robots" content="noindex"/.test(home) && /<meta name="robots" content="noindex"/.test(list), "the composed pages: a title with the brand, noindex");
    assert(!/<loc>[^<]*\/portfolio\/[^<]/.test(r.files.find((f) => f.path === "/sitemap.xml")!.body), "the sitemap lists a project");
    for (const f of r.files) assert(!forbidden.some((x) => x.test(f.body)), `composed ${f.path} carries a trace of another site`);
    results.emptyState = { composedFiles: r.files.map((f) => f.path), emptyTitle: slots.emptyTitle };
  });
  await check("D3 hygiene of the built package (every text file and every file name): no name, hostname, e-mail address or phone number of an existing site, no demo image or project id; the brand, the widget key and the spec's phone are there; the baked origin is the spec's", async () => {
    const siteRoot = path.join(builtA.packageDir, "site");
    eq(await firstForbidden(siteRoot), undefined, "forbidden content in the package");
    const home = await readFile(path.join(siteRoot, "index.html"), "utf8");
    assert(home.includes(fixture.identity.brandName) && home.includes(fixture.boostchat.widgetKey) && home.includes(fixture.boostchat.widgetScriptUrl), "brand / widget on the home page");
    const tels = new Set<string>();
    const mails = new Set<string>();
    for (const page of builtA.facts.htmlPages) {
      const html = await readFile(path.join(siteRoot, page), "utf8");
      for (const m of html.matchAll(/href="(tel:[^"]*)"/g)) tels.add(m[1]!);
      for (const m of html.matchAll(/href="(mailto:[^"]*)"/g)) mails.add(m[1]!);
      assert(!/\{\{[a-zA-Z]+\}\}/.test(html), `${page} carries an unresolved token`);
    }
    eq([[...tels], [...mails]], [["tel:02-000-0000"], []], "tel / mailto links");
    assert((await readFile(path.join(siteRoot, "contact.html"), "utf8")).includes(fixture.boostchat.leadEndpoint), "the contact page posts to the spec's lead endpoint");
    assert(/^Sitemap: https:\/\/provision-smoke\.boostweb\.co\.kr\/sitemap\.xml$/m.test(await readFile(path.join(siteRoot, "robots.txt"), "utf8")), "robots.txt origin");
    const images = (await walk(siteRoot)).filter((f) => f.startsWith("assets/"));
    eq(images.length, (await readJson(path.join(starterRoot, "assets/registry.json"))).items.length, "package images = the starter's images");
  });
  await check("D4 the same spec again: nothing is scaffolded, nothing is rebuilt, the package is the same", async () => {
    const again = await buildProvisionedSite({ repoRoot: rootA, spec: fixture, log: () => {} });
    eq([again.scaffold, again.facts.packageHash, again.durationMs ?? null], ["unchanged", builtA.facts.packageHash, null], "second build");
  });
  await check("D5 a hostile brand name (quotes, a backslash, ${…}, $(…), a starter token, an entity) is DATA: it is on the page literally and escaped, nothing in it is evaluated or re-substituted; no phone → no tel: link; the e-mail is the spec's", async () => {
    const rootB = await makeRoot();
    const brand = `O'Brien "집" \\n \${process.env.HOME} $(id) {{phone}} &amp; 인테리어`.padEnd(80, "!");
    eq(brand.length, 80, "80 characters");
    const hostile = spec((s) => ((s.siteId = "hostile-brand"), (s.hostname = "hostile-brand.boostweb.co.kr"), (s.publicOrigin = "https://hostile-brand.boostweb.co.kr"), (s.identity.brandName = brand), (s.contact.phone = null), (s.contact.email = "owner@customer.example")));
    const built = await buildProvisionedSite({ repoRoot: rootB, spec: hostile, log: () => {} });
    const dir = path.join(rootB, "data/sites/hostile-brand");
    eq((await readJson(path.join(dir, "site.json"))).identity.brandName, brand, "site.json");
    eq((await readJson(path.join(dir, "slots.json"))).values["site.footer"].company1Value, brand, "a slot");
    const siteRoot = path.join(built.packageDir, "site");
    const shellText = await readFile(path.join(siteRoot, SHELL_FILE), "utf8");
    assert(JSON.stringify(JSON.parse(shellText)).includes(JSON.stringify(brand).slice(1, -1)), "shell.json does not hold the brand as a JSON string");
    for (const page of built.facts.htmlPages) {
      const html = await readFile(path.join(siteRoot, page), "utf8");
      assert(html.includes(escapeHtmlText(brand)), `${page} does not carry the escaped brand`);
      assert(!html.includes(os.homedir()) && !/uid=\d+/.test(html), `${page}: something in the brand was evaluated`);
      // outside <script> (where it is a JSON string), the brand's quotes never appear raw
      const markup = html.replace(/<script[\s\S]*?<\/script>/g, "");
      assert(!markup.includes('"집"') && !markup.includes("O'Brien"), `${page}: the brand is in the markup unescaped`);
      assert(!/href="tel:/.test(html), `${page} has a tel: link without a phone in the spec`);
      for (const m of html.matchAll(/href="mailto:([^"?]*)/g)) eq(m[1], "owner@customer.example", `${page} mailto`);
    }
    // a page whose <title> is in the package (the two shell pages get theirs when they are composed — below)
    const title = /<title>([^<]*)<\/title>/.exec(await readFile(path.join(siteRoot, "contact.html"), "utf8"))?.[1] ?? "";
    assert(title.includes(escapeHtmlText(brand)), `the title: ${title}`);
    // composed by the release's runtime kit (what the BoostChat publisher runs): the same holds for the pages it writes
    const runtime = await readJson(path.join(siteRoot, RUNTIME_FILE));
    const shellPages: Record<string, string> = {};
    for (const file of runtime.shellPages as string[]) shellPages[file] = await readFile(path.join(siteRoot, file), "utf8");
    const composed = renderPortfolioSite({ runtime, shell: JSON.parse(shellText), shellPages, portfolio: { categories: [], projects: [], assets: [] }, at: T0().toISOString() });
    if (!composed.ok) throw new Error(`the kit refused: ${JSON.stringify(composed.problems)}`);
    for (const f of composed.files.filter((x) => x.contentType.startsWith("text/html"))) {
      const markup = f.body.replace(/<script[\s\S]*?<\/script>/g, "");
      assert(f.body.includes(escapeHtmlText(brand)) && !markup.includes('"집"') && !markup.includes("O'Brien") && !f.body.includes(os.homedir()), `composed ${f.path}: the brand is not escaped`);
      assert((/<title>([^<]*)<\/title>/.exec(f.body)?.[1] ?? "").includes(escapeHtmlText(brand)), `composed ${f.path}: the title`);
    }
    eq(await firstForbidden(siteRoot), undefined, "forbidden content in the package");
  });

  // ══ E. routes ═════════════════════════════════════════════════════════════════════════════════
  console.log("E. routes");
  const fakeRoutes = (initial: Omit<WorkerRoute, "id">[] = [], opts: { failCreate?: (routes: WorkerRoute[]) => Error | undefined; onList?: () => void; onCreate?: () => void } = {}) => {
    const routes: WorkerRoute[] = initial.map((r, i) => ({ id: `route-${i}`, ...r }));
    const created: { pattern: string; script: string }[] = [];
    let lists = 0;
    const client: WorkerRouteClient = {
      async list() {
        lists++;
        opts.onList?.();
        return routes.map((r) => ({ ...r }));
      },
      async create(pattern, script) {
        const failure = opts.failCreate?.(routes);
        if (failure) throw failure;
        created.push({ pattern, script });
        opts.onCreate?.();
        const route = { id: `route-new-${created.length}`, pattern, script };
        routes.push(route);
        return route;
      },
    };
    return { client, routes, created, lists: () => lists };
  };
  const WILDCARDS = [
    { pattern: "*.boostweb.co.kr/*", script: "site-factory-next" },
    { pattern: "*/*", script: "site-factory-next" },
    { pattern: "interior-demo.boostweb.co.kr/*", script: DEFAULT_RUNTIME_SCRIPT },
  ];
  await check("E1 ensureHostRoute: no route → the exact <hostname>/* is created for the script (the zone's wildcards of another Worker are not a conflict); already ours → nothing is created", async () => {
    const f = fakeRoutes(WILDCARDS);
    eq(await ensureHostRoute({ client: f.client, hostname: HOST, script: DEFAULT_RUNTIME_SCRIPT }), { pattern: `${HOST}/*`, created: true, routeId: "route-new-1" }, "created");
    eq(f.created, [{ pattern: `${HOST}/*`, script: DEFAULT_RUNTIME_SCRIPT }], "the one create");
    eq(await ensureHostRoute({ client: f.client, hostname: HOST, script: DEFAULT_RUNTIME_SCRIPT }), { pattern: `${HOST}/*`, created: false, routeId: "route-new-1" }, "second call");
    eq(f.created.length, 1, "no second create");
  });
  await check("E2 ensureHostRoute: a route for the hostname on ANOTHER Worker (any pattern of that host, or one that turns Workers off) is a conflict — nothing is created, nothing is changed", async () => {
    for (const foreign of [
      { pattern: `${HOST}/*`, script: "site-factory-next" },
      { pattern: `${HOST}/admin/*`, script: "another-worker" },
      { pattern: `https://${HOST}/*`, script: "another-worker" },
      { pattern: `${HOST}/*`, script: null },
    ]) {
      const f = fakeRoutes([...WILDCARDS, foreign]);
      eq(await codeOf(ensureHostRoute({ client: f.client, hostname: HOST, script: DEFAULT_RUNTIME_SCRIPT })), "route_conflict", `conflict with ${foreign.pattern} → ${String(foreign.script)}`);
      eq([f.created, f.routes.length], [[], WILDCARDS.length + 1], "nothing created");
    }
    eq(await codeOf(ensureHostRoute({ client: fakeRoutes().client, hostname: "Not A Host", script: DEFAULT_RUNTIME_SCRIPT })), "route_invalid", "hostname");
    eq(await codeOf(ensureHostRoute({ client: fakeRoutes().client, hostname: HOST, script: "bad script;rm" })), "route_invalid", "script");
  });
  await check("E3 ensureHostRoute: a create that fails is an error — unless the route turns out to exist for our script (a retried run, a lost answer)", async () => {
    const lost = fakeRoutes(WILDCARDS, {
      failCreate: (routes) => {
        routes.push({ id: "route-raced", pattern: `${HOST}/*`, script: DEFAULT_RUNTIME_SCRIPT });
        return new RouteError("route_api", "Cloudflare routes API: create answered HTTP 409 (10020 duplicate)");
      },
    });
    eq(await ensureHostRoute({ client: lost.client, hostname: HOST, script: DEFAULT_RUNTIME_SCRIPT }), { pattern: `${HOST}/*`, created: false, routeId: "route-raced" }, "the lost answer");
    const down = fakeRoutes(WILDCARDS, { failCreate: () => new RouteError("route_api", "Cloudflare routes API: create answered HTTP 500") });
    eq(await codeOf(ensureHostRoute({ client: down.client, hostname: HOST, script: DEFAULT_RUNTIME_SCRIPT })), "route_api", "create failed");
  });
  await check("E4 the script is the runner's constant: recon-runtime-pilot, or RECON_RUNTIME_SCRIPT of the runner's environment — a malformed name is refused", () => {
    eq([runtimeScriptName({}), runtimeScriptName({ RECON_RUNTIME_SCRIPT: "recon-runtime-staging" })], ["recon-runtime-pilot", "recon-runtime-staging"], "script");
    let refused = false;
    try {
      runtimeScriptName({ RECON_RUNTIME_SCRIPT: "x y" });
    } catch (e) {
      refused = e instanceof RouteError && e.code === "route_config";
    }
    assert(refused, "a malformed script name");
  });
  await check("E5 the Cloudflare client (fake fetch): GET / POST zones/<zone>/workers/routes on api.cloudflare.com with the bearer token; a failed call, a non-route entry and a paged list are refused; the token is in no message", async () => {
    const ZONE = "0123456789abcdef0123456789abcdef";
    const seen: { url: string; init: RequestInit }[] = [];
    const answering = (status: number, body: unknown) =>
      (async (url: unknown, init?: RequestInit) => {
        seen.push({ url: String(url), init: init ?? {} });
        return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
      }) as typeof fetch;
    const client = (f: typeof fetch) => createCloudflareRouteClient({ apiToken: CF_TOKEN, zoneId: ZONE, fetch: f });
    const list = await client(answering(200, { success: true, errors: [], result: [{ id: "a", pattern: "x.boostweb.co.kr/*", script: "recon-runtime-pilot" }, { id: "b", pattern: "y.boostweb.co.kr/*" }] })).list();
    eq(list, [{ id: "a", pattern: "x.boostweb.co.kr/*", script: "recon-runtime-pilot" }, { id: "b", pattern: "y.boostweb.co.kr/*", script: null }], "list");
    eq([seen[0]!.url, seen[0]!.init.method, (seen[0]!.init.headers as Record<string, string>).authorization, seen[0]!.init.redirect], [`${CLOUDFLARE_API}/zones/${ZONE}/workers/routes`, "GET", `Bearer ${CF_TOKEN}`, "error"], "list request");
    const created = await client(answering(200, { success: true, result: { id: "new" } })).create(`${HOST}/*`, "recon-runtime-pilot");
    eq(created, { id: "new", pattern: `${HOST}/*`, script: "recon-runtime-pilot" }, "create");
    eq([seen[1]!.init.method, JSON.parse(String(seen[1]!.init.body))], ["POST", { pattern: `${HOST}/*`, script: "recon-runtime-pilot" }], "create request");
    const messages: string[] = [];
    const refused = async (p: Promise<unknown>, label: string) => {
      try {
        await p;
      } catch (e) {
        assert(e instanceof RouteError && e.code === "route_api", `${label}: ${(e as Error).message}`);
        messages.push(e.message);
        return;
      }
      throw new Error(`${label}: accepted`);
    };
    await refused(client(answering(403, { success: false, errors: [{ code: 10000, message: `Authentication error for Bearer ${CF_TOKEN}` }] })).list(), "403");
    await refused(client(answering(200, { success: true, result: [{ pattern: "no id" }] })).list(), "an entry that is not a route");
    await refused(client(answering(200, { success: true, result: [], result_info: { total_pages: 3 } })).list(), "a paged list");
    await refused(client(answering(200, "<html>not json</html>")).list(), "not JSON");
    await refused(client((async () => Promise.reject(new Error(`connect failed with header Bearer ${CF_TOKEN}`))) as unknown as typeof fetch).list(), "no answer");
    await refused(client(answering(500, { success: false, errors: [] })).create(`${HOST}/*`, "recon-runtime-pilot"), "create 500");
    const scrub = createScrubber([CF_TOKEN]);
    // the client's own text never holds the token; what Cloudflare echoes back is the scrubber's to remove
    assert(!messages.filter((m) => !m.includes("Authentication error")).some((m) => m.includes(CF_TOKEN)), `a message holds the token: ${messages.join(" | ")}`);
    assert(!messages.some((m) => scrub.line(m).includes(CF_TOKEN)), "a scrubbed message holds the token");
    for (const bad of [{ apiToken: "", zoneId: ZONE }, { apiToken: "a b", zoneId: ZONE }, { apiToken: CF_TOKEN, zoneId: "not-a-zone" }]) eq(await codeOf(() => createCloudflareRouteClient(bad)), "route_config", `config ${JSON.stringify({ ...bad, apiToken: bad.apiToken ? "set" : "" })}`);
  });
  await check("E6 the runtime deploy list = wrangler.jsonc routes ∪ the live routes of the script: a provisioned hostname is kept, another Worker's routes are not taken, a config route live under another Worker is refused; the real wrangler.jsonc still parses and says the plain deploy is forbidden", async () => {
    const text = await readFile(path.join(repoRoot, "workers/recon-runtime/wrangler.jsonc"), "utf8");
    const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", text);
    assert(!parsed.error && parsed.config?.env?.pilot?.name === DEFAULT_RUNTIME_SCRIPT, "wrangler.jsonc env.pilot.name");
    assert(/platform\/cli\/runtime-deploy\.ts/.test(text) && /FORBIDDEN/.test(text), "the comment at the routes array");
    const config = configRoutes(parsed.config.env.pilot.routes);
    assert(config.length >= 3 && config.every((r) => r.zone_name === "boostweb.co.kr" && /^[a-z0-9-]+\.boostweb\.co\.kr\/\*$/.test(r.pattern)), `config routes: ${JSON.stringify(config)}`);
    const live: WorkerRoute[] = [
      ...config.map((r, i) => ({ id: `c${i}`, pattern: r.pattern, script: DEFAULT_RUNTIME_SCRIPT })),
      { id: "p1", pattern: "new-customer.boostweb.co.kr/*", script: DEFAULT_RUNTIME_SCRIPT },
      { id: "w1", pattern: "*.boostweb.co.kr/*", script: "site-factory-next" },
      { id: "w2", pattern: "*/*", script: "site-factory-next" },
    ];
    const m = mergeDeployRoutes({ config, live, script: DEFAULT_RUNTIME_SCRIPT });
    eq([m.liveOnly, m.configOnly], [["new-customer.boostweb.co.kr/*"], []], "live only / config only");
    eq(m.routes.map((r) => r.pattern), [...config.map((r) => r.pattern), "new-customer.boostweb.co.kr/*"].sort(), "merged");
    assert(m.routes.every((r) => r.zone_name === "boostweb.co.kr") && !m.routes.some((r) => r.pattern.includes("*.") || r.pattern === "*/*"), "a wildcard was taken");
    eq(mergeDeployRoutes({ config, live: [], script: DEFAULT_RUNTIME_SCRIPT }).configOnly, config.map((r) => r.pattern).sort(), "nothing live → the config routes would be created");
    const throws = (fn: () => unknown) => {
      try {
        fn();
      } catch (e) {
        return e instanceof DeployRoutesError;
      }
      return false;
    };
    assert(throws(() => mergeDeployRoutes({ config, live: [{ id: "x", pattern: config[0]!.pattern, script: "site-factory-next" }], script: DEFAULT_RUNTIME_SCRIPT })), "a config route live under another Worker");
    assert(throws(() => mergeDeployRoutes({ config: [...config, { pattern: "a.other-zone.example/*", zone_name: "other-zone.example" }], live, script: DEFAULT_RUNTIME_SCRIPT })), "two zones");
    assert(throws(() => mergeDeployRoutes({ config, live: [{ id: "x", pattern: "a.other-zone.example/*", script: DEFAULT_RUNTIME_SCRIPT }], script: DEFAULT_RUNTIME_SCRIPT })), "a live route outside the zone");
    assert(throws(() => configRoutes([])) && throws(() => configRoutes([{ pattern: "a.boostweb.co.kr", custom_domain: true }])) && throws(() => configRoutes(undefined)), "config routes of another form");
  });

  // ══ F. BoostChat client ═══════════════════════════════════════════════════════════════════════
  console.log("F. BoostChat client (fake fetch)");
  /** A BoostChat that speaks the provisioning contract. `answer` may override one response. */
  function fakeBoostChat(opts: { spec?: unknown; answer?: (pathname: string, body: any, n: number) => Response | undefined; timeline?: string[] } = {}) {
    const requests: { pathname: string; method: string; authorization: string; body: any }[] = [];
    const events: { type: RunnerEventType; data: any }[] = [];
    const doFetch = (async (url: unknown, init?: RequestInit) => {
      const u = new URL(String(url));
      const body = JSON.parse(String(init?.body ?? "null"));
      requests.push({ pathname: u.pathname, method: String(init?.method), authorization: (init?.headers as Record<string, string>).authorization ?? "", body });
      const override = opts.answer?.(u.pathname, body, requests.length);
      if (override) return override;
      const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
      if (u.origin !== "https://boostchat.test.example" || init?.method !== "POST") return json(404, { error: "not_found" });
      if (requests.at(-1)!.authorization !== `Bearer ${PUBLISHER_TOKEN}`) return json(401, { error: "unauthorized" });
      if (u.pathname === claimPath(JOB)) return json(200, { ok: true, job: { id: JOB, attempt: 2 }, eventToken: EVENT_TOKEN, spec: opts.spec ?? fixture });
      if (u.pathname === eventsPath(JOB)) {
        if (body.attempt !== 2 || body.eventToken !== EVENT_TOKEN) return json(409, { error: "stale_attempt" });
        events.push({ type: body.type, data: body.data });
        opts.timeline?.push(`event:${body.type}`);
        return json(200, { ok: true });
      }
      return json(404, { error: "job_not_found" });
    }) as typeof fetch;
    const client = createProvisioningClient({ baseUrl: "https://boostchat.test.example", token: PUBLISHER_TOKEN, jobId: JOB, fetch: doFetch, sleep: async () => {} });
    return { client, requests, events };
  }
  const json = (status: number, value: unknown) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  await check("F1 claim: POST {base}/api/publisher/provisioning/<jobId>/claim with the publisher's Bearer header and { runId, runAttempt }; the caller gets the job and the spec — never the event token", async () => {
    const b = fakeBoostChat();
    const claim = await b.client.claim(RUN);
    eq(b.requests, [{ pathname: `/api/publisher/provisioning/${JOB}/claim`, method: "POST", authorization: `Bearer ${PUBLISHER_TOKEN}`, body: { runId: "1234567890", runAttempt: 1 } }], "request");
    eq([claim.job, Object.keys(claim).sort()], [{ id: JOB, attempt: 2 }, ["job", "spec"]], "claim");
    assert(!JSON.stringify(claim).includes(EVENT_TOKEN) && !b.client.description.includes(PUBLISHER_TOKEN), "the event token left the client");
    eq(b.client.secrets().sort(), [EVENT_TOKEN, PUBLISHER_TOKEN].sort(), "secrets() — for the scrubber");
  });
  await check("F2 events: POST …/events with { attempt, eventToken, type, data } of the claim; data is exactly the contract's fields (anything else is refused before it is sent); a failed message is cut to 300", async () => {
    const b = fakeBoostChat();
    eq(await codeOf(b.client.event("built", { packageHash: "a".repeat(64), buildInputId: "b".repeat(64), fileCount: 1, releaseId: fixture.template.releaseId, releaseHash: fixture.template.releaseHash })), "config", "an event before a claim");
    await b.client.claim(RUN);
    await b.client.event("route_ready", { pattern: `${HOST}/*`, created: true });
    eq(b.requests.at(-1), { pathname: `/api/publisher/provisioning/${JOB}/events`, method: "POST", authorization: `Bearer ${PUBLISHER_TOKEN}`, body: { attempt: 2, eventToken: EVENT_TOKEN, type: "route_ready", data: { pattern: `${HOST}/*`, created: true } } }, "event request");
    const n = b.requests.length;
    eq(await codeOf(b.client.event("route_ready", { pattern: `${HOST}/*`, created: true, script: "x" } as never)), "protocol", "an extra field");
    eq(await codeOf(b.client.event("failed", { step: "deploy" as never, code: "x", message: "m" })), "protocol", "a step outside the enum");
    eq(await codeOf(b.client.event("failed", { step: "build", code: "Not A Code", message: "m" })), "protocol", "a code that is not a code");
    eq(b.requests.length, n, "nothing was sent for a refused event");
    await b.client.event("failed", { step: "build", code: "build_failed", message: "x".repeat(900) });
    eq([b.events.at(-1)!.data.message.length, Object.keys(b.events.at(-1)!.data).sort()], [300, ["code", "message", "step"]], "failed event");
    for (const type of Object.keys(RunnerEventDataSchemas)) assert(["built", "announced", "route_ready", "activated", "failed"].includes(type), `an event type the contract does not name: ${type}`);
  });
  await check("F3 answers: 401 / 403 → unauthorized, 404 → job_not_found, 409 on a claim → job_not_claimable, 409 on an event → event_refused (final, not retried), 5xx / no answer on an event → retried, an answer outside the contract or for another job → protocol; https only; no token in any message", async () => {
    const messages: string[] = [];
    const claimCode = async (answer: (p: string, b: any, n: number) => Response | undefined) => {
      try {
        await fakeBoostChat({ answer }).client.claim(RUN);
      } catch (e) {
        messages.push((e as Error).message);
        return (e as ProvisioningApiError).code;
      }
      return "(accepted)";
    };
    eq(await claimCode(() => json(401, { error: "unauthorized" })), "unauthorized", "401");
    eq(await claimCode(() => json(403, { error: "forbidden" })), "unauthorized", "403");
    eq(await claimCode(() => json(404, { error: "job_not_found" })), "job_not_found", "404");
    eq(await claimCode(() => json(409, { error: "job_not_claimable" })), "job_not_claimable", "409");
    eq(await claimCode(() => json(503, { error: `store_unavailable token=${PUBLISHER_TOKEN}` })), "http", "503");
    eq(await claimCode(() => new Response("<html>", { status: 200 })), "protocol", "not JSON");
    eq(await claimCode(() => json(200, { ok: true, job: { id: JOB, attempt: 1 }, spec: fixture })), "protocol", "no event token");
    eq(await claimCode(() => json(200, { ok: true, job: { id: JOB, attempt: 1 }, eventToken: EVENT_TOKEN, spec: fixture, debug: true })), "protocol", "an extra field");
    eq(await claimCode(() => json(200, { ok: true, job: { id: "11111111-2222-3333-4444-555555555555", attempt: 1 }, eventToken: EVENT_TOKEN, spec: fixture })), "protocol", "another job");
    eq(await claimCode(() => json(200, { ok: true, job: { id: JOB, attempt: 1 }, eventToken: "short", spec: fixture })), "protocol", "a token of another shape");
    eq(await claimCode(() => { throw new Error(`socket hang up (authorization: Bearer ${PUBLISHER_TOKEN})`); }), "network", "no answer");

    const stale = fakeBoostChat({ answer: (p) => (p.endsWith("/events") ? json(409, { error: "stale_attempt" }) : undefined) });
    await stale.client.claim(RUN);
    eq(await codeOf(stale.client.event("route_ready", { pattern: `${HOST}/*`, created: true })), "event_refused", "409 on an event");
    eq(stale.requests.filter((r) => r.pathname.endsWith("/events")).length, 1, "a 409 is not retried");
    const flaky = fakeBoostChat({ answer: (p, _b, n) => (p.endsWith("/events") && n <= 3 ? (n === 2 ? json(502, { error: "bad_gateway" }) : (() => { throw new Error("ECONNRESET"); })()) : undefined) });
    await flaky.client.claim(RUN);
    await flaky.client.event("route_ready", { pattern: `${HOST}/*`, created: true });
    eq([flaky.requests.filter((r) => r.pathname.endsWith("/events")).length, flaky.events.length], [3, 1], "5xx and no answer are retried; the third try is accepted");
    const down = fakeBoostChat({ answer: (p) => (p.endsWith("/events") ? json(500, { error: "internal" }) : undefined) });
    await down.client.claim(RUN);
    eq(await codeOf(down.client.event("route_ready", { pattern: `${HOST}/*`, created: true })), "http", "5xx three times");
    eq(down.requests.filter((r) => r.pathname.endsWith("/events")).length, 3, "three tries");

    const scrub = createScrubber(SECRETS);
    assert(!messages.some((m) => scrub.line(m).includes(PUBLISHER_TOKEN) || m.includes(EVENT_TOKEN)), `a message holds a token: ${messages.join(" | ")}`);
    for (const bad of [{ baseUrl: "http://boostchat.example", jobId: JOB }, { baseUrl: "https://boostchat.example/api", jobId: JOB }, { baseUrl: "https://boostchat.example", jobId: "not-a-uuid" }, { baseUrl: "https://boostchat.example", jobId: JOB.toUpperCase() }]) {
      eq(await codeOf(() => createProvisioningClient({ ...bad, token: PUBLISHER_TOKEN })), "config", `config ${JSON.stringify(bad)}`);
    }
    eq(await codeOf(() => createProvisioningClient({ baseUrl: "https://boostchat.example", jobId: JOB, token: "" })), "config", "no token");
    eq(await codeOf(fakeBoostChat().client.claim({ runId: "1; rm -rf /", runAttempt: 1 })), "config", "a run id that is not one");
  });
  await check("F4 the scrubber: exact secret values, bearer headers, URL credentials, URL queries and secret-named pairs are removed; hashes, hostnames and site ids are kept; one line, cut to the limit", () => {
    const scrub = createScrubber([PUBLISHER_TOKEN]);
    const hash = "c".repeat(64);
    const line = scrub.line(`put packages/${SITE}/${hash}/index.html failed\n  Authorization: Bearer abc.def-123\n https://user:pw@r2.example/x?X-Amz-Signature=deadbeef token=${PUBLISHER_TOKEN} CLOUDFLARE_API_TOKEN=zzz9 host ${HOST}`);
    assert(!line.includes(PUBLISHER_TOKEN) && !line.includes("abc.def-123") && !line.includes("user:pw") && !line.includes("deadbeef") && !line.includes("zzz9"), `not scrubbed: ${line}`);
    assert(line.includes(hash) && line.includes(HOST) && line.includes(SITE) && line.includes(REDACTED) && !line.includes("\n"), `over-scrubbed: ${line}`);
    scrub.add(EVENT_TOKEN);
    eq(scrub.line(`x ${EVENT_TOKEN} y`), `x ${REDACTED} y`, "a secret added later");
    eq(scrub.message("가".repeat(500), 300).length, 300, "cut to 300");
  });

  // ══ G. provisionSite ══════════════════════════════════════════════════════════════════════════
  console.log("G. provisionSite (memory store, fake BoostChat / announcer / routes, the real package of D1)");
  const HASH = builtA?.facts.packageHash ?? "";
  const ROUTING = routingKey(HOST);
  const CURRENT = portfolioCurrentKey(SITE, HASH);

  /** What the BoostChat publisher writes for (site, package): the composed EMPTY portfolio of D2 — blobs → manifest → pointer last. */
  async function publishEmptyOverlay(store: ObjectStore, revision: number, timeline?: string[]) {
    const routes: Record<string, unknown> = {};
    for (const f of composedEmpty.files) {
      const body = enc(f.body);
      const key = `blobs/${sha256(body)}${f.path === "/sitemap.xml" ? ".xml" : ".html"}`;
      await store.put(portfolioPublicKey(SITE, key), body, { contentType: f.contentType, cacheControl: "no-store" });
      routes[f.path] = { key, sha256: sha256(body), size: body.length, contentType: f.contentType };
    }
    const manifest = enc({ schema: "portfolio-manifest@1", siteId: SITE, revision, shell: { packageHash: HASH, releaseId: fixture.template.releaseId }, owned: composedEmpty.owned, routes, assets: {}, projects: {} });
    const manifestKey = `revisions/${revision}/${sha256(manifest).slice(0, 16)}.json`;
    await store.put(portfolioPublicKey(SITE, manifestKey), manifest, JSON_META);
    await store.put(CURRENT, enc({ schema: "portfolio-current@1", siteId: SITE, shellPackageHash: HASH, revision, manifestKey, manifestSha256: sha256(manifest), publishedAt: T0().toISOString() }), JSON_META);
    timeline?.push("overlay:published");
  }

  interface World {
    store: MemoryStore;
    timeline: string[];
    logs: string[];
    events: { type: RunnerEventType; data: any }[];
    /** every attempt to send an event, accepted or not */
    attempts: RunnerEventType[];
    announces: number;
    routes: ReturnType<typeof fakeRoutes>;
    run: (over?: Partial<ProvisionDeps>) => Promise<ProvisionResult>;
  }
  interface WorldOptions {
    store?: MemoryStore;
    spec?: unknown;
    /** BoostChat's answer to the n-th announce (1-based); default: queued for revision 1, already_published once the overlay is in the store */
    announce?: (n: number, w: World) => ShellAnnouncement | Error;
    /** the fake publisher writes the overlay during the n-th sleep of the wait (default 1; 0 = never) */
    publishOnSleep?: number;
    routes?: ReturnType<typeof fakeRoutes>;
    refuseEvent?: (type: RunnerEventType) => ProvisioningApiError | undefined;
    claimError?: ProvisioningApiError;
    resources?: (w: World) => ProvisionResources;
  }
  function world(o: WorldOptions = {}): World {
    const store = o.store ?? new MemoryStore();
    const timeline: string[] = [];
    const w = { store, timeline, logs: [], events: [], attempts: [], announces: 0, routes: o.routes ?? fakeRoutes(WILDCARDS, { onList: () => timeline.push("route:list"), onCreate: () => timeline.push("route:create") }) } as unknown as World;
    const spied: ObjectStore = {
      description: "memory (spied)",
      get: (k) => store.get(k),
      put: async (k, b, m) => {
        await store.put(k, b, m);
        if (k === ROUTING) timeline.push("put:routing");
        if (k === sealKey(SITE, HASH)) timeline.push("put:seal");
      },
    };
    const boostchat: ProvisioningClient = {
      description: "BoostChat https://boostchat.test.example",
      secrets: () => [PUBLISHER_TOKEN, EVENT_TOKEN],
      async claim() {
        if (o.claimError) throw o.claimError;
        return { job: { id: JOB, attempt: 2 }, spec: o.spec ?? fixture };
      },
      async event(type, data) {
        w.attempts.push(type);
        RunnerEventDataSchemas[type].parse(data); // the contract's fields, nothing else
        const refusal = o.refuseEvent?.(type);
        if (refusal) throw refusal;
        w.events.push({ type, data });
        timeline.push(`event:${type}`);
      },
    };
    const announcer: ShellPackageAnnouncer = {
      description: "BoostChat https://boostchat.test.example",
      async announce(input) {
        w.announces++;
        timeline.push("announce");
        eq(input, { siteId: SITE, packageHash: HASH }, "announce input");
        const live = store.objects.has(CURRENT);
        const answer = o.announce ? o.announce(w.announces, w) : ({ ok: true, siteId: SITE, packageHash: HASH, state: live ? "already_published" : "queued", publishMode: "v2", searchSource: "canonical", desiredRevision: 1, liveRevision: live ? 1 : null } as ShellAnnouncement);
        if (answer instanceof Error) throw answer;
        return answer;
      },
    };
    let t = 0;
    let sleeps = 0;
    w.run = (over = {}) =>
      provisionSite({
        repoRoot: rootA,
        boostchat,
        run: RUN,
        resources: () => (o.resources ? o.resources(w) : { store: spied, announce: { mode: "on", create: () => announcer }, routes: w.routes.client, script: DEFAULT_RUNTIME_SCRIPT }),
        log: (l) => w.logs.push(l),
        secrets: [CF_TOKEN],
        waitSeconds: 9,
        pollIntervalMs: 3000,
        clock: () => t,
        now: T0,
        sleep: async (ms) => {
          t += ms;
          sleeps++;
          if (sleeps === (o.publishOnSleep ?? 1)) await publishEmptyOverlay(spied, 1, timeline);
        },
        ...over,
      });
    return w;
  }
  /** no secret in any log line, any event's data, or the result */
  function assertNoSecret(w: World, result: ProvisionResult, label: string) {
    const everything = [...w.logs, JSON.stringify(w.events), JSON.stringify(result)];
    for (const secret of SECRETS) assert(!everything.some((t) => t.includes(secret)), `${label}: a secret is in a log line, an event or the result`);
    assert(!w.logs.some((l) => l.includes(rootA) || l.includes("\n")), `${label}: a log line holds the checkout's absolute path or a line break`);
  }
  /** a failed run: exactly one `failed` event attempt, of this step and code; no routing pointer; nothing after it */
  function assertFailed(w: World, r: ProvisionResult, stepName: string, code: string, before: RunnerEventType[], label: string) {
    assert(!r.ok && r.stage !== "claim", `${label}: result ${JSON.stringify(r)}`);
    eq([r.stage, r.code], [stepName, code], `${label}: stage / code`);
    eq(w.attempts.filter((t) => t === "failed").length, 1, `${label}: exactly one failed event`);
    eq(w.events.map((e) => e.type), [...before, "failed"], `${label}: events`);
    const failedEvent = w.events.at(-1)!.data;
    eq([failedEvent.step, failedEvent.code, Object.keys(failedEvent).sort()], [stepName, code, ["code", "message", "step"]], `${label}: failed event`);
    assert(failedEvent.message.length > 0 && failedEvent.message.length <= 300, `${label}: message length ${failedEvent.message.length}`);
    assert(!w.store.objects.has(ROUTING) && !w.store.writes.includes(ROUTING), `${label}: a routing pointer was written`);
    assertNoSecret(w, r, label);
  }

  let happy!: World;
  await check("G1 the whole job: claim → built → upload + seal → announce → announced → route created → route_ready → BoostChat publishes the empty portfolio during the wait → routing pointer (the LAST write) → activated", async () => {
    assert(HASH && composedEmpty, "D1 / D2 did not pass");
    happy = world();
    const r = await happy.run();
    assert(r.ok, `not ok: ${JSON.stringify(r)} | ${happy.logs.slice(-3).join(" | ")}`);
    eq(happy.timeline.filter((x) => x !== "route:list"), ["event:built", "put:seal", "announce", "event:announced", "route:create", "event:route_ready", "announce", "overlay:published", "put:routing", "event:activated"], "order");
    eq(happy.events.map((e) => e.type), ["built", "announced", "route_ready", "activated"], "events");
    eq(happy.events[0]!.data, { packageHash: HASH, buildInputId: builtA.facts.buildInputId, fileCount: builtA.facts.fileCount, releaseId: fixture.template.releaseId, releaseHash: fixture.template.releaseHash }, "built");
    eq(happy.events[1]!.data, { packageHash: HASH, state: "queued", desiredRevision: 1 }, "announced");
    eq(happy.events[2]!.data, { pattern: `${HOST}/*`, created: true }, "route_ready");
    eq(happy.events[3]!.data, { hostname: HOST, packageHash: HASH }, "activated");
    eq(happy.routes.created, [{ pattern: `${HOST}/*`, script: DEFAULT_RUNTIME_SCRIPT }], "the one route");
    eq({ ...r, ok: undefined }, { jobId: JOB, attempt: 2, siteId: SITE, hostname: HOST, packageHash: HASH, buildInputId: builtA.facts.buildInputId, fileCount: builtA.facts.fileCount, route: { pattern: `${HOST}/*`, created: true }, pointerWrite: "written" }, "result");
    // the routing pointer: one write, the very last one, after BoostChat's pointer
    eq([happy.store.writes.filter((k) => k.startsWith("routing/")), happy.store.writes.at(-1), happy.store.writes.indexOf(CURRENT) < happy.store.writes.indexOf(ROUTING)], [[ROUTING], ROUTING, true], "routing writes");
    const pointer = JSON.parse(Buffer.from(happy.store.objects.get(ROUTING)!.body).toString("utf8"));
    eq([pointer.hostname, pointer.siteId, pointer.packageHash, pointer.releaseId], [HOST, SITE, HASH, fixture.template.releaseId], "pointer");
    assertNoSecret(happy, r, "G1");
  });
  await check("G2 what the hostname then serves (the real Worker over the same objects): /portfolio is the EMPTY LIST with the starter's copy, / carries the brand, a project URL is 404, /_runtime/** is not served", async () => {
    const s = happy.store;
    const meta = (key: string) => {
      const o = s.objects.get(key);
      return o ? { size: o.body.length, httpEtag: `"${createHash("md5").update(o.body).digest("hex")}"`, httpMetadata: { contentType: o.meta.contentType, cacheControl: o.meta.cacheControl }, bytes: o.body } : null;
    };
    const bucket: R2BucketLike = {
      async get(key) {
        const o = meta(key);
        if (!o) return null;
        return { size: o.size, httpEtag: o.httpEtag, httpMetadata: o.httpMetadata, body: new Blob([new Uint8Array(o.bytes)]).stream(), text: async () => Buffer.from(o.bytes).toString("utf8") } as R2ObjectBodyLike;
      },
      async head(key) {
        const o = meta(key);
        return o && { size: o.size, httpEtag: o.httpEtag, httpMetadata: o.httpMetadata };
      },
    };
    const env: Env = { SITES: bucket };
    const get = async (p: string, host = HOST) => {
      const res = await handle(new Request(`https://${host}${p}`), env);
      return { status: res.status, body: await res.text() };
    };
    const slots = (await readJson(path.join(starterRoot, "slots.json"))).values["portfolio.index"];
    const list = await get("/portfolio");
    eq(list.status, 200, "/portfolio");
    assert(list.body.includes(escapeHtmlText(slots.emptyTitle)) && !/data-project-card/.test(list.body) && !list.body.includes("data-portfolio-slot"), "/portfolio is not the composed empty list");
    const home = await get("/");
    assert(home.status === 200 && home.body.includes(fixture.identity.brandName) && home.body.includes(fixture.boostchat.widgetKey), "/");
    eq([(await get("/contact")).status, (await get("/portfolio/some-project")).status, (await get(`/${RUNTIME_FILE}`)).status], [200, 404, 404], "/contact, a project URL, /_runtime");
    eq((await get("/", "another-host.boostweb.co.kr")).status, 404, "a hostname without a pointer");
  });
  await check("G3 the same job again (a retry after success): nothing is uploaded, the route is found, BoostChat answers already_published, the pointer is unchanged — and the four events are sent again", async () => {
    const before = happy.store.writes.length;
    const again = world({ store: happy.store, routes: happy.routes });
    const r = await again.run();
    assert(r.ok, `not ok: ${JSON.stringify(r)}`);
    eq([r.route, r.pointerWrite], [{ pattern: `${HOST}/*`, created: false }, "unchanged"], "route / pointer");
    eq([happy.store.writes.length, happy.routes.created.length], [before, 1], "no new write, no new route");
    eq(again.events.map((e) => e.type), ["built", "announced", "route_ready", "activated"], "events");
    eq(again.events[1]!.data, { packageHash: HASH, state: "already_published", desiredRevision: 1 }, "announced (the revision BoostChat reports as live)");
    assertNoSecret(again, r, "G3");
  });

  await check("G4 a claim that is not accepted sends NOTHING: no event, no build, no store write, no route", async () => {
    const w = world({ claimError: new ProvisioningApiError("job_not_claimable", `claim answered HTTP 409 job_not_claimable (Bearer ${PUBLISHER_TOKEN})`, 409) });
    const r = await w.run();
    eq([r.ok, !r.ok && r.stage, !r.ok && r.code], [false, "claim", "claim_job_not_claimable"], "result");
    eq([w.attempts, w.store.writes, w.routes.lists(), w.announces], [[], [], 0, 0], "nothing happened");
    assertNoSecret(w, r, "G4");
  });
  await check("G5 failed at `unknown` · runner_config: the runner's own configuration is judged AFTER the claim, so the job is told instead of timing out — the message names variables, never values", async () => {
    const w = world({ resources: () => { throw new ProvisionError("runner_config", "the runner is not configured: CLOUDFLARE_ZONE_ID is not a zone id"); } });
    const r = await w.run();
    assertFailed(w, r, "unknown", "runner_config", [], "G5");
    eq([w.store.writes, w.routes.lists()], [[], 0], "nothing written");
    const off = world({ resources: (x) => ({ store: x.store, announce: { mode: "off", why: "test" }, routes: x.routes.client, script: DEFAULT_RUNTIME_SCRIPT }) });
    assertFailed(off, await off.run(), "unknown", "runner_config", [], "G5 (no announcer)");
  });
  await check("G6 failed at `scaffold`: a spec BoostChat should never have sent (a hostname outside the zone, an unknown release, a site id that is taken) — nothing is built, uploaded or routed", async () => {
    const cases: [unknown, string][] = [
      [spec((s) => ((s.hostname = "x.example.com"), (s.publicOrigin = "https://x.example.com"))), "host_invalid"],
      [spec((s) => (s.template.releaseId = `interior-02-9.9.9-${fixture.template.releaseHash.slice(0, 12)}`)), "release_not_allowed"],
      [spec((s) => (s.identity.brandName = "이미 있는 다른 사이트")), "site_exists_different"],
      [{ nothing: true }, "spec_invalid"],
    ];
    for (const [bad, code] of cases) {
      const w = world({ spec: bad });
      const r = await w.run({ buildSite: async () => { throw new Error("the builder must not run"); } });
      assertFailed(w, r, "scaffold", code, [], `G6 ${code}`);
      eq([w.store.writes, w.routes.lists(), w.announces], [[], 0, 0], `G6 ${code}: nothing happened`);
    }
  });
  await check("G7 failed at `build`: the builder's error becomes one failed event — the message is one line of at most 300 characters with every credential removed", async () => {
    const w = world();
    const noisy = `next build exited 1\n  at /home/runner/work/x.js:1\n  Authorization: Bearer ${CF_TOKEN}\n  fetch https://user:${PUBLISHER_TOKEN}@registry.example/pkg?token=${EVENT_TOKEN} failed ${"x".repeat(600)}`;
    const r = await w.run({ buildSite: async () => { throw new Error(noisy); } });
    assertFailed(w, r, "build", "build_failed", [], "G7");
    eq([w.store.writes, w.announces, w.routes.lists()], [[], 0, 0], "nothing after the build");
    const message = w.events.at(-1)!.data.message as string;
    assert(message.startsWith("next build exited 1") && message.includes(REDACTED) && !message.includes("\n"), `message: ${message}`);
  });
  await check("G8 failed at `upload`: a store write that fails stops the job after `built` — no seal, no announce, no route, no pointer; run again with a working store, it completes", async () => {
    const store = new MemoryStore({ failPut: (k) => k.endsWith("/index.html") });
    const w = world({ store });
    const r = await w.run();
    assertFailed(w, r, "upload", "upload_failed", ["built"], "G8");
    eq([store.objects.has(sealKey(SITE, HASH)), w.announces, w.routes.lists()], [false, 0, 0], "no seal, no announce, no route");
    store.faults = {};
    const retry = world({ store });
    const again = await retry.run();
    assert(again.ok && again.pointerWrite === "written", `the retry: ${JSON.stringify(again)}`);
    // a read-back that does not match what was sent is an upload failure too
    const corrupt = world({ store: new MemoryStore({ corruptPut: (k) => k.endsWith("/robots.txt") }) });
    assertFailed(corrupt, await corrupt.run(), "upload", "upload_failed", ["built"], "G8 (corrupt read-back)");
  });
  await check("G9 failed at `announce`: BoostChat does not accept the package (5xx, 404 site_not_found, mode_v1, an answer without a revision) — the package stays uploaded and sealed, no route is created, no pointer", async () => {
    const cases: [(n: number) => ShellAnnouncement | Error, string][] = [
      [() => new AnnounceError(`announce answered HTTP 503 store_unavailable (Bearer ${PUBLISHER_TOKEN})`, "unavailable", 503), "announce_failed"],
      [() => new AnnounceError("announce answered HTTP 404 site_not_found", "site_not_found", 404), "site_not_found"],
      [() => new AnnounceError("announce answered HTTP 409 package_not_v2", "package_not_v2", 409), "package_not_v2"],
      [() => ({ ok: true, siteId: SITE, packageHash: HASH, state: "mode_v1", publishMode: "v1", searchSource: "snapshot", desiredRevision: null, liveRevision: null }), "mode_v1"],
      [() => ({ ok: true, siteId: SITE, packageHash: HASH, state: "queued", publishMode: "v2", searchSource: "canonical", desiredRevision: null, liveRevision: null }), "announce_failed"],
    ];
    for (const [announce, code] of cases) {
      const w = world({ announce });
      const r = await w.run();
      assertFailed(w, r, "announce", code, ["built"], `G9 ${code}`);
      eq([w.store.objects.has(sealKey(SITE, HASH)), w.routes.lists(), w.routes.created], [true, 0, []], `G9 ${code}: sealed, no route`);
    }
    const config = world({ resources: (x) => ({ store: x.store, announce: { mode: "on", create: () => { throw new AnnounceError("BOOSTCHAT_BASE_URL is not a URL", "config"); } }, routes: x.routes.client, script: DEFAULT_RUNTIME_SCRIPT }) });
    assertFailed(config, await config.run(), "announce", "announce_config", ["built"], "G9 announce_config");
    eq(config.store.writes, [], "an unusable announcer is found before anything is uploaded");
  });
  await check("G10 failed at `route` · route_conflict: a route for the hostname on another Worker — nothing is created or changed, no pointer; `route_api` when Cloudflare cannot be asked", async () => {
    const routes = fakeRoutes([...WILDCARDS, { pattern: `${HOST}/*`, script: "site-factory-next" }]);
    const w = world({ routes });
    const r = await w.run();
    assertFailed(w, r, "route", "route_conflict", ["built", "announced"], "G10");
    eq([routes.created, routes.routes.length], [[], WILDCARDS.length + 1], "the foreign route is untouched");
    const down = world({ routes: { ...fakeRoutes(), client: { list: async () => { throw new RouteError("route_api", `Cloudflare routes API: GET got no answer (Bearer ${CF_TOKEN})`); }, create: async () => { throw new Error("must not be called"); } } } });
    assertFailed(down, await down.run(), "route", "route_api", ["built", "announced"], "G10 route_api");
  });
  await check("G11 failed at `route`: the bucket already holds a routing pointer for the hostname to ANOTHER site (or one that cannot be read) — no route is created, so that site never goes public on it; the pointer is byte-identical", async () => {
    const foreign = enc(`${JSON.stringify({ schemaVersion: 1, hostname: HOST, siteId: "boost-interior-demo-02", packageHash: "a".repeat(64), buildInputId: "b".repeat(64), releaseId: "interior-02-0.0.0-prior", publishedAt: "2026-10-01T00:00:00.000Z" }, null, 2)}\n`);
    for (const [body, code] of [[foreign, "host_serves_other_site"], [enc("not json"), "host_pointer_unreadable"], [enc({ siteId: SITE }), "host_pointer_unreadable"]] as const) {
      const store = new MemoryStore();
      store.objects.set(ROUTING, { body, meta: JSON_META });
      const w = world({ store });
      const r = await w.run();
      assert(!r.ok && r.stage === "route" && r.code === code, `G11 ${code}: ${JSON.stringify(r)}`);
      eq([w.events.map((e) => e.type), w.attempts.filter((t) => t === "failed").length], [["built", "announced", "failed"], 1], `G11 ${code}: events`);
      eq([w.routes.lists(), w.routes.created, sha256(store.objects.get(ROUTING)!.body), store.writes.includes(ROUTING)], [0, [], sha256(body), false], `G11 ${code}: no route, the pointer is untouched`);
      assertNoSecret(w, r, `G11 ${code}`);
    }
  });
  await check("G12 failed at `activate` · overlay_timeout: BoostChat never publishes the first revision — the route exists, the pointer does NOT; the same job later (BoostChat has published) completes without a second route", async () => {
    const w = world({ publishOnSleep: 0 });
    const r = await w.run();
    assertFailed(w, r, "activate", "overlay_timeout", ["built", "announced", "route_ready"], "G12");
    eq(w.routes.created.length, 1, "the route was created");
    const later = world({ store: w.store, routes: w.routes, publishOnSleep: 1 });
    const again = await later.run();
    assert(again.ok, `the retry: ${JSON.stringify(again)}`);
    eq([again.route.created, again.pointerWrite, w.routes.created.length], [false, "written", 1], "the retry");
    // BoostChat says "already published" but the store does not show it → store_behind, still at activate, still no pointer
    const behind = world({ announce: (n) => ({ ok: true, siteId: SITE, packageHash: HASH, state: n === 1 ? "queued" : "already_published", publishMode: "v2", searchSource: "canonical", desiredRevision: 1, liveRevision: 1 }), publishOnSleep: 0 });
    assertFailed(behind, await behind.run(), "activate", "store_behind", ["built", "announced", "route_ready"], "G12 store_behind");
  });
  await check("G13 an overlay that is in the store but that recon-runtime would refuse (a manifest for another package) is not `ready`: the wait runs out, no pointer", async () => {
    const store = new MemoryStore();
    const w = world({ store, publishOnSleep: 0 });
    const manifest = enc({ schema: "portfolio-manifest@1", siteId: SITE, revision: 1, shell: { packageHash: "f".repeat(64), releaseId: fixture.template.releaseId }, owned: { exact: ["/"], prefixes: ["/portfolio"] }, routes: {}, assets: {}, projects: {} });
    const manifestKey = `revisions/1/${sha256(manifest).slice(0, 16)}.json`;
    store.objects.set(portfolioPublicKey(SITE, manifestKey), { body: manifest, meta: JSON_META });
    store.objects.set(CURRENT, { body: enc({ schema: "portfolio-current@1", siteId: SITE, shellPackageHash: HASH, revision: 1, manifestKey, manifestSha256: sha256(manifest), publishedAt: T0().toISOString() }), meta: JSON_META });
    const r = await w.run();
    assert(!r.ok && r.stage === "activate", `result: ${JSON.stringify(r)}`);
    eq([w.attempts.filter((t) => t === "failed").length, store.objects.has(ROUTING)], [1, false], "one failed event, no pointer");
  });
  await check("G14 a STALE run (BoostChat answers 409 to an event: another attempt owns the job) stops where it is — after `built` refused nothing is uploaded; after `route_ready` refused the hostname is not switched", async () => {
    const refused = (at: RunnerEventType) => (type: RunnerEventType) => (type === at || type === "failed" ? new ProvisioningApiError("event_refused", "event answered HTTP 409 stale_attempt", 409) : undefined);
    const early = world({ refuseEvent: refused("built") });
    const r1 = await early.run();
    eq([!r1.ok && r1.stage, !r1.ok && r1.code, !r1.ok && r1.stage !== "claim" && r1.failedEventSent], ["build", "event_refused", false], "refused at built");
    eq([early.store.writes, early.announces, early.routes.lists(), early.attempts], [[], 0, 0, ["built", "failed"]], "nothing after the refusal; one failed attempt");
    const late = world({ refuseEvent: refused("route_ready") });
    const r2 = await late.run();
    eq([!r2.ok && r2.stage, !r2.ok && r2.code], ["route", "event_refused"], "refused at route_ready");
    eq([late.store.objects.has(ROUTING), late.announces, late.attempts.filter((t) => t === "failed").length], [false, 1, 1], "no pointer, no second announce");
    const flaky = world({ refuseEvent: (type) => (type === "announced" ? new ProvisioningApiError("network", "event got no answer") : undefined) });
    const r3 = await flaky.run();
    assertFailed(flaky, r3, "announce", "event_undelivered", ["built"], "G14 an event that could not be delivered");
  });
  await check("G15 the `activated` event is not accepted AFTER the switch: the failed event says the truth — the pointer was written and the hostname is public", async () => {
    const w = world({ refuseEvent: (type) => (type === "activated" ? new ProvisioningApiError("network", "event got no answer") : undefined) });
    const r = await w.run();
    eq([!r.ok && r.stage, !r.ok && r.code, w.store.objects.has(ROUTING)], ["activate", "event_undelivered", true], "result");
    eq([w.events.map((e) => e.type), w.attempts.filter((t) => t === "failed").length], [["built", "announced", "route_ready", "failed"], 1], "events");
    assert(/routing pointer was written/.test(w.events.at(-1)!.data.message) && w.events.at(-1)!.data.message.includes(HOST), `message: ${w.events.at(-1)!.data.message}`);
    assertNoSecret(w, r, "G15");
  });
  await check("G16 the whole job once more over the REAL BoostChat client (fake fetch): every event body carries the claim's attempt and event token, and the token is in no log line", async () => {
    const timeline: string[] = [];
    const b = fakeBoostChat({ timeline });
    const w = world();
    const r = await w.run({ boostchat: b.client });
    assert(r.ok, `not ok: ${JSON.stringify(r)} | ${w.logs.slice(-3).join(" | ")}`);
    eq(b.events.map((e) => e.type), ["built", "announced", "route_ready", "activated"], "events");
    const eventRequests = b.requests.filter((q) => q.pathname === eventsPath(JOB));
    assert(eventRequests.every((q) => q.body.attempt === 2 && q.body.eventToken === EVENT_TOKEN && q.authorization === `Bearer ${PUBLISHER_TOKEN}` && JSON.stringify(Object.keys(q.body)) === JSON.stringify(["attempt", "eventToken", "type", "data"])), "event bodies");
    assert(!JSON.stringify(b.events).includes(EVENT_TOKEN), "the event token is inside an event's data");
    for (const secret of SECRETS) assert(!w.logs.some((l) => l.includes(secret)) && !JSON.stringify(r).includes(secret), "a secret is in a log line or the result");
    assert(w.logs.some((l) => l.includes(`claimed job ${JOB} attempt 2`)), "the claim is logged");
  });

  // ══ H. runner files ═══════════════════════════════════════════════════════════════════════════
  console.log("H. runner files");
  await check("H1 the workflow keeps its rules: workflow_dispatch(job_id, source_ref required, smoke); the checked-out commit is proven to be on the trusted branch before anything of it runs; contents: read only; concurrency per job without cancelling; 25 minutes; no ${{ }} inside any run script; every action pinned to a commit; secrets on the one real step", async () => {
    const yml = await readFile(path.join(repoRoot, ".github/workflows/provision-site.yml"), "utf8");
    const lines = yml.split("\n");
    assert(/^on:\n  workflow_dispatch:\n    inputs:\n      job_id:\n(?:        .*\n)*?        type: string\n        required: false\n      source_ref:\n(?:        .*\n)*?        type: string\n        required: true\n      smoke:\n(?:        .*\n)*?        type: boolean\n        default: false\n/m.test(yml), "inputs");
    assert(/^permissions:\n  contents: read\n\n/m.test(yml) && !/:\s*write\b/.test(yml) && (yml.match(/^\s*permissions:/gm) ?? []).length === 1, "permissions");
    assert(yml.includes("concurrency:\n  group: provision-${{ inputs.job_id || 'smoke' }}\n  cancel-in-progress: false\n"), "concurrency");
    assert(/runs-on: ubuntu-latest\n    timeout-minutes: 25\n/.test(yml) && (yml.match(/^  [a-z-]+:\n    runs-on:/gm) ?? []).length === 1, "one job, ubuntu-latest, 25 minutes");
    assert(/ref: \$\{\{ inputs\.source_ref \}\}\n          fetch-depth: 1\n/.test(yml), "checkout");
    // the commit is proven to be on the trusted branch BEFORE anything from the checkout runs, for every run (smoke too)
    const stepNames = [...yml.matchAll(/^      - name: (.+)$/gm)].map((m) => m[1]!);
    eq(stepNames[0], "Check out the runner", "the first step");
    eq(stepNames[1], "Refuse a commit that is not on the trusted branch", "the second step — before node, pnpm, the cache and every script of the checkout");
    const guard = yml.slice(yml.indexOf("      - name: Refuse a commit that is not on the trusted branch"), yml.indexOf("      - name: Set up Node 22"));
    assert(!/^\s*if:/m.test(guard), "the guard has no condition: it runs for smoke runs too");
    assert(guard.includes("SOURCE_REF: ${{ inputs.source_ref }}") && guard.includes("GH_TOKEN: ${{ github.token }}") && /TRUSTED_BRANCH: [a-z0-9][a-z0-9._\/-]*\n/.test(guard), "the guard's inputs come through env");
    assert(guard.includes("grep -Eq '^[0-9a-f]{40}$'") && guard.includes('[ "$SOURCE_REF" != "$head" ]'), "source_ref must be the full SHA that was checked out");
    assert(guard.includes('compare/$TRUSTED_BRANCH...$head') && /identical\|behind\) echo/.test(guard) && /\*\) echo "refused:[^\n]*exit 1/.test(guard), "only the head or an ancestor of the trusted branch passes; everything else exits 1");
    // run scripts: single-line and block form
    const scripts: string[] = [];
    for (let i = 0; i < lines.length; i++) {
      const m = /^(\s*)run:\s*(.*)$/.exec(lines[i]!);
      if (!m) continue;
      if (m[2] !== "|" && m[2] !== ">") {
        scripts.push(m[2]!);
        continue;
      }
      const block: string[] = [];
      for (let j = i + 1; j < lines.length && (lines[j]!.trim() === "" || lines[j]!.startsWith(`${m[1]}  `)); j++) block.push(lines[j]!);
      scripts.push(block.join("\n"));
    }
    assert(scripts.length >= 5, `run scripts found: ${scripts.length}`);
    for (const s of scripts) assert(!s.includes("${{"), `an expression inside a run script: ${s}`);
    const uses = lines.filter((l) => /^\s*uses:/.test(l));
    assert(uses.length >= 3 && uses.every((l) => /^\s*uses: [\w.-]+\/[\w.-]+@[0-9a-f]{40} # v\d+\.\d+\.\d+$/.test(l)), `actions not pinned to a commit: ${uses.join(" | ")}`);
    // steps
    const steps = yml.slice(yml.indexOf("    steps:\n")).split(/\n(?=      - name: )/).slice(1);
    const withSecrets = steps.filter((s) => s.includes("secrets."));
    eq(withSecrets.length, 1, "steps that map a secret");
    const real = withSecrets[0]!;
    assert(/if: \$\{\{ !inputs\.smoke \}\}/.test(real) && /PROVISION_JOB_ID: \$\{\{ inputs\.job_id \}\}/.test(real) && real.trimEnd().endsWith("platform/cli/site-provision.ts"), "the real step");
    for (const name of ["BOOSTCHAT_PUBLISHER_TOKEN", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_ZONE_ID"]) assert(real.includes(`${name}: \${{ secrets.${name} }}`), `${name} is not mapped from a secret`);
    assert(real.includes('RECON_PUBLISH_ALLOW_REMOTE: "1"') && real.includes("BOOSTCHAT_BASE_URL: ${{ vars.BOOSTCHAT_BASE_URL }}"), "the constants of the real step");
    const smoke = steps.find((s) => s.includes("--build-only"));
    assert(smoke && /if: \$\{\{ inputs\.smoke \}\}/.test(smoke) && !/\benv:/.test(smoke) && smoke.includes(`--spec-file ${FIXTURE}`), "the smoke step (no env, the fixture)");
    eq((yml.match(/inputs\.job_id/g) ?? []).length, 2, "inputs.job_id appears in the concurrency group and in one env mapping only");
    eq((yml.match(/inputs\.source_ref/g) ?? []).length, 2, "inputs.source_ref appears in the checkout and in the guard's env mapping only");
    assert(yml.includes("pnpm install --frozen-lockfile") && yml.includes("platform/provision/prime-store.ts") && !/pnpm\/action-setup/.test(yml.replace(/^\s*#.*$/gm, "")), "install + store priming, no pnpm/action-setup");
  });
  const tsx = path.join(repoRoot, "node_modules/.bin/tsx");
  const cli = (file: string, args: string[], env: Record<string, string>) => {
    const r = spawnSync(tsx, ["--tsconfig", "platform/tsconfig.json", file, ...args], { cwd: repoRoot, encoding: "utf8", env: { PATH: process.env.PATH ?? "", HOME: os.homedir(), ...env } as unknown as NodeJS.ProcessEnv, timeout: 60_000 });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  await check("H2 the runner CLI refuses before doing anything: no variables → exit 2 naming them; an unusable job id / base URL → exit 2, nothing claimed, no token printed; no flag but the two smoke flags", () => {
    const none = cli("platform/cli/site-provision.ts", [], {});
    assert(none.status === 2 && ["PROVISION_JOB_ID", "BOOSTCHAT_BASE_URL", "BOOSTCHAT_PUBLISHER_TOKEN", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT"].every((n) => none.out.includes(n)), `no variables: ${none.status} ${none.out}`);
    const full = { PROVISION_JOB_ID: JOB, BOOSTCHAT_BASE_URL: "https://boostchat.test.example", BOOSTCHAT_PUBLISHER_TOKEN: PUBLISHER_TOKEN, GITHUB_RUN_ID: "1", GITHUB_RUN_ATTEMPT: "1", CLOUDFLARE_API_TOKEN: CF_TOKEN };
    for (const [over, label] of [[{ PROVISION_JOB_ID: "$(id)" }, "job id"], [{ BOOSTCHAT_BASE_URL: "http://boostchat.test.example" }, "plain http"], [{ BOOSTCHAT_BASE_URL: `https://u:${PUBLISHER_TOKEN}@boostchat.test.example` }, "credentials in the URL"], [{ GITHUB_RUN_ATTEMPT: "0" }, "run attempt"]] as const) {
      const r = cli("platform/cli/site-provision.ts", [], { ...full, ...over });
      assert(r.status === 2 && /nothing was claimed/.test(r.out), `${label}: ${r.status} ${r.out}`);
      assert(!SECRETS.some((s) => r.out.includes(s)), `${label}: a token is printed: ${r.out}`);
    }
    for (const args of [["--spec-file", FIXTURE], ["--build-only"], ["--build-only", "--spec-file", FIXTURE, "--remote"], ["--job", JOB], ["--build-only", "--spec-file", "does/not/exist.json"]]) {
      const r = cli("platform/cli/site-provision.ts", args, full);
      eq(r.status, 2, `flags ${args.join(" ")}: ${r.out}`);
    }
  });
  await check("H3 the deploy CLI refuses without the live route list: no token / no zone → exit 2 and nothing is deployed (also with --dry-run); any other argument → exit 2", () => {
    for (const [args, env] of [[["--dry-run"], {}], [["--dry-run"], { CLOUDFLARE_API_TOKEN: CF_TOKEN }], [["--dry-run"], { CLOUDFLARE_API_TOKEN: CF_TOKEN, CLOUDFLARE_ZONE_ID: "not-a-zone" }], [["--dry-run", "--env", "production"], {}], [["--force"], {}]] as const) {
      const r = cli("platform/cli/runtime-deploy.ts", [...args], env);
      assert(r.status === 2 && !r.out.includes(CF_TOKEN) && !/deployed recon/.test(r.out), `${args.join(" ")} ${Object.keys(env).join(",")}: ${r.status} ${r.out}`);
    }
  });

  console.log(`\nresults ${JSON.stringify(results)}`);
} finally {
  for (const root of tmpRoots) await rm(root, { recursive: true, force: true });
}

console.log(`\n${passed}/${passed + failed.length} checks passed`);
if (failed.length > 0) {
  console.log(`FAILED:\n  ${failed.join("\n  ")}`);
  process.exit(1);
}
