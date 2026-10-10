import { z } from "zod";
import { resolvePortfolioRuntime } from "../portfolio-runtime/capability";
import { loadRelease, verifyRelease, type ReleaseRecord } from "../release/release";
import { FORBIDDEN_CHAR_RE, HeadScriptSchema } from "../site/head-scripts";
import { inquiryEndpointProblem } from "../site/inquiry";
import { SiteIdSchema } from "../site/instance";
import { HASH_RE, HOSTNAME_RE, SITE_ID_RE } from "../../workers/recon-runtime/src/contract";
import { loadStarter, type Starter } from "./starter";

/**
 * The provisioning spec — what BoostChat hands the runner for ONE new site
 * (boost-chat docs/reports/auto-onboarding-v1.md §3.2, src/lib/site-provisioning/types.ts
 * `ProvisionSpec` / `RunnerClaimResponse`). This module is the runner's own copy of that shape, strict:
 * a field the contract does not name is refused, never ignored.
 *
 * The spec is DATA. Nothing in it is ever a command, a path or a script name: every value that ends
 * up in a file name or a URL is matched against a closed pattern here first, and the Worker script
 * a route is created for is not in it at all (routes.ts).
 *
 *   parseProvisionSpec(raw)                   shape + every check that needs no file
 *   validateProvisionSpec({ repoRoot, raw })  … + the starter allowlist and the release store
 */

export const PROVISION_SPEC_SCHEMA = "site-provision-spec@1";
/** The only zone a provisioned site may live in. A constant of the runner — never taken from the spec or the environment. */
export const HOST_SUFFIX = ".boostweb.co.kr";
export const WIDGET_KEY_RE = /^wgt_[A-Za-z0-9_-]{32}$/;
export const PHONE_RE = /^[0-9+\- ]{0,20}$/;
export const BRAND_NAME_MAX = 80;
const TEMPLATE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RELEASE_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d+\.\d+\.\d+-[0-9a-f]{12}$/;
const HOST_LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A refusal of the runner: a stable machine code + one sentence. Which STEP it belongs to is decided by where it was raised (provision.ts). */
export class ProvisionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ProvisionError";
  }
}

export const ProvisionSpecSchema = z
  .object({
    schema: z.literal(PROVISION_SPEC_SCHEMA),
    siteId: z.string(),
    hostname: z.string(),
    publicOrigin: z.string(),
    template: z.object({ templateId: z.string(), releaseId: z.string(), releaseHash: z.string() }).strict(),
    identity: z.object({ brandName: z.string(), locale: z.literal("ko-KR") }).strict(),
    contact: z.object({ phone: z.string().nullable(), email: z.string().nullable() }).strict(),
    boostchat: z.object({ baseUrl: z.string(), widgetScriptUrl: z.string(), widgetKey: z.string(), leadEndpoint: z.string() }).strict(),
  })
  .strict();
export type ProvisionSpec = z.infer<typeof ProvisionSpecSchema>;

/** `POST …/claim` → 200. `spec` is judged separately (parseProvisionSpec), so a bad spec is reported with its own code. */
export const RunnerClaimResponseSchema = z
  .object({
    ok: z.literal(true),
    job: z.object({ id: z.string().regex(UUID_RE), attempt: z.number().int().min(1) }).strict(),
    eventToken: z.string().regex(/^[A-Za-z0-9_-]{32,128}$/),
    spec: z.unknown(),
  })
  .strict();

const FAILED_STEPS = ["scaffold", "build", "upload", "announce", "route", "activate", "unknown"] as const;
export type FailedStep = (typeof FAILED_STEPS)[number];
export const FAILED_MESSAGE_MAX = 300;
const Hash = z.string().regex(HASH_RE);

