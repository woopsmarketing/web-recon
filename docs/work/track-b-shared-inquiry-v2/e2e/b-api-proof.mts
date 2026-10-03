/**
 * B — API-level proof. Track B's REAL inquiry door (platform/site/inquiry-client.ts,
 * createInquirySender) is driven from Node against a LOCAL BoostChat (the isolated copy, `next
 * start`) on the local TEST database. Rows are counted directly in SQL (LEAD_ROWS = rows of
 * lead_request for this run's tenant).
 *
 * The door only ever sees the endpoint the site declares (an https production URL). A wrapper
 * installed as globalThis.fetch rewrites exactly that URL to the local route of this run's test
 * channel, adds the `Origin` header a browser would add (the registered site origin) and the
 * `X-Real-IP` header BoostChat's edge adds (the visitor seam of BoostChat's own tests), and
 * refuses every other URL. Nothing leaves 127.0.0.1.
 *
 *   BOOSTCHAT_E2E_COPY=<copy> ./node_modules/.bin/tsx --tsconfig platform/tsconfig.json \
 *     docs/work/track-b-shared-inquiry-v2/e2e/b-api-proof.mts
 */
import path from "node:path";
import { createInquirySender, type InquiryResult, type InquirySubmission } from "../../../../platform/site/inquiry-client.ts";
import {
  TRACK_B_ROOT,
  assertLeadSchema,
  boostChatCommit,
  boostChatCopy,
  check,
  cleanupFixture,
  declaredEndpoint,
  freshVisitor,
  id8,
  info,
  leadCount,
  leadCountForSubmission,
  leadRows,
  leftovers,
  log,
  loopbackFetch,
  openTestDb,
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

/** the registered site origin of this run (production: the customer site's https origin; here a loopback one) */
const SITE_ORIGIN = "http://127.0.0.1:4173";
const RECEIVED = '{"received":true}';
const CONFLICT = '{"error":"idempotency_conflict"}';
const CLIENT_WINDOW_SECONDS = 600;
const CLIENT_MAX = 5;

const copy = boostChatCopy();
const ENDPOINT = declaredEndpoint();
const db = await openTestDb(copy);

log("LOCAL E2E idempotency proof — B (API level, the real door from Node)");
log(`started:            ${new Date().toISOString()}`);
log(`boostchat commit:   ${boostChatCommit(copy)} (isolated git-archive copy)`);
log(`database:           ${db.database} on loopback (name contains "test": yes)`);
log(`migration 0055:     ${await assertLeadSchema(db)}`);
log(`door:               platform/site/inquiry-client.ts sha256 ${sha256File(path.join(TRACK_B_ROOT, "platform", "site", "inquiry-client.ts")).slice(0, 16)}…`);
log(`declared endpoint:  https://${new URL(ENDPOINT).host}/api/widget/<declared key>/lead  (rewritten to the local server — never contacted)`);

let fx: Fixture | undefined;
let sink: MailSink | undefined;
let server: BoostChatServer | undefined;
let stopped = false;
watchdog(300, () => server?.pid);
const baseline = await leftovers(db);

// ── the wire ────────────────────────────────────────────────────────────────
interface Wire {
  via: "door" | "raw";
  visitor: string;
  body: string;
  /** undefined: the request was not forwarded to the server */
  status: number | undefined;
  text: string;
  retryAfter: string | null;
  allowOrigin: string | null;
  expose: string | null;
}
const wire: Wire[] = [];
const doorRequests = (): Wire[] => wire.filter((w) => w.via === "door");
const submissionIdOf = (body: string): string | undefined => {
  const id = (JSON.parse(body) as { submission_id?: unknown }).submission_id;
  return typeof id === "string" ? id : undefined;
};

/** how the wrapper treats the door's NEXT requests */
type Mode =
  | "pass" // forwarded, answer returned
  | "capture-only" // NOT forwarded: recorded, then a network error (the request never left)
  | "lose-answer" // forwarded and answered by the server, then a network error (the answer is lost)
  | "prestore-different"; // a DIFFERENT inquiry is first stored under the same id, then forwarded (→ a real 409)
const net = { mode: "pass" as Mode, visitor: "" };
let localUrl = "";

async function post(via: "door" | "raw", body: string, visitor: string, signal?: AbortSignal | null): Promise<{ entry: Wire; response: Response }> {
  const response = await loopbackFetch(localUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: SITE_ORIGIN, "X-Real-IP": visitor },
    body,
    signal: signal ?? AbortSignal.timeout(30_000),
  });
  const entry: Wire = {
    via,
    visitor,
    body,
    status: response.status,
    text: await response.clone().text(),
    retryAfter: response.headers.get("retry-after"),
    allowOrigin: response.headers.get("access-control-allow-origin"),
    expose: response.headers.get("access-control-expose-headers"),
  };
  wire.push(entry);
  return { entry, response };
}
/** a request NOT made by the door (a replay, a tampered body, a legacy client) */
const rawPost = async (body: string, visitor: string): Promise<Wire> => (await post("raw", body, visitor)).entry;

