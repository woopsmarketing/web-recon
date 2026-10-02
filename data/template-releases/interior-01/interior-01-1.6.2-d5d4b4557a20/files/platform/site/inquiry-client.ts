/**
 * Browser-side door for a Template's inquiry form: ONE cross-origin POST of the visitor's inquiry
 * to the endpoint the SITE declares (data/sites/<siteId>/inquiry.json → SiteContext.inquiry).
 *
 * Template code may not touch `fetch`/timers/`window` (release gate); like browser.ts for URL
 * state, this module is the narrow, platform-owned door for the one network request a static
 * per-site build legitimately makes. It is deliberately not a general HTTP client:
 *   - the method, headers and body shape are fixed here — a Template chooses none of them;
 *   - the body carries exactly the five keys below (an endpoint that validates strictly refuses
 *     anything else), and `consent` can only be the literal true;
 *   - no cookies or credentials are sent, and a redirect is an error (what the visitor typed is
 *     delivered to the declared URL or to nowhere);
 *   - the text it sends is normalised here (normalizeInquiryText) and the phone number must pass
 *     the phone rule (isInquiryPhone): a strict endpoint refuses control characters and anything
 *     that is not a phone number, so such a request is never made;
 *   - the only thing reported back is "ok" or "failed": no status code, no response text, no
 *     error detail ever reaches Template code or the page.
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

export type InquiryResult = { status: "ok" } | { status: "failed" };

/** A request still unanswered after this long is aborted and reported as failed. */
export const INQUIRY_TIMEOUT_MS = 15_000;

const FAILED: InquiryResult = { status: "failed" };

/**
 * POST the inquiry as JSON. Resolves "ok" only for HTTP 200 with a JSON body `{ "received": true }`;
 * every other outcome — another status, a body that is not that JSON, a network or CORS error, a
 * redirect, the timeout, a non-https endpoint — resolves "failed". Never rejects.
 *
 * No request is made at all (→ "failed") without the consent, with an empty name or message, or
 * with a phone number that fails the phone rule — each judged on the normalised text, which is
 * also what is sent. The honeypot value is forwarded as it is.
 */
export async function submitInquiry(endpoint: string, submission: InquirySubmission): Promise<InquiryResult> {
  if (typeof fetch !== "function" || !endpoint.startsWith("https://") || submission.consent !== true) return FAILED;
  const name = normalizeInquiryText(submission.name);
  const phone = normalizeInquiryText(submission.phone);
  const message = normalizeInquiryText(submission.message, true);
  if (name === "" || message === "" || !isInquiryPhone(phone)) return FAILED;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), INQUIRY_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consent: true,
        name,
        phone,
        message,
        hp: submission.hp,
      }),
      mode: "cors",
      credentials: "omit",
      redirect: "error",
      signal: controller.signal,
    });
    if (response.status !== 200) return FAILED;
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null && (body as { received?: unknown }).received === true ? { status: "ok" } : FAILED;
  } catch {
    return FAILED;
  } finally {
    clearTimeout(timer);
  }
}
