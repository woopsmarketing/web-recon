/**
 * Online inquiry delivery (interior-01 1.6.3): the sender LIFECYCLE the platform door
 * (@platform/site/inquiry-client) owns, on top of the fixed-shape POST inquiry162.test.ts already
 * asserts (D1-D6 there: never throws, normaliser, phone rule). This file:
 *   1. door lifecycle — createInquirySender / inquirySender: one submission id per LOGICAL inquiry
 *      (a Map keyed by the normalised values, kept until the endpoint confirms "ok" or refuses with
 *      "conflict"), joining a press with the SAME values made while one is pending (a DIFFERENT one
 *      resolves "unknown", no fetch), every InquiryFailure reason, the wall-clock "rate_limited"
 *      pause (INQUIRY_PAUSE_TICK_MS ticks, survives a frozen timer), the id-less / crypto-degraded
 *      paths, the never-throws contract, and the per-endpoint sender cache (inquirySender);
 *   2. Template — the 1.6.3 contact.page slots/labels, contactPage's onlineFallback (site-authored
 *      link slots then the business email, deduped by href, a dead /path dropped), the release gate
 *      (still no crypto/fetch/timer/Date in Template code), the unchanged initial render, and
 *      the fallback rule's source shape (the contact list after every failure but a conflict —
 *      its behaviour, state by state, is inquiry163-browser.test.ts UX-5);
 *   3. the demo's built package — pinned to the current 1.6.3 release, the submission_id body shape
 *      in the shipped JS, and the five new texts / fallback contact confined to /contact's payload.
 *
 * Run AFTER `site:build boost-interior-demo`:
 *   tsx --tsconfig platform/tsconfig.json platform/test/inquiry163.test.ts
 */
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, cp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { scanTemplateSource } from "../release/release";
import { createSiteContext } from "../site/context";
import {
  INQUIRY_PAUSE_TICK_MS,
  INQUIRY_RETRY_DEFAULT_S,
  INQUIRY_RETRY_MAX_S,
  INQUIRY_TIMEOUT_MS,
  createInquirySender,
  inquirySender,
  type InquiryFailure,
  type InquiryResult,
  type InquirySubmission,
} from "../site/inquiry-client";
import { buildSiteSnapshot } from "../site/load";
import { frozenDemoRoot } from "./demo-frozen-dataset";
import { InquiryForm, type InquiryFieldLabels, type InquiryOnline } from "../../templates/interior-01/v1/components/InquiryForm";
import { contactPage } from "../../templates/interior-01/v1/sections/ContactPage";
import type { Ctx } from "../../templates/interior-01/v1/sections/types";
import template from "../../templates/interior-01/v1/template";

const repoRoot = process.cwd();
const DEMO = "boost-interior-demo";
const AT = "2026-09-22T12:00:00Z";
const TEMPLATE_REL = "templates/interior-01/v1";
/** the demo's declared endpoint — literal: it is what the consumer's route is deployed at */
const DEMO_ENDPOINT = "https://boostchat.co.kr/api/widget/wgt_99kYYFOm7ABvdQbVh_8SdrnOlLrPqDI3/lead";
/** a door-made submission id: a random v4 UUID */
const SUBMISSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
const chr = (...codes: number[]) => String.fromCodePoint(...codes);

/** narrow an InquiryResult to its "failed" variant, asserting the exact reason first */
function expectFailed(r: InquiryResult, reason: InquiryFailure, msg: string): Extract<InquiryResult, { status: "failed" }> {
  assert(r.status === "failed" && r.reason === reason, `${msg}: ${JSON.stringify(r)}`);
  if (r.status !== "failed") throw new Error("unreachable");
  return r;
}

const SUBMISSION: InquirySubmission = { consent: true, name: "홍길동", phone: "010-1234-5678", message: "문의 내용입니다", hp: "" };

// --------------------------------------------------------- fetch + timer harness --
type FetchArgs = { url: string; init: RequestInit };
interface Timer {
  id: number;
  fn: () => void;
  ms: number;
  cleared: boolean;
  fired: boolean;
}
let timerSeq = 0;
let timerLog: Timer[] = [];
let fetchCallCount = 0;
/** every request body sent during the "Door lifecycle" scenarios (FORM-ID-1..10b) — for FORM-ID-11/12 */
const allBodies: string[] = [];
const realSetTimeout = globalThis.setTimeout;
const realClearTimeout = globalThis.clearTimeout;
function installTimerCapture() {
  timerSeq = 0;
  timerLog = [];
  globalThis.setTimeout = ((fn: () => void, ms: number) => {
    const t: Timer = { id: ++timerSeq, fn, ms, cleared: false, fired: false };
    timerLog.push(t);
    return t.id as unknown as ReturnType<typeof setTimeout>;
  }) as typeof setTimeout;
  globalThis.clearTimeout = ((id: unknown) => {
    const t = timerLog.find((x) => x.id === id);
    if (t) t.cleared = true;
  }) as typeof clearTimeout;
}
function restoreTimerCapture() {
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
}
/** fire a captured timer and prove it never calls fetch itself */
function fire(t: Timer) {
  const before = fetchCallCount;
  t.fired = true;
  t.fn();
  eq(fetchCallCount, before, "firing a timer must not call fetch directly");
}
async function withFetch<T>(impl: (args: FetchArgs) => Promise<Response>, run: (calls: FetchArgs[]) => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  const calls: FetchArgs[] = [];
  globalThis.fetch = ((url: string, init: RequestInit) => {
    fetchCallCount++;
    calls.push({ url, init });
    allBodies.push(init.body as string);
    return impl({ url, init });
  }) as typeof fetch;
  try {
    return await run(calls);
  } finally {
    globalThis.fetch = original;
  }
}
const json = (status: number, body: string, headers: Record<string, string> = {}) => new Response(body, { status, headers: { "content-type": "application/json", ...headers } });
const bodyOf = (c: FetchArgs): Record<string, unknown> => JSON.parse(c.init.body as string) as Record<string, unknown>;
const idOf = (c: FetchArgs): string | undefined => bodyOf(c).submission_id as string | undefined;