/** `data` of every runner event, by type — exactly the fields of the contract table. */
export const RunnerEventDataSchemas = {
  built: z.object({ packageHash: Hash, buildInputId: Hash, fileCount: z.number().int().positive(), releaseId: z.string().regex(RELEASE_ID_RE), releaseHash: Hash }).strict(),
  announced: z.object({ packageHash: Hash, state: z.string().min(1).max(40), desiredRevision: z.number().int().min(0) }).strict(),
  route_ready: z.object({ pattern: z.string().min(1).max(260), created: z.boolean() }).strict(),
  activated: z.object({ hostname: z.string().regex(HOSTNAME_RE), packageHash: Hash }).strict(),
  failed: z.object({ step: z.enum(FAILED_STEPS), code: z.string().regex(/^[a-z0-9_]{1,60}$/), message: z.string().max(FAILED_MESSAGE_MAX) }).strict(),
} as const;
export type RunnerEventType = keyof typeof RunnerEventDataSchemas;
export type RunnerEventData<T extends RunnerEventType> = z.infer<(typeof RunnerEventDataSchemas)[T]>;

function refuse(code: string, message: string): never {
  throw new ProvisionError(code, message);
}

/** `https://host` and nothing else (no path, query, hash, credentials); undefined when it is not one. */
function httpsOrigin(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return undefined;
  return url.origin === value ? url.origin : undefined;
}

/**
 * Shape and every file-free check. Returns the spec with the brand name trimmed (the platform's
 * identity schema trims it too, so what is validated is what is rendered). Throws ProvisionError.
 */
