/**
 * Shared plumbing of the LOCAL end-to-end idempotency proof (Track B inquiry door <-> BoostChat
 * site-lead route). Nothing here is product code; it is used only by b-api-proof.mts,
 * c-browser-proof.mts and cleanup.mts in this directory.
 *
 * SAFETY (enforced in code, not by convention):
 *   - the database is the one named by TEST_DATABASE_URL in the BoostChat env file; the run is
 *     refused unless its host is loopback AND its name contains "test", and the LIVE connection is
 *     asked again (current_database / inet_server_addr) before the first write;
 *   - BoostChat is started from an ISOLATED COPY (BOOSTCHAT_E2E_COPY) that must not be a git
 *     working tree, bound to 127.0.0.1, with a scrubbed environment (no production variable is
 *     inherited, no TURNSTILE_* is set, mail goes to a loopback SMTP sink);
 *   - every fetch made through loopbackFetch() is refused unless the URL host is 127.0.0.1;
 *   - every row this harness creates hangs off a tenant / user whose slug / id / e-mail starts
 *     with FIXTURE_PREFIX, and only such rows (plus the rate-limit buckets carrying this run's
 *     channel id) are ever deleted.
 * Secrets (database URL, hash secrets) are read or generated in-process and never printed.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const E2E_DIR = path.dirname(fileURLToPath(import.meta.url));
export const TRACK_B_ROOT = path.resolve(E2E_DIR, "../../../..");
/** every tenant slug, user id and user e-mail this harness creates starts with this */
export const FIXTURE_PREFIX = "trackb-inquiry-v2-e2e-";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

// ── output ───────────────────────────────────────────────────────────────────
export function log(line = ""): void {
  console.log(line);
}
export function section(title: string): void {
  log("");
  log(`== ${title} ==`);
}
/** the first 8 characters of an id (a full UUID / key is never printed) */
export function id8(value: string | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  return `${value.slice(0, 8)}…`;
}
export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface CheckResult {
  id: string;
  ok: boolean;
}
const results: CheckResult[] = [];
/** one proven statement: what was expected, what was observed */
export function check(id: string, ok: boolean, expected: string, observed: string): boolean {
  results.push({ id, ok });
  log(`[${ok ? "PASS" : "FAIL"}] ${id}`);
  log(`         expected: ${expected}`);
  log(`         observed: ${observed}`);
  return ok;
}
export function info(id: string, text: string): void {
  log(`[INFO] ${id}  ${text}`);
}
export function summary(): { passed: number; failed: string[] } {
  const failed = results.filter((r) => !r.ok).map((r) => r.id);
  return { passed: results.length - failed.length, failed };
}

// ── guards ───────────────────────────────────────────────────────────────────
export function assertLoopbackHttpUrl(raw: string, what: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${what}: not a URL`);
  }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1") {
    throw new Error(`${what}: refused — only http://127.0.0.1:<port> is allowed (got host "${url.hostname}", ${url.protocol})`);
  }
  return url;
}

const realFetch = globalThis.fetch.bind(globalThis);
/** the ONLY way this harness talks HTTP: refused unless the target is http://127.0.0.1 */
export function loopbackFetch(url: string, init?: RequestInit): Promise<Response> {
  assertLoopbackHttpUrl(url, "loopbackFetch");
  return realFetch(url, { ...init, redirect: "error" });
}

/** the isolated BoostChat copy (never the owner's working tree) */
export function boostChatCopy(): string {
  const dir = process.env.BOOSTCHAT_E2E_COPY;
  if (!dir) throw new Error("BOOSTCHAT_E2E_COPY is not set (the isolated `git archive` copy of BoostChat — see README.md)");
  const abs = path.resolve(dir);
  if (existsSync(path.join(abs, ".git"))) throw new Error("BOOSTCHAT_E2E_COPY is a git working tree — refused: build and run only in an isolated copy");
  if (!existsSync(path.join(abs, ".next", "BUILD_ID"))) throw new Error("BOOSTCHAT_E2E_COPY has no .next/BUILD_ID — build the copy first (see README.md)");
  if (existsSync(path.join(abs, ".env.local")) || existsSync(path.join(abs, ".env"))) throw new Error("BOOSTCHAT_E2E_COPY contains an env file — refused: the server must get its environment from this harness only");
  return abs;
}
export function boostChatCommit(copy: string): string {
  const file = path.join(copy, ".e2e-source-commit");
  return existsSync(file) ? readFileSync(file, "utf8").trim() : "unknown (no .e2e-source-commit in the copy)";
}

