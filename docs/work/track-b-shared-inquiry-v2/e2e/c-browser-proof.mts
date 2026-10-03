/**
 * C — browser-level proof. The REAL built Track B page (the package data/site-builds/
 * boost-interior-demo/current.json points to, /contact) runs in Chromium against a LOCAL BoostChat
 * (the isolated copy, `next start`) on the local TEST database. The page is served unmodified from
 * a loopback static server; the endpoint it declares is an https production URL, which is never
 * contacted — the browser's request for it is carried to the local server in two different ways:
 *
 *   mode R ("route", the brief's method)  Playwright intercepts the request (context.route),
 *        forwards it to the local BoostChat with route.fetch (method, headers incl. Origin, body)
 *        and fulfils with the REAL response, so the real status and CORS headers reach the page.
 *        Every other non-static request is aborted. Playwright answers CORS preflights ITSELF
 *        while interception is on, so in this mode the real OPTIONS handler is not exercised by
 *        the browser.
 *   mode G ("gateway", no interception at all)  Chromium is given a loopback HTTP proxy that
 *        accepts a tunnel only to the declared host and hands it to a loopback TLS terminator,
 *        which relays OPTIONS / POST of the declared path to the local BoostChat byte for byte.
 *        The browser's own preflight and its own CORS checks therefore meet the REAL route.
 *        Every other tunnel is refused. Only this mode can show two things: what the browser does
 *        when a connection it already used dies before the answer (step 2r: it re-sends the POST
 *        by itself), and what the page gets from an origin that is not registered (step 8).
 * In both modes Chromium also runs with --host-resolver-rules="MAP * ~NOTFOUND , EXCLUDE 127.0.0.1"
 * (no name can be resolved), so nothing can leave 127.0.0.1 even if a layer above failed.
 *
 * The one thing added to the browser's request is `X-Real-IP` (a synthetic visitor address): in
 * production BoostChat's edge sets it; BoostChat's own tests set it the same way.
 *
 *   BOOSTCHAT_E2E_COPY=<copy> ./node_modules/.bin/tsx --tsconfig platform/tsconfig.json \
 *     docs/work/track-b-shared-inquiry-v2/e2e/c-browser-proof.mts
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import {
  TRACK_B_ROOT,
  assertLoopbackHttpUrl,
  assertLeadSchema,
  boostChatCommit,
  boostChatCopy,
  check,
  cleanupFixture,
  declaredEndpoint,
  freePort,
  freshVisitor,
  id8,
  info,
  leadCount,
  leadCountForSubmission,
  leftovers,
  log,
  loopbackFetch,
  openTestDb,
  portInUse,
  section,
  seedFixture,
  serverLogTags,
  settleWindow,
  watchdog,
  sha256File,
  sleep,
  startBoostChat,
  startMailSink,
  summary,
  type BoostChatServer,
  type Fixture,
  type MailSink,
} from "./lib.mts";

const HOST_RULES = "--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1";
const CLIENT_WINDOW_SECONDS = 600;
const CLIENT_MAX = 5;
const UI_TIMEOUT_MS = 15_000;

const copy = boostChatCopy();
const ENDPOINT = declaredEndpoint();
const DECLARED = new URL(ENDPOINT);
const db = await openTestDb(copy);
const logDir = path.join(copy, "..", "logs");
mkdirSync(logDir, { recursive: true });

// ── the built package (resolved through current.json at run time) ────────────
const current = JSON.parse(readFileSync(path.join(TRACK_B_ROOT, "data", "site-builds", "boost-interior-demo", "current.json"), "utf8")) as { buildInputId: string; packageDir: string; finishedAt: string };
const packageDir = path.join(TRACK_B_ROOT, current.packageDir);
const siteDir = path.join(packageDir, "site");
const record = JSON.parse(readFileSync(path.join(packageDir, "build-record.json"), "utf8")) as { startedAt: string; template: { releaseId: string; templateVersion: string } };
const contactHtml = readFileSync(path.join(siteDir, "contact.html"), "utf8");
if (!contactHtml.includes(ENDPOINT)) throw new Error("the built contact page does not carry the declared endpoint");
const payload = contactHtml.replaceAll('\\"', '"');
const label = (key: string): string => new RegExp(`"${key}":"([^"]*)"`).exec(payload)?.[1] ?? "";
const LABELS = { successTitle: label("successTitle"), failure: label("failure"), rateLimited: label("rateLimited") };
const chunkDir = path.join(siteDir, "_next", "static", "chunks");
const doorChunk = readdirSync(chunkDir).find((f) => f.endsWith(".js") && readFileSync(path.join(chunkDir, f), "utf8").includes("submission_id"));
const doorSource = path.join(TRACK_B_ROOT, "platform", "site", "inquiry-client.ts");
const formSource = path.join(TRACK_B_ROOT, "templates", "interior-01", "v1", "components", "InquiryForm.tsx");
const builtAfterSources = Math.max(statSync(doorSource).mtimeMs, statSync(formSource).mtimeMs) <= Date.parse(record.startedAt);

log("LOCAL E2E idempotency proof — C (browser level, the real built page)");
log(`started:            ${new Date().toISOString()}`);
log(`boostchat commit:   ${boostChatCommit(copy)} (isolated git-archive copy)`);
log(`database:           ${db.database} on loopback (name contains "test": yes)`);
log(`migration 0055:     ${await assertLeadSchema(db)}`);
log(`package:            boost-interior-demo ${current.buildInputId.slice(0, 16)}… (current.json), ${record.template.releaseId}, built ${record.startedAt} .. ${current.finishedAt}`);
log(`door in the page:   chunk ${doorChunk ?? "NOT FOUND"} (contains "submission_id"); door source sha256 ${sha256File(doorSource).slice(0, 16)}…; door + form sources older than this build: ${builtAfterSources ? "yes" : "NO — the page carries an OLDER door than the working tree"}`);
log(`declared endpoint:  https://${DECLARED.host}/api/widget/<declared key>/lead  (carried to the local server — never contacted)`);
if (!doorChunk || LABELS.successTitle === "" || LABELS.failure === "" || !LABELS.rateLimited.includes("{minutes}")) throw new Error("the built page is not the online inquiry form this proof is about");

// ── a tiny static server for the package ─────────────────────────────────────
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".map": "application/json",
};
function startStatic(): Promise<{ origin: string; port: number; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    let pathname = "/";
    try {
      pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
    } catch {
      /* served as "/" */
    }
    if (pathname.endsWith("/")) pathname += "index.html";
    const candidates = [pathname, `${pathname}.html`, `${pathname}/index.html`];
    for (const candidate of candidates) {
      const file = path.join(siteDir, candidate);
      if (!file.startsWith(siteDir + path.sep) || !existsSync(file) || !statSync(file).isFile()) continue;
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store" });
      res.end(readFileSync(file));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      resolve({ origin: `http://127.0.0.1:${port}`, port, close: () =>
          new Promise((done) => {
            server.close(() => done());
            // a browser keeps speculative connections open on which it never sends a request; without
            // this, close() waits for them for ever
            server.closeAllConnections();
          }),
      });
    });
  });
}