export function parseProvisionSpec(raw: unknown): ProvisionSpec {
  const parsed = ProvisionSpecSchema.safeParse(raw);
  if (!parsed.success) {
    // paths and zod's own words only — never a value of the document
    const where = parsed.error.issues.slice(0, 6).map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`).join("; ");
    throw new ProvisionError("spec_invalid", `the spec is not a ${PROVISION_SPEC_SCHEMA} document (${where})`);
  }
  const spec = parsed.data;

  // siteId: the platform's rule AND the Worker's (it becomes a directory name and an R2 key segment)
  if (!SiteIdSchema.safeParse(spec.siteId).success || !SITE_ID_RE.test(spec.siteId)) refuse("site_id_invalid", "siteId must be lowercase words joined by single hyphens, at most 64 characters");

  // hostname: one label in front of the fixed suffix, written in lowercase
  const host = spec.hostname;
  if (host !== host.toLowerCase() || !HOSTNAME_RE.test(host)) refuse("host_invalid", "hostname must be a lowercase DNS name");
  if (!host.endsWith(HOST_SUFFIX) || !HOST_LABEL_RE.test(host.slice(0, -HOST_SUFFIX.length))) refuse("host_invalid", `hostname must be exactly one label followed by ${HOST_SUFFIX}`);
  if (spec.publicOrigin !== `https://${host}`) refuse("origin_mismatch", "publicOrigin must be https://<hostname>");

  // template pin: ids only — they select a directory of the starter store and of the release store
  const t = spec.template;
  if (!TEMPLATE_ID_RE.test(t.templateId) || t.templateId.length > 64) refuse("template_invalid", "template.templateId is not a template id");
  if (!HASH_RE.test(t.releaseHash)) refuse("template_invalid", "template.releaseHash is not a sha256");
  if (!RELEASE_ID_RE.test(t.releaseId) || !t.releaseId.startsWith(`${t.templateId}-`) || !t.releaseId.endsWith(`-${t.releaseHash.slice(0, 12)}`)) {
    refuse("template_invalid", "template.releaseId must be <templateId>-<x.y.z>-<releaseHash[0:12]>");
  }

  // brand name: plain text of one line — it is rendered on every page
  const brandName = spec.identity.brandName.trim();
  if (brandName.length < 1 || brandName.length > BRAND_NAME_MAX) refuse("brand_name_invalid", `identity.brandName must be 1..${BRAND_NAME_MAX} characters`);
  if (FORBIDDEN_CHAR_RE.test(brandName) || /[<>]/.test(brandName)) refuse("brand_name_invalid", "identity.brandName must not contain control characters or < >");

  const { phone, email } = spec.contact;
  if (phone !== null && !PHONE_RE.test(phone)) refuse("phone_invalid", "contact.phone must be digits, +, - and spaces (at most 20), or null");
  if (email !== null && (email.length > 254 || FORBIDDEN_CHAR_RE.test(email) || !z.email().safeParse(email).success)) refuse("email_invalid", "contact.email must be an e-mail address or null");

  // BoostChat: one https origin; the script and the lead endpoint live ON that origin (an origin
  // comparison — a string prefix would accept https://boostchat.co.kr.evil.example)
  const b = spec.boostchat;
  const base = httpsOrigin(b.baseUrl);
  if (!base) refuse("base_url_invalid", "boostchat.baseUrl must be an https origin (no path, query, hash or credentials)");
  if (!WIDGET_KEY_RE.test(b.widgetKey)) refuse("widget_key_invalid", "boostchat.widgetKey is not a widget key");
  const onBase = (value: string) => {
    try {
      return new URL(value).origin === base && value.startsWith(`${base}/`);
    } catch {
      return false;
    }
  };
  // …and each must be something the platform's own documents accept (scripts.json / inquiry.json)
  if (!onBase(b.widgetScriptUrl) || !HeadScriptSchema.safeParse({ id: "widget", src: b.widgetScriptUrl }).success) {
    refuse("widget_script_url_invalid", "boostchat.widgetScriptUrl must be a canonical https URL on boostchat.baseUrl");
  }
  if (!onBase(b.leadEndpoint) || inquiryEndpointProblem(b.leadEndpoint) !== undefined) refuse("lead_endpoint_invalid", "boostchat.leadEndpoint must be a canonical https URL on boostchat.baseUrl, without query or fragment");

  return { ...spec, identity: { ...spec.identity, brandName } };
}

export interface ValidatedSpec {
  spec: ProvisionSpec;
  starter: Starter;
  /** the stored, re-hashed release the spec pins */
  release: ReleaseRecord;
}

/**
 * parseProvisionSpec + what needs this checkout: a starter exists for the template and lists the
 * release (the allowlist), the release is in the store, intact, has exactly the hash the spec names
 * and can be published incrementally.
 */
export async function validateProvisionSpec(opts: { repoRoot: string; raw: unknown }): Promise<ValidatedSpec> {
  const spec = parseProvisionSpec(opts.raw);
  const { templateId, releaseId, releaseHash } = spec.template;
  const starter = await loadStarter(opts.repoRoot, templateId);
  if (!starter) throw new ProvisionError("template_not_allowed", `template "${templateId}" has no site starter in this checkout; a site can only be created from a template that has one`);
  if (!starter.releaseIds.includes(releaseId)) throw new ProvisionError("release_not_allowed", `release ${releaseId} is not listed by the ${templateId} starter (it lists ${starter.releaseIds.join(", ")})`);

  let release: ReleaseRecord;
  try {
    release = await loadRelease(opts.repoRoot, templateId, releaseId);
  } catch {
    throw new ProvisionError("release_missing", `release ${releaseId} is not in this checkout's release store`);
  }
  if (release.releaseHash !== releaseHash) throw new ProvisionError("release_hash_mismatch", `the spec pins ${releaseId} with hash ${releaseHash.slice(0, 12)}… and the stored release has ${release.releaseHash.slice(0, 12)}…`);
  try {
    await verifyRelease(opts.repoRoot, release);
  } catch (error) {
    throw new ProvisionError("release_corrupt", `the stored release ${releaseId} does not verify: ${(error as Error).message}`);
  }
  const support = resolvePortfolioRuntime(release);
  if (!support.supported) throw new ProvisionError("release_no_runtime", `release ${releaseId} cannot be published incrementally: ${support.reason}`);
  return { spec, starter, release };
}

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
