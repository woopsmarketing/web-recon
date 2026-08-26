/**
 * Deployment package assembly (Task 23 I).
 *
 * A deployment-ready bundle generatable WITHOUT credentials:
 *
 *   package/
 *     site/                  the fully baked static site (the whole product)
 *     server.mjs             self-contained node server (no dependencies)
 *     deploy-manifest.json   spec lineage ref + route table + QA expectations
 *     sitemap.preview.xml    path-only plan artifact (NOT served — preview)
 *     RUN.md                 run + deploy instructions
 *
 * No cloud deploy happens here; the directory is the deliverable.
 */
import { rename, writeFile, cp } from "node:fs/promises";
import path from "node:path";

import { renderServerMjs } from "./static-server.js";
import type { DeployManifest } from "./types.js";

export function renderRunMd(manifest: DeployManifest): string {
  return `# web-recon production package — ${manifest.siteName} (${manifest.mode.toUpperCase()})

Built from ProductionSpec run \`${manifest.specRunId}\` (source host: ${manifest.sourceHost}).
This directory is self-contained: no repository, no run directories, no
environment variables and no node_modules are needed to serve it.

## Run locally

    node server.mjs --port 3000

Requires Node >= 18. The server prints \`wr-production-server listening on ...\`
when ready. Any static file host works instead — serve \`site/\` with:

- \`/path\` -> \`site/path.html\` (no trailing slashes; \`/\` -> \`site/index.html\`)
- unknown paths -> HTTP 404 with \`site/404.html\`
- \`/_next/static/*\` and \`/media/*\` -> long-lived immutable cache

## Mode: ${manifest.mode}

${
  manifest.mode === "preview"
    ? `This is a PREVIEW build and MUST NOT be indexed:

- every route carries \`<meta name="robots" content="noindex,nofollow">\`
- \`robots.txt\` disallows everything and names no sitemap
- \`/sitemap.xml\` is intentionally absent (404); \`sitemap.preview.xml\` in this
  directory is a path-only plan artifact, not a servable sitemap

Blockers that keep this a preview (machine-readable copy in
deploy-manifest.json and in the ProductionSpec):

${manifest.blockers.map((blocker) => `- ${blocker}`).join("\n")}`
    : "Production mode."
}

## Known residual external requests

Requests to ${
    manifest.knownResidualSourceHosts.length > 0
      ? manifest.knownResidualSourceHosts.join(", ")
      : "(none)"
  } remain for replacement-required assets that were deliberately never
copied (brand/person/customer surfaces awaiting operator replacements).
`;
}

export interface PackageResult {
  packageDir: string;
  siteDir: string;
}

export async function assemblePackage(options: {
  buildDir: string;
  exportOutDir: string;
  deployManifest: DeployManifest;
  sitemapPreviewFile: string | null;
}): Promise<PackageResult> {
  const packageDir = path.join(options.buildDir, "package");
  const siteDir = path.join(packageDir, "site");
  const { mkdir } = await import("node:fs/promises");
  await mkdir(packageDir, { recursive: true });
  await rename(options.exportOutDir, siteDir);
  await writeFile(path.join(packageDir, "server.mjs"), renderServerMjs(), "utf8");
  await writeFile(
    path.join(packageDir, "deploy-manifest.json"),
    JSON.stringify(options.deployManifest, null, 2),
    "utf8",
  );
  await writeFile(path.join(packageDir, "RUN.md"), renderRunMd(options.deployManifest), "utf8");
  if (options.sitemapPreviewFile !== null) {
    await cp(options.sitemapPreviewFile, path.join(packageDir, "sitemap.preview.xml"));
  }
  return { packageDir, siteDir };
}
