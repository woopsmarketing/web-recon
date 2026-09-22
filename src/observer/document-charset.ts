/*
 * Review fix m1 — decoding the captured main-document bytes. PURE (no imports),
 * so the offline SiteSpec compile can decode `document-response.html` without
 * reaching the browser-side navigation module.
 *
 * MEASURED (Chromium 151 via Playwright): `Response.body()` of a TEXT document
 * is the browser-DECODED text re-encoded as UTF-8, not the bytes on the wire —
 * an EUC-KR page served as 219 bytes comes back as 221 UTF-8 bytes. So the
 * capture decodes the body as UTF-8 whenever it is valid UTF-8, records that
 * as `charset`, and keeps the page's declared label separately.
 */

/** Charset label from a `content-type` header, or from an early `<meta>`. */
export function detectCharset(contentType: string | undefined, body: Buffer): string {
  const fromHeader = /charset\s*=\s*["']?([^"';\s]+)/i.exec(contentType ?? "");
  if (fromHeader) return fromHeader[1]!.toLowerCase();
  // HTML sniffing window: the first 1024 bytes, ASCII-compatible.
  const head = body.subarray(0, 1024).toString("latin1");
  const fromMeta =
    /<meta[^>]+charset\s*=\s*["']?([^"'\s/>;]+)/i.exec(head) ??
    /<meta[^>]+content\s*=\s*["'][^"']*charset=([^"'\s;]+)/i.exec(head);
  return fromMeta ? fromMeta[1]!.toLowerCase() : "utf-8";
}

/**
 * Decode captured document bytes: an explicit `charset` label wins (the one
 * recorded at capture), then the `content-type` header, then an early
 * `<meta>`; an unknown label falls back to UTF-8 and reports that.
 */
export function decodeDocumentBytes(
  body: Buffer,
  contentType: string | undefined,
  charset?: string,
): { html: string; charset: string } {
  const label = charset ?? detectCharset(contentType, body);
  try {
    return { html: new TextDecoder(label).decode(body), charset: label };
  } catch {
    return { html: new TextDecoder("utf-8").decode(body), charset: "utf-8" };
  }
}


/**
 * Decode a body exactly as `Response.body()` handed it over: valid UTF-8 →
 * `utf-8` (the browser transcodes text documents); otherwise the declared
 * label. `declaredCharset` is the header / `<meta>` label, whatever was used.
 */
export function decodeCapturedBody(
  body: Buffer,
  contentType: string | undefined,
): { html: string; charset: string; declaredCharset: string } {
  const declaredCharset = detectCharset(contentType, body);
  try {
    return {
      html: new TextDecoder("utf-8", { fatal: true }).decode(body),
      charset: "utf-8",
      declaredCharset,
    };
  } catch {
    const decoded = decodeDocumentBytes(body, contentType, declaredCharset);
    return { ...decoded, declaredCharset };
  }
}