// ── what reached BoostChat, per mode ─────────────────────────────────────────
interface Seen {
  method: string;
  status: number;
  /** POST: the body the page sent */
  body: string;
  /** the answer was withheld from the page (the simulated lost answer) */
  lost: boolean;
  /** mode G: how many requests the connection this one arrived on had already served (0 = a fresh connection) */
  servedBefore?: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
}
interface Transport {
  mode: "R" | "G";
  /** the synthetic visitor address the edge would set */
  visitor: string;
  /** the next POST is forwarded and answered, but the answer does not reach the page */
  loseNext: boolean;
  seen: Seen[];
  /** hosts the page tried to reach that were refused */
  refused: string[];
  /**
   * mode G: makes the NEXT request of the page arrive on a fresh connection (the relay drops its idle
   * connections and closes each connection after its answer while `freshConnections` is set). Needed
   * because of what a browser does when a connection it has ALREADY USED dies before any answer
   * byte: it sends the request again by itself (step 2r) — the page never sees that failure.
   */
  freshConnections: boolean;
  dropIdle?: () => Promise<void>;
}
const posts = (t: Transport, from: number): Seen[] => t.seen.slice(from).filter((s) => s.method === "POST");
const submissionIdOf = (body: string): string | undefined => {
  try {
    const id = (JSON.parse(body) as { submission_id?: unknown }).submission_id;
    return typeof id === "string" ? id : undefined;
  } catch {
    return undefined;
  }
};

