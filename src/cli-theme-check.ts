import { loadReconTemplate } from "./content-injection/load-template.js";
import {
  checkThemeCompatibility,
  generateThemeOverlay,
  loadAdapterFile,
  loadThemeFile,
} from "./theme/index.js";

/**
 * web-recon Theme — deterministic compatibility check CLI (Task 20 §21).
 *
 *   pnpm theme:check <template-manifest> --theme <file> --adapter <site-theme-adapter.json>
 *
 * Verdict: compatible | compatible-with-warnings | incompatible — a GATE,
 * never a ranking. Also dry-runs the overlay generator so an unsafe theme
 * value or a non-allowlisted property fails HERE, before any serving.
 */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const manifestRef = argv.find((a) => !a.startsWith("--"));
  const themeRef = argv.includes("--theme") ? argv[argv.indexOf("--theme") + 1] : undefined;
  const adapterRef = argv.includes("--adapter") ? argv[argv.indexOf("--adapter") + 1] : undefined;
  if (!manifestRef || !themeRef || !adapterRef) {
    console.log("Usage: pnpm theme:check <template-manifest> --theme <file> --adapter <site-theme-adapter.json>");
    process.exitCode = 1;
    return;
  }
  const template = await loadReconTemplate(manifestRef);
  const adapter = await loadAdapterFile(adapterRef);
  const theme = await loadThemeFile(themeRef);
  if (adapter.templateId !== template.manifest.templateId) {
    throw new Error(
      `adapter belongs to template ${adapter.templateId}, not ${template.manifest.templateId}`,
    );
  }
  const compat = checkThemeCompatibility(adapter, theme);
  const overlay = generateThemeOverlay(adapter, theme);
  console.log(`[theme:check] ${theme.themeId} (${theme.metadata.mode}) on ${adapter.templateId}`);
  console.log(`[theme:check] verdict: ${compat.result.toUpperCase()}`);
  for (const check of compat.checks) {
    if (check.level === "ok") continue;
    console.log(`  ${check.level.toUpperCase().padEnd(7)} ${check.id}: ${check.detail}`);
  }
  console.log(
    `[theme:check] overlay dry-run: ${overlay.themedGroupCount} group(s) themed, ` +
      `${overlay.customProperties} custom properties, element weight ${overlay.themedElementWeight}`,
  );
  if (compat.result === "incompatible") process.exitCode = 2;
}

main().catch((err) => {
  console.error("[theme:check] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