// the door's fetch: only the declared endpoint, rewritten to loopback
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url !== ENDPOINT) throw new Error("refused: the door asked for a URL other than the declared endpoint");
  if (init?.method !== "POST" || typeof init.body !== "string") throw new Error("refused: not the door's POST");
  const body = init.body;
  if (net.mode === "capture-only") {
    wire.push({ via: "door", visitor: net.visitor, body, status: undefined, text: "", retryAfter: null, allowOrigin: null, expose: null });
    throw new TypeError("simulated: the request never left the page");
  }
  if (net.mode === "prestore-different") {
    const other = JSON.stringify({ ...(JSON.parse(body) as Record<string, unknown>), message: `${String((JSON.parse(body) as { message: string }).message)} (a different text stored first under the same id)` });
    await rawPost(other, freshVisitor());
  }
  const { response } = await post("door", body, net.visitor, init.signal);
  if (net.mode === "lose-answer") {
    await response.arrayBuffer();
    throw new TypeError("simulated: the answer was lost on the way back");
  }
  return response;
}) as typeof fetch;

const inquiry = (label: string): InquirySubmission => ({
  consent: true,
  name: "E2E Tester",
  phone: "010-0000-0000",
  message: `[trackb-inquiry-v2-e2e] synthetic inquiry ${label}`,
  hp: "",
});
const describe = (r: InquiryResult): string => (r.status === "ok" ? "ok" : `failed/${r.reason}${r.wait ? ` wait=${r.wait.seconds}s` : ""}`);
const tally = (entries: Wire[]): string => {
  const counts = new Map<string, number>();
  for (const e of entries) {
    const key = `${e.status}${e.status === 429 ? ` ${(JSON.parse(e.text) as { error?: string }).error}` : ""}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort()
    .map(([k, n]) => `${n}x${k}`)
    .join(" + ");
};

try {
  // ── A. bring-up ─────────────────────────────────────────────────────────────
  section("A. bring-up");
  fx = await seedFixture(db, "b", [SITE_ORIGIN]);
  sink = await startMailSink(copy);
  server = await startBoostChat({ copy, db, publicKeys: [fx.publicKey], smtpPort: sink.port, logDir: path.join(copy, "..", "logs"), label: "b" });
  localUrl = `${server.baseUrl}/api/widget/${fx.publicKey}/lead`;
  const rows = () => leadCount(db, fx!.tenantId);
  log(`seeded:   tenant ${fx.slug} (id ${id8(fx.tenantId)}), widget channel ${id8(fx.channelId)} key ${fx.publicKey.slice(0, 8)}… enabled, allowed_origins=[${SITE_ORIGIN}], owner ${fx.ownerEmail}`);
  log(`server:   ${server.baseUrl} (next start, BUILD_ID ${server.buildId}), WIDGET_SITE_LEAD_KEYS = this key only, Turnstile OFF`);
  log(`mail:     SMTP sink on 127.0.0.1:${sink.port} (BoostChat's scripts/smtp-sink.ts) — no real mail`);
  log(`LEAD_ROWS at start: ${await rows()}`);

  // ── B0. the gate is the real one ────────────────────────────────────────────
  section("B0. the route's gate and CORS answers (nothing is weakened)");
  {
    const preflight = await loopbackFetch(localUrl, { method: "OPTIONS", headers: { Origin: SITE_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" } });
    const h = preflight.headers;
    check(
      "B0.1 preflight, registered origin",
      preflight.status === 204 && h.get("access-control-allow-origin") === SITE_ORIGIN && h.get("access-control-allow-methods") === "POST" && h.get("access-control-allow-headers") === "content-type" && h.get("access-control-allow-credentials") === null,
      `204, Allow-Origin=${SITE_ORIGIN}, Allow-Methods=POST, Allow-Headers=content-type, no Allow-Credentials`,
      `${preflight.status}, Allow-Origin=${h.get("access-control-allow-origin")}, Allow-Methods=${h.get("access-control-allow-methods")}, Allow-Headers=${h.get("access-control-allow-headers")}, Max-Age=${h.get("access-control-max-age")}, Allow-Credentials=${h.get("access-control-allow-credentials")}`,
    );
    const before = await rows();
    const body = JSON.stringify({ ...inquiry("gate"), submission_id: crypto.randomUUID() });
    const foreign = await loopbackFetch(localUrl, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:4174", "X-Real-IP": freshVisitor() }, body });
    const none = await loopbackFetch(localUrl, { method: "POST", headers: { "Content-Type": "application/json", "X-Real-IP": freshVisitor() }, body });
    const otherKey = await loopbackFetch(`${server.baseUrl}/api/widget/wgt_${"A".repeat(32)}/lead`, { method: "POST", headers: { "Content-Type": "application/json", Origin: SITE_ORIGIN, "X-Real-IP": freshVisitor() }, body });
    check(
      "B0.2 unregistered origin / no Origin / key not opted in",
      foreign.status === 403 && none.status === 403 && otherKey.status === 403 && foreign.headers.get("access-control-allow-origin") === null && (await rows()) === before,
      "403 + 403 + 403, no Access-Control-Allow-Origin, LEAD_ROWS unchanged",
      `${foreign.status} + ${none.status} + ${otherKey.status}, Allow-Origin=${foreign.headers.get("access-control-allow-origin")}, LEAD_ROWS ${before} -> ${await rows()}`,
    );
  }

  // ── B1. FORM-ID-14 ──────────────────────────────────────────────────────────
  section("B1. FORM-ID-14 — one logical submission sent 10 times concurrently -> one row");
  let mailsAfterConcurrent = 0;
  {
    // the door itself: 10 concurrent calls of ONE sender with the same values
    const before = await rows();
    const wireBefore = doorRequests().length;
    const send = createInquirySender(ENDPOINT);
    net.mode = "pass";
    net.visitor = freshVisitor();
    const p = inquiry("B1 join");
    const results = await Promise.all(Array.from({ length: 10 }, () => send(p)));
    const made = doorRequests().length - wireBefore;
    check(
      "B1.1 door: 10 concurrent calls of the sender join ONE request",
      made === 1 && results.every((r) => r.status === "ok") && (await rows()) === before + 1,
      "HTTP requests = 1, 10 results ok, LEAD_ROWS +1",
      `HTTP requests = ${made} (status ${doorRequests().at(-1)?.status}), results = ${results.filter((r) => r.status === "ok").length}x ok, LEAD_ROWS ${before} -> ${await rows()}`,
    );
  }
  {
    // (a) 10 distinct visitors. The body is the door's own: captured from its first request, which
    //     is NOT forwarded — so no row exists yet and the 10 requests really race for the insert.
    const before = await rows();
    const mailsBefore = await sink.settledCountFor(fx, before);
    const send = createInquirySender(ENDPOINT);
    const p = inquiry("B1a ten visitors");
    net.mode = "capture-only";
    net.visitor = freshVisitor();
    const first = await send(p);
    const bodyA = doorRequests().at(-1)!.body;
    const idA = submissionIdOf(bodyA)!;
    const afterCapture = await rows();
    const replies = await Promise.all(Array.from({ length: 10 }, () => rawPost(bodyA, freshVisitor())));
    const after = await rows();
    const forA = await leadCountForSubmission(db, fx.tenantId, idA);
    check(
      "B1.2 (a) the door's exact body (id A), 10 concurrent POSTs from 10 visitors",
      replies.every((r) => r.status === 200 && r.text === RECEIVED) && after === before + 1 && forA === 1 && afterCapture === before,
      `10x200 ${RECEIVED}, LEAD_ROWS +1, rows with submission_id A = 1`,
      `${tally(replies)}, bodies all ${RECEIVED}: ${replies.every((r) => r.text === RECEIVED)}, LEAD_ROWS ${before} -> ${after}, rows with id A (${id8(idA)}) = ${forA}  [door's captured first request: ${describe(first)}, not forwarded]`,
    );
    mailsAfterConcurrent = await sink.settledCountFor(fx, mailsBefore + 1);
    const rowA = (await leadRows(db, fx.tenantId)).find((r) => r.submission_id === idA);
    check(
      "B6.1 owner notifications for the 10-concurrent case",
      mailsAfterConcurrent - mailsBefore === 1 && rowA?.notified === true,
      "exactly 1 mail in the SMTP sink for this tenant's owner, the row's notified_at set",
      `mails ${mailsBefore} -> ${mailsAfterConcurrent} (+${mailsAfterConcurrent - mailsBefore}), notified_at set: ${rowA?.notified}`,
    );
    // the visitor presses again: the door resends the same id — byte-identical body — and stores nothing
    net.mode = "pass";
    net.visitor = freshVisitor();
    const again = await send(p);
    const resent = doorRequests().at(-1)!;
    check(
      "B1.3 the door's own retry after that (same values) carries the same body",
      again.status === "ok" && resent.body === bodyA && (await rows()) === after,
      "byte-identical body (same submission_id), result ok, LEAD_ROWS unchanged",
      `identical: ${resent.body === bodyA}, status ${resent.status}, result ${describe(again)}, LEAD_ROWS ${after} -> ${await rows()}`,
    );
  }
  {
    // (b) ONE visitor: the 10-minute budget of 5 POSTs applies to every POST, replays included
    const window = await settleWindow(db, CLIENT_WINDOW_SECONDS, 20);
    const before = await rows();
    const send = createInquirySender(ENDPOINT);
    net.mode = "capture-only";
    net.visitor = freshVisitor();
    await send(inquiry("B1b one visitor"));
    const bodyB = doorRequests().at(-1)!.body;
    const idB = submissionIdOf(bodyB)!;
    const visitor = freshVisitor();
    const replies = await Promise.all(Array.from({ length: 10 }, () => rawPost(bodyB, visitor)));
    const ok = replies.filter((r) => r.status === 200).length;
    const limited = replies.filter((r) => r.status === 429 && r.text === '{"error":"rate_limited"}').length;
    const after = await rows();
    const forB = await leadCountForSubmission(db, fx.tenantId, idB);
    check(
      "B1.4 (b) a fresh submission (id B), 10 concurrent POSTs from ONE visitor",
      ok + limited === 10 && ok === CLIENT_MAX && after === before + 1 && forB === 1,
      `a mix: ${CLIENT_MAX}x200 + ${10 - CLIENT_MAX}x429 rate_limited, LEAD_ROWS +1, rows with submission_id B = 1`,
      `${tally(replies)}, LEAD_ROWS ${before} -> ${after}, rows with id B (${id8(idB)}) = ${forB}  [${window}s of the budget window were left]`,
    );
  }

  // ── B2. same id: replay and conflict ────────────────────────────────────────
  section("B2. A+P -> 200, A+P again -> 200 without a row, A + changed P -> 409");
  const sender2 = createInquirySender(ENDPOINT);
  const p2 = inquiry("B2");
  let body2 = "";
  let id2 = "";
  {
    const before = await rows();
    net.mode = "pass";
    net.visitor = freshVisitor();
    const first = await sender2(p2);
    const sent = doorRequests().at(-1)!;
    body2 = sent.body;
    id2 = submissionIdOf(body2)!;
    const afterFirst = await rows();
    check("B2.1 A+P through the door", first.status === "ok" && sent.status === 200 && sent.text === RECEIVED && afterFirst === before + 1, `200 ${RECEIVED}, LEAD_ROWS +1`, `${sent.status} ${sent.text}, door ${describe(first)}, LEAD_ROWS ${before} -> ${afterFirst}`);

    const replay = await rawPost(body2, freshVisitor());
    const afterReplay = await rows();
    check("B2.2 A+P again (the same body, replayed)", replay.status === 200 && replay.text === RECEIVED && afterReplay === afterFirst, `200 ${RECEIVED} (idempotent), LEAD_ROWS unchanged`, `${replay.status} ${replay.text}, LEAD_ROWS ${afterFirst} -> ${afterReplay}`);

    const stored = (await leadRows(db, fx.tenantId)).find((r) => r.submission_id === id2)!;
    const changed = JSON.stringify({ ...(JSON.parse(body2) as Record<string, unknown>), message: `${p2.message} (changed)` });
    const conflict = await rawPost(changed, freshVisitor());
    const afterConflict = await rows();
    const still = (await leadRows(db, fx.tenantId)).find((r) => r.submission_id === id2)!;
    check(
      "B2.3 A + changed P (the id reused with another message)",
      conflict.status === 409 && conflict.text === CONFLICT && afterConflict === afterFirst && still.message_md5 === stored.message_md5 && conflict.allowOrigin === SITE_ORIGIN,
      `409 ${CONFLICT} with CORS headers, LEAD_ROWS unchanged, the stored row untouched`,
      `${conflict.status} ${conflict.text}, Allow-Origin=${conflict.allowOrigin}, LEAD_ROWS ${afterFirst} -> ${afterConflict}, stored message unchanged: ${still.message_md5 === stored.message_md5}`,
    );
  }

  // ── B3. the door's memory of ids ────────────────────────────────────────────
  section("B3. the door's client state");
  {
    // after a confirmed 200 the id is dropped: the same values sent again are a NEW logical inquiry
    const before = await rows();
    net.mode = "pass";
    net.visitor = freshVisitor();
    const again = await sender2(p2);
    const sent = doorRequests().at(-1)!;
    const newId = submissionIdOf(sent.body)!;
    check(
      "B3.1 after the 200, the same values sent again",
      again.status === "ok" && newId !== id2 && (await rows()) === before + 1,
      "a NEW submission_id, 200, LEAD_ROWS +1 — a second LOGICAL inquiry (the first was confirmed), not a duplicate of the first",
      `id ${id8(id2)} -> ${id8(newId)} (different: ${newId !== id2}), ${sent.status}, LEAD_ROWS ${before} -> ${await rows()}`,
    );
  }
  {
    // the answer is lost: the server stored the inquiry, the door only sees a network error
    const before = await rows();
    const send = createInquirySender(ENDPOINT);
    const p = inquiry("B3 lost answer");
    net.mode = "lose-answer";
    net.visitor = freshVisitor();
    const lost = await send(p);
    const first = doorRequests().at(-1)!;
    const afterLost = await rows();
    net.mode = "pass";
    const retry = await send(p);
    const second = doorRequests().at(-1)!;
    const after = await rows();
    check(
      "B3.2 lost answer, then the visitor presses again",
      lost.status === "failed" && lost.reason === "network" && first.status === 200 && afterLost === before + 1 && retry.status === "ok" && submissionIdOf(second.body) === submissionIdOf(first.body) && second.body === first.body && after === afterLost,
      "1st: server 200 (row stored) but the door reports failed/network; 2nd: the SAME submission_id -> 200, NO additional row",
      `1st: server ${first.status}, door ${describe(lost)}, LEAD_ROWS ${before} -> ${afterLost}; 2nd: id ${id8(submissionIdOf(first.body))} -> ${id8(submissionIdOf(second.body))} (same: ${second.body === first.body}), ${second.status}, door ${describe(retry)}, LEAD_ROWS ${afterLost} -> ${after}`,
    );
  }
  {
    // the answer is lost, then the visitor EDITS the message, then goes BACK to the first text
    const before = await rows();
    const send = createInquirySender(ENDPOINT);
    const original = inquiry("B3 lost then edited");
    const edited = { ...original, message: `${original.message} — edited by the visitor` };
    net.mode = "lose-answer";
    net.visitor = freshVisitor();
    const lost = await send(original);
    const first = doorRequests().at(-1)!;
    const afterLost = await rows();
    net.mode = "pass";
    const second = await send(edited);
    const sentEdited = doorRequests().at(-1)!;
    const afterEdited = await rows();
    check(
      "B3.3 lost answer, then the visitor edits the message",
      lost.status === "failed" && lost.reason === "network" && afterLost === before + 1 && second.status === "ok" && submissionIdOf(sentEdited.body) !== submissionIdOf(first.body) && afterEdited === afterLost + 1,
      "the edited text gets a NEW submission_id -> 200 and a new row (two rows in all: the stored-but-unconfirmed first text, and the edited one — two different inquiries)",
      `1st: server ${first.status}, door ${describe(lost)}, LEAD_ROWS ${before} -> ${afterLost}; edited: id ${id8(submissionIdOf(first.body))} -> ${id8(submissionIdOf(sentEdited.body))} (different: ${submissionIdOf(sentEdited.body) !== submissionIdOf(first.body)}), ${sentEdited.status}, LEAD_ROWS ${afterLost} -> ${afterEdited}`,
    );
    // back to the EARLIER values: the door kept their id (never confirmed, never refused) → nothing is stored twice
    const third = await send(original);
    const sentBack = doorRequests().at(-1)!;
    const afterBack = await rows();
    const forFirst = await leadCountForSubmission(db, fx.tenantId, submissionIdOf(first.body)!);
    check(
      "B3.4 … and then goes BACK to the earlier text",
      third.status === "ok" && sentBack.body === first.body && afterBack === afterEdited && forFirst === 1,
      "the EARLIER submission_id is reused (byte-identical body) -> 200, NO additional row: the stored-but-unconfirmed inquiry is not stored twice",
      `id ${id8(submissionIdOf(sentBack.body))} = first id ${id8(submissionIdOf(first.body))}: ${sentBack.body === first.body}, ${sentBack.status}, door ${describe(third)}, LEAD_ROWS ${afterEdited} -> ${afterBack}, rows with the first id = ${forFirst}`,
    );
  }
  {
    // while a request is on its way: same values join, other values are refused locally
    const before = await rows();
    const wireBefore = doorRequests().length;
    const send = createInquirySender(ENDPOINT);
    const p = inquiry("B3 in flight");
    net.mode = "pass";
    net.visitor = freshVisitor();
    const running = send(p);
    const joined = send(p);
    const other = await send({ ...p, message: `${p.message} — other values while the first is on its way` });
    const [a, b] = await Promise.all([running, joined]);
    const made = doorRequests().length - wireBefore;
    check(
      "B3.5 a call with DIFFERENT values while a request is on its way",
      a.status === "ok" && b.status === "ok" && other.status === "failed" && other.reason === "unknown" && made === 1 && (await rows()) === before + 1,
      "refused locally (failed/unknown) without a request; the request on its way is unaffected: HTTP requests = 1, LEAD_ROWS +1",
      `other values: ${describe(other)}; same values: ${describe(a)} / ${describe(b)}; HTTP requests = ${made}, LEAD_ROWS ${before} -> ${await rows()}`,
    );
  }
  {
    // a REAL 409 reaches the door: the id it sent already belongs to a different inquiry on the server
    const before = await rows();
    const send = createInquirySender(ENDPOINT);
    const p = inquiry("B3 conflict");
    net.mode = "prestore-different";
    net.visitor = freshVisitor();
    const wireBefore = doorRequests().length;
    const refused = await send(p);
    const conflicted = doorRequests().at(-1)!;
    const afterConflict = await rows();
    net.mode = "pass";
    await sleep(1_500); // nothing may be sent again by itself
    const autoResends = doorRequests().length - wireBefore - 1;
    const next = await send(p);
    const sentNext = doorRequests().at(-1)!;
    const after = await rows();
    check(
      "B3.6 a real 409 fed back to the door",
      refused.status === "failed" && refused.reason === "conflict" && refused.wait === undefined && conflicted.status === 409 && conflicted.text === CONFLICT && autoResends === 0 && afterConflict === before + 1 && next.status === "ok" && submissionIdOf(sentNext.body) !== submissionIdOf(conflicted.body) && after === afterConflict + 1,
      `server 409 ${CONFLICT} -> door failed/conflict, 0 automatic resends, the door's own inquiry NOT stored; the next press: a NEW submission_id -> 200, LEAD_ROWS +1`,
      `server ${conflicted.status} ${conflicted.text} -> door ${describe(refused)}, automatic resends in 1.5s = ${autoResends}, LEAD_ROWS ${before} -> ${afterConflict} (+1 = the different inquiry stored first under that id); next press: id ${id8(submissionIdOf(conflicted.body))} -> ${id8(submissionIdOf(sentNext.body))}, ${sentNext.status}, door ${describe(next)}, LEAD_ROWS ${afterConflict} -> ${after}`,
    );
  }

  // ── B4. source and the body allow-list ──────────────────────────────────────
  section("B4. source = website_form is the server's; the body allow-list is strict");
  {
    const doorBodies = doorRequests().map((w) => Object.keys(JSON.parse(w.body) as Record<string, unknown>).sort().join(","));
    const shapes = [...new Set(doorBodies)];
    const all = await leadRows(db, fx.tenantId);
    const fromForm = all.filter((r) => r.source === "website_form").length;
    const withId = all.filter((r) => r.submission_id !== null).length;
    check(
      "B4.1 every row so far (all sent with the door's body shape)",
      shapes.length === 1 && shapes[0] === "consent,hp,message,name,phone,submission_id" && fromForm === all.length && withId === all.length && all.length > 0,
      "the door's body keys are exactly consent,hp,message,name,phone,submission_id (no `source`); every row has source='website_form' and submission_id NOT NULL",
      `door body key sets: [${shapes.join(" | ")}] over ${doorBodies.length} door requests; rows ${all.length}: source='website_form' ${fromForm}, submission_id NOT NULL ${withId}`,
    );

    const before = await rows();
    const withSource = await rawPost(JSON.stringify({ ...inquiry("B4 source"), submission_id: crypto.randomUUID(), source: "website_form" }), freshVisitor());
    check("B4.2 a body that carries `source`", withSource.status === 400 && (await rows()) === before, "400 (refused by the real route), LEAD_ROWS unchanged", `${withSource.status} ${withSource.text.slice(0, 60)}, LEAD_ROWS ${before} -> ${await rows()}`);

    const legacy = await rawPost(JSON.stringify(inquiry("B4 legacy five keys")), freshVisitor());
    const afterLegacy = await leadRows(db, fx.tenantId);
    const legacyRow = afterLegacy.at(-1)!;
    check(
      "B4.3 the five legacy keys only (no submission_id)",
      legacy.status === 200 && legacy.text === RECEIVED && afterLegacy.length === before + 1 && legacyRow.source === "website_form" && legacyRow.submission_id === null,
      `200 ${RECEIVED}, LEAD_ROWS +1, that row: source='website_form', submission_id NULL`,
      `${legacy.status} ${legacy.text}, LEAD_ROWS ${before} -> ${afterLegacy.length}, row ${id8(legacyRow.id)}: source=${legacyRow.source}, submission_id=${legacyRow.submission_id === null ? "NULL" : "set"}`,
    );
  }

  // ── B5. 429 and Retry-After ─────────────────────────────────────────────────
  section("B5. the visitor budget exhausted: the door reads the real Retry-After and waits");
  {
    const window = await settleWindow(db, CLIENT_WINDOW_SECONDS, 30);
    const before = await rows();
    const visitor = freshVisitor();
    const used: number[] = [];
    for (let i = 0; i < CLIENT_MAX; i++) used.push((await rawPost(body2, visitor)).status ?? 0); // replays: 200, no rows
    const send = createInquirySender(ENDPOINT);
    const p = inquiry("B5 over budget");
    net.mode = "pass";
    net.visitor = visitor;
    const wireBefore = doorRequests().length;
    const limited = await send(p);
    const answer = doorRequests().at(-1)!;
    const header = Number(answer.retryAfter);
    check(
      "B5.1 the 6th POST of the visitor, through the door",
      used.every((s) => s === 200) && answer.status === 429 && answer.text === '{"error":"rate_limited"}' && limited.status === "failed" && limited.reason === "rate_limited" && limited.wait?.seconds === header && header >= 1 && header <= CLIENT_WINDOW_SECONDS && answer.expose?.toLowerCase() === "retry-after" && answer.allowOrigin === SITE_ORIGIN,
      "5x200 (budget used), then 429 {\"error\":\"rate_limited\"} with Retry-After (exposed to cross-origin script); door: failed/rate_limited, wait.seconds = that header",
      `budget: ${used.join(",")}; then ${answer.status} ${answer.text}, Retry-After=${answer.retryAfter}, Access-Control-Expose-Headers=${answer.expose}, Allow-Origin=${answer.allowOrigin}; door ${describe(limited)}  [${window}s of the window were left when the step began]`,
    );
    const same = await send(p);
    const different = await send({ ...p, message: `${p.message} — other values during the pause` });
    const made = doorRequests().length - wireBefore - 1;
    const within = (r: InquiryResult): boolean => r.status === "failed" && r.reason === "rate_limited" && r.wait !== undefined && r.wait.seconds >= 1 && r.wait.seconds <= header;
    check(
      "B5.2 presses during the pause",
      within(same) && within(different) && made === 0 && (await rows()) === before,
      "failed/rate_limited with the REMAINING seconds (1..Retry-After), 0 requests made, LEAD_ROWS unchanged",
      `same values: ${describe(same)}; other values: ${describe(different)}; requests made = ${made}; LEAD_ROWS ${before} -> ${await rows()}`,
    );
    await sleep(2_500);
    const later = await send(p);
    const laterMade = doorRequests().length - wireBefore - 1;
    check(
      "B5.3 a press 2.5 s later, still in the pause",
      later.status === "failed" && later.reason === "rate_limited" && later.wait !== undefined && later.wait.seconds < header && later.wait.seconds >= header - 4 && laterMade === 0,
      "the wall clock is what counts: fewer seconds left than Retry-After (by 2..4), still 0 requests",
      `${describe(later)} (Retry-After was ${header}), requests made = ${laterMade}`,
    );
  }

  // ── B7. contract edges beyond the brief ─────────────────────────────────────
  section("B7. contract edges: the OTHER 429, and the tenant's own lead-form settings (extras, not in the brief's list)");
  {
    // the channel's daily cap (100 stored inquiries): simulated by setting THIS channel's own daily counter to the cap
    const before = await rows();
    const dayKey = `wsl:d:${fx.channelId}`;
    await db.query(
      `insert into analytics_rate_limit_bucket (client_id, window_start, request_count, expires_at)
       values ($1, to_timestamp(floor(extract(epoch from now()) / 86400) * 86400), 100, to_timestamp(floor(extract(epoch from now()) / 86400) * 86400) + interval '172800 seconds')
       on conflict (client_id, window_start) do update set request_count = 100`,
      [dayKey],
    );
    const send = createInquirySender(ENDPOINT);
    const p = inquiry("B7 channel capacity");
    net.mode = "pass";
    net.visitor = freshVisitor();
    const wireBefore = doorRequests().length;
    const full = await send(p);
    const answer = doorRequests().at(-1)!;
    const again = await send(p);
    const second = doorRequests().at(-1)!;
    const made = doorRequests().length - wireBefore;
    await db.query("delete from analytics_rate_limit_bucket where client_id = $1", [dayKey]);
    check(
      "B7.1 the channel's daily cap is reached (429 channel_capacity)",
      answer.status === 429 && answer.text === '{"error":"channel_capacity"}' && full.status === "failed" && full.reason === "capacity" && full.wait === undefined && again.status === "failed" && again.reason === "capacity" && made === 2 && second.body === answer.body && (await rows()) === before,
      'server 429 {"error":"channel_capacity"} (also with Retry-After); door: failed/capacity WITHOUT a pause — a further press does send again (same submission_id), LEAD_ROWS unchanged',
      `server ${answer.status} ${answer.text}, Retry-After=${answer.retryAfter}; door ${describe(full)}; second press: ${describe(again)}, requests made = ${made}, same body: ${second.body === answer.body}; LEAD_ROWS ${before} -> ${await rows()}`,
    );
  }
  {
    // the route validates against the TENANT's lead-form settings (the same row the chat lead form uses)
    const before = await rows();
    await db.query("insert into lead_form_config (tenant_id, email_enabled, email_required) values ($1, true, true)", [fx.tenantId]);
    const send = createInquirySender(ENDPOINT);
    net.mode = "pass";
    net.visitor = freshVisitor();
    const refused = await send(inquiry("B7 email required"));
    const answer = doorRequests().at(-1)!;
    check(
      "B7.2 the tenant's form settings require e-mail (a field the Track B form does not have)",
      answer.status === 400 && (JSON.parse(answer.text) as { error?: string; field?: string }).error === "field_required" && (JSON.parse(answer.text) as { field?: string }).field === "email" && refused.status === "failed" && refused.reason === "invalid" && (await rows()) === before,
      'server 400 field_required (field: email); door failed/invalid — the visitor cannot cure it; LEAD_ROWS unchanged',
      `server ${answer.status} error=${(JSON.parse(answer.text) as { error?: string }).error} field=${(JSON.parse(answer.text) as { field?: string }).field}; door ${describe(refused)}; LEAD_ROWS ${before} -> ${await rows()}`,
    );
    await db.query("update lead_form_config set email_enabled = false, email_required = false, message_enabled = false where tenant_id = $1", [fx.tenantId]);
    net.visitor = freshVisitor();
    const accepted = await send(inquiry("B7 message switched off"));
    const sent = doorRequests().at(-1)!;
    const stored = (await leadRows(db, fx.tenantId)).find((r) => r.submission_id === submissionIdOf(sent.body));
    await db.query("delete from lead_form_config where tenant_id = $1", [fx.tenantId]);
    check(
      "B7.3 the tenant's form settings switch the message field off",
      sent.status === 200 && accepted.status === "ok" && stored !== undefined && stored.has_message === false && (await rows()) === before + 1,
      "server 200, door ok, LEAD_ROWS +1 — but the stored row has NO message: the server silently drops a field the tenant switched off (and the form's folded details with it)",
      `server ${sent.status}; door ${describe(accepted)}; LEAD_ROWS ${before} -> ${await rows()}; stored row ${id8(stored?.id)}: message present = ${stored?.has_message}`,
    );
  }

  // ── B6. notifications overall ───────────────────────────────────────────────
  section("B6. owner notifications overall");
  {
    const total = await rows();
    const mails = await sink.settledCountFor(fx, total);
    const all = await leadRows(db, fx.tenantId);
    check(
      "B6.2 one notification per STORED row, none for a replay / 409 / 429 / 400",
      mails === total && all.every((r) => r.notified),
      "mails in the sink for this tenant = LEAD_ROWS, every row's notified_at set",
      `mails = ${mails}, LEAD_ROWS = ${total}, rows with notified_at = ${all.filter((r) => r.notified).length}; all mails the sink received (any recipient) = ${sink.total()}`,
    );
    log("");
    log("rows of the test tenant (ids shortened):");
    for (const r of all) log(`  ${id8(r.id)}  source=${r.source}  submission_id=${id8(r.submission_id)}  notified=${r.notified}`);
    log(`requests on the wire: ${wire.length} (door ${doorRequests().length}, of which forwarded ${doorRequests().filter((w) => w.status !== undefined).length}; raw ${wire.filter((w) => w.via === "raw").length})`);
  }
} catch (err) {
  check("B.run", false, "the run completes", `aborted: ${err instanceof Error ? err.message : String(err)}`);
} finally {
  section("teardown");
  if (server) {
    stopped = await server.stop();
    const { tags, leaked } = serverLogTags(server.logFile, ["trackb-inquiry-v2-e2e] synthetic", "010-0000-0000", "E2E Tester"]);
    log(`server stopped: ${stopped ? "yes" : "NO"} (port ${server.port} free)`);
    log(`server log lines (the route throttles its warnings — a count of LINES, not of events): ${Object.entries(tags).map(([k, v]) => `${k}=${v}`).join(", ")}`);
    check("B.log the server log", tags["site_lead_schema_behind"] === 0 && tags["site_lead_failed"] === 0 && tags["site_lead_store_rejected"] === 0 && tags["site_lead_client_limit_skipped"] === 0 && leaked.length === 0, "no schema_behind / failed / store_rejected / limit_skipped line, no form content in the log", `schema_behind=${tags["site_lead_schema_behind"]}, failed=${tags["site_lead_failed"]}, store_rejected=${tags["site_lead_store_rejected"]}, limit_skipped=${tags["site_lead_client_limit_skipped"]}, form content found: ${leaked.length}`);
  }
  if (sink) await sink.close();
  if (fx) {
    const removed = await cleanupFixture(db, fx);
    log(`cleaned up: tenant ${removed.tenants} (with ${removed.leads} lead rows, its widget channel and membership by cascade), owner user ${removed.users}, rate-limit buckets ${removed.buckets}`);
  }
  const left = await leftovers(db);
  check("B.cleanup nothing of this harness is left in the test database", left.tenants === baseline.tenants && left.users === baseline.users && left.leads === baseline.leads, `fixtures under "trackb-inquiry-v2-e2e-" as before the run (${baseline.tenants} tenants, ${baseline.users} users, ${baseline.leads} leads)`, `${left.tenants} tenants, ${left.users} users, ${left.leads} leads`);
  await db.end();
}

const { passed, failed } = summary();
section("result");
log(`${passed} passed, ${failed.length} failed${failed.length > 0 ? `: ${failed.join("; ")}` : ""}`);
log(`finished: ${new Date().toISOString()}`);
// the door's pause timer (B5) is still pending by design: leave explicitly
process.exit(failed.length > 0 ? 1 : 0);