/** mode G: a loopback proxy (tunnels only to the declared host) + a loopback TLS terminator relaying to BoostChat */
async function startGateway(t: Transport, localBase: string, publicKey: string): Promise<{ proxyPort: number; connects: string[]; close: () => Promise<void> }> {
  const base = assertLoopbackHttpUrl(localBase, "gateway upstream");
  const keyFile = path.join(logDir, `gateway-${process.pid}.key.pem`);
  const certFile = path.join(logDir, `gateway-${process.pid}.cert.pem`);
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyFile, "-out", certFile, "-days", "2", "-subj", `/CN=${DECLARED.hostname}`], { stdio: "ignore" });
  const served = new WeakMap<net.Socket, number>();
  const relay = https.createServer({ key: readFileSync(keyFile), cert: readFileSync(certFile) }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const method = req.method ?? "";
      if (req.url !== DECLARED.pathname || (method !== "POST" && method !== "OPTIONS")) {
        // anything else the page asks of the declared host (its chat widget script) stays here
        t.refused.push(`${DECLARED.host}${(req.url ?? "").split("?")[0]} (not the lead route: 404 from the gateway)`);
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("not relayed");
        return;
      }
      const body = Buffer.concat(chunks);
      const headers: Record<string, string | string[]> = {};
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined && k !== "host" && k !== "connection") headers[k] = v;
      headers["x-real-ip"] = t.visitor; // what the edge adds
      const lose = method === "POST" && t.loseNext;
      if (lose) t.loseNext = false;
      const servedBefore = served.get(req.socket) ?? 0;
      served.set(req.socket, servedBefore + 1);
      const upstream = http.request({ host: "127.0.0.1", port: Number(base.port), path: `/api/widget/${publicKey}/lead`, method, headers }, (up) => {
        const parts: Buffer[] = [];
        up.on("data", (c: Buffer) => parts.push(c));
        up.on("end", () => {
          const flat = (h: http.IncomingHttpHeaders): Record<string, string> => Object.fromEntries(Object.entries(h).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : (v ?? "")]));
          t.seen.push({ method, status: up.statusCode ?? 0, body: body.toString("utf8"), lost: lose, servedBefore, requestHeaders: flat(req.headers), responseHeaders: flat(up.headers) });
          if (lose) {
            req.socket.destroy(); // the server answered; the answer never reaches the page
            return;
          }
          const out: http.OutgoingHttpHeaders = {};
          for (const [k, v] of Object.entries(up.headers)) if (v !== undefined && k !== "connection" && k !== "keep-alive" && k !== "transfer-encoding") out[k] = v;
          const payloadOut = Buffer.concat(parts);
          out["content-length"] = payloadOut.length;
          if (t.freshConnections) out["connection"] = "close";
          res.writeHead(up.statusCode ?? 502, out);
          res.end(payloadOut);
        });
      });
      upstream.on("error", () => {
        res.writeHead(502);
        res.end();
      });
      upstream.end(body);
    });
  });
  relay.keepAliveTimeout = 60_000; // an idle connection stays usable between the steps
  t.dropIdle = async () => {
    relay.closeIdleConnections();
    await sleep(300);
  };
  const relayPort = await new Promise<number>((resolve) => relay.listen(0, "127.0.0.1", () => resolve((relay.address() as net.AddressInfo).port)));
  const connects: string[] = [];
  const sockets = new Set<net.Socket>();
  const proxy = http.createServer((req, res) => {
    // a plain (non-tunnel) proxy request: refused
    t.refused.push(`${req.headers.host ?? "?"} (plain proxy request: 403 from the gateway)`);
    res.writeHead(403);
    res.end();
  });
  proxy.on("connect", (req, client: net.Socket, head: Buffer) => {
    const target = req.url ?? "";
    connects.push(target);
    sockets.add(client);
    client.on("close", () => sockets.delete(client));
    client.on("error", () => client.destroy());
    if (target !== `${DECLARED.hostname}:443`) {
      t.refused.push(`${target} (tunnel refused by the gateway)`);
      client.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    const tunnel = net.connect(relayPort, "127.0.0.1", () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length > 0) tunnel.write(head);
      tunnel.pipe(client);
      client.pipe(tunnel);
    });
    sockets.add(tunnel);
    tunnel.on("close", () => {
      sockets.delete(tunnel);
      client.destroy();
    });
    tunnel.on("error", () => client.destroy());
    client.on("close", () => tunnel.destroy());
  });
  const proxyPort = await new Promise<number>((resolve) => proxy.listen(0, "127.0.0.1", () => resolve((proxy.address() as net.AddressInfo).port)));
  return {
    proxyPort,
    connects,
    close: async () => {
      for (const s of sockets) s.destroy();
      relay.closeAllConnections();
      proxy.closeAllConnections();
      await new Promise<void>((done) => relay.close(() => done()));
      await new Promise<void>((done) => proxy.close(() => done()));
      rmSync(keyFile, { force: true }); // the throwaway key pair of this run
      rmSync(certFile, { force: true });
    },
  };
}

// ── the page ─────────────────────────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
const requireFromTrackB = createRequire(path.join(TRACK_B_ROOT, "package.json"));
const { chromium } = requireFromTrackB("playwright") as { chromium: any };
type Page = any;

interface Typed {
  name: string;
  phone: string;
  region: string;
  message: string;
}
const typed = (mode: string, step: string): Typed => ({
  name: "E2E Tester",
  phone: "010-0000-0000",
  region: `E2E-${mode}`,
  message: `[trackb-inquiry-v2-e2e] synthetic browser inquiry ${mode} ${step}`,
});
async function openForm(page: Page, origin: string, values: Typed): Promise<void> {
  await page.goto(`${origin}/contact`, { waitUntil: "load" });
  await page.waitForSelector("[data-inquiry-submit]:not([disabled])", { timeout: UI_TIMEOUT_MS }); // the island is mounted
  await page.fill("#i1-inquiry-name", values.name);
  await page.fill("#i1-inquiry-phone", values.phone);
  await page.fill("#i1-inquiry-region", values.region);
  await page.fill("#i1-inquiry-message", values.message);
  await page.check("#i1-inquiry-consent");
}
const waitDone = (page: Page): Promise<unknown> => page.waitForSelector("[data-inquiry-status].i1-form__status--done", { timeout: UI_TIMEOUT_MS });
// in-page code is handed over as SOURCE TEXT: a function compiled by tsx carries a helper the page does not have
const waitAlert = (page: Page): Promise<unknown> => page.waitForFunction('((document.querySelector("[data-inquiry-error]") || {}).textContent || "").trim() !== ""', undefined, { timeout: UI_TIMEOUT_MS });
interface UiState {
  done: boolean;
  title: string;
  fields: number;
  alert: string;
  contacts: boolean;
  name: string;
  phone: string;
  message: string;
  consent: boolean;
  buttonDisabled: boolean | null;
}
const UI_STATE = `(() => {
  const value = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
  const button = document.querySelector("[data-inquiry-submit]");
  const alertNode = document.querySelector("[data-inquiry-error]");
  const alertText = alertNode && alertNode.firstElementChild && alertNode.firstElementChild.firstChild ? alertNode.firstElementChild.firstChild.textContent : alertNode ? alertNode.textContent : "";
  const title = document.querySelector(".i1-form__done-title");
  const consent = document.getElementById("i1-inquiry-consent");
  return {
    done: document.querySelector("[data-inquiry-status].i1-form__status--done") !== null,
    title: title ? title.textContent : "",
    fields: document.querySelectorAll("[data-inquiry-form] input, [data-inquiry-form] textarea, [data-inquiry-form] select").length,
    alert: (alertText || "").trim(),
    contacts: document.querySelector("[data-inquiry-contacts]") !== null,
    name: value("i1-inquiry-name"),
    phone: value("i1-inquiry-phone"),
    message: value("i1-inquiry-message"),
    consent: consent ? consent.checked : false,
    buttonDisabled: button ? button.disabled : null,
  };
})()`;
const uiState = (page: Page): Promise<UiState> => page.evaluate(UI_STATE);
/** five clicks on the submit button inside ONE script task; answers how many submit events the form saw */
const FIVE_CLICKS = `(() => {
  const button = document.querySelector("[data-inquiry-submit]");
  let submits = 0;
  document.querySelector("[data-inquiry-form]").addEventListener("submit", () => { submits += 1; }, true);
  for (let i = 0; i < 5; i++) button.click();
  return submits;
})()`;

