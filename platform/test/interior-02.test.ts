/**
 * interior-02 — the second authored Template, its fictional site (ongyeol-interior-demo) and its reuse
 * site (boost-interior-demo-02).
 *
 * [source]  the Template's working tree: declared identity and routes, the release gate (imports,
 *           identifiers, siteId literals, forbidden terms) over the tree as it is now, isolation from the
 *           first Template (no import either way, neither Template's source terms in the other) and no
 *           Template-owned static files.
 * [release] the working tree IS a release (no unreleased drift) that declares the portfolio runtime
 *           and proved it at the release gate; the site's pin is an immutable release that exists,
 *           verifies byte for byte, froze the provenance terms, passed every gate — the working
 *           tree's, or an earlier one that differs from it only in files no site build is changed by
 *           (plus ONE exact, closed exception: 1.1.0 ↔ 1.2.0 in the files PENDING_REPIN names one by
 *           one — a re-pin that is pending, see there).
 * [package] the site's current package: built with that pin from the site's present data (identity
 *           recomputed here), QA pass, every page the fixture's data plans, no source term of either
 *           Template in any emitted text file, and no site of the first Template pinned to this one.
 * [reuse]   a second site on the SAME immutable release: its own identity, origin, content and theme
 *           as Site Data only, its own package, neither site's brand in the other's package, and the
 *           third-party script it declares (a per-site key) nowhere in the Template or its release.
 *
 * Every expected value is a literal or is read from the site's own authored data — never recomputed
 * with the Template code under test. Reads only: builds nothing, writes nothing.
 *
 * The reuse site's PORTFOLIO is owned by BoostChat (site:portfolio-sync regenerates it; once its
 * tracked marker portfolio.source.json is committed, a checkout without a generated portfolio refuses
 * to load the directory at all). Its portfolio is therefore read through the frozen composition
 * (demo-frozen-dataset.ts: that site's live directory + the frozen dataset it was authored with) —
 * byte for byte the live directory while that is still the hand-authored one. Everything the site
 * itself owns (site.json, settings, theme, scripts) is read from the live directory as before, and
 * L2 holds the live directory to what it is in this checkout.
 *
 * Run AFTER `template:release interior-02@1` + `site:build ongyeol-interior-demo` +
 * `site:build boost-interior-demo-02`:
 *   tsx --tsconfig platform/tsconfig.json platform/test/interior-02.test.ts
 */
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { prepareSiteInput } from "../build/site-build";
import { collectReleaseSources, gateTemplateSources, loadRelease, scanForbiddenTerms, verifyRelease } from "../release/release";
import { PORTFOLIO_RUNTIME_GATE, recordedEmptyState, resolvePortfolioRuntime, type PortfolioRuntimeCapability } from "../portfolio-runtime/capability";
import { readPortfolioSource } from "../portfolio-sync/managed";
import { loadSiteInstance } from "../site/load";
import { sha256 } from "../util/hash";
import { frozenDemoRoot, notGenerated } from "./demo-frozen-dataset";
import template from "../../templates/interior-02/v1/template";
import { PORTFOLIO_PAGE_SIZE } from "../../templates/interior-02/v1/manifest/portfolio";
import { portfolioShell } from "../../templates/interior-02/v1/runtime/shell";

const repoRoot = process.cwd();
const TEMPLATE = "interior-02";
const OTHER_TEMPLATE = "interior-01";
/** A later Template with sites of its own (interior-03.test.ts): its sites are not this Template's either. */
const LATER_TEMPLATE = "interior-03";
const SITE = "ongyeol-interior-demo";
/** the same release under another brand: nothing but Site Data differs */
const REUSE_SITE = "boost-interior-demo-02";
/** the fixed pages of the Template's route table (the list's later pages and the detail pages come from data) */
const FIXED_PAGES = ["index.html", "portfolio.html", "service.html", "about.html", "faq.html", "contact.html"] as const;
const TEXT_FILE = /\.(html|txt|js|css|json|xml|svg|map)$/;

