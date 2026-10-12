/**
 * node_modules/.bin/tsx --tsconfig tools/tsconfig.json tools/design/design-states.ts <outDir>
 *        [--preset luxury-gallery,editorial-studio,remodeling-conversion] [--profile regular8]
 *        [--release <releaseId>] [--template interior-02] [--work <dir>]
 *
 * State shots: VIEWPORT screenshots of what a full-page capture cannot show. For every preset the
 * same fixture site (default profile regular8) is built and served, then:
 *
 *   home-390-v0|v1|v2|vEnd.png   phone 390×844 at scroll top · one screen down · middle · very bottom
 *   home-390-menu.png            phone navigation menu opened (only if the header has a menu control)
 *   detail-390-v1.png            detail page, one screen down
 *   detail-390-viewer.png        photo viewer opened on a SECONDARY photo (the second tile), 390×844
 *   detail-1440-viewer.png       the same at 1440×900
 *   contact-390-vEnd.png         bottom of the contact page (submit control vs bottom bar)
 *   home-1440-v0.png             desktop first screen 1440×900
 *   listing-1440-v0.png          desktop listing first screen 1440×900
 *   home-768-v0.png              tablet first screen 768×1024
 *
 * Extra pages (/service and /faq are linked from every menu and footer; design:shots shoots five pages only):
 *   service-390.png service-1440.png faq-390.png faq-1440.png    FULL-PAGE, measured by the harness' own capture()
 *   service-thin0-390.png        full page of /service on the thin0 profile (when that profile generates it)
 *   service-390-v0.png faq-390-v0.png    phone viewport at scroll top
 *   faq-390-open.png             phone viewport with one accordion item expanded (if the items expand)
 *   a route the fixture does not generate (status ≠ 200) is recorded in `extraChecks` (generated: false) and `missing`
 *
 *   <outDir>/<preset>/<name>.png
 *   <outDir>/states.json         per shot: preset, name, page, url, viewport, requested + actual scroll
 *                                position, page height; and `missing`: the shots that could not be made, with why
 *
 * Built from the working tree unless --release names a stored release (same rule as design:shots).
 * Animations are off, page reveal is run first (as in design:shots), a page may request only the
 * local server. Nothing is written outside <outDir>.
 */
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { DesignError } from "../../platform/design/errors";
import { FIXTURE_PROFILES, type FixtureProfile } from "../../platform/design/dev/make-fixture";
import { buildFixture, capture, fixturePages, openDesignRoot, servePackage, type PageCheck } from "./harness";

const PRESETS = ["luxury-gallery", "editorial-studio", "remodeling-conversion"];

const args = process.argv.slice(2);
const outArg = args[0];
const option = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i > 0 ? args[i + 1] : undefined;
};
const profile = (option("profile") ?? "regular8") as FixtureProfile;
if (!outArg || outArg.startsWith("--") || !FIXTURE_PROFILES.includes(profile)) {
  console.error("usage: tsx --tsconfig tools/tsconfig.json tools/design/design-states.ts <outDir> [--preset a,b] [--profile regular8] [--release <releaseId>] [--template interior-02] [--work <dir>]");
  process.exit(2);
}
const repoRoot = process.cwd();
const outDir = path.resolve(outArg);
const templateId = option("template") ?? "interior-02";
const presets = option("preset") ? option("preset")!.split(",") : PRESETS;
const log = (line: string) => console.error(line);

interface StateShot {
  preset: string;
  name: string;
  file: string;
  page: string;
  url: string;
  viewport: { width: number; height: number };
  /** where the shot was asked to be taken and where the page actually was */
  scroll: { requested: string; scrollY: number; maxScrollY: number; pageHeight: number };
  /** "viewport" = one screen at the scroll position; "full-page" = the whole document */
  kind: "viewport" | "full-page";
  note?: string;
}
interface Missing {
  preset: string;
  name: string;
  reason: string;
}
const shots: StateShot[] = [];
const missing: Missing[] = [];
/** the harness' checks (overflow, h1, alt, font, console, requests) of the extra full-page captures */
const extraChecks: (PageCheck & { preset: string; profile: string })[] = [];

