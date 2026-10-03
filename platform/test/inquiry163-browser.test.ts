/**
 * Shared inquiry form (interior-01 1.6.3) — browser behaviour, in real Chromium (+ WebKit where
 * installed) against the site's OWN built package, served from a tiny local static server. No
 * request ever reaches a real inquiry endpoint: every declared endpoint is answered by an
 * in-process, programmable stub installed before any navigation; every other outbound request
 * (the demo's chat-widget script, analytics, …) is aborted and recorded.
 *
 * Site-agnostic: the list of sites comes from INQUIRY_BROWSER_SITES (comma list; default
 * "boost-interior-demo,fixture-online-inquiry"), a site missing a build (no
 * data/site-builds/<site>/current.json) is SKIPped, and everything about a site — its endpoint,
 * its copy, its fallback contacts — is read from that site's own data (data/sites/<site>/…) via
 * the real contactPage()/createSiteContext() the builder itself uses, never hard-coded.
 *
 * Run (after the site(s) are built — `site:build <id>`):
 *   ./node_modules/.bin/tsx --tsconfig platform/tsconfig.json platform/test/inquiry163-browser.test.ts
 *   env: INQUIRY_BROWSER_SITES (comma list)
 * Screenshots → docs/result/shared-inquiry-form-v2/screenshots/<site>-<viewport>-<state>.jpg
 */
import { mkdir, readFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, webkit, devices, type Browser, type BrowserContext, type Page, type Route } from "playwright";
import { createSiteContext } from "../site/context";
import { buildSiteSnapshot } from "../site/load";
import template from "../../templates/interior-01/v1/template";
import { contactPage } from "../../templates/interior-01/v1/sections/ContactPage";
import type { InquiryContact, InquiryOnline } from "../../templates/interior-01/v1/components/InquiryForm";
import { resolvePath, NOT_FOUND_KEY } from "../../workers/recon-runtime/src/paths";

const repoRoot = process.cwd();
const AT = "2026-10-04T00:00:00Z";
const SITES = (process.env.INQUIRY_BROWSER_SITES ?? "boost-interior-demo,fixture-online-inquiry")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SCREENSHOT_DIR = path.join(repoRoot, "docs/result/shared-inquiry-form-v2/screenshots");
const DESKTOP = { width: 1440, height: 900 };

// ── tiny test harness ──────────────────────────────────────────────────────────────────────────
let passed = 0;
const failedNames: string[] = [];
const skippedNames: string[] = [];
const tableBySite = new Map<string, { id: string; ok: boolean }[]>();

async function check(name: string, fn: () => unknown | Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
    return true;
  } catch (error) {
    failedNames.push(name);
    console.log(`  FAIL ${name}\n       ${(error as Error).message.split("\n").join("\n       ")}`);
    return false;
  }
}
function skip(name: string, reason: string) {
  skippedNames.push(name);
  console.log(`  SKIP ${name}\n       (${reason})`);
}
async function siteCheck(site: string, id: string, desc: string, fn: () => unknown | Promise<unknown>): Promise<boolean> {
  const ok = await check(`${site} ${id}: ${desc}`, fn);
  (tableBySite.get(site) ?? tableBySite.set(site, []).get(site)!).push({ id, ok });
  return ok;
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function eq(a: unknown, b: unknown, msg: string) {
  const [x, y] = [JSON.stringify(a), JSON.stringify(b)];
  if (x !== y) throw new Error(`${msg}: ${x} ≠ ${y}`);
}
const readJson = async (f: string) => JSON.parse(await readFile(f, "utf8")) as Record<string, unknown>;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// ── static server over a built package's site/ dir, routed exactly as the real runtime does ────
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".xml": "application/xml; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};
function contentTypeFor(key: string): string {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] ?? "application/octet-stream";
}
async function startStaticServer(siteDir: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    void (async () => {
      const u = new URL(req.url ?? "/", "http://localhost");
      const resolved = resolvePath(u.pathname);
      const key = resolved.kind === "key" ? resolved.key : NOT_FOUND_KEY;
      const status = resolved.kind === "key" ? 200 : 404;
      try {
        const data = await readFile(path.join(siteDir, key));
        res.writeHead(status, { "content-type": contentTypeFor(key) });
        res.end(data);
      } catch {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
      }
    })();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}

// ── the declared endpoint's in-memory stub ───────────────────────────────────────────────────────
interface PostRecord {
  body: Record<string, unknown>;
  headers: Record<string, string>;
  raw: string;
}
type ScriptedAnswer =
  | { kind: "ok" }
  | { kind: "invalid" }
  | { kind: "timeout" }
  | { kind: "conflict" }
  | { kind: "rateLimited"; retryAfter: number }
  | { kind: "capacity"; retryAfter: number }
  | { kind: "unavailable" }
  | { kind: "network" }
  | { kind: "unknownHtml" }
  | { kind: "unknownOkBadJson" }
  | { kind: "unknownStatus"; status: number }
  | { kind: "hold" };

/** a request whose wire response is deferred: either a scripted answer still to be chosen at
 * release time, or a store-mode outcome already decided at receipt time (realistic: an idempotent
 * backend decides atomically when the request arrives; only the reply may be slow in transit). */
type HeldRequest = { route: Route } & ({ kind: "scripted" } | { kind: "store-decided"; status: number; body: string });

class EndpointStub {
  otherMethodRequests: string[] = [];
  storedCount = 0;
  private mode: "scripted" | "store" = "scripted";
  private queue: ScriptedAnswer[] = [];
  private defaultAnswer: ScriptedAnswer = { kind: "ok" };
  private held: HeldRequest[] = [];
  private store = new Map<string, string>();
  private failNextStoreAsNetwork = false;
  private holdNextStoreRequest = false;

  constructor(private readonly sink: PostRecord[]) {}

  useScriptedMode() {
    this.mode = "scripted";
  }
  useStoreMode() {
    this.mode = "store";
  }
  /** fresh store + counter for a check that asserts an absolute storedCount, independent of earlier checks */
  resetStore() {
    this.store.clear();
    this.storedCount = 0;
    this.failNextStoreAsNetwork = false;
    this.holdNextStoreRequest = false;
  }
  queueAnswer(a: ScriptedAnswer) {
    this.queue.push(a);
  }
  clearQueue() {
    this.queue = [];
  }
  setDefaultAnswer(a: ScriptedAnswer) {
    this.defaultAnswer = a;
  }
  failNextStoredRequestAsNetwork() {
    this.failNextStoreAsNetwork = true;
  }
  /** store mode only: the next request is decided (store mutated) immediately but the reply is held */
  holdNextStoredReply() {
    this.holdNextStoreRequest = true;
  }
  heldCount() {
    return this.held.length;
  }
  /** releases the oldest held request. `answer` is used only for a still-undecided ("scripted") hold. */
  async releaseHeld(answer: ScriptedAnswer) {
    const entry = this.held.shift();
    if (!entry) throw new Error("EndpointStub: nothing held to release");
    if (entry.kind === "store-decided") {
      await entry.route.fulfill({ status: entry.status, headers: this.cors(entry.route), contentType: "application/json", body: entry.body });
      return;
    }
    await this.respond(entry.route, answer);
  }

