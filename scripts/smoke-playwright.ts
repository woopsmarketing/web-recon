import { chromium } from "playwright";

/**
 * Playwright environment smoke test — Phase 1 (Foundation).
 *
 * This verifies ONLY that Chromium launches and can load a page. It is not an
 * Observer implementation and collects no DOM / CSS / geometry / screenshot data.
 *
 *   Chromium launch -> https://example.com -> read title -> close
 */
async function main(): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto("https://example.com", { waitUntil: "domcontentloaded" });
    const title = await page.title();

    if (!title.includes("Example Domain")) {
      throw new Error(`Unexpected page title: "${title}"`);
    }

    console.log(`[smoke] OK — Chromium launched, title: "${title}"`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[smoke] FAILED —", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
