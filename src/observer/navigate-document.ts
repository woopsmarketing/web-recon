import { createHash } from "node:crypto";
import type { Page, Response } from "playwright";
import {
  DOCUMENT_NAV_RETRY_BACKOFF_MS,
  DOCUMENT_RESPONSE_FILE,
  MAX_DOCUMENT_NAV_ATTEMPTS,
  MAX_DOCUMENT_RESPONSE_BYTES,
  NAV_TIMEOUT_MS,
  type DocumentNavigationAttempt,
  type DocumentResponse,
  type InitialDocument,
} from "./types.js";
import { decodeCapturedBody } from "./document-charset.js";

export { decodeCapturedBody, decodeDocumentBytes, detectCharset } from "./document-charset.js";

/* ---------------------------------------------------------------------------
 * Task 28.75 §07 — THE MAIN DOCUMENT'S HTTP STATUS, FOR EVERY PAGE LOAD.
 * ---------------------------------------------------------------------------
 *
 * WHY THIS MODULE EXISTS. Task 28.7 B1 established that the observer must read
 * `page.goto`'s main-frame response, retry a non-2xx once, and MARK the capture
 * when the retry still fails — because a proxy error body is otherwise filed as
 * a perfectly successful observation. It shipped that policy inside
 * `observe-page.ts`, private to the DEEP observation's own page load.
 *
 * The pipeline makes FOUR loads of every URL, not two: desktop deep, mobile
 * deep, desktop probe, mobile probe. The probe's load lived in `layout-probe.ts`
 * and never got the gate, so exactly the defect B1 was opened for survived on
 * half the loads — and then happened, on `linear.app /`, run
 * `2026-09-04T22-34-32-296Z`: the MOBILE PROBE's own load answered with a
 * plain-text edge error, Chrome wrapped it in `<pre>`, and the probe recorded
 * `html/body/pre` — THREE elements — against a 2,283-element page, with
 * `disconnected: 0` and `prepareScrollStatus: prepare-scroll-complete`. Nothing
 * in the artifact was red.
 *
 * The policy is unchanged. It is only moved to where BOTH callers can reach it,
 * because a load policy that only one of four loads obeys is not a policy.
 *
 * `layout-probe.ts` cannot import from `observe-page.ts` — `observe-page.ts`
 * already imports `autoScrollPrepare` from `layout-probe.ts`, so the dependency
 * runs the other way. Hence a module both can depend on rather than a re-export.
 * ------------------------------------------------------------------------- */

/**
 * A wait that cannot reject. `page.waitForTimeout` throws once the page,
 * context or browser has gone away, and a stabilization wait must never be the
 * reason an observation is lost — that is the whole class of defect Task 28.7
 * A1 was opened for.
 */
export async function pause(page: Page, ms: number): Promise<void> {
  try {
    await page.waitForTimeout(ms);
  } catch {
    await new Promise<void>((resolve) => setTimeout(resolve, ms));
  }
}

/** True for an HTTP status the server calls a success. */
export function isOkStatus(status: number | null): boolean {
  return status !== null && status >= 200 && status <= 299;
}

/**
 * Navigate to the main document, retrying ONCE on a non-2xx answer.
 *
 * A `null` status (Playwright produced no main-frame response at all — a
 * same-document navigation, `about:blank`) is NOT evidence of failure and is
 * never retried: it is recorded as `statusUnavailable` and left alone, because
 * inventing a 200 for it would be the confident-wrong-value bug this record
 * exists to prevent.
 *
 * A `goto` that THROWS is untouched by this: it propagates exactly as before,
 * and the site orchestrator still files it as a `navigation-error`.
 */
export async function navigateMainDocument(
  page: Page,
  requestedUrl: string,
  log: (message: string) => void,
): Promise<DocumentResponse> {
  return (await navigateMainDocumentWithResponse(page, requestedUrl, log)).documentResponse;
}

/**
 * Responsive Core P0 §C1.1 — the same navigation, additionally capturing the
 * MAIN-DOCUMENT response body ONCE from the `Response` `page.goto` already
 * returned (the final, post-redirect attempt). No second HTTP request is made,
 * and `page.content()` is never used as a substitute: the body is the bytes as
 * served, before any script ran.
 */