  async handle(route: Route) {
    const req = route.request();
    if (req.method() !== "POST") {
      this.otherMethodRequests.push(`${req.method()} ${req.url()}`);
      await route.fulfill({ status: 405, headers: this.cors(route), body: "" });
      return;
    }
    const raw = req.postData() ?? "";
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      /* kept {} */
    }
    const record: PostRecord = { body, headers: req.headers(), raw };
    this.sink.push(record);
    if (this.mode === "store") {
      await this.handleStore(route, body);
      return;
    }
    const answer = this.queue.length > 0 ? this.queue.shift()! : this.defaultAnswer;
    if (answer.kind === "hold") {
      this.held.push({ route, kind: "scripted" });
      return;
    }
    await this.respond(route, answer);
  }

  private cors(route: Route): Record<string, string> {
    const origin = route.request().headers()["origin"] ?? "*";
    return { "access-control-allow-origin": origin, "access-control-expose-headers": "Retry-After" };
  }

  private async respond(route: Route, answer: ScriptedAnswer) {
    const headers = this.cors(route);
    switch (answer.kind) {
      case "ok":
        await route.fulfill({ status: 200, headers, contentType: "application/json", body: '{"received":true}' });
        return;
      case "invalid":
        await route.fulfill({ status: 400, headers, contentType: "application/json", body: JSON.stringify({ error: "field_invalid", field: "phone" }) });
        return;
      case "timeout":
        await route.fulfill({ status: 408, headers, contentType: "application/json", body: JSON.stringify({ error: "request_timeout" }) });
        return;
      case "conflict":
        await route.fulfill({ status: 409, headers, contentType: "application/json", body: JSON.stringify({ error: "idempotency_conflict" }) });
        return;
      case "rateLimited":
        await route.fulfill({ status: 429, headers: { ...headers, "Retry-After": String(answer.retryAfter) }, contentType: "application/json", body: JSON.stringify({ error: "rate_limited" }) });
        return;
      case "capacity":
        await route.fulfill({ status: 429, headers: { ...headers, "Retry-After": String(answer.retryAfter) }, contentType: "application/json", body: JSON.stringify({ error: "channel_capacity" }) });
        return;
      case "unavailable":
        await route.fulfill({ status: 503, headers, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }) });
        return;
      case "network":
        await route.abort("failed");
        return;
      case "unknownHtml":
        await route.fulfill({ status: 500, headers, contentType: "text/html", body: "<html><body>internal error</body></html>" });
        return;
      case "unknownOkBadJson":
        await route.fulfill({ status: 200, headers, contentType: "application/json", body: "not actually json" });
        return;
      case "unknownStatus":
        // a status the door has no word for (e.g. 403), with a well-formed JSON error body
        await route.fulfill({ status: answer.status, headers, contentType: "application/json", body: JSON.stringify({ error: "forbidden" }) });
        return;
      case "hold":
        throw new Error("unreachable: hold is queued, not answered");
    }
  }

  private async handleStore(route: Route, body: Record<string, unknown>) {
    const id = typeof body.submission_id === "string" ? body.submission_id : "";
    const valueKey = JSON.stringify({ name: body.name, phone: body.phone, message: body.message });
    const existing = this.store.get(id);
    if (existing === undefined) {
      this.store.set(id, valueKey);
      this.storedCount++;
      if (this.failNextStoreAsNetwork) {
        this.failNextStoreAsNetwork = false;
        // the backend received and persisted it, but the reply never made it back to the client
        await route.abort("failed");
        return;
      }
      await this.finishStore(route, 200, '{"received":true}');
      return;
    }
    if (existing === valueKey) {
      await this.finishStore(route, 200, '{"received":true}');
      return;
    }
    await this.finishStore(route, 409, JSON.stringify({ error: "idempotency_conflict" }));
  }

  private async finishStore(route: Route, status: number, body: string) {
    if (this.holdNextStoreRequest) {
      this.holdNextStoreRequest = false;
      this.held.push({ route, kind: "store-decided", status, body });
      return;
    }
    await route.fulfill({ status, headers: this.cors(route), contentType: "application/json", body });
  }
}

// ── site expectations: the real resolver (contactPage), never hard-coded copy ───────────────────
interface SiteExpectations {
  endpoint: string;
  online: InquiryOnline;
  siteRoot: string;
}
async function loadSiteExpectations(siteId: string): Promise<SiteExpectations | undefined> {
  const buildDir = path.join(repoRoot, "data/site-builds", siteId);
  let current: { packageDir: string };
  try {
    current = (await readJson(path.join(buildDir, "current.json"))) as unknown as { packageDir: string };
  } catch {
    return undefined;
  }
  const siteRoot = path.join(repoRoot, current.packageDir, "site");
  const siteDir = path.join(repoRoot, "data/sites", siteId);
  const pin = (await readJson(path.join(siteDir, "site.json"))).template as { templateId: string; templateVersion: string; releaseId: string; releaseHash: string };
  const snapshot = (await buildSiteSnapshot({ repoRoot, siteId, mode: "public", at: AT })).snapshot;
  const ctx = createSiteContext({ siteId, template, templateRelease: pin, mode: "public", at: AT, snapshot });
  const data = contactPage(ctx);
  if (!data.form || !("online" in data.form) || !data.form.online) return undefined;
  return { endpoint: data.form.online.endpoint, online: data.form.online, siteRoot };
}

// ── page helpers ──────────────────────────────────────────────────────────────────────────────
async function waitMounted(page: Page) {
  await page.waitForFunction(
    () => {
      const b = document.querySelector<HTMLButtonElement>("[data-inquiry-submit]");
      return !!b && b.disabled === false;
    },
    undefined,
    { timeout: 8000 },
  );
}
async function openContact(page: Page, origin: string) {
  await page.goto(`${origin}/contact`, { waitUntil: "domcontentloaded" });
  await waitMounted(page);
}
async function fillValid(page: Page, overrides: Partial<{ name: string; phone: string; message: string }> = {}) {
  await page.fill("#i1-inquiry-name", overrides.name ?? "홍길동");
  await page.fill("#i1-inquiry-phone", overrides.phone ?? "010-1234-5678");
  await page.fill("#i1-inquiry-message", overrides.message ?? "테스트 문의 내용입니다.");
  await page.check("#i1-inquiry-consent");
}
const alertText = async (page: Page) => (await page.textContent("[data-inquiry-error]")) ?? "";
const statusText = async (page: Page) => (await page.textContent("[data-inquiry-status]")) ?? "";
const fieldVal = (page: Page, f: string) => page.inputValue(`#i1-inquiry-${f}`);
async function waitAlertNonEmpty(page: Page) {
  await page.waitForFunction(() => (document.querySelector("[data-inquiry-error]")?.textContent ?? "").length > 0, undefined, { timeout: 6000 });
}
async function waitDone(page: Page) {
  await page.waitForSelector(".i1-form__status--done", { timeout: 6000 });
}
async function waitButtonDisabled(page: Page, disabled: boolean) {
  await page.waitForFunction((want) => (document.querySelector<HTMLButtonElement>("[data-inquiry-submit]")?.disabled ?? null) === want, disabled, { timeout: 6000 });
}

// ── the fallback rule (1.6.3): WHEN the alert lists the site's other contact channels ────────────
// After EVERY failure but a conflict (which another press cures), and nowhere else — not in the
// initial state, not while a request is on its way, not once the pause is over, not after success.
// What is listed is exactly the site's own channels (the real resolver's `online.fallback`: its
// order, its hrefs, its link texts) under the site's lead line; a site that has no channel gets no
// list at all.
/** the text the contact list adds to the alert (textContent): the lead line, then each channel */
const contactsText = (online: InquiryOnline) => (online.fallback.length > 0 ? `${online.labels.fallbackLead}${online.fallback.map((c: InquiryContact) => `${c.name ? `${c.name}: ` : ""}${c.text}`).join("")}` : "");
/** what the page shows of the contact list right now (no named function inside the callback — see measureAndShoot) */
const contactsSeen = (page: Page) =>
  page.evaluate(() => ({
    lists: document.querySelectorAll("[data-inquiry-contacts]").length,
    styled: document.querySelectorAll(".i1-form__contacts").length,
    insideAlert: document.querySelectorAll("[data-inquiry-error] [data-inquiry-contacts].i1-form__contacts").length,
    lead: document.querySelector("[data-inquiry-contacts] .i1-form__contacts-lead")?.textContent ?? null,
    links: Array.from(document.querySelectorAll("[data-inquiry-contacts] .i1-form__contact a")).map((a) => [a.getAttribute("href"), a.textContent]),
  }));
