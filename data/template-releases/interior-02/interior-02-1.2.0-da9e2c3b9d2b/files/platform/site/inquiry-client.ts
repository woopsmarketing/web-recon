/**
 * Browser-side door for a Template's inquiry form: the cross-origin POST of the visitor's inquiry
 * to the endpoint the SITE declares (data/sites/<siteId>/inquiry.json → SiteContext.inquiry).
 *
 * Template code may not touch `fetch`/timers/`window`/`crypto` (release gate); like browser.ts for
 * URL state, this module is the narrow, platform-owned door for the one network request a static
 * per-site build legitimately makes. It is deliberately not a general HTTP client, and it is the
 * SAME for every site and every Template — nothing here is chosen per customer:
 *   - the method, headers and body shape are fixed here — a Template chooses none of them;
 *   - the body carries exactly the keys below (an endpoint that validates strictly refuses
 *     anything else — in particular there is no `source`, which the endpoint decides itself, and
 *     no challenge token), and `consent` can only be the literal true;
 *   - no cookies or credentials are sent, and a redirect is an error (what the visitor typed is
 *     delivered to the declared URL or to nowhere);
 *   - the text it sends is normalised here (normalizeInquiryText) and the phone number must pass
 *     the phone rule (isInquiryPhone): a strict endpoint refuses control characters and anything
 *     that is not a phone number, so such a request is never made;
 *   - every request carries a `submission_id`: ONE id per logical inquiry, not per press — see
 *     createInquirySender. With it the endpoint stores an inquiry once however often it is sent;
 *   - what is reported back is "ok", or "failed" with one word of a closed vocabulary
 *     (InquiryFailure) and, when the endpoint asked for a pause, how long: no status code, no
 *     response text and no error detail ever reaches Template code or the page;
 *   - nothing is retried by itself, nothing is logged, and nothing is kept outside this module's
 *     memory (no storage, no cookie): a page load starts from nothing.
 * No vendor, host or key is named here: the endpoint is site data.
 */

/**
 * Characters removed from every text value: the C0 controls (TAB and the line breaks are handled
 * before this class is applied), DEL and the C1 controls, the soft hyphen, zero-width and
 * bidirectional format characters (U+200B–U+200F, U+202A–U+202E, U+2060–U+2064, U+2066–U+2069,
 * U+FEFF), the line / paragraph separators (U+2028, U+2029) and the Hangul filler (U+3164) — none
 * of them is something a person means to type into a name, a phone number or a message, and all of
 * them reach a form through a paste. Written as escapes in a string on purpose: this file contains
 * no literal invisible character.
 */
const INVISIBLE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F\\u00AD\\u200B-\\u200F\\u202A-\\u202E\\u2028\\u2029\\u2060-\\u2064\\u2066-\\u2069\\u3164\\uFEFF]",
  "gu",
);
const LINE_BREAK = new RegExp("\\r\\n?|\\n", "g");
const TAB = new RegExp("\\t", "g");

/**
 * One text value as it is validated and sent: every line break becomes "\n" (kept only when
 * `multiline` — a one-line value gets a space instead), a TAB becomes one space, the invisible
 * characters above are removed, and the result is trimmed. Idempotent.
 */
export function normalizeInquiryText(value: string, multiline = false): string {
  return value
    .replace(LINE_BREAK, multiline ? "\n" : " ")
    .replace(TAB, " ")
    .replace(INVISIBLE, "")
    .trim();
}

/**
 * A phone number as people write it: only digits, spaces, + - ( ), 8 to 20 characters, of which at
 * least 8 are digits. Lenient on purpose (no national format is assumed). This is the source of an
 * HTML `pattern` attribute — which the browser anchors and compiles with the `v` flag (the `u` flag
 * in older browsers): every class character that syntax reserves is escaped, so it compiles in both.
 */
export const INQUIRY_PHONE_PATTERN = "(?=(?:[^0-9]*[0-9]){8})[0-9+\\-\\(\\) ]{8,20}";
const PHONE_RULE = new RegExp(`^(?:${INQUIRY_PHONE_PATTERN})$`, "u");