async function scenario(t: Transport, page: Page, origin: string, fx: Fixture, localUrl: string): Promise<void> {
  const m = `C.${t.mode}`;
  const rows = () => leadCount(db, fx.tenantId);

  // 1a. five trusted mouse clicks on the button, as fast as the input pipeline takes them
  {
    const values = typed(t.mode, "1a five mouse clicks");
    t.visitor = freshVisitor();
    await openForm(page, origin, values);
    const before = await rows();
    const from = t.seen.length;
    await page.locator("[data-inquiry-submit]").scrollIntoViewIfNeeded();
    const at = await page.locator("[data-inquiry-submit]").boundingBox();
    await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2, { clickCount: 5, delay: 0 });
    await waitDone(page);
    await sleep(700); // any straggler would have arrived by now
    const sent = posts(t, from);
    const ui = await uiState(page);
    const after = await rows();
    check(
      `${m}.1a submit pressed 5 times (5 trusted mouse clicks in a row)`,
      sent.length === 1 && sent[0]!.status === 200 && ui.done && ui.title === LABELS.successTitle && ui.fields === 0 && after === before + 1,
      "POSTs that reached BoostChat = 1 (200), the page shows the success state (fields removed), LEAD_ROWS +1",
      `POSTs = ${sent.length} (${sent.map((s) => s.status).join(",")}), submission_id ${id8(submissionIdOf(sent[0]?.body ?? "{}"))}, success shown: ${ui.done} ("${ui.title}"), fields left: ${ui.fields}, LEAD_ROWS ${before} -> ${after}`,
    );
  }
  // 1b. five clicks dispatched in ONE script task — before the page can disable its button
  let replayBody = "";
  {
    const values = typed(t.mode, "1b five clicks in one task");
    t.visitor = freshVisitor();
    await openForm(page, origin, values);
    const before = await rows();
    const from = t.seen.length;
    const dispatched: number = await page.evaluate(FIVE_CLICKS);
    await waitDone(page);
    await sleep(700);
    const sent = posts(t, from);
    const ui = await uiState(page);
    const after = await rows();
    replayBody = sent[0]?.body ?? "";
    check(
      `${m}.1b submit pressed 5 times within one script task (the button not yet disabled)`,
      dispatched === 5 && sent.length === 1 && sent[0]!.status === 200 && ui.done && ui.fields === 0 && after === before + 1,
      "5 submit events, POSTs that reached BoostChat = 1 (200), success state, LEAD_ROWS +1",
      `submit events = ${dispatched}, POSTs = ${sent.length} (${sent.map((s) => s.status).join(",")}), success shown: ${ui.done}, LEAD_ROWS ${before} -> ${after}`,
    );
  }
  // 2r. (mode G only) the connection dies before any answer byte, on a connection the browser has
  //     already used: the BROWSER sends the POST again by itself — the page makes one request and
  //     never learns of the failure. Two POSTs reach the server; the id makes them one row.
  if (t.mode === "G") {
    const values = typed(t.mode, "2r connection dies, browser resends");
    t.visitor = freshVisitor();
    await openForm(page, origin, values);
    const before = await rows();
    const from = t.seen.length;
    let pageRequests = 0;
    const count = (request: any): void => {
      if (request.url() === ENDPOINT && request.method() === "POST") pageRequests += 1;
    };
    page.on("request", count);
    t.loseNext = true;
    await page.click("[data-inquiry-submit]");
    await waitDone(page);
    await sleep(700);
    page.off("request", count);
    const sent = posts(t, from);
    const ui = await uiState(page);
    const after = await rows();
    const id = submissionIdOf(sent[0]?.body ?? "{}");
    const forId = id ? await leadCountForSubmission(db, fx.tenantId, id) : -1;
    check(
      `${m}.2r the connection dies before the answer, on an already-used connection`,
      sent.length === 2 && sent[0]!.lost && sent[0]!.status === 200 && (sent[0]!.servedBefore ?? 0) >= 1 && sent[1]!.status === 200 && sent[1]!.body === sent[0]!.body && pageRequests === 1 && ui.done && after === before + 1 && forId === 1,
      "the page makes ONE request; 2 POSTs with the identical body reach BoostChat (the browser's own resend), both 200; success state with no alert; LEAD_ROWS +1 — exactly 1 row for that id",
      `page requests = ${pageRequests}; POSTs at BoostChat = ${sent.length} (${sent.map((s) => `${s.status}${s.lost ? " answer withheld" : ""} on a connection that had served ${s.servedBefore}`).join("; ")}), bodies identical: ${sent[1]?.body === sent[0]?.body}, submission_id ${id8(id)}; success shown: ${ui.done}; LEAD_ROWS ${before} -> ${after}, rows with that id = ${forId}`,
    );
  }
  // 2. the answer is lost, the visitor presses again
  {
    const values = typed(t.mode, "2 lost answer");
    t.visitor = freshVisitor();
    await openForm(page, origin, values);
    const before = await rows();
    const from = t.seen.length;
    if (t.dropIdle) {
      // mode G: on a FRESH connection the browser does not resend — the page gets the network error
      t.freshConnections = true;
      await t.dropIdle();
    }
    t.loseNext = true;
    await page.click("[data-inquiry-submit]");
    await waitAlert(page);
    t.freshConnections = false;
    const failedUi = await uiState(page);
    const first = posts(t, from);
    const afterLost = await rows();
    check(
      `${m}.2a the first answer is lost on the way back`,
      first.length === 1 && first[0]!.status === 200 && first[0]!.lost && afterLost === before + 1 && !failedUi.done && failedUi.alert === LABELS.failure && failedUi.name === values.name && failedUi.phone === values.phone && failedUi.message === values.message && failedUi.consent && failedUi.buttonDisabled === false,
      "BoostChat answered 200 and stored the row, the page shows the failure alert, every input is preserved, the button is ready again",
      `server ${first.map((s) => s.status).join(",")} (answer withheld: ${first[0]?.lost}${first[0]?.servedBefore !== undefined ? `, on a connection that had served ${first[0].servedBefore}` : ""}), LEAD_ROWS ${before} -> ${afterLost}, alert: "${failedUi.alert}" (other contact channels offered: ${failedUi.contacts}), name/phone/message kept: ${failedUi.name === values.name}/${failedUi.phone === values.phone}/${failedUi.message === values.message}, consent kept: ${failedUi.consent}, button disabled: ${failedUi.buttonDisabled}`,
    );
    await page.click("[data-inquiry-submit]");
    await waitDone(page);
    await sleep(700);
    const both = posts(t, from);
    const ui = await uiState(page);
    const after = await rows();
    const idFirst = submissionIdOf(both[0]?.body ?? "{}");
    const idSecond = submissionIdOf(both[1]?.body ?? "{}");
    const forId = idFirst ? await leadCountForSubmission(db, fx.tenantId, idFirst) : -1;
    check(
      `${m}.2b the visitor presses again`,
      both.length === 2 && idFirst !== undefined && idSecond === idFirst && both[1]!.body === both[0]!.body && both[1]!.status === 200 && ui.done && ui.title === LABELS.successTitle && after === afterLost && forId === 1,
      "the SAME submission_id on the wire, 200, success state, NO further row: exactly 1 row for this inquiry (not 2)",
      `submission_id ${id8(idFirst)} -> ${id8(idSecond)} (same: ${idSecond === idFirst}, body identical: ${both[1]?.body === both[0]?.body}), ${both[1]?.status}, success shown: ${ui.done}, LEAD_ROWS ${afterLost} -> ${after}, rows with that id = ${forId}`,
    );
  }
  // 3. the visitor's budget is used up: the page must read the REAL Retry-After across origins
  {
    const window = await settleWindow(db, CLIENT_WINDOW_SECONDS, 150);
    const visitor = freshVisitor();
    const used: number[] = [];
    for (let i = 0; i < CLIENT_MAX; i++) {
      // replays of an inquiry already stored (200, no row), from this visitor
      const res = await loopbackFetch(localUrl, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "X-Real-IP": visitor }, body: replayBody });
      used.push(res.status);
      await res.arrayBuffer();
    }
    const values = typed(t.mode, "3 over budget");
    t.visitor = visitor;
    await openForm(page, origin, values);
    const before = await rows();
    const from = t.seen.length;
    await page.click("[data-inquiry-submit]");
    await waitAlert(page);
    const ui = await uiState(page);
    const sent = posts(t, from);
    const retryAfter = Number(sent[0]?.responseHeaders["retry-after"]);
    const minutes = Math.ceil(retryAfter / 60);
    const expectedAlert = LABELS.rateLimited.replaceAll("{minutes}", String(minutes));
    await page.locator("[data-inquiry-submit]").click({ force: true, timeout: 2_000 }).catch(() => undefined); // a press on the disabled button
    await sleep(500);
    const afterPress = posts(t, from);
    check(
      `${m}.3 the 6th POST of a visitor, from the page`,
      used.every((s) => s === 200) && sent.length === 1 && sent[0]!.status === 429 && minutes >= 3 && ui.alert === expectedAlert && ui.buttonDisabled === true && afterPress.length === 1 && (await rows()) === before,
      'real 429 with Retry-After; the alert names ceil(Retry-After/60) minutes (>= 3, i.e. NOT the 1 minute the door falls back to when it cannot read the header), the button is disabled, a further press makes no request, LEAD_ROWS unchanged',
      `budget: ${used.join(",")}; then ${sent.map((s) => s.status).join(",")}, Retry-After=${sent[0]?.responseHeaders["retry-after"]}, Access-Control-Expose-Headers=${sent[0]?.responseHeaders["access-control-expose-headers"]}; alert: "${ui.alert}" (expected ${minutes} min: ${ui.alert === expectedAlert}), button disabled: ${ui.buttonDisabled}, POSTs of this step after one more press = ${afterPress.length} (still only the 429), LEAD_ROWS ${before} -> ${await rows()}  [${window}s of the window were left]`,
    );
  }
}