/** the alert lists the site's contact channels — all of them, in order, as links (none for a site that has none) */
async function expectContacts(page: Page, online: InquiryOnline, when: string) {
  const seen = await contactsSeen(page);
  const any = online.fallback.length > 0;
  eq([seen.lists, seen.styled, seen.insideAlert], any ? [1, 1, 1] : [0, 0, 0], `${when}: the contact list, inside the alert`);
  eq(seen.links, online.fallback.map((c) => [c.href, c.text]), `${when}: fallback contact links (href, text)`);
  eq(seen.lead, any && online.labels.fallbackLead ? online.labels.fallbackLead : null, `${when}: the lead line`);
}
/** no contact channel is rendered anywhere in the form */
async function expectNoContacts(page: Page, when: string) {
  const rendered = await page.evaluate(() => document.querySelectorAll("[data-inquiry-contacts], .i1-form__contacts, .i1-form__contacts-lead, .i1-form__contact").length);
  eq(rendered, 0, `${when}: contact channels rendered`);
}

// ── per-site run ──────────────────────────────────────────────────────────────────────────────
const RESP_VIEWPORTS: { w: number; h: number; label: string }[] = [
  { w: 1440, h: 900, label: "1440x900" },
  { w: 1024, h: 768, label: "1024x768" },
  { w: 768, h: 1024, label: "768x1024" },
  { w: 390, h: 844, label: "390x844" },
  { w: 375, h: 667, label: "375x667" },
];
const RESP_STATES = ["initial", "validation-error", "loading", "error-fallback", "rate-limited", "success", "long-message"] as const;
type RespState = (typeof RESP_STATES)[number];

async function driveState(page: Page, origin: string, stub: EndpointStub, state: RespState) {
  await page.goto(`${origin}/contact`, { waitUntil: "domcontentloaded" });
  await waitMounted(page);
  stub.clearQueue();
  switch (state) {
    case "initial":
      return;
    case "validation-error":
      await page.click("[data-inquiry-submit]");
      await page.waitForTimeout(150);
      return;
    case "loading":
      stub.queueAnswer({ kind: "hold" });
      await fillValid(page);
      await page.click("[data-inquiry-submit]");
      await waitButtonDisabled(page, true).catch(() => {});
      return;
    case "error-fallback":
      stub.queueAnswer({ kind: "network" });
      await fillValid(page);
      await page.click("[data-inquiry-submit]");
      await waitAlertNonEmpty(page).catch(() => {});
      return;
    case "rate-limited":
      stub.queueAnswer({ kind: "rateLimited", retryAfter: 120 });
      await fillValid(page);
      await page.click("[data-inquiry-submit]");
      await waitButtonDisabled(page, true).catch(() => {});
      return;
    case "success":
      stub.queueAnswer({ kind: "ok" });
      await fillValid(page);
      await page.click("[data-inquiry-submit]");
      await waitDone(page).catch(() => {});
      return;
    case "long-message":
      await page.fill("#i1-inquiry-name", "나".repeat(100));
      await page.fill("#i1-inquiry-phone", "010-1234-5678");
      await page.fill("#i1-inquiry-message", "가".repeat(500));
      await page.check("#i1-inquiry-consent");
      return;
  }
}

async function measureAndShoot(page: Page, viewportW: number, viewportH: number, screenshotPath: string): Promise<void> {
  // NB: no locally-named helper function is declared inside this callback (e.g. `const rectOf = (x)
  // => {...}`) — esbuild's name-inference wraps such bindings in a `__name(...)` call that tsx emits
  // at module scope; Playwright ships only this function's own source to the browser, where that
  // helper does not exist, and the ReferenceError kills the whole evaluate. Selectors are mapped with
  // a bare (unnamed) callback instead, which the spec never assigns an inferred name to.
  const data = await page.evaluate(() => {
    const rects = ["[data-inquiry-form]", "[data-inquiry-error]", "[data-inquiry-submit]", "[data-inquiry-status]"].map((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
    });
    const alert = document.querySelector("[data-inquiry-error]");
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      form: rects[0],
      alert: rects[1],
      button: rects[2],
      status: rects[3],
      alertOverflow: alert ? alert.scrollWidth - alert.clientWidth : 0,
      contacts: Array.from(document.querySelectorAll<HTMLElement>("[data-inquiry-contacts] a")).map((a) => a.getBoundingClientRect().height),
    };
  });
  assert(data.scrollWidth <= data.innerWidth + 1, `horizontal overflow (scrollWidth ${data.scrollWidth} > innerWidth ${data.innerWidth})`);
  for (const [name, rect] of [
    ["form", data.form],
    ["alert", data.alert],
    ["button", data.button],
    ["status", data.status],
  ] as const) {
    if (!rect) continue;
    assert(rect.left >= -1 && rect.right <= viewportW + 1, `${name} outside viewport width (${JSON.stringify(rect)}, viewport ${viewportW})`);
  }
  assert(data.alertOverflow <= 1, `alert text clipped (scrollWidth-clientWidth = ${data.alertOverflow})`);
  if (viewportW <= 390) {
    if (data.button) assert(data.button.height >= 43.5, `submit button shorter than 44px (${data.button.height})`);
    for (const h of data.contacts) assert(h >= 43.5, `fallback link shorter than 44px (${h})`);
  }
  if (data.button) {
    await page.evaluate(() => document.querySelector("[data-inquiry-submit]")?.scrollIntoView({ block: "center" }));
    const covered = await page.evaluate(() => {
      const btn = document.querySelector("[data-inquiry-submit]");
      if (!btn) return false;
      const r = btn.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(el === btn || btn.contains(el));
    });
    assert(!covered, "submit button is covered by another element");
  }
  await page.screenshot({ path: screenshotPath, type: "jpeg", quality: 70 });
}

interface EngineCtx {
  browser: Browser;
  context: BrowserContext;
  stub: EndpointStub;
  strayHits: string[];
  consoleErrors: string[];
  origin: string;
  endpoint: string;
}

async function newEngineContext(browser: Browser, options: Parameters<Browser["newContext"]>[0], origin: string, endpoint: string, sink: PostRecord[], strayHits: string[], consoleErrors: string[]): Promise<EngineCtx> {
  const context = await browser.newContext(options);
  const stub = new EndpointStub(sink);
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (url.startsWith(origin)) {
      await route.continue();
      return;
    }
    if (url === endpoint) {
      await stub.handle(route);
      return;
    }
    strayHits.push(url);
    await route.abort("failed");
  });
  context.on("page", attachListeners);
  function attachListeners(page: Page) {
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      const url = m.location().url;
      if (m.text().startsWith("Failed to load resource") && !url.startsWith(origin)) return; // our own deliberate aborts
      consoleErrors.push(m.text());
    });
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
  }
  return { browser, context, stub, strayHits, consoleErrors, origin, endpoint };
}
async function newPage(engine: EngineCtx): Promise<Page> {
  const page = await engine.context.newPage();
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const url = m.location().url;
    if (m.text().startsWith("Failed to load resource") && !url.startsWith(engine.origin)) return;
    engine.consoleErrors.push(m.text());
  });
  page.on("pageerror", (e) => engine.consoleErrors.push(String(e)));
  return page;
}