let passed = 0;
const failed: string[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(`  FAIL ${name}\n       ${(error as Error).message.split("\n").join("\n       ")}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
const readJson = async (f: string) => JSON.parse(await readFile(path.join(repoRoot, f), "utf8"));
const exists = async (f: string) => stat(path.join(repoRoot, f)).then(() => true, () => false);
async function walkFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of (await readdir(path.join(dir, rel), { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const next = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await walkFiles(dir, next)));
    else if (entry.isFile()) out.push(next);
  }
  return out;
}
const templateDir = (id: string) => `templates/${id}/v1`;
const termsOf = async (id: string): Promise<string[]> => (await readJson(`${templateDir(id)}/provenance.json`)).forbiddenTerms;

// ----------------------------------------------------------------- source --
console.log("\n[source] the second Template's working tree");
await check("A declares its own identity (id, vertical, one major) and exactly its eight routes", () => {
  eq([template.id, template.vertical, /^1\.\d+\.\d+$/.test(template.version)], [TEMPLATE, "interior", true], "identity");
  eq(
    template.routes.map((r) => [r.key, r.path]),
    [
      ["home", "/"],
      ["portfolio.index", "/portfolio"],
      ["portfolio.page", "/portfolio/page/[n]"],
      ["portfolio.detail", "/portfolio/[slug]"],
      ["service", "/service"],
      ["about", "/about"],
      ["faq", "/faq"],
      ["contact", "/contact"],
    ],
    "routes",
  );
});
await check("B the release gate holds on the tree as it is now: imports, identifiers, no siteId literal, no source term", async () => {
  const siteIds = await readdir(path.join(repoRoot, "data/sites"));
  const findings = await gateTemplateSources(repoRoot, TEMPLATE, 1, siteIds, await termsOf(TEMPLATE));
  assert(findings.length === 0, JSON.stringify(findings).slice(0, 800));
});
await check("C the two Templates stand alone: no import reaches the other one, and neither holds the other's source terms", async () => {
  const hits: string[] = [];
  for (const [self, other] of [[TEMPLATE, OTHER_TEMPLATE], [OTHER_TEMPLATE, TEMPLATE]] as const) {
    const otherTerms = await termsOf(other);
    const dir = path.join(repoRoot, templateDir(self));
    for (const f of await walkFiles(dir)) {
      if (!/\.(tsx?|mjs|css|json)$/.test(f)) continue;
      const text = await readFile(path.join(dir, f), "utf8");
      for (const m of text.matchAll(/(?:from\s*|import\s*\(?\s*|require\s*\(\s*)["']([^"']+)["']/g)) {
        const spec = m[1]!;
        if (spec.includes(other) || (spec.startsWith(".") && !path.resolve(dir, path.dirname(f), spec).startsWith(dir + path.sep))) hits.push(`${self}/${f} imports ${spec}`);
      }
      if (f === "provenance.json") continue;
      hits.push(...scanForbiddenTerms(`${self}/${f}`, text, otherTerms).map((h) => `${h.file}: ${h.why}`));
    }
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
});
await check("D the Template ships no static files of its own (every image is a site asset) and names its source only in provenance.json", async () => {
  assert(!(await exists(`${templateDir(TEMPLATE)}/public`)), "templates/interior-02/v1/public exists");
  const dir = path.join(repoRoot, templateDir(TEMPLATE));
  const binary = (await walkFiles(dir)).filter((f) => /\.(png|jpe?g|webp|gif|avif|ico|woff2?|ttf|otf|mp4|webm)$/i.test(f));
  eq(binary, [], "binary files in the Template");
  const terms = await termsOf(TEMPLATE);
  assert(terms.length >= 4, `provenance.json lists only ${terms.length} terms`);
  const hits = [];
  for (const f of await walkFiles(dir)) {
    if (f === "provenance.json") continue;
    hits.push(...scanForbiddenTerms(f, await readFile(path.join(dir, f), "utf8"), terms));
  }
  assert(hits.length === 0, JSON.stringify(hits).slice(0, 800));
});

// ---------------------------------------------------------------- release --
console.log("\n[release] the working tree's release and the site's pin");
const site = await loadSiteInstance(repoRoot, SITE);
const pin = site.template;
/** the release of the working-tree version: exactly one */
const headId = await (async () => {
  const ids = (await readdir(path.join(repoRoot, "data/template-releases", TEMPLATE))).filter((d) => d.startsWith(`${TEMPLATE}-${template.version}-`));
  if (ids.length !== 1) throw new Error(`releases of the working-tree version ${template.version}: ${ids.join(", ") || "none"} (run template:release ${TEMPLATE}@1)`);
  return ids[0]!;
})();
/**
 * What the sites' pin may lag the working tree in. Re-pinning a site is a build + a publish, so a
 * release that changes nothing a site build reads does not force one: 1.1.1 is 1.1.0 plus the
 * declared portfolio runtime capability — template.ts (the declaration and the version), and no
 * other file. A release that touches anything else is not on this list: the sites are re-pinned.
 */
const PIN_MAY_LAG_IN = [`${templateDir(TEMPLATE)}/template.ts`];
/**
 * ONE exact exception to that rule, for ONE pair of releases — a re-pin that is pending, not a
 * harmless lag.
 *
 * WHAT IS PENDING. The site this check looks at — `SITE`, ongyeol-interior-demo, the Template's own
 * fictional site, whose tracked package the [package] checks hold to its pin — is still pinned to
 * 1.1.0. Two releases were cut since without re-pinning it: 1.1.2 (sections/HomeKeywords.tsx: a
 * home chip none of whose values matches a project of the site is left out) and 1.2.0 (the design
 * system: presets, variants, font sets, and the classic pages routed through it). Re-pinning means
 * rebuilding and re-recording the site's package — and, for the reuse site, a production publish —
 * and rebuilding a demo site is a production action that is not approved yet. Until it is re-pinned
 * the site's package is built from the 1.1.0 bytes of every file under `changed`, and from none of
 * the files under `added`.
 *
 * WHY THE LAG IS TOLERABLE for a CLASSIC site (one with no design document — `site.design.config`
 * is null by default, and this site sets none), checked, not assumed:
 *   - 1.1.0 → 1.1.2: interior-02-home-keywords.test.ts C2 computes home.keywords of this site (and
 *     of the reuse site) with the 1.1.0 release's runtime and with the newer one and holds them
 *     identical — all six of its chips match projects.
 *   - 1.1.2 → 1.2.0: the classic regression proof (`pnpm design:parity classic <out> --baseline
 *     interior-02-1.1.2-0b35f76a156d`) builds the same classic fixture on both and compares five
 *     pages at two widths: 10 / 10 identical, 0 differing pixels, identical body markup. The sixteen
 *     changed files reach the classic output through `design/classic.tsx` (the classic sections and
 *     chrome, by identity) and add `id` / `data-design` only where a design document exists.
 *   - the manifest gains ONE member, `...designSections` (manifest/design.ts: the setting
 *     `site.design` with `defaults: { config: null }` and no slot) — a site that does not set it
 *     resolves to the classic recipe; routes, the other sections and the theme are unchanged.
 * None of this makes the site current: a preset cannot be applied to it until it is re-pinned.
 *
 * THE EXCEPTION IS EXACT. It names both release ids and every file, one by one — no pattern, no
 * directory. G2 holds it to the two release records in both directions: a file that differs and is
 * not named fails, a named file that does not differ fails, a `changed` file must exist in both
 * releases and an `added` one only in the head, and each manifest line must be in the head's body
 * exactly once and absent from the pinned one. It ends by itself: any later release of the Template
 * is a different head, so a site still pinned to 1.1.0 then fails G2 again — until someone re-pins
 * the site or decides, here, in writing, why not. Delete this constant when the site is re-pinned.
 */
const PENDING_REPIN = {
  pinned: "interior-02-1.1.0-be2c1e2d3850",
  head: "interior-02-1.2.0-da9e2c3b9d2b",
  /** files BOTH releases hold, with other bytes in the head (16) — a build of the pinned site reads the OLD bytes of each */
  changed: [
    "app/about/page.tsx", "app/contact/page.tsx", "app/faq/page.tsx", "app/layout.tsx", "app/not-found.tsx", "app/page.tsx",
    "app/portfolio/[slug]/page.tsx", "app/portfolio/page.tsx", "app/portfolio/page/[n]/page.tsx", "app/service/page.tsx",
    "components/portfolio/ProjectGallery.tsx", "components/runtime/RuntimeSlot.tsx", "runtime/portfolio.ts", "sections/AboutPage.tsx", "sections/HomeKeywords.tsx",
    "sections/SiteFooter.tsx",
  ],
  /** files only the head holds (88): the design system — nothing in the pinned release imports them */
  added: [
    "design/chrome.tsx", "design/classic.tsx", "design/config.ts", "design/contract.ts", "design/fonts.json",
    "design/fonts.ts", "design/registry.ts", "design/resolve.ts", "design/sections.tsx", "design/slot-components.ts",
    "design/slots.ts", "design/styles.ts", "design/tokens.ts", "design/variants/about/manifesto.tsx",
    "design/variants/about/shared.ts", "design/variants/about/split-panel.tsx", "design/variants/about/statement-photo.tsx",
    "design/variants/about/status.ts", "design/variants/action-bar/action-bar.tsx", "design/variants/action-bar/channels.ts",
    "design/variants/action-bar/status.ts", "design/variants/cta/band.tsx", "design/variants/cta/quiet.tsx",
    "design/variants/cta/shared.ts", "design/variants/cta/status.ts", "design/variants/detail/build.data.ts",
    "design/variants/detail/gallery.data.ts", "design/variants/detail/gallery.tsx", "design/variants/detail/model.ts",
    "design/variants/detail/parts.tsx", "design/variants/detail/status.ts", "design/variants/detail/typographic.data.ts",
    "design/variants/detail/typographic.tsx", "design/variants/detail/zoom.tsx", "design/variants/footer/minimal.tsx", "design/variants/footer/status.ts",
    "design/variants/header/centered.tsx", "design/variants/header/conversion.tsx", "design/variants/header/shared.tsx",
    "design/variants/header/status.ts", "design/variants/hero/model.ts", "design/variants/hero/parts.tsx",
    "design/variants/hero/photo.data.ts", "design/variants/hero/photo.tsx", "design/variants/hero/source.ts",
    "design/variants/hero/split.data.ts", "design/variants/hero/split.tsx", "design/variants/hero/statement.data.ts",
    "design/variants/hero/statement.tsx", "design/variants/hero/status.ts", "design/variants/services/numbered.tsx",
    "design/variants/services/rows.tsx", "design/variants/services/shared.ts", "design/variants/services/status.ts",
    "design/variants/showcase/cards.data.ts", "design/variants/showcase/cards.tsx", "design/variants/showcase/index.data.ts",
    "design/variants/showcase/index.tsx", "design/variants/showcase/items.data.ts", "design/variants/showcase/model.ts",
    "design/variants/showcase/panels.data.ts", "design/variants/showcase/panels.tsx", "design/variants/showcase/parts.tsx",
    "design/variants/showcase/status.ts", "manifest/design.ts", "sections/AboutStory.tsx", "sections/FooterBand.tsx",
    "styles/design/about-manifesto.css", "styles/design/about-split-panel.css", "styles/design/about-statement-photo.css",
    "styles/design/action-bar.css", "styles/design/cta-band.css", "styles/design/cta-quiet.css",
    "styles/design/detail-gallery.css", "styles/design/detail-typographic.css", "styles/design/footer-minimal.css",
    "styles/design/header-centered.css", "styles/design/header-conversion.css", "styles/design/hero-photo.css",
    "styles/design/hero-split.css", "styles/design/hero-statement.css", "styles/design/inner.css",
    "styles/design/services-numbered.css", "styles/design/services-rows.css", "styles/design/showcase-cards.css",
    "styles/design/showcase-index.css", "styles/design/showcase-panels.css", "styles/design/tokens.css",
  ],
  /** lines the head's manifest body (template.ts, `vertical:` … `});`) holds and the pinned one does not — by name, each exactly once */
  manifestAdds: ["...designSections,"],
} as const;
const versionOf = (v: string) => v.split(".").map(Number) as [number, number, number];
const notNewer = (a: string, b: string) => {
  const [x, y] = [versionOf(a), versionOf(b)];
  return x[0] !== y[0] ? x[0] < y[0] : x[1] !== y[1] ? x[1] < y[1] : x[2] <= y[2];
};
await check("E the site pins an exact interior-02 release (id + full hash) that verifies byte for byte: the working tree's version or an earlier one", async () => {
  eq([pin.templateId, notNewer(pin.templateVersion, template.version)], [TEMPLATE, true], `pin ${pin.templateVersion} vs working tree ${template.version}`);
  const record = await loadRelease(repoRoot, TEMPLATE, pin.releaseId);
  eq(record.releaseHash, pin.releaseHash, "releaseHash");
  await verifyRelease(repoRoot, record);
  await verifyRelease(repoRoot, await loadRelease(repoRoot, TEMPLATE, headId));
});
await check("F each of the two releases froze the provenance terms and passed every gate", async () => {
  for (const id of new Set([pin.releaseId, headId])) {
    const record = await loadRelease(repoRoot, TEMPLATE, id);
    eq([...record.forbiddenTerms].sort(), [...(await termsOf(TEMPLATE))].sort(), `${id} forbiddenTerms`);
    const gates = Object.entries(record.gates);
    assert(gates.length > 0, `${id} recorded no gate`);
    eq(gates.filter(([, g]) => !g.pass).map(([k]) => k), [], `${id} failed gates`);
    assert(!record.files.some((f) => f.path.endsWith("provenance.json")), `provenance.json is inside ${id}`);
  }
});
await check("G the release of the working-tree version IS the working tree: same files, same bytes (no unreleased drift)", async () => {
  const record = await loadRelease(repoRoot, TEMPLATE, headId);
  const { sources } = await collectReleaseSources(repoRoot, TEMPLATE, 1);
  const live: [string, string][] = [];
  for (const [rel, abs] of sources) live.push([rel, sha256(await readFile(abs))]);
  const released = new Map(record.files.map((f) => [f.path, f.sha256]));
  const drift = [
    ...live.filter(([rel, hash]) => released.get(rel) !== hash).map(([rel]) => (released.has(rel) ? `changed ${rel}` : `unreleased ${rel}`)),
    ...[...released.keys()].filter((rel) => !sources.has(rel)).map((rel) => `removed ${rel}`),
  ];
  assert(drift.length === 0, drift.slice(0, 12).join("\n"));
});
const PENDING_FILES: readonly string[] = [...PENDING_REPIN.changed, ...PENDING_REPIN.added].map((rel) => `${templateDir(TEMPLATE)}/${rel}`);
await check(`G2 the pin of ${SITE} is that release, or lags it only where a site build is not changed (PIN_MAY_LAG_IN: template.ts) — and, for exactly ${PENDING_REPIN.pinned} ↔ ${PENDING_REPIN.head}, in the ${PENDING_FILES.length} files PENDING_REPIN names one by one (${PENDING_REPIN.changed.length} changed, ${PENDING_REPIN.added.length} only in the head: the site is not re-pinned yet) and in ${PENDING_REPIN.manifestAdds.length} named manifest line; every other file is byte-identical in both`, async () => {
  if (pin.releaseId === headId) return;
  const [pinned, head] = [await loadRelease(repoRoot, TEMPLATE, pin.releaseId), await loadRelease(repoRoot, TEMPLATE, headId)];
  const a = new Map(pinned.files.map((f) => [f.path, f.sha256]));
  const b = new Map(head.files.map((f) => [f.path, f.sha256]));
  const differs = [...new Set([...a.keys(), ...b.keys()])].filter((rel) => a.get(rel) !== b.get(rel)).sort();
  // the pending re-pin is this pair of releases and no other: another pin or another head gets no exception
  const applies = pin.releaseId === PENDING_REPIN.pinned && headId === PENDING_REPIN.head;
  const pending: readonly string[] = applies ? PENDING_FILES : [];
  eq(new Set(PENDING_FILES).size, PENDING_FILES.length, "PENDING_REPIN names a file twice");
  assert(!PENDING_FILES.some((rel) => /[*?{}]|\/$/.test(rel)), "PENDING_REPIN holds a pattern or a directory");
  eq(differs.filter((rel) => !PIN_MAY_LAG_IN.includes(rel) && !pending.includes(rel)), [], `files that differ between ${pin.releaseId} and ${headId}`);
  // …and while the exception applies it is exact: every file it names does differ (a stale exception is not kept) …
  eq(pending.filter((rel) => !differs.includes(rel)), [], `PENDING_REPIN names a file that does not differ between ${pin.releaseId} and ${headId}`);
  if (applies) {
    // … in the way it says: `changed` = in both releases, `added` = only in the head; nothing was removed
    const of = (rels: readonly string[]) => rels.map((rel) => `${templateDir(TEMPLATE)}/${rel}`);
    eq(of(PENDING_REPIN.changed).filter((rel) => !(a.has(rel) && b.has(rel))), [], "PENDING_REPIN.changed names a file that is not in both releases");
    eq(of(PENDING_REPIN.added).filter((rel) => a.has(rel) || !b.has(rel)), [], "PENDING_REPIN.added names a file the pinned release holds (or the head does not)");
    eq(differs.filter((rel) => !b.has(rel)), [], "files the head no longer holds");
    eq([differs.length, pinned.files.length, head.files.length], [PENDING_FILES.length + PIN_MAY_LAG_IN.length, 112, 200], "the size of the lag: differing files, files of the pinned release, files of the head");
  }
  // …and in template.ts, the manifest a build reads is the same but for the version — routes, sections, theme — and, for this pair
  // only, but for the manifest lines PENDING_REPIN names: each one in the head's body exactly once, and not in the pinned one
  const text = async (id: string) => readFile(path.join(repoRoot, "data/template-releases", TEMPLATE, id, "files", PIN_MAY_LAG_IN[0]!), "utf8");
  const body = (t: string) => t.slice(t.indexOf("vertical:"), t.indexOf("\n});") + 4);
  const [before, after] = [body(await text(pin.releaseId)), body(await text(headId))];
  const mayAdd: readonly string[] = applies ? PENDING_REPIN.manifestAdds : [];
  const linesOf = (t: string) => t.split("\n");
  for (const line of mayAdd) {
    eq([linesOf(before).filter((l) => l.trim() === line).length, linesOf(after).filter((l) => l.trim() === line).length], [0, 1], `manifest line \`${line}\` (pinned, head)`);
  }
  const without = (t: string) => linesOf(t).filter((l) => !mayAdd.includes(l.trim())).join("\n");
  assert(before.length > 500 && before === without(after), "the manifest body (routes, sections, theme) differs between the two releases beyond what PENDING_REPIN names");
  if (applies) {
    // what that one line spreads in: ONE setting section whose default is "no design document" — the classic site
    const fragment = await readFile(path.join(repoRoot, "data/template-releases", TEMPLATE, headId, "files", templateDir(TEMPLATE), "manifest/design.ts"), "utf8");
    eq((fragment.match(/^  "[a-z.]+": \{$/gm) ?? []).map((l) => l.trim()), ['"site.design": {'], "the sections manifest/design.ts declares");
    assert(/defaults: \{ config: null \},\n    slots: \{\},/.test(fragment), "site.design no longer defaults to no design document (config: null) with no slot");
    const siteSettings = JSON.parse(await readFile(path.join(repoRoot, "data/sites", SITE, "settings.json"), "utf8")) as { overrides?: Record<string, unknown> };
    eq(siteSettings.overrides?.["site.design"], undefined, `${SITE} sets a design document: it is no longer a classic site, and this lag is not tolerable`);
  }
});
await check("G3 the Template declares the portfolio runtime, and its release records exactly that after proving it: gate passed, a safe empty state; the pinned release still resolves (declared, or legacy for one cut before the capability)", async () => {
  // typed: the declaration is assignable to what the platform reads
  const declared: PortfolioRuntimeCapability = template.portfolioRuntime;
  eq(declared, { supported: true, contract: "portfolio-runtime@1" }, "manifest declaration");
  const head = await loadRelease(repoRoot, TEMPLATE, headId);
  eq(head.portfolioRuntime, declared, "release record");
  eq([head.gates[PORTFOLIO_RUNTIME_GATE]?.pass, recordedEmptyState(head)], [true, "supported"], `gate: ${head.gates[PORTFOLIO_RUNTIME_GATE]?.detail}`);
  eq(resolvePortfolioRuntime(head), { supported: true, contract: "portfolio-runtime@1", declared: "release" }, "the working-tree release");
  const pinned = resolvePortfolioRuntime(await loadRelease(repoRoot, TEMPLATE, pin.releaseId));
  eq([pinned.supported, pinned.supported && pinned.contract], [true, "portfolio-runtime@1"], `the pinned release ${pin.releaseId}`);
});