console.log("\n[door] sender lifecycle: one id per logical inquiry, joins, failures, the rate-limit pause, never throws");
installTimerCapture();

await check("FORM-ID-1 a new form's first send carries exactly one UUID v4 (made by crypto.randomUUID, called exactly once); two different senders get different ids", async () => {
  let calls = 0;
  const fakeRandomUUID = () => {
    calls++;
    return `aaaaaaaa-aaaa-4aaa-8aaa-${calls.toString(16).padStart(12, "0")}`;
  };
  const realCrypto = globalThis.crypto;
  const desc = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  Object.defineProperty(globalThis, "crypto", { value: { randomUUID: fakeRandomUUID, getRandomValues: realCrypto.getRandomValues.bind(realCrypto) }, configurable: true });
  try {
    await withFetch(async () => json(200, '{"received":true}'), async (fcalls) => {
      const sender = createInquirySender(DEMO_ENDPOINT);
      await sender(SUBMISSION);
      eq(calls, 1, "randomUUID called exactly once for the first send");
      const id1 = idOf(fcalls[0]!);
      assert(id1 && SUBMISSION_ID_RE.test(id1), `id shape: ${id1}`);
      const sender2 = createInquirySender(DEMO_ENDPOINT);
      await sender2(SUBMISSION);
      assert(idOf(fcalls[1]!) !== id1, "two senders, two ids");
    });
  } finally {
    Object.defineProperty(globalThis, "crypto", desc);
  }
});

await check("FORM-ID-2 double press: two calls in the same tick while the first is unanswered join into exactly ONE fetch and both resolve to the same result; a second press after a failed answer with the same values makes a second fetch with the SAME id", async () => {
  let resolveFetch!: (r: Response) => void;
  await withFetch(() => new Promise<Response>((res) => (resolveFetch = res)), async (calls) => {
    const sender = createInquirySender(DEMO_ENDPOINT);
    const p1 = sender(SUBMISSION);
    const p2 = sender(SUBMISSION);
    eq(calls.length, 1, "one fetch for a double press");
    assert(p1 === p2, "the joined press returns the SAME promise");
    resolveFetch(json(200, '{"received":true}'));
    const [r1, r2] = await Promise.all([p1, p2]);
    eq(r1, { status: "ok" }, "result");
    eq(r2, r1, "both resolve to the same result");
  });
  await withFetch(async () => json(503, ""), async (calls) => {
    const sender = createInquirySender(DEMO_ENDPOINT);
    eq(await sender(SUBMISSION), { status: "failed", reason: "unavailable" }, "first press");
    eq(await sender(SUBMISSION), { status: "failed", reason: "unavailable" }, "second press");
    eq(calls.length, 2, "two fetches");
    eq(idOf(calls[0]!), idOf(calls[1]!), "same id on retry");
  });
});

await check('FORM-ID-2b a call with DIFFERENT values made while one is pending joins nothing: no second fetch, resolved {status:"failed",reason:"unknown"}; the original press still gets its own answer', async () => {
  let resolveFetch!: (r: Response) => void;
  await withFetch(() => new Promise<Response>((res) => (resolveFetch = res)), async (calls) => {
    const sender = createInquirySender(DEMO_ENDPOINT);
    const p1 = sender(SUBMISSION);
    const r2 = await sender({ ...SUBMISSION, name: "다른이름" });
    eq(calls.length, 1, "still one fetch");
    eq(r2, { status: "failed", reason: "unknown" }, "the differing call");
    resolveFetch(json(200, '{"received":true}'));
    eq(await p1, { status: "ok" }, "the original press still gets its answer");
  });
});

await check("FORM-ID-3 five calls in the same tick → one fetch, all resolving the same way; five SEQUENTIAL sends each answered 503 → five fetches, one distinct id shared by all", async () => {
  let resolveFetch!: (r: Response) => void;
  await withFetch(() => new Promise<Response>((res) => (resolveFetch = res)), async (calls) => {
    const sender = createInquirySender(DEMO_ENDPOINT);
    const ps = Array.from({ length: 5 }, () => sender(SUBMISSION));
    eq(calls.length, 1, "one fetch for five calls in the same tick");
    resolveFetch(json(200, '{"received":true}'));
    for (const r of await Promise.all(ps)) eq(r, { status: "ok" }, "every joined call resolves the same way");
  });
  await withFetch(async () => json(503, ""), async (calls) => {
    const sender = createInquirySender(DEMO_ENDPOINT);
    for (let i = 0; i < 5; i++) eq(await sender(SUBMISSION), { status: "failed", reason: "unavailable" }, `send ${i + 1}`);
    eq(calls.length, 5, "five fetches");
    const ids = new Set(calls.map(idOf));
    eq(ids.size, 1, "one distinct id across all five");
    assert(SUBMISSION_ID_RE.test([...ids][0]!), "id shape");
  });
});

await check('FORM-ID-4 a network failure (fetch rejects) → reason "network"; a resend of the same values carries the SAME id', async () => {
  await withFetch(async () => Promise.reject(new TypeError("Failed to fetch")), async (calls) => {
    const sender = createInquirySender(DEMO_ENDPOINT);
    eq(await sender(SUBMISSION), { status: "failed", reason: "network" }, "first");
    eq(await sender(SUBMISSION), { status: "failed", reason: "network" }, "resend");
    eq(calls.length, 2, "two fetches");
    eq(idOf(calls[0]!), idOf(calls[1]!), "same id");
  });
});