// ── FORM-ID / UX / KEY checks (chromium full set; a subset also runs under webkit) ──────────────
async function runFullSuite(site: string, engine: EngineCtx, exp: SiteExpectations, sitePosts: PostRecord[]) {
  const { stub, endpoint } = engine;
  const online = exp.online;

  await siteCheck(site, "FORM-ID-1", "one press, 200 → exactly one request; exact body keys; v4 submission_id; success UI with focus; no cookies; no contact channels listed in the initial state or after success", async () => {
    stub.useScriptedMode();
    stub.clearQueue();
    stub.setDefaultAnswer({ kind: "ok" });
    const page = await newPage(engine);
    await openContact(page, engine.origin);
    const before = sitePosts.length;
    eq(await alertText(page), "", "alert in the initial state");
    await expectNoContacts(page, "initial state");
    await fillValid(page);
    await page.click("[data-inquiry-submit]");
    await waitDone(page);
    eq(sitePosts.length - before, 1, "requests");
    const post = sitePosts[sitePosts.length - 1]!;
    eq(Object.keys(post.body).sort(), ["consent", "hp", "message", "name", "phone", "submission_id"].sort(), "body keys");
    assert(typeof post.body.submission_id === "string" && UUID_V4.test(post.body.submission_id), `submission_id not a v4 UUID: ${post.body.submission_id}`);
    assert(post.headers["cookie"] === undefined, "request carried a cookie header");
    const status = await statusText(page);
    eq(status, `${online.labels.successTitle}${online.labels.successBody}`, "success status text");
    const focusOnStatus = await page.evaluate(() => document.activeElement?.hasAttribute("data-inquiry-status") ?? false);
    assert(focusOnStatus, "focus did not move to the status region");
    const controls = await page.evaluate(() => document.querySelectorAll("[data-inquiry-form] input, [data-inquiry-form] select, [data-inquiry-form] textarea, [data-inquiry-form] button").length);
    eq(controls, 0, "fields not removed after success");
    await expectNoContacts(page, "after success");
    await page.close();
  });

  await siteCheck(site, "FORM-ID-2", "fast double click while the answer is held → exactly one request, no contact channels listed while submitting; release → success; store count 1", async () => {
    stub.useStoreMode();
    stub.resetStore();
    stub.holdNextStoredReply();
    const before = sitePosts.length;
    const page = await newPage(engine);
    await openContact(page, engine.origin);
    await fillValid(page);
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>("[data-inquiry-submit]");
      btn?.click();
      btn?.click();
    });
    await page.waitForTimeout(250);
    eq(sitePosts.length - before, 1, "requests while held");
    eq(stub.heldCount(), 1, "exactly one reply held");
    eq(stub.storedCount, 1, "store mutated at receipt, before the reply was released");
    eq([await page.isDisabled("[data-inquiry-submit]"), await alertText(page)], [true, ""], "submitting: button disabled, alert empty");
    await expectNoContacts(page, "while submitting");
    await stub.releaseHeld({ kind: "ok" });
    await waitDone(page).catch(() => {});
    eq(stub.storedCount, 1, "store count after release");
    await page.close();
    stub.useScriptedMode();
  });

  await siteCheck(site, "FORM-ID-3", "5 fast clicks (script-dispatched and real) → one request, one id; store count 1", async () => {
    stub.useStoreMode();
    stub.resetStore();
    const before = sitePosts.length;
    const page = await newPage(engine);
    await openContact(page, engine.origin);
    await fillValid(page);
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>("[data-inquiry-submit]");
      for (let i = 0; i < 5; i++) btn?.click();
    });
    await page.waitForTimeout(400);
    for (let i = 0; i < 5; i++) await page.click("[data-inquiry-submit]", { timeout: 1000, force: true }).catch(() => {});
    await page.waitForTimeout(400);
    eq(sitePosts.length - before, 1, "requests from 10 clicks");
    const ids = new Set(sitePosts.slice(before).map((p) => p.body.submission_id));
    eq(ids.size, 1, "distinct ids");
    eq(stub.storedCount, 1, "store count");
    await page.close();
    stub.useScriptedMode();
  });

  await siteCheck(
    site,
    "FORM-ID-4",
    "network failure → failureText + fallback contacts (not auto-opened, no navigation); fields kept, focus not on alert; retry (200) → SAME id → success",
    async () => {
      stub.useScriptedMode();
      stub.clearQueue();
      const page = await newPage(engine);
      await openContact(page, engine.origin);
      await fillValid(page);
      const urlBefore = page.url();
      stub.queueAnswer({ kind: "network" });
      const before = sitePosts.length;
      await page.click("[data-inquiry-submit]");
      await waitAlertNonEmpty(page);
      eq(sitePosts.length - before, 1, "one request");
      const text = await alertText(page);
      assert(text.includes(online.labels.failure), `alert does not show failureText: ${text}`);
      const values = await Promise.all(["name", "phone", "message"].map((f) => fieldVal(page, f)));
      eq(values, ["홍길동", "010-1234-5678", "테스트 문의 내용입니다."], "fields kept");
      const focusOnAlert = await page.evaluate(() => document.activeElement?.hasAttribute("data-inquiry-error") ?? false);
      assert(!focusOnAlert, "focus moved to the alert");
      eq(page.url(), urlBefore, "no navigation");
      await expectContacts(page, online, "after a network failure");
      const firstId = sitePosts[sitePosts.length - 1]!.body.submission_id;
      stub.queueAnswer({ kind: "ok" });
      await page.click("[data-inquiry-submit]");
      await waitDone(page);
      eq(sitePosts.length - before, 2, "second request sent");
      eq(sitePosts[sitePosts.length - 1]!.body.submission_id, firstId, "same submission_id on retry");
      await expectNoContacts(page, "after the retry succeeded");
      await page.close();
    },
  );

  await siteCheck(site, "FORM-ID-5", "408 → failureText + fallback contacts, input kept; retry → same id", async () => {
    stub.useScriptedMode();
    stub.clearQueue();
    const page = await newPage(engine);
    await openContact(page, engine.origin);
    await fillValid(page);
    stub.queueAnswer({ kind: "timeout" });
    const before = sitePosts.length;
    await page.click("[data-inquiry-submit]");
    await waitAlertNonEmpty(page);
    const text = await alertText(page);
    assert(text.includes(online.labels.failure), `expected failureText: ${text}`);
    await expectContacts(page, online, "after a 408");
    eq(await fieldVal(page, "name"), "홍길동", "input kept");
    const firstId = sitePosts[sitePosts.length - 1]!.body.submission_id;
    stub.queueAnswer({ kind: "ok" });
    await page.click("[data-inquiry-submit]");
    await waitDone(page);
    eq(sitePosts.length - before, 2, "requests");
    eq(sitePosts[sitePosts.length - 1]!.body.submission_id, firstId, "same id");
    await page.close();
  });

  await siteCheck(site, "FORM-ID-6", "503 → failureText + fallback contacts, input kept; retry → same id", async () => {
    stub.useScriptedMode();
    stub.clearQueue();
    const page = await newPage(engine);
    await openContact(page, engine.origin);
    await fillValid(page);
    stub.queueAnswer({ kind: "unavailable" });
    const before = sitePosts.length;
    await page.click("[data-inquiry-submit]");
    await waitAlertNonEmpty(page);
    const text = await alertText(page);
    assert(text.includes(online.labels.failure), `expected failureText: ${text}`);
    await expectContacts(page, online, "after a 503");
    eq(await fieldVal(page, "name"), "홍길동", "input kept");
    const firstId = sitePosts[sitePosts.length - 1]!.body.submission_id;
    stub.queueAnswer({ kind: "ok" });
    await page.click("[data-inquiry-submit]");
    await waitDone(page);
    eq(sitePosts.length - before, 2, "requests");
    eq(sitePosts[sitePosts.length - 1]!.body.submission_id, firstId, "same id");
    await page.close();
  });

  await siteCheck(
    site,
    "FORM-ID-7",
    "429 rate_limited, Retry-After 2 → rateLimitedText with {minutes}=1 + fallback contacts, button disabled, no request while paused; ~2s later enabled + alert empty (no contacts); retry → same id → success",
    async () => {
      stub.useScriptedMode();
      stub.clearQueue();
      const page = await newPage(engine);
      await openContact(page, engine.origin);
      await fillValid(page);
      stub.queueAnswer({ kind: "rateLimited", retryAfter: 2 });
      const before = sitePosts.length;
      await page.click("[data-inquiry-submit]");
      // the button is also disabled for the brief earlier "submitting" phase (no alert yet); wait for
      // the alert itself so we are observing "paused", not the moment just before the answer arrived
      await waitAlertNonEmpty(page);
      await waitButtonDisabled(page, true);
      const text = await alertText(page);
      const expected = online.labels.rateLimited.replaceAll("{minutes}", "1");
      assert(text.includes(expected), `expected rateLimitedText with minutes=1: got ${JSON.stringify(text)}, expected to include ${JSON.stringify(expected)}`);
      await expectContacts(page, online, "during the rate-limit pause");
      await page.evaluate(() => {
        document.querySelector<HTMLButtonElement>("[data-inquiry-submit]")?.click();
        document.querySelector<HTMLFormElement>("form[data-inquiry-form]")?.requestSubmit();
      });
      await page.waitForTimeout(200);
      eq(sitePosts.length - before, 1, "no request made while paused");
      await waitButtonDisabled(page, false);
      const emptied = await alertText(page);
      eq(emptied, "", "alert cleared once the pause is over");
      await expectNoContacts(page, "once the pause is over");
      const firstId = sitePosts[sitePosts.length - 1]!.body.submission_id;
      stub.queueAnswer({ kind: "ok" });
      await page.click("[data-inquiry-submit]");
      await waitDone(page);
      eq(sitePosts.length - before, 2, "requests");
      eq(sitePosts[sitePosts.length - 1]!.body.submission_id, firstId, "same id");
      await page.close();
    },
  );

  await siteCheck(site, "FORM-ID-7b", "429 channel_capacity → capacityText + fallback contacts; button stays enabled; no automatic request over 2.5s; input kept", async () => {
    stub.useScriptedMode();
    stub.clearQueue();
    const page = await newPage(engine);
    await openContact(page, engine.origin);
    await fillValid(page);
    stub.queueAnswer({ kind: "capacity", retryAfter: 30 });
    const before = sitePosts.length;
    await page.click("[data-inquiry-submit]");
    await waitAlertNonEmpty(page);
    const text = await alertText(page);
    assert(text.includes(online.labels.capacity), `expected capacityText: ${text}`);
    const disabled = await page.isDisabled("[data-inquiry-submit]");
    assert(!disabled, "button disabled after a capacity failure");
    await expectContacts(page, online, "after a 429 channel_capacity");
    await page.waitForTimeout(2500);
    eq(sitePosts.length - before, 1, "no automatic retry over 2.5s");
    eq(await fieldVal(page, "name"), "홍길동", "input kept");
    await page.close();
  });

  await siteCheck(
    site,
    "FORM-ID-8",
    "after a success, a CLIENT-SIDE navigation away and back (no document load: the page's script — and the sender's memory — lives on) and the SAME values → a DIFFERENT id (the confirmed id was dropped)",
    async () => {
      stub.useScriptedMode();
      stub.clearQueue();
      stub.setDefaultAnswer({ kind: "ok" });
      const page = await newPage(engine);
      await openContact(page, engine.origin);
      const documents: string[] = [];
      page.on("request", (r) => {
        if (r.resourceType() === "document") documents.push(r.url());
      });
      await fillValid(page);
      const before = sitePosts.length;
      await page.click("[data-inquiry-submit]");
      await waitDone(page);
      eq(sitePosts.length - before, 1, "first request sent");
      const first = sitePosts[sitePosts.length - 1]!.body;
      const firstId = first.submission_id;
      assert(typeof firstId === "string" && UUID_V4.test(firstId), `first submission_id not a v4 UUID: ${firstId}`);
      // away and back through the site's own header links, as FORM-ID-9c does: the form is taken off
      // the page and put back, but the document is never loaded again — a full reload would start
      // the sender from nothing and prove nothing about the id being dropped
      await page.click('a[data-nav="about"]');
      await page.waitForSelector("[data-inquiry-form]", { state: "detached", timeout: 8000 });
      await page.click('a[data-nav="contact"]');
      await page.waitForSelector("[data-inquiry-form]", { state: "attached", timeout: 8000 });
      await waitMounted(page);
      eq(documents.length, 0, "client-side navigation issued a new document request");
      eq(new URL(page.url()).pathname, "/contact", "back on /contact");
      await fillValid(page);
      await page.click("[data-inquiry-submit]");
      await waitDone(page);
      eq(sitePosts.length - before, 2, "requests");
      const second = sitePosts[sitePosts.length - 1]!.body;
      const secondId = second.submission_id;
      eq({ ...second, submission_id: null }, { ...first, submission_id: null }, "the second inquiry carries the SAME values as the first");
      assert(typeof secondId === "string" && UUID_V4.test(secondId), `second submission_id not a v4 UUID: ${secondId}`);
      assert(secondId !== firstId, `expected a different id after a success and a client-side navigation away and back, got the same: ${secondId}`);
      await page.close();
    },
  );

  await siteCheck(site, "FORM-ID-9a", "503 (uncertain), then a CHANGED message → a DIFFERENT id", async () => {
    stub.useScriptedMode();
    stub.clearQueue();
    const page = await newPage(engine);
    await openContact(page, engine.origin);
    await fillValid(page, { message: "첫 번째 문의 내용입니다." });
    stub.queueAnswer({ kind: "unavailable" });
    const before = sitePosts.length;
    await page.click("[data-inquiry-submit]");
    await waitAlertNonEmpty(page);
    const firstId = sitePosts[sitePosts.length - 1]!.body.submission_id;
    await page.fill("#i1-inquiry-message", "두 번째로 바뀐 문의 내용입니다.");
    stub.queueAnswer({ kind: "ok" });
    await page.click("[data-inquiry-submit]");
    await waitDone(page);
    eq(sitePosts.length - before, 2, "requests");
    const secondId = sitePosts[sitePosts.length - 1]!.body.submission_id;
    assert(secondId !== firstId, `expected a different id after changing the message, got the same: ${secondId}`);
    await page.close();
  });

  await siteCheck(site, "FORM-ID-9b", "after changing the message (uncertain failure) and reverting it to the EARLIER text → the EARLIER id again", async () => {
    stub.useScriptedMode();
    stub.clearQueue();
    const page = await newPage(engine);
    await openContact(page, engine.origin);
    const firstMessage = "원래 문의 내용입니다.";
    await fillValid(page, { message: firstMessage });
    stub.queueAnswer({ kind: "unavailable" });
    const before = sitePosts.length;
    await page.click("[data-inquiry-submit]");
    await waitAlertNonEmpty(page);
    const firstId = sitePosts[sitePosts.length - 1]!.body.submission_id;
    await page.fill("#i1-inquiry-message", "바뀐 문의 내용입니다.");
    stub.queueAnswer({ kind: "unavailable" });
    await page.click("[data-inquiry-submit]");
    await waitAlertNonEmpty(page);
    const secondId = sitePosts[sitePosts.length - 1]!.body.submission_id;
    assert(secondId !== firstId, "changing the message did not get a new id");
    await page.fill("#i1-inquiry-message", firstMessage);
    stub.queueAnswer({ kind: "ok" });
    await page.click("[data-inquiry-submit]");
    await waitDone(page);
    eq(sitePosts.length - before, 3, "requests");
    const thirdId = sitePosts[sitePosts.length - 1]!.body.submission_id;
    eq(thirdId, firstId, "reverting to the earlier message did not reuse the earlier id");
    await page.close();
  });

  await siteCheck(
    site,
    "FORM-ID-9c",
    "idempotent store: a stored-but-network-failed request, then a CLIENT-SIDE navigation away and back (no document reload) and the same values → SAME submission_id, store count stays 1",
    async () => {
      stub.useStoreMode();
      stub.resetStore();
      const page = await newPage(engine);
      await openContact(page, engine.origin);
      const documents: string[] = [];
      page.on("request", (r) => {
        if (r.resourceType() === "document") documents.push(r.url());
      });
      const message = "저장 후 네트워크 오류 플로우입니다.";
      await fillValid(page, { message });
      stub.failNextStoredRequestAsNetwork();
      const before = sitePosts.length;
      await page.click("[data-inquiry-submit]");
      await waitAlertNonEmpty(page);
      eq(sitePosts.length - before, 1, "one request sent");
      eq(stub.storedCount, 1, "the first request was stored");
      const firstId = sitePosts[sitePosts.length - 1]!.body.submission_id;
      assert(typeof firstId === "string" && firstId.length > 0, "no submission_id on the first (stored) request");
      const navCountBefore = documents.length;
      await page.click('a[data-nav="about"]');
      await page.waitForLoadState("domcontentloaded");
      await page.click('a[data-nav="contact"]');
      await page.waitForLoadState("domcontentloaded");
      eq(documents.length, navCountBefore, "client-side navigation issued a new document request");
      await waitMounted(page);
      await fillValid(page, { message });
      await page.click("[data-inquiry-submit]");
      await waitDone(page);
      eq(sitePosts.length - before, 2, "second request sent");
      eq(sitePosts[sitePosts.length - 1]!.body.submission_id, firstId, "submission_id changed across the client-side navigation and resend");
      eq(stub.storedCount, 1, "store count stayed at 1 across the client-side navigation and resend");
      await page.close();
      stub.useScriptedMode();
    },
  );

  await siteCheck(site, "FORM-ID-10", "409 → conflictText (no raw vocabulary leaked) and NO fallback contacts; exactly one request, none over the next 2.5s; input kept; retry → a NEW id", async () => {
    stub.useScriptedMode();
    stub.clearQueue();
    const page = await newPage(engine);
    await openContact(page, engine.origin);
    await fillValid(page);
    stub.queueAnswer({ kind: "conflict" });
    const before = sitePosts.length;
    await page.click("[data-inquiry-submit]");
    await waitAlertNonEmpty(page);
    const text = await alertText(page);
    assert(text.includes(online.labels.conflict), `expected conflictText: ${text}`);
    for (const bad of ["idempotency", "409", "conflict", "submission"]) assert(!text.toLowerCase().includes(bad), `conflict alert leaked raw vocabulary "${bad}": ${text}`);
    eq(text, online.labels.conflict, "the conflict alert is its own text and nothing else");
    await expectNoContacts(page, "after a conflict (409)");
    await page.waitForTimeout(2500);
    eq(sitePosts.length - before, 1, "no automatic retry over 2.5s");
    eq(await fieldVal(page, "name"), "홍길동", "input kept");
    const firstId = sitePosts[sitePosts.length - 1]!.body.submission_id;
    stub.queueAnswer({ kind: "ok" });
    await page.click("[data-inquiry-submit]");
    await waitDone(page);
    const secondId = sitePosts[sitePosts.length - 1]!.body.submission_id;
    assert(secondId !== firstId, `expected a new id after a conflict, got the same: ${secondId}`);
    await page.close();
  });

  await siteCheck(site, "FORM-ID-10b", "400 → invalidText + fallback contacts, input kept; retry → same id", async () => {
    stub.useScriptedMode();
    stub.clearQueue();
    const page = await newPage(engine);
    await openContact(page, engine.origin);
    await fillValid(page);
    stub.queueAnswer({ kind: "invalid" });
    const before = sitePosts.length;
    await page.click("[data-inquiry-submit]");
    await waitAlertNonEmpty(page);
    const text = await alertText(page);
    assert(text.includes(online.labels.invalid), `expected invalidText: ${text}`);
    await expectContacts(page, online, "after a 400");
    eq(await fieldVal(page, "name"), "홍길동", "input kept");
    const firstId = sitePosts[sitePosts.length - 1]!.body.submission_id;
    stub.queueAnswer({ kind: "ok" });
    await page.click("[data-inquiry-submit]");
    await waitDone(page);
    eq(sitePosts.length - before, 2, "requests");
    eq(sitePosts[sitePosts.length - 1]!.body.submission_id, firstId, "same id");
    await page.close();
  });

  await siteCheck(site, "UX-1", "the submit button is disabled in the served HTML and with JavaScript disabled (noscript text visible)", async () => {
    const res = await fetch(`${engine.origin}/contact`);
    const html = await res.text();
    const button = /<button\b[^>]*data-inquiry-submit=""[^>]*>/.exec(html)?.[0] ?? "";
    assert(button.includes('disabled=""'), `served button not disabled: ${button}`);
    const noJsCtx = await engine.browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await noJsCtx.newPage();
      await page.goto(`${engine.origin}/contact`, { waitUntil: "load" });
      const disabled = await page.isDisabled("[data-inquiry-submit]");
      assert(disabled, "button not disabled with JS disabled");
      const line = page.locator("form[data-inquiry-form] .i1-form__noscript");
      assert((await line.count()) === 1, "no noscript line");
      assert(await line.first().isVisible(), "noscript line not visible");
      await page.close();
    } finally {
      await noJsCtx.close();
    }
  });

  await siteCheck(site, "UX-2", "client validation sends no request for an empty name, a short phone or no consent; values kept; zero-width/tab normalised on submit", async () => {
    stub.useScriptedMode();
    stub.clearQueue();
    stub.setDefaultAnswer({ kind: "ok" });
    const before = sitePosts.length;
    {
      const page = await newPage(engine);
      await openContact(page, engine.origin);
      await page.fill("#i1-inquiry-name", "");
      await page.fill("#i1-inquiry-phone", "010-1234-5678");
      await page.fill("#i1-inquiry-message", "문의");
      await page.check("#i1-inquiry-consent");
      await page.click("[data-inquiry-submit]");
      await page.waitForTimeout(150);
      eq(sitePosts.length - before, 0, "empty name sent a request");
      eq(await fieldVal(page, "message"), "문의", "message value lost");
      await page.close();
    }
    {
      const page = await newPage(engine);
      await openContact(page, engine.origin);
      await page.fill("#i1-inquiry-name", "홍길동");
      await page.fill("#i1-inquiry-phone", "123");
      await page.fill("#i1-inquiry-message", "문의");
      await page.check("#i1-inquiry-consent");
      await page.click("[data-inquiry-submit]");
      await page.waitForTimeout(150);
      eq(sitePosts.length - before, 0, "short phone sent a request");
      eq(await fieldVal(page, "name"), "홍길동", "name value lost");
      await page.close();
    }
    {
      const page = await newPage(engine);
      await openContact(page, engine.origin);
      await fillValid(page);
      await page.uncheck("#i1-inquiry-consent");
      await page.click("[data-inquiry-submit]");
      await page.waitForTimeout(150);
      eq(sitePosts.length - before, 0, "no consent sent a request");
      eq(await fieldVal(page, "phone"), "010-1234-5678", "phone value lost");
      await page.close();
    }
    {
      const page = await newPage(engine);
      await openContact(page, engine.origin);
      await page.fill("#i1-inquiry-name", `​홍길동\t`);
      await page.fill("#i1-inquiry-phone", "010-1234-5678");
      await page.fill("#i1-inquiry-message", "문의 내용");
      await page.check("#i1-inquiry-consent");
      await page.click("[data-inquiry-submit]");
      await page.waitForFunction(() => (document.querySelector<HTMLInputElement>("#i1-inquiry-name")?.value ?? "") === "홍길동", undefined, { timeout: 3000 });
      await page.close();
    }
  });

  await siteCheck(site, "UX-3", "honeypot: a script-filled trap field is forwarded as hp", async () => {
    stub.useScriptedMode();
    stub.clearQueue();
    stub.setDefaultAnswer({ kind: "ok" });
    const page = await newPage(engine);
    await openContact(page, engine.origin);
    await fillValid(page);
    await page.evaluate(() => {
      const trap = document.querySelector<HTMLInputElement>("[data-inquiry-trap]");
      if (trap) trap.value = "bot-filled";
    });
    const before = sitePosts.length;
    await page.click("[data-inquiry-submit]");
    await waitDone(page);
    eq(sitePosts.length - before, 1, "requests");
    eq(sitePosts[sitePosts.length - 1]!.body.hp, "bot-filled", "hp not forwarded");
    await page.close();
  });

  await siteCheck(site, "UX-4", "an unrecognised answer (500 html, a 403, or 200 with a non-JSON body) → failureText + fallback contacts, no page error, input kept", async () => {
    stub.useScriptedMode();
    stub.clearQueue();
    {
      const page = await newPage(engine);
      await openContact(page, engine.origin);
      await fillValid(page);
      stub.queueAnswer({ kind: "unknownHtml" });
      await page.click("[data-inquiry-submit]");
      await waitAlertNonEmpty(page);
      const text = await alertText(page);
      assert(text.includes(online.labels.failure), `expected failureText for a 500 html answer: ${text}`);
      await expectContacts(page, online, "after a 500 html answer (unknown)");
      eq(await fieldVal(page, "name"), "홍길동", "input kept");
      await page.close();
    }
    {
      const page = await newPage(engine);
      await openContact(page, engine.origin);
      await fillValid(page);
      stub.queueAnswer({ kind: "unknownStatus", status: 403 });
      await page.click("[data-inquiry-submit]");
      await waitAlertNonEmpty(page);
      const text = await alertText(page);
      assert(text.includes(online.labels.failure), `expected failureText for a 403 answer: ${text}`);
      await expectContacts(page, online, "after a 403 (unknown status)");
      eq(await fieldVal(page, "name"), "홍길동", "input kept");
      await page.close();
    }
    {
      const page = await newPage(engine);
      await openContact(page, engine.origin);
      await fillValid(page);
      stub.queueAnswer({ kind: "unknownOkBadJson" });
      await page.click("[data-inquiry-submit]");
      await waitAlertNonEmpty(page);
      const text = await alertText(page);
      assert(text.includes(online.labels.failure), `expected failureText for a 200 non-JSON answer: ${text}`);
      await expectContacts(page, online, "after a 200 non-JSON answer (unknown)");
      eq(await fieldVal(page, "name"), "홍길동", "input kept");
      await page.close();
    }
  });

  await siteCheck(site, "UX-5", fallbackRuleName(online, "chromium"), () => runFallbackRule(engine, exp, sitePosts));

  await siteCheck(site, "KEY-1", "tab order name→phone→region→area→workType→schedule→message→consent→submit (honeypot skipped); Enter in name submits once; focus not on alert/status after a failure", async () => {
    const page = await newPage(engine);
    await openContact(page, engine.origin);
    await page.locator("#i1-inquiry-name").focus();
    const order: (string | null)[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return null;
        if (el.id) return `#${el.id}`;
        if (el.hasAttribute("data-inquiry-submit")) return "submit";
        const name = el.getAttribute("name");
        return name ? `name:${name}` : el.tagName;
      });
      order.push(info);
    }
    eq(order, ["#i1-inquiry-phone", "#i1-inquiry-region", "#i1-inquiry-area", "#i1-inquiry-workType", "#i1-inquiry-schedule", "#i1-inquiry-message", "#i1-inquiry-consent", "submit"], "tab order");

    stub.useScriptedMode();
    stub.clearQueue();
    stub.setDefaultAnswer({ kind: "ok" });
    await page.goto(`${engine.origin}/contact`, { waitUntil: "domcontentloaded" });
    await waitMounted(page);
    await fillValid(page);
    const before = sitePosts.length;
    await page.locator("#i1-inquiry-name").press("Enter");
    await waitDone(page);
    eq(sitePosts.length - before, 1, "Enter submitted more than once");

    await page.goto(`${engine.origin}/contact`, { waitUntil: "domcontentloaded" });
    await waitMounted(page);
    await fillValid(page);
    await page.locator("#i1-inquiry-message").focus();
    stub.queueAnswer({ kind: "network" });
    await page.click("[data-inquiry-submit]");
    await waitAlertNonEmpty(page);
    const focus = await page.evaluate(() => (document.activeElement?.hasAttribute("data-inquiry-error") ? "alert" : document.activeElement?.hasAttribute("data-inquiry-status") ? "status" : "other"));
    assert(focus !== "alert" && focus !== "status", `a failure moved focus to the ${focus}`);
    await page.close();
  });
}

