import { createHash } from "node:crypto";

/**
 * Public-URL verification (contract §5.4): what the publisher reports as `verified` is exactly what
 * these requests observed, never what the build or the publish said — and it is bound to the package
 * that was just built: a URL counts only when the bytes it serves ARE that package's bytes.
 *
 *   present   every file the caller names for the record — its detail page GET <base>/portfolio/<slug>
 *             and its cover image — answers 200 with exactly the built package's bytes (sha256)
 *   absent    GET <base>/portfolio/<slug> (the URL the export says the record was public under) answers 404
 *   list      GET <base>/portfolio is the built package's listing page, byte for byte (also what proves
 *             a removal reached the public site, and that a site without an integration feed serves
 *             THIS package)
 *   manifest  when the build emitted an integration portfolio document:
 *             GET <base>/_integration/manifest.json names exactly that version
 *
 * A check is repeated a few times before it is given up (the routing pointer has just moved), a few
 * checks run at once, and the whole verification has one deadline. A request that could not be made
 * at all is an ERROR (the stage cannot tell), not an "unconfirmed".
 */

/** The detail URL shape the contract fixes (§4 verified.present / §5.4). */
export const detailPath = (slug: string) => `/portfolio/${slug}`;
export const LIST_PATH = "/portfolio";
export const MANIFEST_URL_PATH = "/_integration/manifest.json";

/** A URL path of the public site and the sha256 the built package holds for it. */
export interface ExpectedFile {
  path: string;
  sha256: string;
}

export interface VerifyTarget {
  id: string;
  slug: string;
  /** present only: the built package's files this record's public URLs must serve (detail page first). Absent → the detail page's status alone is checked. */
  files?: readonly ExpectedFile[];
}

export interface VerifyInput {
  /** origin the published site answers on, e.g. https://<hostname> or http://localhost:8787 */
  base: string;
  present: readonly VerifyTarget[];
  absent: readonly VerifyTarget[];
  /** the built package's listing page */
  list?: ExpectedFile;
  /** the portfolio document version the build emitted; undefined = the site's integration is off (no manifest check) */
  expectPortfolioVersion?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** attempts per check (default 4) and the pause between them (default 1500 ms) */
  attempts?: number;
  delayMs?: number;
  /** checks in flight at once (default 4) and the deadline of the whole verification (default 120 s) */
  concurrency?: number;
  deadlineMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

export interface VerifyOutcome {
  /** record ids whose public URLs served the built package's bytes */
  present: string[];
  /** record ids whose previous detail URL answered 404 */
  absent: string[];
  /** checks that got an answer, but not the expected one (`got`: the status, or 200 with `detail` when the bytes differ) */
  unconfirmed: { id: string; url: string; expected: 200 | 404; got: number; detail?: string }[];
  list?: { url: string; expected: string; got: string; ok: boolean };
  manifest?: { url: string; expected: string; got: string | undefined; ok: boolean };
  /** requests that never got an HTTP answer (DNS, connection, timeout, deadline) */
  errors: string[];
}

export function verifyBaseOrigin(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error(`--verify-base "${input}" is not a URL`);
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.pathname.replace(/\/+$/, "") !== "" || url.search || url.hash || url.username || url.password) {
    throw new Error(`--verify-base "${input}" must be an http(s) origin (no path, query, hash or credentials)`);
  }
  return url.origin;
}

/** localhost, *.localhost, 127.0.0.0/8, ::1 */
export function isLoopbackOrigin(origin: string): boolean {
  const host = new URL(origin).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host.endsWith(".localhost") || /^127(\.\d{1,3}){3}$/.test(host) || host === "::1";
}