// ── run ──────────────────────────────────────────────────────────────────────
let fx: Fixture | undefined;
let sink: MailSink | undefined;
let server: BoostChatServer | undefined;
let site: Awaited<ReturnType<typeof startStatic>> | undefined;
let gateway: Awaited<ReturnType<typeof startGateway>> | undefined;
const browsers: any[] = [];
watchdog(420, () => server?.pid);
const baseline = await leftovers(db);

try {
  section("A. bring-up");
  site = await startStatic();
  fx = await seedFixture(db, "c", [site.origin]);
  sink = await startMailSink(copy);
  server = await startBoostChat({ copy, db, publicKeys: [fx.publicKey], smtpPort: sink.port, logDir, label: "c" });
  const localUrl = `${server.baseUrl}/api/widget/${fx.publicKey}/lead`;
  assertLoopbackHttpUrl(localUrl, "local lead route");
  log(`static:   ${site.origin} serves the package's site/ unmodified (/contact -> contact.html)`);
  log(`seeded:   tenant ${fx.slug} (id ${id8(fx.tenantId)}), widget channel ${id8(fx.channelId)} key ${fx.publicKey.slice(0, 8)}… enabled, allowed_origins=[${site.origin}], owner ${fx.ownerEmail}`);
  log(`server:   ${server.baseUrl} (next start, BUILD_ID ${server.buildId}), WIDGET_SITE_LEAD_KEYS = this key only, Turnstile OFF`);
  log(`mail:     SMTP sink on 127.0.0.1:${sink.port} — no real mail`);
  log(`LEAD_ROWS at start: ${await leadCount(db, fx.tenantId)}`);

  // ── mode R: Playwright route interception (the brief's method) ──────────────
  section("C.R — mode R: context.route -> route.fetch(local BoostChat) -> route.fulfill(real response)");
  {
    const t: Transport = { mode: "R", visitor: "", loseNext: false, seen: [], refused: [], freshConnections: false };
    const browser = await chromium.launch({ headless: true, args: [HOST_RULES] });
    browsers.push(browser);
    {
      // the second layer, checked where it can do no harm: a loopback NAME must not resolve
      const probe = await (await browser.newContext()).newPage();
      const error: string = await probe.goto(`http://localhost:${site.port}/robots.txt`, { timeout: 5_000 }).then(() => "", (e: Error) => e.message.split("\n")[0] ?? "");
      info("C.R.0", `second layer (no name resolves in this browser): http://localhost:<static port>/ -> ${error === "" ? "LOADED — the resolver rule is NOT active" : error.replace(/ at .*/, "")}`);
      await probe.context().close();
    }
    const context = await browser.newContext({ locale: "ko-KR" });
    let preflightsSurfaced = 0;
    let originOnWire = "";
    await context.route("**/*", async (route: any) => {
      const request = route.request();
      const url: string = request.url();
      if (url.startsWith(`${site!.origin}/`)) return route.continue();
      if (url !== ENDPOINT) {
        t.refused.push(`${new URL(url).host}${new URL(url).pathname} (aborted by the route)`);
        return route.abort("blockedbyclient");
      }
      const method: string = request.method();
      if (method === "OPTIONS") preflightsSurfaced += 1;
      const headers: Record<string, string> = await request.allHeaders();
      if (method === "POST") originOnWire = headers["origin"] ?? "";
      const lose = method === "POST" && t.loseNext;
      if (lose) t.loseNext = false;
      const response = await route.fetch({ url: localUrl, method, headers: { ...headers, "x-real-ip": t.visitor }, postData: request.postDataBuffer() ?? undefined, maxRedirects: 0 });
      t.seen.push({ method, status: response.status(), body: request.postData() ?? "", lost: lose, requestHeaders: headers, responseHeaders: response.headers() });
      if (lose) return route.abort("failed"); // BoostChat answered; the answer never reaches the page
      return route.fulfill({ response });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(UI_TIMEOUT_MS);
    await scenario(t, page, site.origin, fx, localUrl);
    const post = t.seen.find((s) => s.method === "POST" && s.status === 200);
    check(
      "C.R.4 what the browser put on the wire, and what it was given back",
      originOnWire === site.origin && post?.requestHeaders["content-type"] === "application/json" && post.requestHeaders["cookie"] === undefined && post.responseHeaders["access-control-allow-origin"] === site.origin && post.responseHeaders["access-control-allow-credentials"] === undefined,
      `Origin=${site.origin} set by the browser, Content-Type application/json, no cookie; answer: Access-Control-Allow-Origin=${site.origin}, no Allow-Credentials`,
      `Origin=${originOnWire}, Content-Type=${post?.requestHeaders["content-type"]}, cookie sent: ${post?.requestHeaders["cookie"] !== undefined}; answer: Allow-Origin=${post?.responseHeaders["access-control-allow-origin"]}, Allow-Credentials=${post?.responseHeaders["access-control-allow-credentials"] ?? "absent"}`,
    );
    info("C.R.5", `CORS preflights that surfaced to the route handler: ${preflightsSurfaced} — Playwright fulfils a preflight itself while interception is on, so mode R does NOT exercise BoostChat's OPTIONS handler (mode G does)`);
    info("C.R.6", `requests refused: ${t.refused.length === 0 ? "none" : [...new Set(t.refused)].join("; ")}`);
    info("C.R.7", `reached BoostChat: ${t.seen.map((s) => `${s.method} ${s.status}${s.lost ? " (answer withheld)" : ""}`).join(", ")}`);
    await context.close();
    await browser.close();
  }

  // ── mode G: no interception — the browser's own preflight meets the real route ──
  section("C.G — mode G: no interception; loopback proxy -> loopback TLS relay -> local BoostChat");
  {
    const t: Transport = { mode: "G", visitor: "", loseNext: false, seen: [], refused: [], freshConnections: false };
    gateway = await startGateway(t, server.baseUrl, fx.publicKey);
    const browser = await chromium.launch({ headless: true, proxy: { server: `http://127.0.0.1:${gateway.proxyPort}`, bypass: "127.0.0.1" }, args: [HOST_RULES] });
    browsers.push(browser);
    const context = await browser.newContext({ locale: "ko-KR", ignoreHTTPSErrors: true });
    // is the proxy really what this browser uses? asked with a name that exists nowhere (.invalid), on a page of its own
    const probe = await context.newPage();
    await probe.goto("https://probe.invalid/", { timeout: 5_000 }).catch(() => undefined);
    await probe.close();
    const page = await context.newPage();
    page.setDefaultTimeout(UI_TIMEOUT_MS);
    const proxied = gateway.connects.includes("probe.invalid:443");
    check("C.G.0 the browser can only reach the gateway", proxied, "a tunnel request for probe.invalid:443 arrives at the loopback gateway and is refused there", `gateway saw: ${gateway.connects.join(", ") || "nothing"}`);
    if (proxied) {
      await scenario(t, page, site.origin, fx, localUrl);
      const preflights = t.seen.filter((s) => s.method === "OPTIONS");
      const first = preflights[0];
      const firstPostIndex = t.seen.findIndex((s) => s.method === "POST");
      check(
        "C.G.4 the browser's OWN preflight, answered by the real route",
        preflights.length >= 1 && t.seen.indexOf(first!) < firstPostIndex && first!.status === 204 && first!.requestHeaders["origin"] === site.origin && first!.requestHeaders["access-control-request-method"] === "POST" && first!.requestHeaders["access-control-request-headers"] === "content-type" && first!.responseHeaders["access-control-allow-origin"] === site.origin && first!.responseHeaders["access-control-allow-headers"] === "content-type",
        `an OPTIONS before the first POST (Origin=${site.origin}, Access-Control-Request-Method=POST, Access-Control-Request-Headers=content-type) answered 204 with Allow-Origin=${site.origin}, Allow-Headers=content-type — and the browser then sent the POST`,
        `preflights that reached BoostChat: ${preflights.length} (${preflights.map((p) => p.status).join(",")}); first: Origin=${first?.requestHeaders["origin"]}, Request-Method=${first?.requestHeaders["access-control-request-method"]}, Request-Headers=${first?.requestHeaders["access-control-request-headers"]}, other access-control-request-*: ${Object.keys(first?.requestHeaders ?? {}).filter((k) => k.startsWith("access-control-request-") && k !== "access-control-request-method" && k !== "access-control-request-headers").join(",") || "none"} -> ${first?.status}, Allow-Origin=${first?.responseHeaders["access-control-allow-origin"]}, Allow-Methods=${first?.responseHeaders["access-control-allow-methods"]}, Allow-Headers=${first?.responseHeaders["access-control-allow-headers"]}, Max-Age=${first?.responseHeaders["access-control-max-age"]}`,
      );
      const post = t.seen.find((s) => s.method === "POST" && s.status === 200);
      check(
        "C.G.5 what the browser put on the wire",
        post?.requestHeaders["origin"] === site.origin && post.requestHeaders["content-type"] === "application/json" && post.requestHeaders["cookie"] === undefined,
        `Origin=${site.origin} set by the browser, Content-Type application/json, no cookie`,
        `Origin=${post?.requestHeaders["origin"]}, Content-Type=${post?.requestHeaders["content-type"]}, cookie sent: ${post?.requestHeaders["cookie"] !== undefined}, sec-fetch-mode=${post?.requestHeaders["sec-fetch-mode"]}, sec-fetch-site=${post?.requestHeaders["sec-fetch-site"]}`,
      );
      {
        // 8. the SAME page from an origin that is NOT registered for the channel (a second static server)
        const stranger = await startStatic();
        try {
          const values = typed("G", "8 unregistered origin");
          t.visitor = freshVisitor();
          const before = await leadCount(db, fx.tenantId);
          const from = t.seen.length;
          await openForm(page, stranger.origin, values);
          await page.click("[data-inquiry-submit]");
          await waitAlert(page);
          const ui = await uiState(page);
          const reached = t.seen.slice(from);
          const after = await leadCount(db, fx.tenantId);
          check(
            "C.G.8 negative control: the page served from an origin that is not registered",
            reached.length >= 1 && reached.every((s) => s.method === "OPTIONS" && s.status === 403 && s.responseHeaders["access-control-allow-origin"] === undefined) && ui.alert === LABELS.failure && ui.contacts && !ui.done && after === before,
            "the browser's preflight gets the route's uniform 403 without CORS headers, so the browser never sends the POST; the page shows the failure alert with the other contact channels; LEAD_ROWS unchanged",
            `reached BoostChat: ${reached.map((s) => `${s.method} ${s.status} (Allow-Origin ${s.responseHeaders["access-control-allow-origin"] ?? "absent"})`).join(", ")}; alert: "${ui.alert}" (other contact channels offered: ${ui.contacts}); LEAD_ROWS ${before} -> ${after}`,
          );
        } finally {
          await stranger.close();
        }
      }
      info("C.G.6", `tunnels asked of the gateway: ${[...new Set(gateway.connects)].join(", ")}; refused / not relayed: ${t.refused.length === 0 ? "none" : [...new Set(t.refused)].join("; ")}`);
      info("C.G.7", `reached BoostChat: ${t.seen.map((s) => `${s.method} ${s.status}${s.lost ? " (answer withheld)" : ""}`).join(", ")}`);
    }
    await context.close();
    await browser.close();
  }

  section("notifications");
  {
    const total = await leadCount(db, fx.tenantId);
    const mails = await sink.settledCountFor(fx, total);
    check("C.N one owner notification per stored row", mails === total, "mails in the sink for this tenant = LEAD_ROWS", `mails = ${mails}, LEAD_ROWS = ${total}`);
  }
} catch (err) {
  check("C.run", false, "the run completes", `aborted: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`);
} finally {
  section("teardown");
  for (const browser of browsers) await browser.close().catch(() => undefined);
  if (gateway) await gateway.close().catch(() => undefined);
  if (site) await site.close();
  if (server) {
    const stopped = await server.stop();
    const { tags, leaked } = serverLogTags(server.logFile, ["trackb-inquiry-v2-e2e] synthetic", "010-0000-0000", "E2E Tester"]);
    log(`servers stopped: BoostChat ${stopped ? "yes" : "NO"} (port ${server.port} free), static ${site && !(await portInUse(site.port)) ? "yes" : "NO"}, gateway ${gateway ? (!(await portInUse(gateway.proxyPort)) ? "yes" : "NO") : "not started"}, browsers closed`);
    log(`server log lines (the route throttles its warnings — a count of LINES, not of events): ${Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    check("C.log the server log", tags["site_lead_schema_behind"] === 0 && tags["site_lead_failed"] === 0 && tags["site_lead_store_rejected"] === 0 && tags["site_lead_client_limit_skipped"] === 0 && leaked.length === 0, "no schema_behind / failed / store_rejected / limit_skipped line, no form content in the log", `schema_behind=${tags["site_lead_schema_behind"]}, failed=${tags["site_lead_failed"]}, store_rejected=${tags["site_lead_store_rejected"]}, limit_skipped=${tags["site_lead_client_limit_skipped"]}, form content found: ${leaked.length}`);
  }
  if (sink) await sink.close();
  if (fx) {
    const removed = await cleanupFixture(db, fx);
    log(`cleaned up: tenant ${removed.tenants} (with ${removed.leads} lead rows, its widget channel and membership by cascade), owner user ${removed.users}, rate-limit buckets ${removed.buckets}`);
  }
  const left = await leftovers(db);
  check("C.cleanup nothing of this harness is left in the test database", left.tenants === baseline.tenants && left.users === baseline.users && left.leads === baseline.leads, `fixtures under "trackb-inquiry-v2-e2e-" as before the run (${baseline.tenants} tenants, ${baseline.users} users, ${baseline.leads} leads)`, `${left.tenants} tenants, ${left.users} users, ${left.leads} leads`);
  await db.end();
}

const { passed, failed } = summary();
section("result");
log(`${passed} passed, ${failed.length} failed${failed.length > 0 ? `: ${failed.join("; ")}` : ""}`);
log(`finished: ${new Date().toISOString()}`);
process.exit(failed.length > 0 ? 1 : 0);
