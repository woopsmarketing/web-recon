import { z } from "zod";
import type { ReleaseRecord } from "../release/release";
import type { TemplateManifest } from "../site/template-manifest";
import { RUNTIME_SCHEMA, TEMPLATE_RUNTIME_MODULE, TEMPLATE_SHELL_MODULE } from "./contract";

/**
 * The PORTFOLIO RUNTIME capability of a Template — "a release of this Template can be published
 * incrementally: built once as a shell package, its portfolio pages composed at publish time by the
 * release's runtime kit" (contract.ts lists what such a Template provides).
 *
 * It is EXPLICIT, and it is stated twice, by two different parties:
 *
 *   the Template    declares it in its manifest (templates/<id>/v<major>/template.ts):
 *                       portfolioRuntime: { supported: true, contract: "portfolio-runtime@1" }
 *                   absent, or `supported: false`, = not supported.
 *   the release     records it (release.json `portfolioRuntime`, part of the release hash) — and only
 *                   after the release gate `portfolio-runtime-kit` (gate.ts) has built the release's
 *                   kit from the very files being released and rendered with it. A release that
 *                   declares the capability and cannot prove it is never recorded.
 *
 * Everything that needs the answer — the site builder (a shell build), the kit builder, the
 * publisher — asks ONE function, resolvePortfolioRuntime(record), and nobody probes a release for
 * files. The answer is a property of the immutable release record, so it is the same in every
 * checkout and for a release cut long ago.
 *
 * Why the type lives here and not in platform/site/template-manifest.ts: that file is one of the
 * runtime modules every Template Release snapshots, so a byte of it changing is unreleased drift for
 * every Template at once. The declaration is therefore a member the manifest object carries NEXT TO
 * what `defineTemplate` types (TemplateManifestWithPortfolioRuntime), validated by the schema below
 * when a release is cut — not by the Template's own compile.
 *
 * Not imported by entry.tsx: nothing here is bundled into a kit, so it can change without changing
 * a kit's bytes.
 */

/** The contract a release's portfolio runtime speaks: the schema of the runtime document its shell packages carry. */
export const PORTFOLIO_RUNTIME_CONTRACT = RUNTIME_SCHEMA;
/** Name of the release gate that proves a declared capability (release.json `gates`). */
export const PORTFOLIO_RUNTIME_GATE = "portfolio-runtime-kit";
/** The manifest member (and the release record field) that carries the capability. */
export const PORTFOLIO_RUNTIME_KEY = "portfolioRuntime";

/** What a Template manifest may say. */
export const PortfolioRuntimeCapabilitySchema = z.union([
  z.object({ supported: z.literal(true), contract: z.literal(PORTFOLIO_RUNTIME_CONTRACT) }).strict(),
  z.object({ supported: z.literal(false) }).strict(),
]);
export type PortfolioRuntimeCapability = { supported: true; contract: typeof PORTFOLIO_RUNTIME_CONTRACT } | { supported: false };

/** A Template manifest as the platform reads it: what `defineTemplate` types + the optional capability. */
export type TemplateManifestWithPortfolioRuntime = TemplateManifest & { portfolioRuntime?: PortfolioRuntimeCapability };

/**
 * What a release RECORD carries when its Template declared the capability and the gate passed. The
 * contract is a plain string here on purpose: a record written for a later contract must still load;
 * whether this platform speaks it is the resolver's answer.
 */
export const ReleasePortfolioRuntimeSchema = z.object({ supported: z.literal(true), contract: z.string().min(1) }).strict();
export type ReleasePortfolioRuntime = z.infer<typeof ReleasePortfolioRuntimeSchema>;

export type PortfolioRuntimeSupport =
  | {
      supported: true;
      contract: typeof PORTFOLIO_RUNTIME_CONTRACT;
      /** "release" = the record declares it (and carries the passed gate); "legacy" = inferred, see below */
      declared: "release" | "legacy";
    }
  | { supported: false; reason: string };