await check(`FORM-ID-5 a 408 answer and the local abort timer (unanswered for ${INQUIRY_TIMEOUT_MS} ms) both report reason "timeout"; a resend of the same values carries the SAME id`, async () => {
  await withFetch(async () => json(408, ""), async (calls) => {
    const sender = createInquirySender(DEMO_ENDPOINT);
    eq(await sender(SUBMISSION), { status: "failed", reason: "timeout" }, "408");
    eq(await sender(SUBMISSION), { status: "failed", reason: "timeout" }, "resend");
    eq(calls.length, 2, "two fetches");
    eq(idOf(calls[0]!), idOf(calls[1]!), "same id (408)");
  });
  const from = timerLog.length;
  await withFetch(
    ({ init }) => new Promise<Response>((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))),
    async (calls) => {
      const sender = createInquirySender(DEMO_ENDPOINT);
      const p = sender(SUBMISSION);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      const abortTimer = timerLog.slice(from).find((t) => t.ms === INQUIRY_TIMEOUT_MS && !t.cleared && !t.fired);
      assert(abortTimer, "an abort timer was scheduled");
      fire(abortTimer!);
      eq(await p, { status: "failed", reason: "timeout" }, "aborted by the local timer");
      // the resend hangs the same way (the impl above never answers on its own) — its OWN abort timer must fire too
      const p2 = sender(SUBMISSION);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      const abortTimer2 = timerLog.slice(from).find((t) => t.ms === INQUIRY_TIMEOUT_MS && !t.cleared && !t.fired);
      assert(abortTimer2, "a second abort timer was scheduled");
      fire(abortTimer2!);
      eq(await p2, { status: "failed", reason: "timeout" }, "resend");
      eq(calls.length, 2, "two fetches");
      eq(idOf(calls[0]!), idOf(calls[1]!), "same id (local abort)");
    },
  );
});

await check('FORM-ID-6 a 503 answer → reason "unavailable"; a resend of the same values carries the SAME id', async () => {
  await withFetch(async () => json(503, ""), async (calls) => {
    const sender = createInquirySender(DEMO_ENDPOINT);
    eq(await sender(SUBMISSION), { status: "failed", reason: "unavailable" }, "503");
    eq(await sender(SUBMISSION), { status: "failed", reason: "unavailable" }, "resend");
    eq(idOf(calls[0]!), idOf(calls[1]!), "same id");
  });
});

await check(
  'FORM-ID-7 429 rate_limited (Retry-After: 30) → reason "rate_limited", wait.seconds === 30; a send during the pause makes NO fetch and returns the SAME wait.over; the paused clock (two 15s ticks) resolves wait.over, even with a frozen timer (clock advanced past `until` with no tick fired, the next send still goes through); the next send after the pause makes a fetch with the SAME id; Retry-After parsing: missing → default, 999999 → max, 0 → 1, an HTTP date 90s ahead → 90, "1.5"/"-5"/"+120"/""/garbage → default, a 429 whose body is not JSON → still rate_limited',
  async () => {
    const originalNow = Date.now;
    let now = 1_700_000_000_000;
    Date.now = () => now;
    try {
      const from = timerLog.length;
      await withFetch(async () => json(429, '{"error":"x"}', { "Retry-After": "30" }), async (calls) => {
        const sender = createInquirySender(DEMO_ENDPOINT);
        const r1 = expectFailed(await sender(SUBMISSION), "rate_limited", "first answer");
        eq(r1.wait!.seconds, 30, "wait.seconds");
        const r2 = expectFailed(await sender(SUBMISSION), "rate_limited", "during the pause");
        eq(calls.length, 1, "no fetch while paused");
        assert(r2.wait!.over === r1.wait!.over, "the SAME over promise while paused");
        let overResolved = false;
        void r1.wait!.over.then(() => (overResolved = true));
        await Promise.resolve();
        assert(!overResolved, "not over before any tick");
        for (let i = 0; i < 2; i++) {
          now += 15_000;
          for (const t of timerLog.slice(from).filter((t) => !t.cleared && !t.fired)) fire(t);
          await Promise.resolve();
        }
        assert(overResolved, "over after two 15s ticks (a 30s pause)");
        await sender(SUBMISSION);
        eq(calls.length, 2, "a fetch after the pause");
        eq(idOf(calls[1]!), idOf(calls[0]!), "same id after the pause");
      });
      // a frozen timer: the clock passes `until` but no tick ever fires — the next send still goes through
      await withFetch(async () => json(429, '{"error":"x"}', { "Retry-After": "10" }), async (calls) => {
        const sender = createInquirySender(DEMO_ENDPOINT);
        await sender(SUBMISSION);
        eq(calls.length, 1, "paused");
        now += 11_000; // past `until`; no timer fired
        await sender(SUBMISSION);
        eq(calls.length, 2, "a frozen timer does not stretch the pause: the next send still fetches");
        eq(idOf(calls[1]!), idOf(calls[0]!), "same id");
      });
    } finally {
      Date.now = originalNow;
    }
    async function retryAfterSeconds(header: string | undefined, bodyText = '{"error":"x"}'): Promise<number> {
      return withFetch(async () => json(429, bodyText, header === undefined ? {} : { "Retry-After": header }), async () => {
        const sender = createInquirySender(DEMO_ENDPOINT);
        return expectFailed(await sender(SUBMISSION), "rate_limited", "retry-after parsing").wait!.seconds;
      });
    }
    eq(await retryAfterSeconds(undefined), INQUIRY_RETRY_DEFAULT_S, "missing header → default");
    eq(await retryAfterSeconds("999999"), INQUIRY_RETRY_MAX_S, "huge → max");
    eq(await retryAfterSeconds("0"), 1, "zero → 1");
    eq(await retryAfterSeconds("not-a-real-date"), INQUIRY_RETRY_DEFAULT_S, "garbage with letters → default");
    eq(await retryAfterSeconds("1.5"), INQUIRY_RETRY_DEFAULT_S, "decimal → default");
    eq(await retryAfterSeconds("-5"), INQUIRY_RETRY_DEFAULT_S, "negative → default");
    eq(await retryAfterSeconds("+120"), INQUIRY_RETRY_DEFAULT_S, "plus-signed → default");
    eq(await retryAfterSeconds(""), INQUIRY_RETRY_DEFAULT_S, "empty → default");
    {
      const originalNow2 = Date.now;
      const base = 1_800_000_000_000;
      Date.now = () => base;
      try {
        eq(await retryAfterSeconds(new Date(base + 90_000).toUTCString()), 90, "an HTTP date 90s ahead → 90");
      } finally {
        Date.now = originalNow2;
      }
    }
    eq(await retryAfterSeconds("30", "not json"), 30, "a 429 whose body is not JSON is still rate_limited");
  },
);

