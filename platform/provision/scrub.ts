/**
 * What may leave the runner as text (a log line, the `message` of a `failed` event): never a
 * credential. Two layers —
 *   1. the exact secret values this process holds (publisher token, event token, Cloudflare token);
 *   2. shapes that carry one whatever its value: a bearer header, URL credentials, a URL query,
 *      key=value pairs named like a secret.
 * Hashes, hostnames, site ids and file names are left alone: they are what a failure message is for.
 */

export const REDACTED = "[redacted]";

export interface Scrubber {
  /** one line, secrets removed, control characters and newlines collapsed */
  line(text: unknown): string;
  /** line(), cut to `max` characters */
  message(text: unknown, max: number): string;
  /** register one more exact value to remove (ignored when shorter than 8 characters) */
  add(secret: string | undefined): void;
}

export function createScrubber(secrets: readonly (string | undefined)[] = [], replacements: readonly [string, string][] = []): Scrubber {
  const values = new Set<string>();
  const add = (secret: string | undefined) => {
    if (typeof secret === "string" && secret.length >= 8) values.add(secret);
  };
  secrets.forEach(add);

  const line = (input: unknown): string => {
    let text = typeof input === "string" ? input : input instanceof Error ? input.message : String(input);
    // longest first, so a secret that contains another is removed whole
    for (const secret of [...values].sort((a, b) => b.length - a.length)) text = text.split(secret).join(REDACTED);
    for (const [from, to] of replacements) if (from) text = text.split(from).join(to);
    return text
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`)
      .replace(/\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, `$1${REDACTED}@`)
      .replace(/(\bhttps?:\/\/[^\s?#"'<>]+)\?[^\s"'<>]*/gi, `$1?${REDACTED}`)
      .replace(/\b([A-Za-z0-9_-]*(?:token|secret|password|passwd|authorization|api[_-]?key)[A-Za-z0-9_-]*)(\s*[=:]\s*)("?)[^\s"',;]+/gi, `$1$2$3${REDACTED}`)
      .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };

  return {
    line,
    message(input, max) {
      const text = line(input);
      return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
    },
    add,
  };
}