/** TEST_DATABASE_URL of the BoostChat env file — read in-process, never printed */
function readTestDatabaseUrl(): { url: string; database: string } {
  const file = process.env.BOOSTCHAT_ENV_FILE ?? "/Users/woops/projects/boost-chat/.env.local";
  const text = readFileSync(file, "utf8");
  let raw: string | undefined;
  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf("=");
    if (at === -1 || line.slice(0, at).trim() !== "TEST_DATABASE_URL") continue;
    raw = line.slice(at + 1).trim();
  }
  if (!raw) throw new Error("TEST_DATABASE_URL not found in the BoostChat env file — refused (DATABASE_URL is never used instead)");
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) raw = raw.slice(1, -1);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("TEST_DATABASE_URL is not a URL — refused");
  }
  const database = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (!LOOPBACK_HOSTS.has(url.hostname)) throw new Error("TEST_DATABASE_URL host is not loopback — refused");
  if (!database.toLowerCase().includes("test")) throw new Error(`database name "${database}" does not contain "test" — refused`);
  return { url: raw, database };
}

// ── database ─────────────────────────────────────────────────────────────────
export interface Db {
  database: string;
  /** the connection string — handed to the BoostChat child process only */
  url: string;
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  end(): Promise<void>;
}

export async function openTestDb(copy: string): Promise<Db> {
  const { url, database } = readTestDatabaseUrl();
  const requireFromCopy = createRequire(path.join(copy, "package.json"));
  const pg = requireFromCopy("pg") as { Pool: new (config: { connectionString: string; max: number }) => { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>; end: () => Promise<void> } };
  const pool = new pg.Pool({ connectionString: url, max: 4 });
  // the LIVE connection is asked, not only the string
  const { rows } = await pool.query("select current_database() as db, host(inet_server_addr()) as addr");
  const live = rows[0] as { db: string; addr: string | null };
  if (!live.db.toLowerCase().includes("test")) {
    await pool.end();
    throw new Error(`connected database "${live.db}" does not contain "test" — refused`);
  }
  if (live.addr !== null && live.addr !== "127.0.0.1" && live.addr !== "::1") {
    await pool.end();
    throw new Error("connected database server is not on loopback — refused");
  }
  return {
    database: live.db,
    url,
    async query<T>(sql: string, params?: unknown[]): Promise<T[]> {
      return (await pool.query(sql, params)).rows as T[];
    },
    end: () => pool.end(),
  };
}

/**
 * The schema this proof is about (BoostChat migration 0055_lead_source_idempotency). This harness
 * never migrates: if it is missing, apply it with BoostChat's own `npm run db:migrate` pointed at
 * the TEST database, and only if that touches nobody else's data.
 */
export async function assertLeadSchema(db: Db): Promise<string> {
  const columns = await db.query<{ n: number }>(
    `select count(*)::int as n from information_schema.columns
      where table_schema = current_schema() and table_name = 'lead_request'
        and column_name in ('source', 'submission_id', 'submission_fingerprint')`,
  );
  const index = await db.query<{ indexdef: string }>("select indexdef from pg_indexes where schemaname = current_schema() and indexname = 'lead_request_submission_uniq'");
  if (columns[0]!.n !== 3 || index.length !== 1) {
    throw new Error("the test database lacks BoostChat migration 0055_lead_source_idempotency (lead_request.source / submission_id / submission_fingerprint + lead_request_submission_uniq) — refused; this harness does not migrate");
  }
  const applied = await db.query<{ at: string }>("select applied_at::text as at from _migration where name = '0055_lead_source_idempotency.sql'").catch(() => [] as { at: string }[]);
  const definition = index[0]!.indexdef.replace(/^.*USING btree /, "");
  return `present — unique index ${definition}; _migration says applied ${applied[0]?.at ?? "(not recorded)"}; nothing was migrated by this run`;
}

export interface Fixture {
  run: string;
  tenantId: string;
  slug: string;
  channelId: string;
  publicKey: string;
  ownerUserId: string;
  ownerEmail: string;
  origins: string[];
}