await check('FORM-ID-7b 429 channel_capacity (+ Retry-After) → reason "capacity", NO wait, no pause (an immediate next send still fetches); same id for the same values', async () => {
  await withFetch(async () => json(429, '{"error":"channel_capacity"}', { "Retry-After": "30" }), async (calls) => {
    const sender = createInquirySender(DEMO_ENDPOINT);
    const r1 = await sender(SUBMISSION);
    eq(r1, { status: "failed", reason: "capacity" }, "capacity, no wait");
    assert(!("wait" in r1), "no wait field at all");
    const r2 = await sender(SUBMISSION);
    eq(calls.length, 2, "no pause: the next send also fetches");
    eq(r2, { status: "failed", reason: "capacity" }, "capacity again");
    eq(idOf(calls[0]!), idOf(calls[1]!), "same id for the same values");
  });
});

await check('FORM-ID-8 200 {"received":true} → "ok"; the next send — even with identical values — carries a NEW id', async () => {
  await withFetch(async () => json(200, '{"received":true}'), async (calls) => {
    const sender = createInquirySender(DEMO_ENDPOINT);
    eq(await sender(SUBMISSION), { status: "ok" }, "ok");
    eq(await sender(SUBMISSION), { status: "ok" }, "ok again");
    eq(calls.length, 2, "two fetches");
    assert(idOf(calls[0]!) !== idOf(calls[1]!), "a new id even for identical values");
  });
});

await check(
  "FORM-ID-9 after an uncertain answer, a send with CHANGED values (name, phone, message or hp — checked each) carries a NEW id; changing back to the first values afterwards carries A's ORIGINAL id again (the sender remembers both pending values until one is confirmed or refused — an id is never sent with other values than its own); values differing only by what normalizeInquiryText removes are the SAME values → same id",
  async () => {
    function changedValueFor(field: "name" | "phone" | "message" | "hp", base: InquirySubmission): string {
      if (field === "phone") return "010-9999-0000";
      if (field === "hp") return "bot";
      return `${base[field]}X`;
    }
    for (const field of ["name", "phone", "message", "hp"] as const) {
      await withFetch(async () => Promise.reject(new TypeError("net")), async (calls) => {
        const sender = createInquirySender(DEMO_ENDPOINT);
        const A = SUBMISSION;
        const B: InquirySubmission = { ...A, [field]: changedValueFor(field, A) };
        await sender(A);
        await sender(B);
        await sender(A);
        eq(calls.length, 3, `${field}: three sends`);
        const [idA1, idB, idA2] = calls.map(idOf);
        assert(idA1 !== idB, `${field}: A and B get different ids`);
        assert(idA2 === idA1, `${field}: reverting to A reuses A's ORIGINAL id`);
        assert(idA2 !== idB, `${field}: A's id is never B's`);
      });
    }
    await withFetch(async () => Promise.reject(new TypeError("net")), async (calls) => {
      const sender = createInquirySender(DEMO_ENDPOINT);
      const messy: InquirySubmission = { ...SUBMISSION, name: `${SUBMISSION.name}${chr(0x200b)} ` };
      await sender(SUBMISSION);
      await sender(messy);
      eq(calls.length, 2, "two sends");
      eq(idOf(calls[0]!), idOf(calls[1]!), "normalised-equal values share the id");
    });
  },
);

await check(
  'FORM-ID-10 409 idempotency_conflict → reason "conflict", exactly one fetch (no automatic resend: no timer besides the abort timer, and a few microtask turns produce no second fetch); the next send carries a NEW id even with identical values',
  async () => {
    const from = timerLog.length;
    await withFetch(async () => json(409, '{"error":"idempotency_conflict"}'), async (calls) => {
      const sender = createInquirySender(DEMO_ENDPOINT);
      eq(await sender(SUBMISSION), { status: "failed", reason: "conflict" }, "conflict");
      for (let i = 0; i < 5; i++) await Promise.resolve();
      eq(calls.length, 1, "no automatic resend after settling");
      assert(
        timerLog.slice(from).every((t) => t.ms === INQUIRY_TIMEOUT_MS),
        "no timer besides the abort timer",
      );
      eq(await sender(SUBMISSION), { status: "failed", reason: "conflict" }, "a second, manual send");
      eq(calls.length, 2, "a second, manual fetch");
      assert(idOf(calls[0]!) !== idOf(calls[1]!), "a NEW id even for identical values");
    });
  },
);

await check('FORM-ID-10b 400 → "invalid", one fetch; a resend of the same values carries the SAME id (nothing was stored; the id is kept)', async () => {
  await withFetch(async () => json(400, '{"error":"bad"}'), async (calls) => {
    const sender = createInquirySender(DEMO_ENDPOINT);
    eq(await sender(SUBMISSION), { status: "failed", reason: "invalid" }, "400");
    eq(await sender(SUBMISSION), { status: "failed", reason: "invalid" }, "resend");
    eq(calls.length, 2, "two fetches");
    eq(idOf(calls[0]!), idOf(calls[1]!), "same id kept");
  });
});