// Evaluated in the page (a string: a function would be rewritten by the TypeScript runner).
const REVEAL = `(async () => {
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  for (let y = 0; y < document.documentElement.scrollHeight; y += Math.round(innerHeight * 0.7)) { scrollTo(0, y); await frame(); }
  scrollTo(0, document.documentElement.scrollHeight); await frame();
  scrollTo(0, 0); await frame();
})()`;
const SCROLL_STATE = `({ scrollY: Math.round(scrollY), pageHeight: document.documentElement.scrollHeight, viewportHeight: innerHeight })`;

async function open(context: BrowserContext, origin: string, pathname: string): Promise<Page> {
  const page = await context.newPage();
  const response = await page.goto(`${origin}${pathname}`, { waitUntil: "networkidle" });
  if (response?.status() !== 200) throw new Error(`${pathname} answered ${response?.status()}`);
  await page.evaluate(REVEAL);
  await page.waitForLoadState("networkidle");
  await page.evaluate("document.fonts.ready.then(() => true)");
  await page.waitForTimeout(400);
  return page;
}

async function scrollTo(page: Page, where: "v0" | "v1" | "v2" | "vEnd"): Promise<string> {
  const { pageHeight, viewportHeight } = (await page.evaluate(SCROLL_STATE)) as { pageHeight: number; viewportHeight: number };
  const max = Math.max(0, pageHeight - viewportHeight);
  const y = where === "v0" ? 0 : where === "v1" ? Math.min(viewportHeight, max) : where === "v2" ? Math.round(max / 2) : max;
  await page.evaluate(`window.scrollTo(0, ${y})`);
  await page.waitForTimeout(350);
  return where === "v0" ? "top (0)" : where === "v1" ? "one screen down (innerHeight)" : where === "v2" ? "middle of the page ((pageHeight - innerHeight) / 2)" : "very bottom (pageHeight - innerHeight)";
}

async function shoot(opts: { preset: string; name: string; page: Page; pageName: string; pathname: string; origin: string; requested: string; dir: string; note?: string }): Promise<void> {
  const { pageHeight, scrollY, viewportHeight } = (await opts.page.evaluate(SCROLL_STATE)) as { pageHeight: number; scrollY: number; viewportHeight: number };
  const file = `${opts.name}.png`;
  await opts.page.screenshot({ path: path.join(opts.dir, file), fullPage: false, animations: "disabled" });
  shots.push({
    preset: opts.preset,
    name: opts.name,
    file: `${opts.preset}/${file}`,
    page: opts.pageName,
    url: `${opts.origin}${opts.pathname}`,
    viewport: opts.page.viewportSize()!,
    kind: "viewport",
    scroll: { requested: opts.requested, scrollY, maxScrollY: Math.max(0, pageHeight - viewportHeight), pageHeight },
    ...(opts.note ? { note: opts.note } : {}),
  });
  log(`  ${opts.preset}/${file} (scrollY ${scrollY}/${Math.max(0, pageHeight - viewportHeight)})`);
}

