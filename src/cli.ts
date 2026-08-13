import { hasFirecrawlKey } from "./config/env.js";

/**
 * web-recon CLI — Phase 1 (Foundation).
 *
 * At this stage the CLI only reads a target URL argument and echoes the
 * foundation status. No discovery, observation, or reconstruction is executed.
 */
function main(): void {
  const target = process.argv[2];

  console.log("web-recon");

  if (!target) {
    console.log("Usage: pnpm recon <url>");
    console.log("Phase 1 foundation ready.");
    return;
  }

  console.log(`Target: ${target}`);
  console.log(
    `Firecrawl key: ${hasFirecrawlKey ? "detected" : "not set (optional in Phase 1)"}`,
  );
  console.log("Phase 1 foundation ready.");
}

main();