await check('FORM-ID-11 no request body ever contains a "source" key: across every scenario above (FORM-ID-1..10b) the body\'s key set is exactly the six keys; the door source has no "source" body key beside the real ones', async () => {
  assert(allBodies.length > 20, `too few bodies collected: ${allBodies.length}`);
  for (const raw of allBodies) {
    eq([...Object.keys(JSON.parse(raw) as Record<string, unknown>)].sort(), ["consent", "hp", "message", "name", "phone", "submission_id"].sort(), "body keys");
  }
  const door = await readFile(path.join(repoRoot, "platform/site/inquiry-client.ts"), "utf8");
  assert(
    door.includes("const body = JSON.stringify({ consent: true, name, phone, message, hp, ...(id === undefined ? {} : { submission_id: id }) });"),
    "the body literal carries exactly these keys (and no source)",
  );
});

await check('FORM-ID-12 no request body ever contains a "turnstile_token" key; no "turnstile" / "captcha" string (case-insensitive) in the door or any Template source', async () => {
  for (const raw of allBodies) assert(!("turnstile_token" in (JSON.parse(raw) as Record<string, unknown>)), "a turnstile_token key");
  const door = await readFile(path.join(repoRoot, "platform/site/inquiry-client.ts"), "utf8");
  assert(!/turnstile|captcha/i.test(door), "the door names turnstile/captcha");
  const files = (await walkFiles(path.join(repoRoot, TEMPLATE_REL))).filter((f) => /\.(ts|tsx|css|json)$/.test(f));
  for (const f of files) {
    const text = await readFile(path.join(repoRoot, TEMPLATE_REL, f), "utf8");
    assert(!/turnstile|captcha/i.test(text), `${f}: names turnstile/captcha`);
  }
});

await check(
  "FORM-ID-12b nothing automatic: across every scenario above the only timers ever scheduled are one abort timer (INQUIRY_TIMEOUT_MS) per fetch and the rate-limit pause's own look timers (each ≤ INQUIRY_PAUSE_TICK_MS); firing a timer never calls fetch (checked at every fire() above)",
  () => {
    assert(timerLog.length > 10, `too few timers captured: ${timerLog.length}`);
    for (const t of timerLog) assert(t.ms === INQUIRY_TIMEOUT_MS || (t.ms > 0 && t.ms <= INQUIRY_PAUSE_TICK_MS), `an unexpected timer: ${t.ms}ms`);
  },
);
restoreTimerCapture();

await check("PRIV-1 the door source has no console./localStorage/sessionStorage/document.cookie/indexedDB/sendBeacon (the id lives only in the sender's own memory and the request body)", async () => {
  const door = await readFile(path.join(repoRoot, "platform/site/inquiry-client.ts"), "utf8");
  for (const needle of ["console.", "localStorage", "sessionStorage", "document.cookie", "indexedDB", "sendBeacon"]) assert(!door.includes(needle), `the door uses ${needle}`);
});

await check(
  "NOID-1 without globalThis.crypto the send still happens with the five keys only (no submission_id); with crypto.getRandomValues but no randomUUID the id is a valid v4 UUID; a crypto.randomUUID that THROWS also sends without an id (never refused for it)",
  async () => {
    const desc = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
    const realCrypto = globalThis.crypto;
    try {
      Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
      await withFetch(async () => json(200, '{"received":true}'), async (calls) => {
        const sender = createInquirySender(DEMO_ENDPOINT);
        eq(await sender(SUBMISSION), { status: "ok" }, "sent without crypto");
        eq([...Object.keys(bodyOf(calls[0]!))].sort(), ["consent", "hp", "message", "name", "phone"].sort(), "five keys only");
      });
      Object.defineProperty(globalThis, "crypto", { value: { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) }, configurable: true });
      await withFetch(async () => json(200, '{"received":true}'), async (calls) => {
        const sender = createInquirySender(DEMO_ENDPOINT);
        await sender(SUBMISSION);
        const id = idOf(calls[0]!);
        assert(id && SUBMISSION_ID_RE.test(id), `fallback id shape: ${id}`);
      });
      Object.defineProperty(globalThis, "crypto", {
        value: { randomUUID: () => { throw new Error("blocked"); }, getRandomValues: realCrypto.getRandomValues.bind(realCrypto) },
        configurable: true,
      });
      await withFetch(async () => json(200, '{"received":true}'), async (calls) => {
        const sender = createInquirySender(DEMO_ENDPOINT);
        eq(await sender(SUBMISSION), { status: "ok" }, "sent despite randomUUID throwing");
        eq([...Object.keys(bodyOf(calls[0]!))].sort(), ["consent", "hp", "message", "name", "phone"].sort(), "no submission_id when randomUUID throws");
      });
    } finally {
      Object.defineProperty(globalThis, "crypto", desc);
    }
  },
);

await check(
  'RES-1 never throws / never rejects: a 200 whose body is not JSON, or whose response.json() rejects → "unknown"; 500/502/504/403/404/413/415 → "unknown"; a thrown `new AbortController()` → "unknown"',
  async () => {
    const cases: [string, () => Promise<Response>][] = [
      ["200 non-JSON", async () => json(200, "<html>ok</html>", { "content-type": "text/html" })],
      ["200 json() rejects", async () => ({ status: 200, json: () => Promise.reject(new Error("boom")) }) as unknown as Response],
      ["500", async () => json(500, "")],
      ["502", async () => json(502, "")],
      ["504", async () => json(504, "")],
      ["403", async () => json(403, "")],
      ["404", async () => json(404, "")],
      ["413", async () => json(413, "")],
      ["415", async () => json(415, "")],
    ];
    for (const [what, impl] of cases) {
      const sender = createInquirySender(DEMO_ENDPOINT);
      const result = await withFetch(impl, () => sender(SUBMISSION));
      eq(result, { status: "failed", reason: "unknown" }, what);
    }
    const OriginalAC = globalThis.AbortController;
    (globalThis as { AbortController: unknown }).AbortController = class {
      constructor() {
        throw new Error("no abort");
      }
    };
    try {
      const sender = createInquirySender(DEMO_ENDPOINT);
      const result = await withFetch(async () => json(200, '{"received":true}'), () => sender(SUBMISSION));
      eq(result, { status: "failed", reason: "unknown" }, "AbortController constructor throws");
    } finally {
      globalThis.AbortController = OriginalAC;
    }
  },
);