/** ONE tenant + its widget channel (enabled, with the allowed origins) + ONE owner (the notification's recipient) */
export async function seedFixture(db: Db, label: string, origins: string[]): Promise<Fixture> {
  const run = `${label}-${randomBytes(4).toString("hex")}`;
  const slug = `${FIXTURE_PREFIX}${run}`;
  const publicKey = `wgt_${randomBytes(24).toString("base64url")}`;
  const ownerUserId = `${slug}-owner`;
  const ownerEmail = `${slug}-owner@example.com`;
  const tenant = await db.query<{ id: string }>("insert into tenant (slug, name) values ($1, $2) returning id", [slug, `${slug} fixture`]);
  const tenantId = tenant[0]!.id;
  const channel = await db.query<{ id: string }>(
    `insert into tenant_public_widget (tenant_id, public_key, enabled, allowed_origins, approval_status)
     values ($1, $2, true, $3::text[], 'pending') returning id`,
    [tenantId, publicKey, origins],
  );
  await db.query('insert into "user" (id, name, email, "emailVerified") values ($1, $2, $3, true)', [ownerUserId, `${slug} owner`, ownerEmail]);
  await db.query("insert into tenant_membership (tenant_id, user_id, role) values ($1, $2, 'owner')", [tenantId, ownerUserId]);
  return { run, tenantId, slug, channelId: channel[0]!.id, publicKey, ownerUserId, ownerEmail, origins };
}

/** removes exactly what seedFixture + the run created: the buckets carrying this channel's id, the tenant (cascade), the owner */
export async function cleanupFixture(db: Db, fx: Fixture): Promise<{ buckets: number; leads: number; tenants: number; users: number }> {
  if (!fx.slug.startsWith(FIXTURE_PREFIX) || !fx.ownerUserId.startsWith(FIXTURE_PREFIX)) throw new Error("cleanup refused: not a fixture of this harness");
  const leads = await db.query<{ n: number }>("select count(*)::int as n from lead_request where tenant_id = $1", [fx.tenantId]);
  const buckets = await db.query("delete from analytics_rate_limit_bucket where position($1 in client_id) > 0 returning 1", [fx.channelId]);
  const tenants = await db.query("delete from tenant where id = $1 and slug = $2 and slug like $3 returning 1", [fx.tenantId, fx.slug, `${FIXTURE_PREFIX}%`]);
  const users = await db.query('delete from "user" where id = $1 and email like $2 returning 1', [fx.ownerUserId, `${FIXTURE_PREFIX}%`]);
  return { buckets: buckets.length, leads: leads[0]!.n, tenants: tenants.length, users: users.length };
}

/** what is left in the test database under this harness's prefix (all runs) */
export async function leftovers(db: Db): Promise<{ tenants: number; users: number; leads: number }> {
  const t = await db.query<{ n: number }>("select count(*)::int as n from tenant where slug like $1", [`${FIXTURE_PREFIX}%`]);
  const u = await db.query<{ n: number }>('select count(*)::int as n from "user" where email like $1', [`${FIXTURE_PREFIX}%`]);
  const l = await db.query<{ n: number }>("select count(*)::int as n from lead_request where tenant_id in (select id from tenant where slug like $1)", [`${FIXTURE_PREFIX}%`]);
  return { tenants: t[0]!.n, users: u[0]!.n, leads: l[0]!.n };
}

export interface LeadRow {
  id: string;
  source: string | null;
  submission_id: string | null;
  notified: boolean;
  has_message: boolean;
  message_md5: string;
  created_at: string;
}
export async function leadRows(db: Db, tenantId: string): Promise<LeadRow[]> {
  return db.query<LeadRow>(
    `select id::text as id, source, submission_id::text as submission_id, (notified_at is not null) as notified, (message is not null) as has_message,
            md5(coalesce(message, '')) as message_md5, created_at::text as created_at
       from lead_request where tenant_id = $1 order by created_at asc, id asc`,
    [tenantId],
  );
}
/** LEAD_ROWS: the number of lead_request rows of the test tenant, counted in SQL */
export async function leadCount(db: Db, tenantId: string): Promise<number> {
  const rows = await db.query<{ n: number }>("select count(*)::int as n from lead_request where tenant_id = $1", [tenantId]);
  return rows[0]!.n;
}
export async function leadCountForSubmission(db: Db, tenantId: string, submissionId: string): Promise<number> {
  const rows = await db.query<{ n: number }>("select count(*)::int as n from lead_request where tenant_id = $1 and submission_id = $2::uuid", [tenantId, submissionId]);
  return rows[0]!.n;
}

