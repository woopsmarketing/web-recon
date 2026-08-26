import {
  THEME_LIBRARY_DIR,
  checkThemeCompatibility,
  listThemeLibrary,
  loadAdapterFile,
} from "./theme/index.js";

/**
 * web-recon Theme — library listing CLI (Task 20 §17/§20).
 *
 *   pnpm theme:list [--dir <themes-dir>] [--adapter <site-theme-adapter.json>]
 *
 * Lists the theme library: name, mode, supports, warnings. With `--adapter`
 * it also prints each theme's deterministic compatibility verdict for that
 * site. Selection stays with the operator — there is deliberately no
 * recommendation, no ranking and no industry metadata anywhere (§19/§20).
 */

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dir = argv.includes("--dir") ? argv[argv.indexOf("--dir") + 1] : THEME_LIBRARY_DIR;
  const adapterRef = argv.includes("--adapter") ? argv[argv.indexOf("--adapter") + 1] : undefined;
  const adapter = adapterRef !== undefined ? await loadAdapterFile(adapterRef) : undefined;
  const entries = await listThemeLibrary(dir);
  if (entries.length === 0) {
    console.log(`[theme:list] no *.theme.json under ${dir}`);
    return;
  }
  console.log(`[theme:list] ${entries.length} theme(s) in ${dir}\n`);
  for (const { file, theme } of entries) {
    const tokenCount = Object.keys(theme.tokens).length;
    console.log(`${theme.themeId}  —  ${theme.name}`);
    console.log(`  file      ${file}`);
    console.log(`  mode      ${theme.metadata.mode}   supports ${theme.metadata.supports.join(", ")}   tokens ${tokenCount}`);
    if ((theme.metadata.warnings ?? []).length > 0) {
      console.log(`  warnings  ${(theme.metadata.warnings ?? []).join(" · ")}`);
    }
    if (adapter !== undefined) {
      const compat = checkThemeCompatibility(adapter, theme);
      const problems = compat.checks.filter((c) => c.level !== "ok");
      console.log(`  compatibility (${adapter.templateId}): ${compat.result}`);
      for (const problem of problems.slice(0, 6)) {
        console.log(`    ${problem.level.toUpperCase().padEnd(7)} ${problem.id}: ${problem.detail}`);
      }
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("[theme:list] ERROR —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