/** The same rule as INQUIRY_PHONE_PATTERN, for a value that did not go through the attribute's check. */
export function isInquiryPhone(value: string): boolean {
  return PHONE_RULE.test(value);
}

/** What the form sends, already normalised and folded by the Template. */
export interface InquirySubmission {
  /** the visitor ticked the (required) consent box — the request is never made without it */
  consent: true;
  name: string;
  phone: string;
  message: string;
  /** honeypot: the value of the form's hidden trap field ("" for a person) */
  hp: string;
}

/**
 * Why an inquiry was not confirmed. A closed vocabulary — what a form needs to say the right thing
 * and nothing more:
 *   invalid       the endpoint refused the values (400), or the door did (nothing was sent);
 *   conflict      the endpoint already holds a DIFFERENT inquiry under this submission (409);
 *   rate_limited  too many attempts (429): another one may be made once `wait` is over;
 *   capacity      the endpoint is not taking this site's inquiries for now (429) — not the
 *                 visitor's doing, and not something to try again right away;
 *   timeout       no answer in time (408, or INQUIRY_TIMEOUT_MS passed);
 *   unavailable   the endpoint is temporarily down (503);
 *   network       the request did not get through (offline, blocked, CORS, a redirect);
 *   unknown       anything else — an unrecognised status or body.
 * After timeout / unavailable / network / unknown it is NOT known whether the inquiry was stored.
 */
export type InquiryFailure = "invalid" | "conflict" | "rate_limited" | "capacity" | "timeout" | "unavailable" | "network" | "unknown";

/** The pause a "rate_limited" answer asks for. */
export interface InquiryWait {
  /** what is left of it, in whole seconds, when this result was made (at first: the endpoint's Retry-After) */
  seconds: number;
  /** settles when it has passed — a Template has no timer and no clock of its own */
  over: Promise<void>;
}

export type InquiryResult = { status: "ok" } | { status: "failed"; reason: InquiryFailure; wait?: InquiryWait };

/** Sends (or sends again) an inquiry to ONE endpoint. Never throws, never rejects. */
export type InquirySender = (submission: InquirySubmission) => Promise<InquiryResult>;

/** A request still unanswered after this long is aborted and reported as a timeout. */
export const INQUIRY_TIMEOUT_MS = 15_000;
/** The pause after a "rate_limited" answer that names none (or one this page may not read). */
export const INQUIRY_RETRY_DEFAULT_S = 60;
/** The longest pause honoured: a larger Retry-After is cut to this. */
export const INQUIRY_RETRY_MAX_S = 3600;
/**
 * A pause is measured on the wall clock and looked at again at least this often: a timer that was
 * frozen with its page (a locked phone, a background tab) must not stretch the pause.
 */
export const INQUIRY_PAUSE_TICK_MS = 15_000;

const failed = (reason: InquiryFailure): InquiryResult => ({ status: "failed", reason });

/**
 * A new submission id: a random (version 4) UUID. `crypto.randomUUID()` where the browser has it;
 * the same value built from `crypto.getRandomValues` where it does not (older browsers, a page not
 * in a secure context); undefined only without any `crypto` — the inquiry is then sent without an
 * id, as an endpoint accepts it, rather than not at all.
 */
function newSubmissionId(): string | undefined {
  try {
    const source: Partial<Pick<Crypto, "randomUUID" | "getRandomValues">> | undefined = globalThis.crypto;
    if (typeof source?.randomUUID === "function") return source.randomUUID();
    if (typeof source?.getRandomValues !== "function") return undefined;
    const bytes = source.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    // a `crypto` that is there but refuses (an embedded browser, a locked-down page): no id
    return undefined;
  }
}

const DELTA_SECONDS = new RegExp("^[0-9]{1,9}$");
/** an HTTP date names its day and month: a value without a letter is not one (and not for Date.parse to guess at) */
const HAS_LETTER = new RegExp("[A-Za-z]");