/**
 * The visitor budget is a FIXED window (10 minutes, aligned to the epoch, on the database clock).
 * A step that counts on one window waits here until at least `needSeconds` of the current one are left.
 */
export async function settleWindow(db: Db, windowSeconds: number, needSeconds: number): Promise<number> {
  const read = async (): Promise<number> => {
    const rows = await db.query<{ remaining: number }>("select ($1::int - (floor(extract(epoch from now()))::bigint % $1::int))::int as remaining", [windowSeconds]);
    return rows[0]!.remaining;
  };
  let remaining = await read();
  if (remaining < needSeconds) {
    log(`         (the ${windowSeconds}s budget window ends in ${remaining}s — waiting for the next one)`);
    await sleep((remaining + 1) * 1000);
    remaining = await read();
  }
  return remaining;
}

// ── ports ────────────────────────────────────────────────────────────────────
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}
export function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    const done = (inUse: boolean) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(1000);
    socket.on("connect", () => done(true));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
  });
}

// ── mail: the SMTP sink BoostChat's own tests use (scripts/smtp-sink.ts of the copy) ──
export interface MailSink {
  port: number;
  /** owner notifications that reached the sink for this fixture (recipient + the tenant's admin link) */
  countFor(fx: Fixture): number;
  /** waits until at least `min` arrived, then a little longer to see that no more come (delivery is detached) */
  settledCountFor(fx: Fixture, min: number): Promise<number>;
  total(): number;
  close(): Promise<void>;
}
export async function startMailSink(copy: string): Promise<MailSink> {
  const mod = (await import(pathToFileURL(path.join(copy, "scripts", "smtp-sink.ts")).href)) as {
    startSmtpSink: (ports: number[]) => Promise<{ port: number; messages: unknown[]; messagesTo: (addr: string) => { raw: string }[]; close: () => Promise<void> }>;
    decodeEmailBody: (raw: string) => string;
  };
  const sink = await mod.startSmtpSink([await freePort()]);
  const countFor = (fx: Fixture): number => sink.messagesTo(fx.ownerEmail).filter((m) => mod.decodeEmailBody(m.raw).includes(`/admin/${fx.slug}/leads`)).length;
  return {
    port: sink.port,
    countFor,
    async settledCountFor(fx, min) {
      const deadline = Date.now() + 15_000;
      while (countFor(fx) < min && Date.now() < deadline) await sleep(100);
      await sleep(1_500);
      return countFor(fx);
    },
    total: () => sink.messages.length,
    close: () => sink.close(),
  };
}

// ── the BoostChat server (the isolated copy, `next start`, as its own tests start it) ──
export interface BoostChatServer {
  baseUrl: string;
  port: number;
  pid: number;
  buildId: string;
  logFile: string;
  stop(): Promise<boolean>;
}