const sha256Hex = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function verifyPublic(input: VerifyInput): Promise<VerifyOutcome> {
  const base = verifyBaseOrigin(input.base);
  const doFetch = input.fetch ?? fetch;
  const attempts = Math.max(1, input.attempts ?? 4);
  const delayMs = input.delayMs ?? 1500;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = Date.now() + (input.deadlineMs ?? 120_000);
  const out: VerifyOutcome = { present: [], absent: [], unconfirmed: [], errors: [] };

  async function get(url: string): Promise<Response> {
    const left = deadline - Date.now();
    if (left <= 0) throw new Error("verification deadline reached");
    return doFetch(url, { method: "GET", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(Math.max(1, Math.min(input.timeoutMs ?? 20_000, left))) });
  }

  /** repeats until `accept` holds; returns the last answer, or the last network error */
  async function settle<T>(url: string, read: (res: Response) => Promise<T>, accept: (value: T) => boolean): Promise<{ value: T } | { error: string }> {
    let last: { value: T } | { error: string } = { error: "not attempted" };
    for (let attempt = 1; attempt <= attempts; attempt++) {
      if (attempt > 1) {
        if (Date.now() + delayMs >= deadline) break;
        await sleep(delayMs);
      }
      try {
        const value = await read(await get(url));
        last = { value };
        if (accept(value)) return last;
      } catch (error) {
        last = { error: (error as Error).message };
      }
    }
    return last;
  }
  type Body = { status: number; sha256?: string };
  const readBody = async (res: Response): Promise<Body> => {
    if (res.status !== 200) {
      await res.arrayBuffer().catch(() => undefined);
      return { status: res.status };
    }
    return { status: 200, sha256: sha256Hex(new Uint8Array(await res.arrayBuffer())) };
  };
  const fileCheck = (file: ExpectedFile) => settle(`${base}${file.path}`, readBody, (b) => b.status === 200 && b.sha256 === file.sha256);

  // one job per record / page; each fills its own slot so the outcome keeps the input order
  type Verdict = { ok: boolean; unconfirmed?: VerifyOutcome["unconfirmed"][number]; error?: string };
  const presentVerdicts: Verdict[] = new Array(input.present.length);
  const absentVerdicts: Verdict[] = new Array(input.absent.length);
  const jobs: (() => Promise<void>)[] = [];

  input.present.forEach((t, i) => {
    jobs.push(async () => {
      const files = t.files && t.files.length > 0 ? t.files : undefined;
      if (!files) {
        const url = `${base}${detailPath(t.slug)}`;
        const r = await settle(url, readBody, (b) => b.status === 200);
        presentVerdicts[i] = "error" in r ? { ok: false, error: `${url}: ${r.error}` } : r.value.status === 200 ? { ok: true } : { ok: false, unconfirmed: { id: t.id, url, expected: 200, got: r.value.status } };
        return;
      }
      for (const file of files) {
        const url = `${base}${file.path}`;
        const r = await fileCheck(file);
        if ("error" in r) return void (presentVerdicts[i] = { ok: false, error: `${url}: ${r.error}` });
        if (r.value.status !== 200) return void (presentVerdicts[i] = { ok: false, unconfirmed: { id: t.id, url, expected: 200, got: r.value.status } });
        if (r.value.sha256 !== file.sha256) {
          return void (presentVerdicts[i] = { ok: false, unconfirmed: { id: t.id, url, expected: 200, got: 200, detail: `served sha256 ${r.value.sha256!.slice(0, 12)}… is not the built package's ${file.sha256.slice(0, 12)}…` } });
        }
      }
      presentVerdicts[i] = { ok: true };
    });
  });
  input.absent.forEach((t, i) => {
    jobs.push(async () => {
      const url = `${base}${detailPath(t.slug)}`;
      const r = await settle(url, readBody, (b) => b.status === 404);
      absentVerdicts[i] = "error" in r ? { ok: false, error: `${url}: ${r.error}` } : r.value.status === 404 ? { ok: true } : { ok: false, unconfirmed: { id: t.id, url, expected: 404, got: r.value.status } };
    });
  });
  if (input.list) {
    const list = input.list;
    jobs.push(async () => {
      const url = `${base}${list.path}`;
      const r = await fileCheck(list);
      if ("error" in r) out.errors.push(`${url}: ${r.error}`);
      else out.list = { url, expected: list.sha256, got: r.value.sha256 ?? `HTTP ${r.value.status}`, ok: r.value.sha256 === list.sha256 };
    });
  }
  if (input.expectPortfolioVersion !== undefined) {
    const expected = input.expectPortfolioVersion;
    jobs.push(async () => {
      const url = `${base}${MANIFEST_URL_PATH}`;
      const r = await settle(
        url,
        async (res) => {
          if (res.status !== 200) {
            await res.arrayBuffer().catch(() => undefined);
            return `HTTP ${res.status}`;
          }
          const manifest = (await res.json().catch(() => undefined)) as { resources?: { portfolio?: { version?: unknown } } } | undefined;
          const version = manifest?.resources?.portfolio?.version;
          return typeof version === "string" ? version : "no portfolio resource";
        },
        (got) => got === expected,
      );
      if ("error" in r) out.errors.push(`${url}: ${r.error}`);
      else out.manifest = { url, expected, got: r.value, ok: r.value === expected };
    });
  }

  // bounded concurrency
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) await jobs[next++]!();
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(input.concurrency ?? 4, jobs.length)) }, worker));

  const collect = (targets: readonly VerifyTarget[], verdicts: Verdict[], into: string[]) => {
    targets.forEach((t, i) => {
      const v = verdicts[i]!;
      if (v.ok) into.push(t.id);
      else if (v.error) out.errors.push(v.error);
      else if (v.unconfirmed) out.unconfirmed.push(v.unconfirmed);
    });
  };
  const listErrors = out.errors.splice(0); // record errors first, in input order; then the page-level ones
  collect(input.present, presentVerdicts, out.present);
  collect(input.absent, absentVerdicts, out.absent);
  out.errors.push(...listErrors);

  input.log?.(
    `verify ${base}: present ${out.present.length}/${input.present.length}, absent ${out.absent.length}/${input.absent.length}${out.list ? `, listing ${out.list.ok ? "ok" : "NOT the built package's"}` : ""}${out.manifest ? `, manifest ${out.manifest.ok ? "ok" : `MISMATCH (${out.manifest.got})`}` : ""}${out.errors.length ? `, ${out.errors.length} request error(s)` : ""}`,
  );
  return out;
}