await check("SND-1 inquirySender(endpoint) caches one sender per endpoint for the page: the same endpoint returns the SAME sender, a different endpoint a DIFFERENT one", () => {
  const a1 = inquirySender(DEMO_ENDPOINT);
  const a2 = inquirySender(DEMO_ENDPOINT);
  const b = inquirySender(`${DEMO_ENDPOINT}/other`);
  assert(a1 === a2, "same endpoint, same sender");
  assert(a1 !== b, "different endpoint, different sender");
});

// ------------------------------------------------------------------ template --
console.log("\n[template] 1.6.3 contact.page slots, onlineFallback, the release gate and the unchanged initial render");
const demoDir = path.join(repoRoot, "data/sites", DEMO);
// The demo is copied / snapshotted through the frozen composition (demo-frozen-dataset.ts): its site directory is the live one byte for byte except the adoption marker, which makes the live directory refuse to load without a generated portfolio. Plain reads of site-owned files below stay on the live directory.
const frozen = await frozenDemoRoot(repoRoot);
const pin = (await readJson(path.join(demoDir, "site.json"))).template as { templateId: string; templateVersion: string; releaseId: string; releaseHash: string };

await check(
  'TPL-1 version is "1.6.3"; the five new text slots have non-empty neutral defaults, rateLimitedText\'s default contains "{minutes}"; the two link slots are optional; every slot of 1.6.2\'s contact.page is still declared',
  async () => {
    eq(template.version, "1.6.3", "version");
    const slots = template.sections["contact.page"].slots as Record<string, { type: string; maxLength?: number; neutralDefault?: string; required?: boolean }>;
    for (const k of ["invalidText", "conflictText", "rateLimitedText", "capacityText", "fallbackLead"]) {
      eq([slots[k]?.type, typeof slots[k]?.neutralDefault, slots[k]?.required ?? false], ["text", "string", false], `slot ${k}`);
      assert(slots[k]!.neutralDefault!.length > 0, `${k}: empty neutral default`);
    }
    assert(slots.rateLimitedText!.neutralDefault!.includes("{minutes}"), "rateLimitedText default carries {minutes}");
    for (const k of ["fallbackLinkA", "fallbackLinkB"]) eq([slots[k]?.type, slots[k]?.required ?? false], ["link", false], `slot ${k}`);
    const release162 = await readFile(path.join(repoRoot, "data/template-releases/interior-01/interior-01-1.6.2-d5d4b4557a20/files", TEMPLATE_REL, "template.ts"), "utf8");
    const after = release162.slice(release162.indexOf('"contact.page": {'));
    const block = after.slice(0, after.indexOf("\n    },\n"));
    const names162 = [...block.matchAll(/^ {8}([a-zA-Z][a-zA-Z0-9]*): \{/gm)].map((m) => m[1]!);
    eq(names162.length, 30, `1.6.2 contact.page slot names parsed: ${names162.length}`);
    for (const name of names162) assert(slots[name], `1.6.2 slot ${name} no longer declared`);
  },
);

function onlineOf(data: { form?: { online?: InquiryOnline } }): InquiryOnline {
  const online = data.form?.online;
  assert(online, "expected an online form");
  return online;
}
async function demoSiteRoot(mutate: (dir: string) => Promise<void>): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "inquiry163-"));
  const dir = path.join(root, "data/sites", DEMO);
  await mkdir(path.dirname(dir), { recursive: true });
  await cp(frozen.siteDir, dir, { recursive: true });
  await mutate(dir);
  return root;
}
async function contextFrom(root: string): Promise<Ctx> {
  const snapshot = (await buildSiteSnapshot({ repoRoot: root, siteId: DEMO, mode: "public", at: AT })).snapshot;
  return createSiteContext({ siteId: DEMO, template, templateRelease: pin, mode: "public", at: AT, snapshot });
}
async function withDemoCtx(mutate: (dir: string) => Promise<void>, use: (ctx: Ctx) => void | Promise<void>): Promise<void> {
  const root = await demoSiteRoot(mutate);
  try {
    await use(await contextFrom(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function setSlotLinks(dir: string, links: Record<string, { label: string; href: string } | undefined>): Promise<void> {
  const p = path.join(dir, "slots.json");
  const doc = (await readJson(p)) as { values: Record<string, Record<string, unknown>> };
  for (const [k, v] of Object.entries(links)) {
    if (v === undefined) delete doc.values["contact.page"]![k];
    else doc.values["contact.page"]![k] = v;
  }
  await writeFile(p, JSON.stringify(doc, null, 2));
}
async function clearBusinessEmail(dir: string): Promise<void> {
  const p = path.join(dir, "content/business.json");
  const doc = (await readJson(p)) as { data: { contact?: unknown } };
  doc.data.contact = {};
  await writeFile(p, JSON.stringify(doc, null, 2));
}

await check(
  "TPL-2 contactPage(ctx) with an endpoint: online props carry the five new labels and fallback = the authored link slots (A, B order) then the business email; with no email and no link slots → fallback: []; a /path link slot that is not a generated page is dropped (the other link kept); a fallbackLinkA equal to mailto:<business email> yields ONE entry, not two (deduped by href)",
  async () => {
    const email = ((await readJson(path.join(demoDir, "content/business.json"))).data as { contact: { email: string } }).contact.email;
    const emailLabelText = ((await readJson(path.join(demoDir, "slots.json"))).values as Record<string, Record<string, unknown>>)["contact.page"]!.emailLabel as string;

    await withDemoCtx(
      async () => {},
      (ctx) => {
        const online = onlineOf(contactPage(ctx));
        eq(online.fallback, [{ name: emailLabelText, text: email, href: `mailto:${email}` }], "baseline: email only");
      },
    );

    await withDemoCtx(
      (dir) => setSlotLinks(dir, { fallbackLinkA: { label: "전화", href: "tel:+82212345678" }, fallbackLinkB: { label: "소개", href: "/about" } }),
      (ctx) => {
        const online = onlineOf(contactPage(ctx));
        eq(
          online.fallback,
          [
            { text: "전화", href: "tel:+82212345678" },
            { text: "소개", href: "/about" },
            { name: emailLabelText, text: email, href: `mailto:${email}` },
          ],
          "A, B, then email",
        );
      },
    );

    await withDemoCtx(clearBusinessEmail, (ctx) => {
      const online = onlineOf(contactPage(ctx));
      eq(online.fallback, [], "no email, no link slots → no channels");
    });

    await withDemoCtx(
      (dir) => setSlotLinks(dir, { fallbackLinkA: { label: "없음", href: "/no-such-page" }, fallbackLinkB: { label: "소개", href: "/about" } }),
      (ctx) => {
        const online = onlineOf(contactPage(ctx));
        eq(
          online.fallback,
          [
            { text: "소개", href: "/about" },
            { name: emailLabelText, text: email, href: `mailto:${email}` },
          ],
          "a dead /path link is dropped, B kept",
        );
      },
    );

    await withDemoCtx(
      (dir) => setSlotLinks(dir, { fallbackLinkA: { label: "이메일 보내기", href: `mailto:${email}` } }),
      (ctx) => {
        const online = onlineOf(contactPage(ctx));
        eq(online.fallback, [{ text: "이메일 보내기", href: `mailto:${email}` }], "deduped to one entry (the authored link wins)");
      },
    );
  },
);

await check("TPL-3 the Template sources reference no crypto / fetch / setTimeout / Date (scanTemplateSource over every file of templates/interior-01/v1); InquiryForm.tsx is still the only importer of the door", async () => {
  const files = (await walkFiles(path.join(repoRoot, TEMPLATE_REL))).filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !/^(node_modules|\.next|out)\//.test(f));
  const importers: string[] = [];
  for (const f of files) {
    const text = await readFile(path.join(repoRoot, TEMPLATE_REL, f), "utf8");
    eq(scanTemplateSource(`${TEMPLATE_REL}/${f}`, text, [DEMO]), [], `${f}: gate findings`);
    if (text.includes("@platform/site/inquiry-client")) importers.push(f);
  }
  eq(importers, ["components/InquiryForm.tsx"], "door importers");
});

await check("TPL-4 server render (renderToStaticMarkup) of the online form, in its initial state, is unchanged from 1.6.2: empty alert, DISABLED button, no fallback contacts, none of the five new texts in the markup", () => {
  (globalThis as { React?: unknown }).React = React;
  const labels: InquiryFieldLabels = { name: "N", phone: "P", region: "R", area: "A", workType: "W", select: "S", schedule: "Sc", message: "M", required: "* required", submit: "Send", notice: "Note" };
  const online: InquiryOnline = {
    endpoint: "https://api.example.com/lead",
    labels: {
      consent: "Consent",
      phoneHint: "Hint",
      noScript: "No script",
      submitting: "Sending",
      successTitle: "Done",
      successBody: "Thanks",
      failure: "Failed",
      messagePrefix: "[p]",
      invalid: "Invalid",
      conflict: "Conflict",
      rateLimited: "RateLimited {minutes}",
      capacity: "Capacity",
      fallbackLead: "FallbackLead",
    },
    fallback: [
      { name: "Email", text: "owner@site.example", href: "mailto:owner@site.example" },
      { text: "Call", href: "tel:+1234567890" },
    ],
  };
  const markup = renderToStaticMarkup(createElement(InquiryForm, { workTypes: ["a"], labels, online }));
  assert(markup.includes('<p class="i1-form__error" role="alert" data-inquiry-error=""></p>'), "empty alert");
  assert(/data-inquiry-submit="" disabled=""/.test(markup), "disabled button");
  for (const text of ["Invalid", "Conflict", "RateLimited", "Capacity", "FallbackLead", "owner@site.example", "Call", "mailto:", "tel:", "i1-form__contacts", "i1-form__contact"]) {
    assert(!markup.includes(text), `leaked into the initial render: ${text}`);
  }
});

await check('TPL-5 the demo\'s slots.json sets the five new texts, all within the slot caps, and its rateLimitedText contains "{minutes}"', async () => {
  const demoSlots = ((await readJson(path.join(demoDir, "slots.json"))).values as Record<string, Record<string, unknown>>)["contact.page"]!;
  const slots = template.sections["contact.page"].slots as Record<string, { maxLength?: number }>;
  for (const k of ["invalidText", "conflictText", "rateLimitedText", "capacityText", "fallbackLead"]) {
    const v = demoSlots[k];
    assert(typeof v === "string" && v.length > 0, `${k}: not set`);
    assert(v.length <= slots[k]!.maxLength!, `${k}: exceeds cap ${slots[k]!.maxLength}`);
  }
  assert((demoSlots.rateLimitedText as string).includes("{minutes}"), "rateLimitedText carries {minutes}");
});

await check(
  'TPL-6 the fallback rule (source shape; behaviour: inquiry163-browser.test.ts UX-5): the alert lists the site\'s other contact channels after EVERY failure but a conflict — one excluded reason (WITHOUT_FALLBACK = "conflict"), no allow-list of reasons; the list is read once, only while the alert is up (failed or paused), and rendered once, inside the alert, above the button',
  async () => {
    const form = await readFile(path.join(repoRoot, TEMPLATE_REL, "components/InquiryForm.tsx"), "utf8");
    const count = (text: string, needle: string) => text.split(needle).length - 1;
    /** the component without its comments (block comments, then whole-line and trailing line comments) */
    const code = form.replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), "").replace(new RegExp("^\\s*//.*$", "gm"), "").replace(new RegExp("\\s//\\s.*$", "gm"), "");
    const online = code.slice(code.indexOf("function OnlineInquiryForm("));
    assert(online.length > 0 && online.includes("inquirySender(online.endpoint)"), "the online form's code");
    // the rule: every failure but ONE — the excluded reason is a single word of the door's vocabulary
    eq(count(code, 'const WITHOUT_FALLBACK: InquiryFailure = "conflict";'), 1, "the one excluded reason");
    eq(count(code, "WITHOUT_FALLBACK"), 2, "WITHOUT_FALLBACK: declared once, read once");
    assert(!new RegExp("OFFER_FALLBACK|new Set<InquiryFailure>").test(form), "an allow-list of reasons (the pre-release rule: capacity and network only)");
    eq(count(online, 'const alerting = phase === "failed" || paused;'), 1, "alerting = failed or paused");
    eq(count(online, "const contacts = alerting && reason && reason !== WITHOUT_FALLBACK ? online.fallback : [];"), 1, "contacts = the site's channels after every failure but the excluded one");
    eq(count(code, "online.fallback"), 1, "the site's channels are read in exactly one place");
    // no other reason is singled out anywhere near the list: the only reason comparisons are failureText's
    eq(count(online, "reason ==="), 0, "a reason comparison inside the online form");
    eq(count(online, "reason !=="), 1, "reason comparisons inside the online form");
    // rendered once: inside the alert (only while alerting, only when there is a channel), above the button
    eq([count(code, 'data-inquiry-contacts=""'), count(code, 'className="i1-form__contacts"')], [1, 1], "the list is rendered in one place");
    const order = ['role="alert" data-inquiry-error=""', "{alerting ? (", "{contacts.length > 0 ? (", 'data-inquiry-contacts=""', "{contacts.map((c) => (", "<a href={c.href}>{c.text}</a>", 'data-inquiry-submit=""'].map((needle) => {
      const i = online.indexOf(needle);
      assert(i >= 0, `not in the online form: ${needle}`);
      return i;
    });
    eq(order, [...order].sort((x, y) => x - y), "alert → alerting → contacts → the list → its links → the button");
    // the mail hand-off has no such list (its component ends where the online form's state type begins)
    const mail = code.slice(code.indexOf("function MailInquiryForm("), code.indexOf("type OnlineState ="));
    assert(mail.length > 0 && mail.includes("data-inquiry-mailto") && !new RegExp("contacts|WITHOUT_FALLBACK").test(mail), "the mail form took the contact list");
  },
);

// -------------------------------------------------------------------- package --
console.log("\n[package] the built demo: the pinned release, the submission_id body shape, the five new texts confined to /contact");
const pkgDir = path.join(repoRoot, (await readJson(path.join(repoRoot, "data/site-builds", DEMO, "current.json"))).packageDir as string);
const record = (await readJson(path.join(pkgDir, "build-record.json"))) as { template: { releaseId: string; releaseHash: string }; status: string; qa: { pass: boolean } };
const TEXT_FILE = /\.(html|txt|js|mjs|css|json|svg|xml|map|webmanifest)$/i;
const packageFiles = await walkFiles(path.join(pkgDir, "site"));
const packageText = new Map<string, string>();
for (const f of packageFiles) if (TEXT_FILE.test(f)) packageText.set(f, await readFile(path.join(pkgDir, "site", f), "utf8"));
const html = new Map([...packageText].filter(([f]) => f.endsWith(".html")));
const contact = html.get("contact.html")!;

await check("PKG-1 built with the pinned 1.6.3 release (QA pass)", () => {
  eq([pin.templateVersion, record.template.releaseId, record.template.releaseHash, record.status, record.qa.pass], [template.version, pin.releaseId, pin.releaseHash, "success", true], "build record");
});

await check(
  'PKG-2 some emitted _next/static/**.js chunk contains submission_id, whose body literal carries exactly {consent, name, phone, message, hp, …submission_id} (no "source" key beside it); no emitted file names "turnstile" (case-insensitive)',
  () => {
    const chunks = [...packageText].filter(([f, t]) => /^_next\/static\/.*\.js$/.test(f) && t.includes("submission_id"));
    assert(chunks.length > 0, "no chunk carries submission_id");
    for (const [f, t] of chunks) {
      const i = t.indexOf("submission_id");
      const around = t.slice(Math.max(0, i - 400), i + 50);
      assert(/\{consent:!0,name:\w+,phone:\w+,message:\w+,hp:\w+,/.test(around), `${f}: unexpected body literal around submission_id: ${around}`);
      assert(!/\bsource\s*:/.test(around), `${f}: a source key near submission_id`);
    }
    for (const [f, t] of packageText) assert(!/turnstile/i.test(t), `${f}: names turnstile`);
  },
);

await check("PKG-3 the five new texts and the fallback contact appear only inside /contact's payload script / flight .txt files, never in rendered HTML", async () => {
  const demoSlots = ((await readJson(path.join(demoDir, "slots.json"))).values as Record<string, Record<string, unknown>>)["contact.page"]! as Record<string, string>;
  const texts = [demoSlots.invalidText, demoSlots.conflictText, demoSlots.rateLimitedText, demoSlots.capacityText, demoSlots.fallbackLead];
  const CONTACT_FILES = ["contact.html", "contact.txt", "contact/__next._full.txt", "contact/__next.contact.__PAGE__.txt"].sort();
  for (const text of texts) {
    const withText = [...packageText]
      .filter(([, t]) => t.includes(text))
      .map(([f]) => f)
      .sort();
    eq(withText, CONTACT_FILES, `files naming: ${text}`);
    assert(!stripScripts(contact).includes(text), `rendered visibly: ${text}`);
  }
});

console.log(`\n${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