/** A Retry-After value (delta-seconds or an HTTP date) as a pause in seconds, between 1 and the maximum. */
function retryAfterSeconds(header: string | null): number {
  const value = header?.trim() ?? "";
  let seconds = INQUIRY_RETRY_DEFAULT_S;
  if (DELTA_SECONDS.test(value)) seconds = Number(value);
  else if (HAS_LETTER.test(value)) {
    const at = Date.parse(value);
    if (!Number.isNaN(at)) seconds = Math.ceil((at - Date.now()) / 1000);
  }
  return Math.min(Math.max(seconds, 1), INQUIRY_RETRY_MAX_S);
}

/** The `error` word of a JSON error body, or "" (a body that is not such JSON is not an error to report). */
async function errorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const code = typeof body === "object" && body !== null ? (body as { error?: unknown }).error : undefined;
    return typeof code === "string" ? code : "";
  } catch {
    return "";
  }
}

/** What one request came to: the result, and for "rate_limited" the pause the endpoint named. */
type Answer = { result: InquiryResult; retryAfter?: number };

/** A 200's body: true only for JSON `{ "received": true }` (a body that is not JSON is not a confirmation). */
async function confirmed(response: Response): Promise<boolean> {
  try {
    const answer: unknown = await response.json();
    return typeof answer === "object" && answer !== null && (answer as { received?: unknown }).received === true;
  } catch {
    return false;
  }
}