type ReleaseFacts = Pick<ReleaseRecord, "releaseId" | "templateId" | "templateVersion" | "files" | "gates" | "portfolioRuntime">;

/** `templates/<id>/v<major>` of a release (its Template directory inside the snapshot). */
export function templateRelOf(release: Pick<ReleaseRecord, "templateId" | "templateVersion">): string {
  return `templates/${release.templateId}/v${release.templateVersion.split(".")[0]}`;
}

/** The two Template modules a portfolio runtime consists of, as snapshot paths of this release. */
export function runtimeModulesOf(release: Pick<ReleaseRecord, "templateId" | "templateVersion">): string[] {
  const rel = templateRelOf(release);
  return [`${rel}/${TEMPLATE_SHELL_MODULE}`, `${rel}/${TEMPLATE_RUNTIME_MODULE}`];
}

/**
 * LEGACY INFERENCE — for a release cut BEFORE the capability existed, and for nothing else.
 *
 * Such a record has neither the `portfolioRuntime` field nor the `portfolio-runtime-kit` gate. It is
 * taken to support the runtime (contract portfolio-runtime@1, the only one that existed) exactly
 * when it ships BOTH runtime modules — what the builder and the kit builder used to probe for.
 *
 * It is narrow by construction, not by a list: createRelease now refuses to record a release that
 * ships either module without declaring the capability, so no release cut from now on can reach this
 * branch. The releases it applies to are the ones already in the store when the capability was
 * introduced — one: interior-02-1.1.0-be2c1e2d3850, which a live site pins and whose vendored kit
 * must keep reproducing byte for byte (platform/test/portfolio-capability.test.ts holds the set).
 */
function legacySupport(release: ReleaseFacts): boolean {
  if (release.portfolioRuntime !== undefined || release.gates[PORTFOLIO_RUNTIME_GATE] !== undefined) return false;
  const have = new Set(release.files.map((f) => f.path));
  return runtimeModulesOf(release).every((f) => have.has(f));
}

/**
 * THE question: can sites pinned to this release be published incrementally, and with which
 * contract? Pure — reads the record only.
 */
export function resolvePortfolioRuntime(release: ReleaseFacts): PortfolioRuntimeSupport {
  const declared = release.portfolioRuntime;
  if (declared !== undefined) {
    if (declared.contract !== PORTFOLIO_RUNTIME_CONTRACT) {
      return { supported: false, reason: `it declares the portfolio runtime contract "${declared.contract}", and this platform speaks "${PORTFOLIO_RUNTIME_CONTRACT}"` };
    }
    // verifyRelease refuses such a record; said here too so the answer never depends on who verified
    if (release.gates[PORTFOLIO_RUNTIME_GATE]?.pass !== true) return { supported: false, reason: `it declares the portfolio runtime but its record carries no passed "${PORTFOLIO_RUNTIME_GATE}" gate` };
    return { supported: true, contract: PORTFOLIO_RUNTIME_CONTRACT, declared: "release" };
  }
  if (legacySupport(release)) return { supported: true, contract: PORTFOLIO_RUNTIME_CONTRACT, declared: "legacy" };
  return {
    supported: false,
    reason: `its Template does not declare the portfolio runtime (${PORTFOLIO_RUNTIME_KEY}: { supported: true, contract: "${PORTFOLIO_RUNTIME_CONTRACT}" } in the manifest of ${release.templateId} ${release.templateVersion})`,
  };
}

/** What the gate recorded about a release with nothing published: "supported" (a safe empty state) or "refused" (ok: false). */
export function recordedEmptyState(release: Pick<ReleaseRecord, "gates">): "supported" | "refused" | undefined {
  const match = /\bemptyState: (supported|refused)\b/.exec(release.gates[PORTFOLIO_RUNTIME_GATE]?.detail ?? "");
  return match ? (match[1] as "supported" | "refused") : undefined;
}