export async function startBoostChat(opts: { copy: string; db: Db; publicKeys: string[]; smtpPort: number; logDir: string; label: string }): Promise<BoostChatServer> {
  const { copy, db } = opts;
  const buildId = readFileSync(path.join(copy, ".next", "BUILD_ID"), "utf8").trim();
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  assertLoopbackHttpUrl(baseUrl, "BoostChat base URL");
  if (await portInUse(port)) throw new Error(`port ${port} is already in use`);
  mkdirSync(opts.logDir, { recursive: true });
  const logFile = path.join(opts.logDir, `boostchat-${opts.label}-${process.pid}.log`);
  writeFileSync(logFile, "");
  // a SCRUBBED environment: nothing of this shell (and no env file — the copy has none) reaches the server
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    TMPDIR: process.env.TMPDIR ?? "",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    PORT: String(port),
    DATABASE_URL: db.url, // the TEST database (guarded in openTestDb)
    BETTER_AUTH_URL: baseUrl,
    PUBLIC_APP_ORIGIN: baseUrl,
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    PUBLIC_WIDGET_ENABLED: "true",
    RATE_LIMIT_CLIENT_HASH_SECRET: randomBytes(32).toString("hex"),
    WIDGET_SITE_LEAD_KEYS: opts.publicKeys.join(","),
    // owner notification: the real SMTP transport, pointed at the loopback sink (production forbids "capture")
    LEAD_EMAIL_NOTIFICATION_ENABLED: "true",
    EMAIL_TRANSPORT: "smtp",
    SMTP_HOST: "127.0.0.1",
    SMTP_PORT: String(opts.smtpPort),
    SMTP_SECURE: "false",
    SMTP_USER: "",
    SMTP_PASSWORD: "",
    EMAIL_FROM: "boost-chat <no-reply@trackb-inquiry-v2-e2e.invalid>",
    OPS_OPERATOR_EMAILS: "",
    // no TURNSTILE_* and no WIDGET_SITE_LEAD_TURNSTILE_REQUIRED_KEYS: Turnstile stays OFF
  };
  const child: ChildProcess = spawn(process.execPath, [path.join(copy, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: copy,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  const collect = (chunk: Buffer) => appendFileSync(logFile, chunk);
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  let exited = false;
  child.once("exit", () => {
    exited = true;
  });
  const kill = (signal: NodeJS.Signals) => {
    if (child.pid === undefined || exited) return;
    try {
      process.kill(-child.pid, signal);
    } catch {
      try {
        child.kill(signal);
      } catch {
        /* already gone */
      }
    }
  };
  const stop = async (): Promise<boolean> => {
    kill("SIGTERM");
    for (let i = 0; i < 40; i++) {
      if (!(await portInUse(port))) return true;
      await sleep(250);
    }
    kill("SIGKILL");
    await sleep(500);
    return !(await portInUse(port));
  };
  process.once("exit", () => kill("SIGKILL"));

  const deadline = Date.now() + 60_000;
  let html = "";
  while (Date.now() < deadline && !exited) {
    try {
      const res = await loopbackFetch(`${baseUrl}/login`, { signal: AbortSignal.timeout(3000) });
      html = await res.text();
      break;
    } catch {
      await sleep(250);
    }
  }
  if (exited || html === "") {
    await stop();
    throw new Error(`BoostChat did not come up on ${baseUrl} — see ${logFile}`);
  }
  if (!html.includes(buildId)) {
    await stop();
    throw new Error("the server on that port does not serve the copy's current BUILD_ID — refused");
  }
  return { baseUrl, port, pid: child.pid ?? -1, buildId, logFile, stop };
}

/** how often each tag appears in the server log (tags only; the log is also checked for leaked form content) */
/**
 * A run that hangs must not leave a server behind. After `seconds` the BoostChat process group is
 * killed and the process exits with 3 (Playwright kills its own browser on exit). The fixture then
 * stays in the TEST database: cleanup.mts removes it.
 */
export function watchdog(seconds: number, serverPid: () => number | undefined): void {
  const timer = setTimeout(() => {
    log(`[FAIL] watchdog: the run did not finish within ${seconds}s — the BoostChat server is being killed; run cleanup.mts to remove the fixture`);
    const pid = serverPid();
    if (pid !== undefined && pid > 0) {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    }
    process.exit(3);
  }, seconds * 1000);
  timer.unref();
}

export function serverLogTags(logFile: string, needles: string[]): { tags: Record<string, number>; leaked: string[] } {
  const text = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
  const tags: Record<string, number> = {};
  for (const tag of [
    "site_lead_idempotent_replay",
    "site_lead_idempotency_conflict",
    "site_lead_client_rate_limited",
    "site_lead_origin_rejected",
    "site_lead_schema_behind",
    "site_lead_failed",
    "site_lead_store_rejected",
    "site_lead_client_limit_skipped",
    "[lead-notify]",
  ]) {
    tags[tag] = text.split(tag).length - 1;
  }
  return { tags, leaked: needles.filter((n) => n !== "" && text.includes(n)) };
}

export function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** the endpoint the reference site declares (an https production URL: it is only ever REWRITTEN, never contacted) */
export function declaredEndpoint(): string {
  const file = path.join(TRACK_B_ROOT, "data", "sites", "boost-interior-demo", "inquiry.json");
  const endpoint = (JSON.parse(readFileSync(file, "utf8")) as { endpoint?: unknown }).endpoint;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) throw new Error("inquiry.json declares no https endpoint");
  return endpoint;
}

/** a synthetic visitor address (198.18.0.0/15 is reserved for benchmarking): one per "visitor" */
let visitorCounter = 0;
export function freshVisitor(): string {
  visitorCounter += 1;
  return `198.19.${Math.floor(visitorCounter / 250)}.${(visitorCounter % 250) + 1}`;
}