/** ONE request. "ok" only for HTTP 200 with a JSON body `{ "received": true }`. Never rejects. */
async function post(endpoint: string, body: string): Promise<Answer> {
  let controller: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const abort = (controller = new AbortController());
    timer = setTimeout(() => abort.abort(), INQUIRY_TIMEOUT_MS);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      mode: "cors",
      credentials: "omit",
      redirect: "error",
      signal: abort.signal,
    });
    switch (response.status) {
      case 200:
        if (await confirmed(response)) return { result: { status: "ok" } };
        // the answer was cut off by the timeout, or it is a 200 this door does not recognise
        return { result: failed(abort.signal.aborted ? "timeout" : "unknown") };
      case 400:
        return { result: failed("invalid") };
      case 408:
        return { result: failed("timeout") };
      case 409:
        return { result: failed("conflict") };
      case 429:
        // two different things share this status; only the endpoint's own word tells them apart
        if ((await errorCode(response)) === "channel_capacity") return { result: failed("capacity") };
        return { result: failed("rate_limited"), retryAfter: retryAfterSeconds(response.headers.get("Retry-After")) };
      case 503:
        return { result: failed("unavailable") };
      default:
        return { result: failed("unknown") };
    }
  } catch {
    return { result: failed(controller?.signal.aborted ? "timeout" : controller ? "network" : "unknown") };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A pause of `seconds`, measured on the wall clock: `over` settles (after `done` ran) at the first
 * look at the clock that finds it passed — one timer for a short pause, a timer per
 * INQUIRY_PAUSE_TICK_MS for a long one.
 */
function startPause(seconds: number, done: () => void): { until: number; over: Promise<void> } {
  const until = Date.now() + seconds * 1000;
  const over = new Promise<void>((resolve) => {
    const look = () => {
      const left = until - Date.now();
      if (left > 0) {
        setTimeout(look, Math.min(left, INQUIRY_PAUSE_TICK_MS));
        return;
      }
      done();
      resolve();
    };
    look();
  });
  return { until, over };
}

/**
 * A sender for ONE endpoint, with a memory of its own (a form uses inquirySender below, which keeps
 * one per endpoint for the page).
 *
 * It owns the submission id — the endpoint's idempotency key — and gives one id to one LOGICAL
 * inquiry, never one per press:
 *   - an id is made when values are sent for the first time, and belongs to exactly those values
 *     (the normalised name, phone, message and trap value);
 *   - the same values sent again — a second press, a retry after a timeout, a network error, a
 *     503, a 429 or a 400, or the visitor writing the same inquiry once more — carry the SAME id,
 *     so an endpoint that already stored the inquiry (its answer may simply have been lost) stores
 *     nothing twice;
 *   - different values get an id of their OWN: an id is never sent with other values than its
 *     own, which is exactly what an endpoint answers with a conflict;
 *   - an id is forgotten when the endpoint confirmed its inquiry ("ok") or refused the id for good
 *     ("conflict"): the same values sent after that are a new submission, with a new id.
 * The id is used for nothing else: it is not stored, not logged, not shared between page loads,
 * and identifies neither a visitor nor a visit.
 *
 * Presses are harmless here whatever the form does about its button: while a request is on its
 * way, another call with the same values JOINS it (one request, the same result for both) and one
 * with other values is refused ("unknown" — one request at a time); after a "rate_limited" answer
 * no request is made until its pause is over (by the wall clock). Nothing is ever sent again by
 * itself — a retry is always the visitor's press.
 *
 * No request is made at all (→ "invalid") without the consent, with an empty name or message, or
 * with a phone number that fails the phone rule — each judged on the normalised text, which is
 * also what is sent. The honeypot value is forwarded as it is. A non-https endpoint or a browser
 * without `fetch` → "unknown", also without a request.
 */
export function createInquirySender(endpoint: string): InquirySender {
  /** the id of every inquiry not yet confirmed or refused, by its values */
  const ids = new Map<string, string | undefined>();
  /** the request on its way, and the values it carries */
  let pending: { values: string; result: Promise<InquiryResult> } | undefined;
  /** the pause a "rate_limited" answer asked for, until it is over */
  let pause: { until: number; over: Promise<void> } | undefined;

  const send = (submission: InquirySubmission): Promise<InquiryResult> => {
    if (typeof fetch !== "function" || !endpoint.startsWith("https://")) return Promise.resolve(failed("unknown"));
    if (submission.consent !== true) return Promise.resolve(failed("invalid"));
    const name = normalizeInquiryText(submission.name);
    const phone = normalizeInquiryText(submission.phone);
    const message = normalizeInquiryText(submission.message, true);
    const hp = submission.hp;
    if (name === "" || message === "" || !isInquiryPhone(phone)) return Promise.resolve(failed("invalid"));
    const values = JSON.stringify([name, phone, message, hp]);
    if (pending) return pending.values === values ? pending.result : Promise.resolve(failed("unknown"));
    if (pause) {
      const left = pause.until - Date.now();
      if (left > 0) return Promise.resolve({ status: "failed", reason: "rate_limited", wait: { seconds: Math.ceil(left / 1000), over: pause.over } });
      pause = undefined;
    }
    if (!ids.has(values)) ids.set(values, newSubmissionId());
    const id = ids.get(values);
    const body = JSON.stringify({ consent: true, name, phone, message, hp, ...(id === undefined ? {} : { submission_id: id }) });
    const result = post(endpoint, body).then(({ result: answer, retryAfter }): InquiryResult => {
      pending = undefined;
      if (answer.status === "ok" || answer.reason === "conflict") {
        ids.delete(values);
        return answer;
      }
      if (answer.reason !== "rate_limited") return answer;
      const seconds = retryAfter ?? INQUIRY_RETRY_DEFAULT_S;
      const started = startPause(seconds, () => {
        if (pause === started) pause = undefined;
      });
      pause = started;
      return { ...answer, wait: { seconds, over: started.over } };
    });
    pending = { values, result };
    return result;
  };

  return (submission) => {
    try {
      return send(submission);
    } catch {
      return Promise.resolve(failed("unknown"));
    }
  };
}

const senders = new Map<string, InquirySender>();

/**
 * THE sender for an endpoint on this page: made on first use and kept for as long as the page's
 * script lives (in memory only — a page load starts from nothing). A form that is taken off the
 * page and put back (the visitor followed a link of the site and returned) therefore sends through
 * the same sender: an inquiry whose answer was lost keeps its id when it is written again, and a
 * pause the endpoint asked for still holds.
 */
export function inquirySender(endpoint: string): InquirySender {
  let sender = senders.get(endpoint);
  if (!sender) {
    sender = createInquirySender(endpoint);
    senders.set(endpoint, sender);
  }
  return sender;
}
