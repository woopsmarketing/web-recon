/**
 * pnpm design:catalog <templateId> [--thumbnails]
 *
 * Prints the preset catalog BoostChat vendors as `vendor/site-design-catalog/presets.json`
 * (schema site-design-presets@1, CONTRACTS E7) on stdout — JSON only, nothing else, nothing written.
 *
 *   --thumbnails   name the thumbnail files: `<presetId>-<version>-{desktop,mobile}.jpg` — plain file
 *                  names (no directory). The JPEGs are vendored beside the catalog under `thumbs/`
 *                  and listed in `catalog.sha256` as `thumbs/<name>`. Without the flag both are null.
 *
 * Every preset file is validated first; an invalid one fails the command (exit 1, reasons on stderr).
 */
import { buildDesignCatalog, serializeDesignCatalog } from "../design/catalog";
import { DesignError } from "../design/errors";

const args = process.argv.slice(2);
const templateId = args.find((a) => !a.startsWith("--"));
if (!templateId || args.some((a) => a.startsWith("--") && a !== "--thumbnails")) {
  console.error("usage: pnpm design:catalog <templateId> [--thumbnails]");
  process.exit(2);
}
try {
  process.stdout.write(serializeDesignCatalog(await buildDesignCatalog({ repoRoot: process.cwd(), templateId, thumbnails: args.includes("--thumbnails") })));
} catch (error) {
  if (!(error instanceof DesignError)) throw error;
  console.error(`design:catalog ${error.code}: ${error.message}`);
  process.exit(1);
}