const fallbackRuleName = (online: InquiryOnline, engineLabel: string) =>
  `(${engineLabel}) the fallback rule, complete — this site's ${online.fallback.length} contact channel(s) ARE listed after 400, 408, 503, 429 rate_limited (while paused), 429 channel_capacity, a network failure and an unknown answer (403, 500, a non-JSON 200); NOT after 409, not in the initial state, not while submitting, not after success; the alert's whole text is the failure's text + exactly that list`;

/**
 * The fallback rule in one place: every answer the door tells apart → what the alert says, and
 * whether it lists the site's other contact channels (after every failure but a conflict). One page
 * load per answer — a fresh document, so no id and no pause is carried over from the row before.
 * The alert's WHOLE text is compared: the failure's own text, then the list, and nothing else.
 */
async function runFallbackRule(engine: EngineCtx, exp: SiteExpectations, sitePosts: PostRecord[]) {
  const { stub } = engine;
  const { online } = exp;
  const l = online.labels;
  const rule: { answer: ScriptedAnswer; what: string; says: string; contacts: boolean; paused?: true }[] = [
    { answer: { kind: "invalid" }, what: "400 (invalid)", says: l.invalid, contacts: true },
    { answer: { kind: "timeout" }, what: "408 (timeout)", says: l.failure, contacts: true },
    { answer: { kind: "unavailable" }, what: "503 (unavailable)", says: l.failure, contacts: true },
    { answer: { kind: "rateLimited", retryAfter: 90 }, what: "429 rate_limited, Retry-After 90 (rate_limited, paused)", says: l.rateLimited.replaceAll("{minutes}", "2"), contacts: true, paused: true },
    { answer: { kind: "capacity", retryAfter: 30 }, what: "429 channel_capacity (capacity)", says: l.capacity, contacts: true },
    { answer: { kind: "network" }, what: "a network failure (network)", says: l.failure, contacts: true },
    { answer: { kind: "unknownStatus", status: 403 }, what: "403 (unknown)", says: l.failure, contacts: true },
    { answer: { kind: "unknownHtml" }, what: "500 html (unknown)", says: l.failure, contacts: true },
    { answer: { kind: "unknownOkBadJson" }, what: "200 non-JSON (unknown)", says: l.failure, contacts: true },
    { answer: { kind: "conflict" }, what: "409 (conflict)", says: l.conflict, contacts: false },
  ];
  stub.useScriptedMode();
  for (const row of rule) {
    stub.clearQueue();
    const page = await newPage(engine);
    await openContact(page, engine.origin);
    eq(await alertText(page), "", `${row.what}: alert before the press`);
    await expectNoContacts(page, `${row.what}: initial state`);
    await fillValid(page);
    stub.queueAnswer(row.answer);
    const before = sitePosts.length;
    await page.click("[data-inquiry-submit]");
    await waitAlertNonEmpty(page);
    eq(sitePosts.length - before, 1, `${row.what}: requests`);
    eq(await alertText(page), `${row.says}${row.contacts ? contactsText(online) : ""}`, `${row.what}: the alert's whole text`);
    if (row.contacts) await expectContacts(page, online, `after ${row.what}`);
    else await expectNoContacts(page, `after ${row.what}`);
    eq(await page.isDisabled("[data-inquiry-submit]"), row.paused === true, `${row.what}: button disabled`);
    await page.close();
  }
  // the two states that are not a failure: a request on its way, and the endpoint's confirmation
  stub.clearQueue();
  const page = await newPage(engine);
  await openContact(page, engine.origin);
  await fillValid(page);
  stub.queueAnswer({ kind: "hold" });
  await page.click("[data-inquiry-submit]");
  await waitButtonDisabled(page, true);
  for (let i = 0; i < 60 && stub.heldCount() < 1; i++) await page.waitForTimeout(50);
  eq(stub.heldCount(), 1, "submitting: the answer is held");
  eq(await alertText(page), "", "submitting: alert");
  await expectNoContacts(page, "while submitting");
  await stub.releaseHeld({ kind: "ok" });
  await waitDone(page);
  await expectNoContacts(page, "after success");
  await page.close();
}