try {
  const root = await openDesignRoot({ repoRoot, templateId, work: option("work"), log });
  const releaseId = option("release");
  const release = releaseId ? root.stored[releaseId] : root.dev;
  if (!release) throw new Error(`release ${releaseId} is not in the release store (stored: ${Object.keys(root.stored).join(", ")})`);
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch();
  try {
    for (const [presetIndex, preset] of presets.entries()) {
      const dir = path.join(outDir, preset);
      await mkdir(dir, { recursive: true });
      log(`preset ${preset}`);
      const fixture = await buildFixture({ repoRoot, root: root.root, siteId: `dsst-${profile}-${presetIndex}`, release, profile, presetId: preset, log });
      const server = await servePackage(fixture.packageSite);
      const origin = server.origin;
      const pages = Object.fromEntries(fixturePages(fixture).map((p) => [p.name, p.path]));
      const miss = (name: string, reason: string) => {
        missing.push({ preset, name, reason });
        log(`  MISSING ${preset}/${name}: ${reason}`);
      };
      const newContext = async (width: number, height: number) => {
        const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce", locale: "ko-KR" });
        await context.route("**/*", (route) => {
          const url = route.request().url();
          if (url.startsWith(`${origin}/`) || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
          return route.abort();
        });
        return context;
      };
      // each state is taken on its own: one that fails is recorded and the rest go on
      const attempt = async (name: string, run: () => Promise<void>) => {
        try {
          await run();
        } catch (error) {
          miss(name, error instanceof Error ? error.message.split("\n")[0]! : String(error));
        }
      };
      try {
        // ---- phone 390×844: home at four scroll positions + menu
        const phone = await newContext(390, 844);
        await attempt("home-390-*", async () => {
          const page = await open(phone, origin, pages.home!);
          for (const where of ["v0", "v1", "v2", "vEnd"] as const) {
            const requested = await scrollTo(page, where);
            await shoot({ preset, name: `home-390-${where}`, page, pageName: "home", pathname: pages.home!, origin, requested, dir });
          }
          await page.close();
        });
        await attempt("home-390-menu", async () => {
          const page = await open(phone, origin, pages.home!);
          const button = page.locator("[data-menu-button]").first();
          if ((await button.count()) === 0 || !(await button.isVisible())) {
            miss("home-390-menu", "the header has no visible menu control at 390px ([data-menu-button] absent or hidden)");
            await page.close();
            return;
          }
          await button.click();
          await page.waitForTimeout(500);
          await shoot({ preset, name: "home-390-menu", page, pageName: "home", pathname: pages.home!, origin, requested: "top (0), menu opened", dir, note: "[data-menu-button] clicked" });
          await page.close();
        });
        // ---- phone: detail one screen down, photo viewer on the second photo
        if (pages.detail === undefined) {
          for (const name of ["detail-390-v1", "detail-390-viewer", "detail-1440-viewer"]) miss(name, "the fixture has no detail page");
        } else {
          await attempt("detail-390-v1", async () => {
            const page = await open(phone, origin, pages.detail!);
            const requested = await scrollTo(page, "v1");
            await shoot({ preset, name: "detail-390-v1", page, pageName: "detail", pathname: pages.detail!, origin, requested, dir });
            await page.close();
          });
          const viewer = async (name: string, context: BrowserContext) => {
            const page = await open(context, origin, pages.detail!);
            const tiles = page.locator("[data-gallery-zoom]");
            const count = await tiles.count();
            if (count < 2) {
              miss(name, `the detail page has ${count} openable photo(s): no secondary photo to open`);
              await page.close();
              return;
            }
            const tile = tiles.nth(1);
            await tile.scrollIntoViewIfNeeded();
            await tile.click();
            await page.locator("dialog[data-gallery-viewer][open]").waitFor({ state: "visible", timeout: 5000 });
            await page.waitForTimeout(600);
            const counter = (await page.locator("[data-viewer-counter]").first().innerText().catch(() => "")).replace(/\s+/g, " ").trim();
            await shoot({ preset, name, page, pageName: "detail", pathname: pages.detail!, origin, requested: "viewer open on photo 2 (the second tile clicked)", dir, note: `viewer counter reads "${counter}"` });
            await page.close();
          };
          await attempt("detail-390-viewer", () => viewer("detail-390-viewer", phone));
          await attempt("detail-1440-viewer", async () => {
            const desktop = await newContext(1440, 900);
            try {
              await viewer("detail-1440-viewer", desktop);
            } finally {
              await desktop.close();
            }
          });
        }
        await attempt("contact-390-vEnd", async () => {
          const page = await open(phone, origin, pages.contact!);
          const requested = await scrollTo(page, "vEnd");
          await shoot({ preset, name: "contact-390-vEnd", page, pageName: "contact", pathname: pages.contact!, origin, requested, dir });
          await page.close();
        });
        await phone.close();
        // ---- desktop 1440×900 and tablet 768×1024 first screens
        const first = async (name: string, pageName: string, width: number, height: number) => {
          await attempt(name, async () => {
            const pathname = pages[pageName];
            if (pathname === undefined) return miss(name, `the fixture has no ${pageName} page`);
            const context = await newContext(width, height);
            try {
              const page = await open(context, origin, pathname);
              const requested = await scrollTo(page, "v0");
              await shoot({ preset, name, page, pageName, pathname, origin, requested, dir });
            } finally {
              await context.close();
            }
          });
        };
        await first("home-1440-v0", "home", 1440, 900);
        await first("listing-1440-v0", "listing", 1440, 900);
        await first("home-768-v0", "home", 768, 1024);
        // ---- extra pages: /service and /faq
        const fullPages = async (runProfile: FixtureProfile, siteOrigin: string, specs: { name: string; path: string }[], widths: number[]) => {
          const runDir = path.join(outDir, "_extra", `${preset}-${runProfile}`);
          const checks = await capture({ origin: siteOrigin, pages: specs, widths, outDir: runDir, browser, log });
          for (const c of checks) {
            extraChecks.push({ ...c, preset, profile: runProfile });
            const name = `${c.page}-${c.width}`;
            if (!c.generated) {
              miss(`${name}${runProfile === profile ? "" : ` (${runProfile})`}`, `the ${runProfile} fixture does not generate ${c.path} (status ${c.status})`);
              continue;
            }
            await copyFile(path.join(runDir, c.screenshot!), path.join(dir, c.screenshot!));
            shots.push({
              preset,
              name,
              file: `${preset}/${c.screenshot}`,
              page: c.page,
              url: `${siteOrigin}${c.path}`,
              viewport: { width: c.width, height: c.width < 700 ? 844 : 900 },
              scroll: { requested: "full page (captured from scroll top)", scrollY: 0, maxScrollY: Math.max(0, (c.size?.height ?? 0) - (c.width < 700 ? 844 : 900)), pageHeight: c.size?.height ?? 0 },
              kind: "full-page",
              note: `profile ${runProfile}`,
            });
          }
        };
        await attempt("service/faq full pages", () => fullPages(profile, origin, [{ name: "service", path: "/service" }, { name: "faq", path: "/faq" }], [390, 1440]));
        {
          const thin = await buildFixture({ repoRoot, root: root.root, siteId: `dsst-thin0-${presetIndex}`, release, profile: "thin0", presetId: preset, log });
          const thinServer = await servePackage(thin.packageSite);
          try {
            await attempt("service-thin0-390", () => fullPages("thin0", thinServer.origin, [{ name: "service-thin0", path: "/service" }], [390]));
          } finally {
            await thinServer.close();
          }
        }
        const phone2 = await newContext(390, 844);
        for (const [pageName, pathname] of [["service", "/service"], ["faq", "/faq"]] as const) {
          await attempt(`${pageName}-390-v0`, async () => {
            const page = await open(phone2, origin, pathname);
            const requested = await scrollTo(page, "v0");
            await shoot({ preset, name: `${pageName}-390-v0`, page, pageName, pathname, origin, requested, dir });
            await page.close();
          });
        }
        await attempt("faq-390-open", async () => {
          const page = await open(phone2, origin, "/faq");
          const summaries = page.locator("summary.i2-acc__summary");
          const count = await summaries.count();
          if (count === 0) {
            miss("faq-390-open", "the faq page has no expandable items (no summary.i2-acc__summary)");
            await page.close();
            return;
          }
          // expand an item that is closed: the first one, or the second when the first starts open
          let target = summaries.first();
          if ((await target.getAttribute("aria-expanded")) === "true" && count > 1) target = summaries.nth(1);
          if ((await target.getAttribute("aria-expanded")) !== "true") await target.click();
          await target.scrollIntoViewIfNeeded();
          await page.waitForTimeout(700);
          const state = await target.getAttribute("aria-expanded");
          const label = (await target.innerText()).replace(/\s+/g, " ").trim().slice(0, 60);
          await shoot({ preset, name: "faq-390-open", page, pageName: "faq", pathname: "/faq", origin, requested: "an accordion item expanded and scrolled into view", dir, note: `item "${label}" aria-expanded=${state}` });
          await page.close();
        });
        await phone2.close();
      } finally {
        await server.close();
      }
    }
  } finally {
    await browser.close();
  }
  const builtFrom = releaseId ? `stored release ${releaseId}` : "working tree (dev release)";
  await writeFile(path.join(outDir, "states.json"), `${JSON.stringify({ templateId, profile, builtFrom, release, presets, shots, missing, extraChecks }, null, 2)}\n`);
  console.log(`state shots ${shots.length}, missing ${missing.length} → ${path.join(outDir, "states.json")}`);
} catch (error) {
  if (!(error instanceof DesignError)) throw error;
  console.error(`design:states ${error.code}: ${error.message}`);
  process.exit(1);
}