// ---------------------------------------------------------------- package --
console.log("\n[package] the site's current package");
const current = await readJson(`data/site-builds/${SITE}/current.json`);
const record = await readJson(`${current.packageDir}/build-record.json`);
const siteDir = path.join(repoRoot, current.packageDir, "site");
await check("H the current package was built with the pin, from the site's present data, and passed package QA", async () => {
  eq([record.siteId, record.status, record.parts.mode], [SITE, "success", "public"], "record");
  eq([record.template.templateId, record.template.releaseId, record.template.releaseHash], [pin.templateId, pin.releaseId, pin.releaseHash], "the package's Template");
  eq([record.qa.pass, record.qa.failures], [true, []], "package QA");
  const input = await prepareSiteInput({ repoRoot, siteId: SITE, mode: "public", at: record.at });
  eq([input.parts.siteSnapshotHash, input.buildInputId], [record.parts.siteSnapshotHash, current.buildInputId], "identity = the site's present data");
});
await check("I every page the fixture's data plans is emitted: the fixed pages, one detail per published project, the list's later pages", async () => {
  const projects: { slug: string; status: string }[] = (await readJson(`data/sites/${SITE}/content/projects.json`)).items;
  const published = projects.filter((p) => p.status === "published");
  assert(published.length > PORTFOLIO_PAGE_SIZE, `the fixture must fill more than one list page (${published.length} ≤ ${PORTFOLIO_PAGE_SIZE})`);
  const pages = Math.ceil(published.length / PORTFOLIO_PAGE_SIZE);
  const expected = [
    ...FIXED_PAGES,
    ...published.map((p) => `portfolio/${p.slug}.html`),
    ...Array.from({ length: pages - 1 }, (_, i) => `portfolio/page/${i + 2}.html`),
  ].sort();
  const emitted = (await walkFiles(siteDir)).filter((f) => f.endsWith(".html") && !/^(404|_not-found)\.html$/.test(f)).sort();
  eq(emitted, expected, "pages");
  for (const f of ["404.html", "robots.txt", "sitemap.xml"]) assert(await exists(path.join(current.packageDir, "site", f)), `${f} missing`);
});
await check("J no emitted text file holds a source term of either Template, the other Template's name, or a remote stylesheet / script / image", async () => {
  const terms = [...(await termsOf(TEMPLATE)), ...(await termsOf(OTHER_TEMPLATE)), OTHER_TEMPLATE];
  const own = new URL(site.identity.publicOrigin!).origin;
  const hits: string[] = [];
  for (const f of await walkFiles(siteDir)) {
    if (!TEXT_FILE.test(f)) continue;
    const text = await readFile(path.join(siteDir, f), "utf8");
    hits.push(...scanForbiddenTerms(f, text, terms).map((h) => `${h.file}: ${h.why}`));
    if (!f.endsWith(".html")) continue;
    for (const m of text.matchAll(/\s(?:src|href|srcset|poster|action)="(https?:)?\/\/([^"]*)"/g)) {
      const url = `${m[1] ?? "https:"}//${m[2]}`;
      if (!url.startsWith(`${own}/`) && url !== own) hits.push(`${f}: remote reference ${url.slice(0, 120)}`);
    }
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
});
await check("K interior-02 is pinned by its own two sites only: every other site stays on the first Template or on a later Template of its own", async () => {
  const pins: Record<string, string> = {};
  for (const id of (await readdir(path.join(repoRoot, "data/sites"))).filter((d) => !d.startsWith(".")).sort()) pins[id] = (await loadSiteInstance(repoRoot, id)).template.templateId;
  eq(Object.entries(pins).filter(([, t]) => t === TEMPLATE).map(([id]) => id), [REUSE_SITE, SITE].sort(), "sites on interior-02");
  // the first Template's sites, and the third Template's two sites (platform/test/interior-03.test.ts holds those to their own pins)
  eq([...new Set(Object.entries(pins).filter(([id]) => id !== SITE && id !== REUSE_SITE).map(([, t]) => t))].sort(), [OTHER_TEMPLATE, LATER_TEMPLATE].sort(), "the other sites' Templates");
});