export async function navigateMainDocumentCapturingBody(
  page: Page,
  requestedUrl: string,
  log: (message: string) => void,
): Promise<{
  documentResponse: DocumentResponse;
  initialDocument: InitialDocument;
  /** Decoded text; present only when `initialDocument.status === "captured"`. */
  html?: string;
  /** Raw response bytes; present exactly when `html` is. */
  body?: Buffer;
}> {
  const { documentResponse, response } = await navigateMainDocumentWithResponse(
    page,
    requestedUrl,
    log,
  );
  const captured = await captureDocumentBody(response, documentResponse);
  return { documentResponse, ...captured };
}

async function captureDocumentBody(
  response: Response | null,
  documentResponse: DocumentResponse,
): Promise<{ initialDocument: InitialDocument; html?: string; body?: Buffer }> {
  if (response === null) {
    return {
      initialDocument: { status: "unavailable", reason: "no-main-frame-response" },
    };
  }
  const url = response.url();
  const httpStatus = response.status();
  let contentType: string | undefined;
  try {
    contentType = (await response.headerValue("content-type")) ?? undefined;
  } catch {
    contentType = undefined;
  }
  const base: InitialDocument = {
    status: "unavailable",
    url,
    httpStatus,
    ...(contentType !== undefined ? { contentType } : {}),
  };
  if (!documentResponse.ok) {
    return { initialDocument: { ...base, status: "unavailable", reason: "document-non-2xx" } };
  }
  if (contentType !== undefined && !/(text\/html|application\/xhtml\+xml)/i.test(contentType)) {
    return { initialDocument: { ...base, status: "not-html", reason: "content-type" } };
  }
  let body: Buffer;
  try {
    body = await response.body();
  } catch (err) {
    const reason = err instanceof Error ? err.message.split("\n", 1)[0]! : String(err);
    return {
      initialDocument: { ...base, status: "error", reason: `body-unreadable: ${reason}`.slice(0, 200) },
    };
  }
  const bytes = body.byteLength;
  const sha256 = createHash("sha256").update(body).digest("hex");
  if (bytes > MAX_DOCUMENT_RESPONSE_BYTES) {
    return {
      initialDocument: { ...base, status: "too-large", bytes, sha256, reason: "byte-cap" },
    };
  }
  const decoded = decodeCapturedBody(body, contentType);
  return {
    initialDocument: {
      ...base,
      status: "captured",
      bytes,
      sha256,
      file: DOCUMENT_RESPONSE_FILE,
      charset: decoded.charset,
      ...(decoded.declaredCharset !== decoded.charset
        ? { declaredCharset: decoded.declaredCharset }
        : {}),
    },
    html: decoded.html,
    body,
  };
}

async function navigateMainDocumentWithResponse(
  page: Page,
  requestedUrl: string,
  log: (message: string) => void,
): Promise<{ documentResponse: DocumentResponse; response: Response | null }> {
  let lastResponse: Response | null = null;
  const attempts: DocumentNavigationAttempt[] = [];
  let retried = false;
  let retryBackoffMs: number | undefined;

  for (let attempt = 1; attempt <= MAX_DOCUMENT_NAV_ATTEMPTS; attempt++) {
    const response: Response | null = await page.goto(requestedUrl, {
      waitUntil: "load",
      timeout: NAV_TIMEOUT_MS,
    });
    lastResponse = response;
    const status = response ? response.status() : null;
    const statusText = response ? response.statusText() : "";
    attempts.push({
      attempt,
      status,
      ...(statusText ? { statusText } : {}),
      ...(response ? { responseUrl: response.url() } : {}),
    });
    if (status === null || isOkStatus(status)) break;
    if (attempt >= MAX_DOCUMENT_NAV_ATTEMPTS) break;
    retried = true;
    retryBackoffMs = DOCUMENT_NAV_RETRY_BACKOFF_MS;
    log(
      `main document answered HTTP ${String(status)} — retrying once after ` +
        `${String(DOCUMENT_NAV_RETRY_BACKOFF_MS)}ms (a transient upstream 5xx is ` +
        `the measured common case)`,
    );
    await pause(page, DOCUMENT_NAV_RETRY_BACKOFF_MS);
  }

  const last = attempts[attempts.length - 1]!;
  const documentResponse: DocumentResponse = {
    status: last.status,
    ...(last.statusText ? { statusText: last.statusText } : {}),
    ...(last.responseUrl ? { responseUrl: last.responseUrl } : {}),
    ok: isOkStatus(last.status),
    statusUnavailable: last.status === null,
    attempts,
    retried,
    ...(retryBackoffMs !== undefined ? { retryBackoffMs } : {}),
    maxAttempts: MAX_DOCUMENT_NAV_ATTEMPTS,
  };
  return { documentResponse, response: lastResponse };
}