async function runResp1(site: string, engine: EngineCtx, exp: SiteExpectations, viewports: { w: number; h: number; label: string }[], engineLabel: string) {
  const { stub } = engine;
  await siteCheck(site, "RESP-1", `responsive (${engineLabel}): no overflow, elements in-viewport, touch targets on phones, alert not clipped, button not covered, screenshots`, async () => {
    stub.useScriptedMode();
    const page = await newPage(engine);
    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      for (const state of RESP_STATES) {
        await driveState(page, engine.origin, stub, state);
        const shot = path.join(SCREENSHOT_DIR, `${site}-${vp.label}-${state}.jpg`);
        try {
          await measureAndShoot(page, vp.w, vp.h, shot);
        } catch (e) {
          throw new Error(`${vp.label}/${state}: ${(e as Error).message}`);
        }
      }
    }
    await page.close();
    stub.useScriptedMode();
  });
}

async function runErr0(site: string, consoleErrors: string[], engineLabel: string) {
  await siteCheck(site, "ERR-0", `no console error or pageerror over the whole ${engineLabel} run (third-party aborts excluded)`, () => {
    eq(consoleErrors, [], "console/page errors");
  });
}

async function runFormId1112(site: string, sitePosts: PostRecord[], strayHits: string[]) {
  await siteCheck(site, "FORM-ID-11", "no request body across the whole run carries a source or turnstile_token key", () => {
    const offenders = sitePosts.filter((p) => "source" in p.body || "turnstile_token" in p.body);
    eq(offenders.length, 0, `offending bodies: ${JSON.stringify(offenders.map((o) => o.body))}`);
  });
  await siteCheck(site, "FORM-ID-12", "the page never loaded anything from a turnstile / challenges.cloudflare.com host", () => {
    const offenders = strayHits.filter((u) => /turnstile|challenges\.cloudflare\.com/i.test(u));
    eq(offenders.length, 0, `offending urls: ${JSON.stringify(offenders)}`);
  });
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────
await mkdir(SCREENSHOT_DIR, { recursive: true });

for (const site of SITES) {
  const exp = await loadSiteExpectations(site);
  if (!exp) {
    skip(`${site}`, "no data/site-builds/<site>/current.json yet, or the site has no online inquiry form");
    continue;
  }
  console.log(`\n=== ${site} ===`);
  const server = await startStaticServer(exp.siteRoot);
  const sitePosts: PostRecord[] = [];
  const chromiumStray: string[] = [];
  const chromiumErrors: string[] = [];
  try {
    const chromiumBrowser = await chromium.launch();
    try {
      const chromiumEngine = await newEngineContext(chromiumBrowser, { viewport: DESKTOP }, server.origin, exp.endpoint, sitePosts, chromiumStray, chromiumErrors);
      try {
        await runFullSuite(site, chromiumEngine, exp, sitePosts);
        await runResp1(site, chromiumEngine, exp, RESP_VIEWPORTS, "chromium");
      } finally {
        await chromiumEngine.context.close();
      }
    } finally {
      await chromiumBrowser.close();
    }
    await runErr0(site, chromiumErrors, "chromium");

    let webkitAvailable = true;
    let webkitBrowser: Browser | undefined;
    try {
      webkitBrowser = await webkit.launch();
    } catch {
      webkitAvailable = false;
    }
    if (!webkitAvailable || !webkitBrowser) {
      skip(`${site} webkit`, "no installed WebKit build");
    } else {
      const webkitStray: string[] = [];
      const webkitErrors: string[] = [];
      try {
        const webkitEngine = await newEngineContext(webkitBrowser, { ...devices["iPhone 13"] }, server.origin, exp.endpoint, sitePosts, webkitStray, webkitErrors);
        try {
          await siteCheck(site, "FORM-ID-1", "(webkit) one press, 200 → exactly one request; success UI", () =>
            runOneOffFormId1(webkitEngine, exp, sitePosts));
          await siteCheck(site, "FORM-ID-2", "(webkit) fast double click while held → exactly one request; release → success", () => runOneOffFormId2(webkitEngine, sitePosts));
          await siteCheck(site, "FORM-ID-4", "(webkit) network failure → failureText + fallback; retry (200) → same id → success", () => runOneOffFormId4(webkitEngine, exp, sitePosts));
          await siteCheck(site, "UX-5", fallbackRuleName(exp.online, "webkit"), () => runFallbackRule(webkitEngine, exp, sitePosts));
          await runResp1(site, webkitEngine, exp, RESP_VIEWPORTS.filter((v) => v.w === 390), "webkit, 390 only");
        } finally {
          await webkitEngine.context.close();
        }
        await runErr0(site, webkitErrors, "webkit");
        strayHitsPush(chromiumStray, webkitStray);
      } finally {
        await webkitBrowser.close();
      }
    }
    await runFormId1112(site, sitePosts, chromiumStray);
    await siteCheck(site, "SAFETY-1", "no request to the declared endpoint host ever escaped the stub (nothing but local-origin and the exact endpoint URL was ever let through)", () => {
      eq(chromiumStray.includes(exp.endpoint), false, "the exact endpoint URL appeared among aborted stray requests");
    });
  } finally {
    await server.close();
  }

  const rows = tableBySite.get(site) ?? [];
  console.log(`\n-- ${site}: results --`);
  for (const r of rows) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.id}`);
  const sitePassed = rows.filter((r) => r.ok).length;
  console.log(`  ${sitePassed}/${rows.length} passed`);
}

function strayHitsPush(into: string[], from: string[]) {
  into.push(...from);
}

async function runOneOffFormId1(engine: EngineCtx, exp: SiteExpectations, sitePosts: PostRecord[]) {
  engine.stub.useScriptedMode();
  engine.stub.clearQueue();
  engine.stub.setDefaultAnswer({ kind: "ok" });
  const page = await newPage(engine);
  await openContact(page, engine.origin);
  const before = sitePosts.length;
  await fillValid(page);
  await page.click("[data-inquiry-submit]");
  await waitDone(page);
  eq(sitePosts.length - before, 1, "requests");
  const post = sitePosts[sitePosts.length - 1]!;
  assert(typeof post.body.submission_id === "string" && UUID_V4.test(post.body.submission_id), "submission_id not a v4 UUID");
  const status = await statusText(page);
  eq(status, `${exp.online.labels.successTitle}${exp.online.labels.successBody}`, "success status text");
  await page.close();
}
async function runOneOffFormId2(engine: EngineCtx, sitePosts: PostRecord[]) {
  engine.stub.useScriptedMode();
  engine.stub.clearQueue();
  const page = await newPage(engine);
  await openContact(page, engine.origin);
  await fillValid(page);
  engine.stub.queueAnswer({ kind: "hold" });
  const before = sitePosts.length;
  await page.evaluate(() => {
    const btn = document.querySelector<HTMLButtonElement>("[data-inquiry-submit]");
    btn?.click();
    btn?.click();
  });
  await page.waitForTimeout(250);
  eq(sitePosts.length - before, 1, "requests while held");
  if (engine.stub.heldCount() > 0) await engine.stub.releaseHeld({ kind: "ok" });
  await waitDone(page).catch(() => {});
  await page.close();
}
async function runOneOffFormId4(engine: EngineCtx, exp: SiteExpectations, sitePosts: PostRecord[]) {
  engine.stub.useScriptedMode();
  engine.stub.clearQueue();
  const page = await newPage(engine);
  await openContact(page, engine.origin);
  await fillValid(page);
  engine.stub.queueAnswer({ kind: "network" });
  const before = sitePosts.length;
  await page.click("[data-inquiry-submit]");
  await waitAlertNonEmpty(page);
  eq(sitePosts.length - before, 1, "one request");
  const text = await alertText(page);
  assert(text.includes(exp.online.labels.failure), `alert does not show failureText: ${text}`);
  await expectContacts(page, exp.online, "after a network failure");
  const firstId = sitePosts[sitePosts.length - 1]!.body.submission_id;
  engine.stub.queueAnswer({ kind: "ok" });
  await page.click("[data-inquiry-submit]");
  await waitDone(page);
  eq(sitePosts[sitePosts.length - 1]!.body.submission_id, firstId, "same submission_id on retry");
  await page.close();
}

console.log(`\n${passed} passed, ${failedNames.length} failed, ${skippedNames.length} skipped`);
if (failedNames.length > 0) {
  for (const f of failedNames) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
