import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * The first-party integration producer (docs/result/first-party-integration-producer/, 2026-09-22):
 * the new module platform/integration/** plus the builder seam it plugs into (declared-routes,
 * build-input, site-build, site/load, publish/publish.ts). The property the template-cut proofs
 * care about — a site that has not opted in still builds byte-identically (same buildInputId, same
 * packageHash) — is asserted by platform/test/integration.test.ts B1, B4 and T7, so the fingerprints
 * exclude these files the same way they exclude the publish surface and test/.
 *
 * Two different treatments apply within this surface, both driven by integrationSurfaceBefore():
 *  - files the task ADDED (everything under integration/, plus build/declared-routes.ts, which is
 *    new) have no pre-integration fingerprint at all, so callers exclude them from comparison
 *    entirely (they are simply new content — there is nothing to hold them byte-identical to);
 *  - files the task MODIFIED but did not add (build/build-input.ts, build/site-build.ts,
 *    site/load.ts, publish/publish.ts) DO have a pre-integration fingerprint (captured below), so
 *    callers instead substitute that pre-integration sha256 into their live comparison. Each
 *    Template-cut proof then keeps holding for the platform tree as it stood when this task started
 *    (HEAD be6b10a): the four files are proven unchanged between the cut and that checkpoint, and
 *    every other platform file is still compared live. The CURRENT content of the four files is not
 *    covered by the cut proofs (same as the publish surface); it is covered by integration.test.ts
 *    (B1/B4/T7 byte-identical OFF builds, B2 producer source hash in the build identity).
 */
export function isIntegrationSurface(rel: string): boolean {
  return (
    rel.startsWith("integration/") ||
    // ADDED with the Portfolio V0.2 golden package (docs/result/interior-portfolio-v0.2/36): writes
    // only platform/test/golden/, never a site package; checked by integration.test.ts G6.
    rel === "cli/integration-golden.ts" ||
    rel === "build/declared-routes.ts" ||
    rel === "build/build-input.ts" ||
    rel === "build/site-build.ts" ||
    rel === "site/load.ts" ||
    rel === "publish/publish.ts"
  );
}

/**
 * The sha256 of each platform/ file this task MODIFIED (not added), as it was BEFORE the
 * integration work — captured in
 * docs/result/first-party-integration-producer/proof/platform-before-integration.json from git HEAD
 * be6b10a, the checkpoint committed just before this task started. Keyed by the same platform/
 * -relative path the template-cut proofs use (e.g. "build/build-input.ts").
 */
export async function integrationSurfaceBefore(repoRoot: string): Promise<Record<string, string>> {
  const raw = await readFile(
    path.join(repoRoot, "docs/result/first-party-integration-producer/proof/platform-before-integration.json"),
    "utf8",
  );
  const parsed = JSON.parse(raw) as { files: Record<string, string> };
  return parsed.files;
}