// ------------------------------------------------------------------ reuse --
console.log("\n[reuse] a second site on the same release");
const reuse = await loadSiteInstance(repoRoot, REUSE_SITE);
/** the reuse site as a buildable site: its live directory with the frozen portfolio dataset (data/site-builds stays in repoRoot) */
const reuseFrozen = await frozenDemoRoot(repoRoot, REUSE_SITE);
const reuseProjects = async (): Promise<{ slug: string; status: string }[]> => JSON.parse(await readFile(path.join(reuseFrozen.siteDir, "content/projects.json"), "utf8")).items;
/** true = the reuse site is published incrementally (portfolio-source@2): its package is a shell, its project pages are composed at publish time */
const reuseIncremental = async () => (await readPortfolioSource(path.join(repoRoot, "data/sites", REUSE_SITE))) === "incremental";
const reuseCurrent = await readJson(`data/site-builds/${REUSE_SITE}/current.json`);
const reuseRecord = await readJson(`${reuseCurrent.packageDir}/build-record.json`);
const reuseSiteDir = path.join(repoRoot, reuseCurrent.packageDir, "site");
const textFiles = async (dir: string) => (await walkFiles(dir)).filter((f) => TEXT_FILE.test(f));
await check("L the reuse site pins the SAME release as the first site (id + full hash), and its current package was built with it from its present data, package QA pass", async () => {
  eq(reuse.template, pin, "pin");
  eq([reuseRecord.siteId, reuseRecord.status, reuseRecord.parts.mode], [REUSE_SITE, "success", "public"], "record");
  eq([reuseRecord.template.templateId, reuseRecord.template.releaseId, reuseRecord.template.releaseHash], [pin.templateId, pin.releaseId, pin.releaseHash], "the package's Template");
  eq([reuseRecord.qa.pass, reuseRecord.qa.failures], [true, []], "package QA");
  // a site published incrementally is built from its live directory (the marker is what makes the package a shell;
  // the frozen composition drops it and describes a site that builds its own portfolio)
  const input = await prepareSiteInput({ repoRoot: (await reuseIncremental()) ? repoRoot : reuseFrozen.root, siteId: REUSE_SITE, mode: "public", at: reuseRecord.at });
  eq([input.parts.siteSnapshotHash, input.buildInputId], [reuseRecord.parts.siteSnapshotHash, reuseCurrent.buildInputId], "identity = the site's present data");
  assert(reuseCurrent.buildInputId !== current.buildInputId && reuseCurrent.packageDir !== current.packageDir, "the two sites share a package");
});
await check("L2 the reuse site's live directory: its portfolio is the frozen dataset or a generated one; while it is the frozen dataset and loads, it has the tracked package's identity; generated, it loads; adopted for incremental publishing, it loads as the tracked shell package's input; adopted without a generated portfolio, it is refused", async () => {
  const { live } = reuseFrozen;
  assert(live.identical || live.managed, `data/sites/${REUSE_SITE}: the portfolio is neither the frozen dataset nor a generated one`);
  if (await reuseIncremental()) {
    // adopted for incremental publishing (portfolio-source@2): nothing is generated into this checkout and nothing is refused —
    // the directory is a shell input, and the package records the publisher's runtime documents
    assert(live.adopted && !live.managed, "an incremental site carries the marker and no generated portfolio");
    const shell = await prepareSiteInput({ repoRoot, siteId: REUSE_SITE, mode: "public", at: reuseRecord.at });
    eq([shell.parts.siteSnapshotHash, shell.buildInputId], [reuseRecord.parts.siteSnapshotHash, reuseCurrent.buildInputId], "live directory = the tracked shell package's input");
    assert(reuseRecord.portfolioRuntime !== undefined, "the shell package records no portfolio runtime");
  } else if (live.dataset) {
    const liveNow = await prepareSiteInput({ repoRoot, siteId: REUSE_SITE, mode: "public", at: live.identical ? reuseRecord.at : new Date().toISOString() });
    if (live.identical) eq([liveNow.parts.siteSnapshotHash, liveNow.buildInputId], [reuseRecord.parts.siteSnapshotHash, reuseCurrent.buildInputId], "live directory = the tracked package's data");
  } else {
    // adopted (portfolio.source.json) and no generated portfolio in this checkout: the live directory is not a dataset here
    const refused = await prepareSiteInput({ repoRoot, siteId: REUSE_SITE, mode: "public", at: reuseRecord.at }).then(() => "it loaded", (e: Error) => e.message);
    assert(notGenerated(REUSE_SITE).test(refused), `an adopted directory without a generated portfolio must be refused, got: ${refused}`);
  }
});
await check("M the two sites differ in Site Data only: identity, origin, projects, and theme values (the first site shows the Template defaults, the reuse site overrides declared tokens)", async () => {
  assert(reuse.siteId !== site.siteId && reuse.identity.brandName !== site.identity.brandName, "identity");
  assert(new URL(reuse.identity.publicOrigin!).origin !== new URL(site.identity.publicOrigin!).origin, "the two sites share an origin");
  const slugs = async (id: string): Promise<string[]> => (await readJson(`data/sites/${id}/content/projects.json`)).items.map((p: { slug: string }) => p.slug);
  const [a, b] = [await slugs(SITE), (await reuseProjects()).map((p) => p.slug)];
  assert(a.length > 0 && b.length > 0, `a site stores no project (${a.length} / ${b.length})`);
  eq(a.filter((s) => b.includes(s)), [], "project slugs in both sites");
  // the first site authors no theme.json (it shows the Template's default values); the reuse site overrides them
  assert(!(await exists(`data/sites/${SITE}/theme.json`)), "the first site authors a theme.json: compare the two documents instead");
  const defaults: Record<string, string> = (await readJson(`${templateDir(TEMPLATE)}/theme.default.json`)).tokens;
  const overrides: Record<string, string> = (await readJson(`data/sites/${REUSE_SITE}/theme.json`)).tokens;
  eq(Object.keys(overrides).filter((t) => !(t in defaults)), [], "tokens the Template does not declare");
  // the tonal roles a visitor sees first: page ground, the dark block colour, both accents
  for (const t of ["color.canvas", "color.action.primary", "color.accent.primary", "color.accent.secondary"]) {
    assert(typeof defaults[t] === "string" && typeof overrides[t] === "string", `${t} is not set on both sides`);
    assert(defaults[t] !== overrides[t], `${t}: the reuse site repeats the Template default (${defaults[t]})`);
  }
});
await check("N the reuse site's package: the pages its data plans, no source term of either Template, neither site's brand in the other's package", async () => {
  const projects = await reuseProjects();
  const published = projects.filter((p) => p.status === "published");
  assert(published.length > 0, "the reuse site's dataset has no published project");
  const pages = Math.ceil(published.length / PORTFOLIO_PAGE_SIZE);
  // Since 2026-10-10 the reuse site is published INCREMENTALLY (portfolio.source.json, publishing:
  // "incremental"): its package is a shell — the fixed pages plus the ONE detail shell the Template
  // declares — and its project pages are composed at publish time (held by portfolio-runtime.test.ts,
  // page by page against the last package that had them built in). A site that builds its own
  // portfolio is still held to one page per published project.
  const incremental = (await readPortfolioSource(path.join(repoRoot, "data/sites", REUSE_SITE))) === "incremental";
  const expected = incremental
    ? [...FIXED_PAGES, ...portfolioShell.pages.filter((p) => p.route === "portfolio.detail").map((p) => `${p.path.slice(1)}.html`)].sort()
    : [...FIXED_PAGES, ...published.map((p) => `portfolio/${p.slug}.html`), ...Array.from({ length: pages - 1 }, (_, i) => `portfolio/page/${i + 2}.html`)].sort();
  eq((await walkFiles(reuseSiteDir)).filter((f) => f.endsWith(".html") && !/^(404|_not-found)\.html$/.test(f)).sort(), expected, "pages");
  eq(reuseRecord.portfolioRuntime !== undefined, incremental, "the package carries the publisher's runtime documents exactly when the site is incremental");
  const terms = [...(await termsOf(TEMPLATE)), ...(await termsOf(OTHER_TEMPLATE)), OTHER_TEMPLATE];
  const hits: string[] = [];
  // a brand name, its Latin spelling and the site id each: none of them may cross into the other package
  const foreign: [string, string[]][] = [
    [reuseSiteDir, [site.identity.brandName, site.siteId, "온결", "ongyeol"]],
    [siteDir, [reuse.identity.brandName, reuse.siteId, "부스트", "boostinterior"]],
  ];
  for (const [dir, own] of [[siteDir, site.identity.brandName], [reuseSiteDir, reuse.identity.brandName]] as const) {
    assert((await readFile(path.join(dir, "index.html"), "utf8")).includes(own), `${own} is not in its own home page`);
  }
  for (const [dir, brand] of foreign) {
    for (const f of await textFiles(dir)) {
      const text = await readFile(path.join(dir, f), "utf8");
      if (dir === reuseSiteDir) hits.push(...scanForbiddenTerms(f, text, terms).map((h) => `${REUSE_SITE}/${h.file}: ${h.why}`));
      hits.push(...scanForbiddenTerms(f, text, brand).map((h) => `${path.basename(path.dirname(path.dirname(dir)))}/${h.file}: the other site's ${h.why}`));
    }
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
});
await check("O the third-party script the reuse site declares is Site Data: its host and key are in no Template or release file, in every page of its own package, and nowhere in the first site's package; no other remote reference", async () => {
  const scripts: { src: string; attrs?: Record<string, string> }[] = (await readJson(`data/sites/${REUSE_SITE}/scripts.json`)).headScripts;
  assert(scripts.length > 0, "the reuse site declares no head script");
  assert(!(await exists(`data/sites/${SITE}/scripts.json`)), "the first site declares head scripts too: this check assumes it does not");
  const needles = scripts.flatMap((sc) => [new URL(sc.src).host, ...Object.values(sc.attrs ?? {})]);
  const hits: string[] = [];
  const holds = (text: string) => needles.filter((n) => text.includes(n));
  const release = await loadRelease(repoRoot, TEMPLATE, pin.releaseId);
  const releaseDir = path.join(repoRoot, "data/template-releases", TEMPLATE, pin.releaseId);
  assert(release.files.length > 0, "the release lists no file");
  const scanned: Record<string, number> = {};
  for (const dir of [path.join(repoRoot, templateDir(TEMPLATE)), releaseDir, siteDir]) {
    for (const f of await walkFiles(dir)) {
      if (/(^|\/)(node_modules|\.next|out)\//.test(f) || (dir === siteDir && !TEXT_FILE.test(f))) continue;
      scanned[dir] = (scanned[dir] ?? 0) + 1;
      const found = holds(await readFile(path.join(dir, f), "utf8"));
      if (found.length) hits.push(`${path.relative(repoRoot, dir)}/${f}: ${found.join(", ")}`);
    }
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
  // the scan read real trees: every file the release lists, and at least the Template's share of them in the working tree
  const ownShare = release.files.filter((r) => r.path.startsWith(`${templateDir(TEMPLATE)}/`)).length;
  assert(ownShare > 0 && (scanned[path.join(repoRoot, templateDir(TEMPLATE))] ?? 0) >= ownShare, `${templateDir(TEMPLATE)}: ${scanned[path.join(repoRoot, templateDir(TEMPLATE))] ?? 0} files scanned, the release lists ${ownShare}`);
  assert((scanned[releaseDir] ?? 0) >= release.files.length, `release: only ${scanned[releaseDir] ?? 0} files scanned`);
  const own = new URL(reuse.identity.publicOrigin!).origin;
  const declared = new Set(scripts.map((sc) => sc.src));
  for (const f of (await walkFiles(reuseSiteDir)).filter((p) => p.endsWith(".html"))) {
    const html = await readFile(path.join(reuseSiteDir, f), "utf8");
    for (const sc of scripts) {
      assert(html.includes(`src="${sc.src}"`), `${f}: the declared script ${sc.src} is missing`);
      for (const [k, v] of Object.entries(sc.attrs ?? {})) assert(html.includes(`${k}="${v}"`), `${f}: the declared attribute ${k} is missing`);
    }
    for (const m of html.matchAll(/\s(?:src|href|srcset|poster|action)="(https?:)?\/\/([^"]*)"/g)) {
      const url = `${m[1] ?? "https:"}//${m[2]}`;
      if (!url.startsWith(`${own}/`) && url !== own && !declared.has(url)) hits.push(`${f}: remote reference ${url.slice(0, 120)}`);
    }
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
});

// --------------------------------------------------------- corner widget --
console.log("\n[corner] the reuse site's third-party corner widget is Site Data (1.0.1)");
/** the Site Data declaration (settings.json, read as authored — never through the Template's manifest) */
const EXT_KEYS = ["width", "height", "right", "bottom"] as const;
const extOf = async (id: string): Promise<Record<string, unknown> | undefined> => (await readJson(`data/sites/${id}/settings.json`)).overrides?.["site.floater"]?.externalWidget;
await check("P the reuse site declares the widget's closed box as Site Data (site.floater.externalWidget: four positive integer px), the first site declares none", async () => {
  const ext = await extOf(REUSE_SITE);
  assert(ext && typeof ext === "object", `${REUSE_SITE} declares no site.floater.externalWidget`);
  eq(Object.keys(ext).sort(), [...EXT_KEYS].sort(), "keys");
  for (const k of EXT_KEYS) assert(Number.isInteger(ext[k]) && (ext[k] as number) > 0, `${k} is not a positive integer: ${JSON.stringify(ext[k])}`);
  eq((await readJson(`data/sites/${REUSE_SITE}/settings.json`)).overrides["site.floater"].contact, false, "the reuse site's own contact button stays off (the widget is the contact)");
  eq(await extOf(SITE), undefined, `${SITE} declares an external widget`);
});
await check("Q the reuse site's package marks every page for the widget (html[data-ext-widget] + the four --i2-ext-* custom properties = the declared numbers); no page of the first site's package carries the marker or a property", async () => {
  const ext = await extOf(REUSE_SITE);
  assert(ext, `${REUSE_SITE} declares no site.floater.externalWidget`);
  const expectStyle = `--i2-ext-w:${ext.width}px;--i2-ext-h:${ext.height}px;--i2-ext-right:${ext.right}px;--i2-ext-bottom:${ext.bottom}px`;
  const htmlTag = (html: string) => /<html\b[^>]*>/.exec(html)?.[0] ?? "";
  let reusePages = 0;
  for (const f of (await walkFiles(reuseSiteDir)).filter((p) => p.endsWith(".html") && !/^(404|_not-found)\.html$/.test(p))) {
    const tag = htmlTag(await readFile(path.join(reuseSiteDir, f), "utf8"));
    assert(/\sdata-ext-widget(=""|\s|>)/.test(tag), `${REUSE_SITE}/${f}: <html> has no data-ext-widget: ${tag.slice(0, 200)}`);
    assert(tag.includes(`style="${expectStyle}"`), `${REUSE_SITE}/${f}: <html> does not carry ${expectStyle}: ${tag.slice(0, 240)}`);
    reusePages++;
  }
  assert(reusePages >= FIXED_PAGES.length, `only ${reusePages} pages scanned in the reuse package`);
  let firstPages = 0;
  for (const f of (await walkFiles(siteDir)).filter((p) => p.endsWith(".html"))) {
    const html = await readFile(path.join(siteDir, f), "utf8");
    assert(!html.includes("data-ext-widget") && !html.includes("--i2-ext-"), `${SITE}/${f}: carries the corner-widget marker without declaring one`);
    firstPages++;
  }
  assert(firstPages >= FIXED_PAGES.length, `only ${firstPages} pages scanned in the first site's package`);
});
await check("R the Template knows no vendor: no source file of the Template names the widget's vendor, its key or either site, and its CSS reads the box through the custom properties only", async () => {
  const scripts: { src: string; attrs?: Record<string, string> }[] = (await readJson(`data/sites/${REUSE_SITE}/scripts.json`)).headScripts;
  const vendorHost = new URL(scripts[0]!.src).host; // e.g. vendor.example
  const vendorName = vendorHost.split(".")[0]!; // the brand word of the host
  const needles = ["boost", vendorName, ...scripts.flatMap((sc) => Object.values(sc.attrs ?? {})), SITE, REUSE_SITE];
  const dir = path.join(repoRoot, templateDir(TEMPLATE));
  const hits: string[] = [];
  let cssReadsExt = false;
  for (const f of await walkFiles(dir)) {
    if (f === "provenance.json") continue;
    const text = await readFile(path.join(dir, f), "utf8");
    const lower = text.toLowerCase();
    for (const n of needles) if (lower.includes(n.toLowerCase())) hits.push(`${f}: "${n}"`);
    if (f.endsWith(".css") && /html\[data-ext-widget\]/.test(text) && /var\(--i2-ext-(w|h|right|bottom)\)/.test(text)) cssReadsExt = true;
    // no site-specific coordinate: the declared numbers appear in no CSS rule under the marker
    if (f.endsWith(".css")) for (const m of text.matchAll(/html\[data-ext-widget\][^{]*\{([^}]*)\}/g)) assert(!/\b(64|18)px/.test(m[1]!), `${f}: a site's coordinate is hard-coded under html[data-ext-widget]: ${m[1]!.slice(0, 120)}`);
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
  assert(cssReadsExt, "no Template stylesheet reads the widget box through html[data-ext-widget] + var(--i2-ext-*)");
});

console.log(`\ninterior-02: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
