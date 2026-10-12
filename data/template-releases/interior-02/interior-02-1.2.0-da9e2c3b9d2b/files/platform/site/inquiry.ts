import { z } from "zod";
import { FORBIDDEN_CHAR_RE } from "./head-scripts";

/**
 * Site-level online inquiry endpoint: data/sites/<siteId>/inquiry.json (OPTIONAL).
 *
 *   { "schemaVersion": 1, "endpoint": "https://api.example.com/sites/abc/lead" }
 *
 * Absent file = the site has no online inquiry: no `inquiry` key in the snapshot, the Template's
 * inquiry form keeps its mail hand-off, and the package is byte-identical to one built before this
 * document existed — the "absent ≠ empty" rule scripts.json / theme.json / slots.json follow.
 *
 * VENDOR-AGNOSTIC by construction, like head-scripts.ts: the endpoint is ONE URL of site data. No
 * vendor, host, product or key is named in this module, in the client door (inquiry-client.ts), in
 * the Template or in any default — pointing a site at another backend is an edit to one JSON
 * document, never to platform or Template code.
 *
 * Like scripts.json (and unlike integration.json, a builder input), this document IS part of the
 * SiteSnapshot: the URL is rendered into the page's data by Template code, so the pinned Template
 * Release must carry its (strict) schema, and it only becomes usable for a real site once a Release
 * containing this file is cut and the site is re-pinned.
 *
 * Everything below is enforced at VALIDATION time (fail-closed, the build stops):
 *   - the endpoint is an absolute, canonical https:// URL on a named host — no http:, no
 *     protocol-relative or relative URL, no credentials, no query, no fragment (what the visitor
 *     typed travels in the request body, never in the URL);
 *   - only unreserved path characters, so the URL is one unbroken token wherever it is emitted and
 *     the package QA allowance (platform/build/qa.ts, `declaredEndpoints`) is an EXACT match of
 *     the whole URL — never a host or a prefix;
 *   - there is no field for a method, headers or credentials, and there must never be one: the
 *     request shape is the client door's, the same for every site.
 */

export const INQUIRY_FILE = "inquiry.json";
export const ENDPOINT_MAX = 512;

/**
 * The only shape an endpoint may have: https, a lowercase named host (at least one dot, an
 * alphabetic TLD — no IP literal, no bare hostname), an optional port, and a path of unreserved
 * characters plus "%". Deliberately a subset of what the package QA's absolute-URL scan reads as
 * one URL, so a declared endpoint can never be emitted in a form the scan would split.
 */
const ENDPOINT_RE = /^https:\/\/[a-z0-9]+(?:[.-][a-z0-9]+)*\.[a-z]{2,}(?::[0-9]{1,5})?\/[A-Za-z0-9._~%/-]*$/;

/** Why this is not a usable inquiry endpoint, or undefined when it is one. */
export function inquiryEndpointProblem(value: string): string | undefined {
  if (FORBIDDEN_CHAR_RE.test(value)) return "endpoint contains a forbidden character";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "endpoint must be an absolute https:// URL (a relative path and a protocol-relative //host are refused)";
  }
  if (url.protocol !== "https:") return `endpoint must use https: (got "${url.protocol}")`;
  if (url.username !== "" || url.password !== "") return "endpoint must not carry credentials";
  if (url.search !== "" || value.includes("?")) return "endpoint must not carry a query";
  if (url.hash !== "" || value.includes("#")) return "endpoint must not carry a fragment";
  // Canonical spelling only: the package QA allowance matches the declared URL exactly.
  if (url.href !== value) return `endpoint must be written in canonical form ("${url.href}")`;
  if (!ENDPOINT_RE.test(value)) return "endpoint must be https://<named host>[:port]/<path> with only letters, digits and . _ ~ % / - in the path";
  return undefined;
}

export const SiteInquiryDocSchema = z
  .object({
    schemaVersion: z.literal(1),
    endpoint: z.string().min(1).max(ENDPOINT_MAX),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const problem = inquiryEndpointProblem(doc.endpoint);
    if (problem) ctx.addIssue({ code: "custom", path: ["endpoint"], message: problem });
  });
export type SiteInquiryDoc = z.infer<typeof SiteInquiryDocSchema>;

/** What Template code is handed: where the site's inquiry form posts. Nothing else is configurable. */
export interface InquiryTarget {
  readonly endpoint: string;
}

/** The document → the target the Template reads; undefined for a site with no inquiry.json. */
export function inquiryTarget(doc: SiteInquiryDoc | undefined): InquiryTarget | undefined {
  return doc ? { endpoint: doc.endpoint } : undefined;
}
