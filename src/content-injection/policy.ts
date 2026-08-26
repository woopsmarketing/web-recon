import {
  CONTENT_POLICY_ID,
  CONTENT_POLICY_VERSION,
  ContentPolicySchema,
  type ContentPolicy,
} from "./types.js";

/**
 * content-policy-v1 — the FIXED system policy of Content Injection (Task 19 §1).
 *
 * This is the canonical statement of the product rule the user should never
 * have to repeat ("keep the layout"). It is versioned as an artifact: every
 * content run copies it into `content-policy.json`, every generation request
 * references its id + version, and the manifest records which version ruled.
 *
 * The rules are deliberately provider-independent: they bind Claude Code
 * acting as the manual MVP provider exactly as much as any future remote API.
 */
export const CONTENT_POLICY: ContentPolicy = ContentPolicySchema.parse({
  policyId: CONTENT_POLICY_ID,
  policyVersion: CONTENT_POLICY_VERSION,
  rules: [
    {
      id: "layout-preserved-by-default",
      statement:
        "The selected Recon Template's layout, page structure, section order, responsive structure and verified interactions are never changed by a content request. The user does not need to ask for this.",
    },
    {
      id: "no-structural-edits-without-explicit-request",
      statement:
        "Unless the user explicitly requests a structural change, no section is added, removed or reordered, no DOM is rewritten, and no layout is redesigned.",
    },
    {
      id: "content-only-surface",
      statement:
        "A natural-language request maps only onto text, links, CTAs, brand wording, and image-content directives — the surfaces Slot V2 exposes.",
    },
    {
      id: "respect-observed-constraints",
      statement:
        "The original's observed references (character/word counts, per-viewport line counts and boxes, white-space, image aspect ratio) are respected as references. Acceptance is decided by browser layout QA, not by an invented character limit.",
    },
    {
      id: "no-invented-facts",
      statement:
        "Facts the user did not provide — customers, revenue, awards, certifications, history, addresses, phone numbers, prices, statistics, testimonials, legal claims — are never presented as fact.",
    },
    {
      id: "needs-input-over-fabrication",
      statement:
        "When required factual information is missing, the slot is marked needs-input instead of being filled with an invented value.",
    },
    {
      id: "no-source-brand-carryover",
      statement:
        "The original site's proprietary content (its brand, customers, partners, case studies, external destinations) must not survive as if it were a fact about the new site; retained originals are reported as source-brand-leak warnings.",
    },
  ],
});
