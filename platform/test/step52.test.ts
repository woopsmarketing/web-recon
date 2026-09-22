/**
 * Step 5.2 validation — Template finalization (interior-01 1.4.0):
 *   1. the floating contact CTA is site-wide (every generated page, one seat, same rule);
 *   2. a project area may state its basis (`area.basis`: supply | exclusive | unknown).
 * Run AFTER the 1.4.0 release is cut and the three fixtures are re-pinned and built:
 *   pnpm test:platform   (slice1 → step4 → step41 → step5 → polish → this file)
 * Browser behaviour of the seat on every page family (fixed invariant, reachability, overflow,
 * media, non-local requests) is covered by scripts/template-platform-polish-visual-smoke.ts.
 * Throwaway-root builds never touch data/sites or data/site-builds.
 */
import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { toProjectFilterRecord } from "../content/project-filter";
import { AREA_BASES, ProjectSchema, areaBasisOf, defaultAreaBasis, type Project } from "../content/schema";
import { buildSite, packageIntact, prepareSiteInput } from "../build/site-build";
import { loadRelease, verifyRelease } from "../release/release";
import template from "../../templates/interior-01/v1/template";

const repoRoot = process.cwd();
const SITES = ["fixture-large", "fixture-small", "fixture-empty"] as const;
/** The polish release: this step's base and every site's rollback target. */
const POLISH_RELEASE = { id: "interior-01-1.3.1-bd4ae8fb1769", hash: "bd4ae8fb17693fde27859d7e6935db5112df1605ff26a2785817bd1e67b640d4" };
const V1 = "templates/interior-01/v1";
/** The only release files this step may change. */
const CHANGED = [
  "platform/content/schema.ts",
  `${V1}/app/layout.tsx`,
  `${V1}/app/not-found.tsx`,
  `${V1}/app/page.tsx`,
  `${V1}/app/portfolio/[slug]/page.tsx`,
  `${V1}/app/portfolio/page.tsx`,
  `${V1}/app/portfolio/page/[n]/page.tsx`,
  `${V1}/sections/FloatingCta.tsx`,
  `${V1}/sections/SiteFooter.tsx`,
  `${V1}/styles/template.css`,
  `${V1}/template.ts`,
].sort();
/** Semver order of "x.y.z" strings. */
const versionAtLeast = (v: string, min: string) => {
  const [a, b] = [v, min].map((x) => x.split(".").map(Number));
  for (let i = 0; i < 3; i++) if (a![i] !== b![i]) return a![i]! > b![i]!;
  return true;
};

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
const readJson = async (f: string) => JSON.parse(await readFile(f, "utf8"));
async function walkFiles(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...(await walkFiles(path.join(dir, e.name), r)));
    else out.push(r);
  }
  return out.sort();
}
const releaseFile = (id: string, p: string) => readFile(path.join(repoRoot, "data/template-releases/interior-01", id, "files", p), "utf8");
/** Source text without comments (block, JSDoc and whole-line `//` comments). */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\s+/g, " ").trim();
const history = async (s: string) =>
  (await readFile(path.join(repoRoot, "data/site-builds", s, "history.jsonl"), "utf8")).trim().split("\n").map((l) => JSON.parse(l) as { buildInputId: string; status: string; finishedAt: string; releaseId: string });
const pointer = async (s: string, which: "current" | "previous") => {
  const ptr = await readJson(path.join(repoRoot, "data/site-builds", s, `${which}.json`));
  const dir = path.join(repoRoot, ptr.packageDir);
  return { dir, site: path.join(dir, "site"), record: await readJson(path.join(dir, "build-record.json")) };
};
const pinOf = async (s: string) => (await readJson(path.join(repoRoot, "data/sites", s, "site.json"))).template;

/** The seat as rendered: one wrapper, one link. */
const CTA = /<div class="i1-fcta" data-section="site\.floating-cta"><a class="i1-fcta__link" href="([^"]+)" data-floating-cta="">[\s\S]*?<span>([^<]*)<\/span><\/a><\/div>/g;
const ctasOf = (h: string) => [...h.matchAll(CTA)].map((m) => ({ href: m[1]!, label: m[2]! }));
const footerOf = (h: string) => /<footer class="i1-footer" data-section="site\.footer">[\s\S]*?<\/footer>/.exec(h)?.[0] ?? "";
const mainOf = (h: string) => /<main[\s\S]*<\/main>/.exec(h)?.[0] ?? "";
/** Rendered markup only: flight/bootstrap scripts removed; build id, stylesheet and chunk names normalised. */
const markup = (h: string, buildId: string) =>
  h
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "")
    .split(buildId)
    .join("BUILD")
    .replace(/_next\/static\/chunks\/[A-Za-z0-9_-]+\.css/g, "SHEET.css")
    .replace(/_next\/static\/chunks\/[A-Za-z0-9_-]+\.js/g, "CHUNK.js")
    // an EMPTY React Suspense boundary renders nothing; where it sits moved with the shell
    .replace(/<!--\$--><!--\/\$-->/g, "");
/** React useId() values depend on the tree around the page (the shell changed): first-appearance ordinals. */
const canonicalIds = (h: string) => {
  const seen = new Map<string, string>();
  return h.replace(/_R_[A-Za-z0-9]+_/g, (id) => seen.get(id) ?? (seen.set(id, `_ID${seen.size}_`), `_ID${seen.size - 1}_`));
};
const htmlPages = async (site: string) => (await walkFiles(site)).filter((f) => f.endsWith(".html"));

const newPin = await pinOf("fixture-large");
/** The Step 5.2 release = the last 1.4.0 release fixture-large was built with. */
const step52Id = (await history("fixture-large")).filter((r) => r.status === "success" && r.releaseId.startsWith("interior-01-1.4.0-")).at(-1)?.releaseId;
/** A later release is current: the 1.3.1/1.4.0 packages are no longer both retained and the fixtures may have moved on. */
const later = versionAtLeast(newPin.templateVersion, "1.4.1");
const cur = Object.fromEntries(await Promise.all(SITES.map(async (s) => [s, await pointer(s, "current")] as const)));
const prev = Object.fromEntries(await Promise.all(SITES.map(async (s) => [s, await pointer(s, "previous").catch(() => undefined)] as const)));

// ---------------------------------------------------------------- release --
console.log("\n[release] the Step 5.2 release against the polish release");
await check("R1 exactly ONE 1.4.0 release exists, verifies, and is every site's pin while 1.4.0 is current; 1.3.1 unchanged", async () => {
  assert(step52Id, "no successful 1.4.0 build recorded");
  const v140 = (await readdir(path.join(repoRoot, "data/template-releases/interior-01"))).filter((d) => d.startsWith("interior-01-1.4.0-"));
  assert(v140.length === 1 && v140[0] === step52Id, `1.4.0 releases: ${v140.join(", ")}`);
  const rel = await loadRelease(repoRoot, "interior-01", step52Id);
  await verifyRelease(repoRoot, rel);
  assert(rel.templateVersion === "1.4.0", rel.templateVersion);
  if (newPin.templateVersion === "1.4.0") {
    const pins = await Promise.all(SITES.map(pinOf));
    assert(pins.every((p) => p.releaseId === step52Id && p.releaseHash === rel.releaseHash) && template.version === "1.4.0", `pins ${pins.map((p) => p.releaseId).join(", ")}`);
  }
  const polish = await loadRelease(repoRoot, "interior-01", POLISH_RELEASE.id);
  assert(polish.releaseHash === POLISH_RELEASE.hash, "1.3.1 releaseHash changed");
  await verifyRelease(repoRoot, polish);
});
await check("R2 same release file set as 1.3.1; exactly schema.ts, the app/ pages + layout, FloatingCta.tsx, SiteFooter.tsx, template.css, template.ts differ", async () => {
  const [a, b] = await Promise.all([POLISH_RELEASE.id, step52Id!].map((id) => loadRelease(repoRoot, "interior-01", id)));
  const pa = a!.files.map((f) => f.path);
  const pb = b!.files.map((f) => f.path);
  assert(JSON.stringify(pa) === JSON.stringify(pb), `file set changed: +${pb.filter((p) => !pa.includes(p))} −${pa.filter((p) => !pb.includes(p))}`);
  const sha = new Map(a!.files.map((f) => [f.path, f.sha256]));
  eq(b!.files.filter((f) => sha.get(f.path) !== f.sha256).map((f) => f.path).sort(), CHANGED, "changed files");
});
/** The one stylesheet rule 1.4.0 adds: ≥ 900px, /portfolio result actions follow the count (the right end is the seat's). */
const STATUS_RULE = ".i1-pfilter__status { justify-content: flex-start; gap: 8px 32px; }";
await check("R3 FloatingCta.tsx differs in comments only; template.css in comments + ONE rule (filter actions beside the count ≥ 900px); template.ts in comments + version 1.3.1 → 1.4.0 only (no setting/slot change)", async () => {
  const [fa, fb] = await Promise.all([POLISH_RELEASE.id, step52Id!].map((id) => releaseFile(id, `${V1}/sections/FloatingCta.tsx`)));
  assert(fa !== fb && code(fa!) === code(fb!), "FloatingCta.tsx: code changed");
  const [ca, cb] = await Promise.all([POLISH_RELEASE.id, step52Id!].map((id) => releaseFile(id, `${V1}/styles/template.css`)));
  assert(code(cb!).split(STATUS_RULE).length === 2, "template.css: the status rule is not there exactly once");
  assert(code(cb!).replace(` ${STATUS_RULE}`, "") === code(ca!), "template.css: code changed beyond the status rule");
  // …and it sits in the ≥ 900px block, right after the (hidden) panel toggle
  assert(/@media \(min-width: 900px\) \{[^@]*\.i1-pfilter__toggle \{ display: none; \} \.i1-pfilter__status \{ justify-content: flex-start;/.test(code(cb!)), "template.css: status rule outside the ≥ 900px block");
  const [ta, tb] = await Promise.all([POLISH_RELEASE.id, step52Id!].map((id) => releaseFile(id, `${V1}/template.ts`)));
  assert(code(tb!).split('version: "1.4.0"').length === 2, "template.ts version");
  assert(code(ta!) === code(tb!).replace('version: "1.4.0"', 'version: "1.3.1"'), "template.ts code changed beyond the version");
});
await check("R4 ONE seat owner: the root layout renders SiteFooter (once, after every page), SiteFooter renders FloatingCta; no page renders either; pages otherwise unchanged", async () => {
  const footer = await releaseFile(step52Id!, `${V1}/sections/SiteFooter.tsx`);
  assert(/const cta = floatingCta\(ctx\);/.test(footer) && /\{cta \? <FloatingCta data=\{cta\} \/> : null\}\s*<\/footer>/.test(footer), "SiteFooter does not render the seat as its last child");
  assert(!/children/.test(code(footer)), "SiteFooter takes children");
  const layout = code(await releaseFile(step52Id!, `${V1}/app/layout.tsx`));
  assert(/<body> \{children\} <SiteFooter ctx=\{ctx\} \/> <\/body>/.test(layout), "layout does not render the footer after the page");
  const rel = await loadRelease(repoRoot, "interior-01", step52Id!);
  const pages = rel.files.map((f) => f.path).filter((p) => p.startsWith(`${V1}/app/`) && p.endsWith(".tsx") && !p.endsWith("/layout.tsx"));
  assert(pages.length === 5, `pages: ${pages.join(", ")}`);
  for (const p of pages) {
    const [before, after] = await Promise.all([POLISH_RELEASE.id, step52Id!].map((id) => releaseFile(id, p)));
    assert(!/SiteFooter|FloatingCta|floatingCta/.test(code(after!)), `${p} still renders the footer or the seat`);
    // the only code change: the page's own footer (and the homepage's seat) moved to the shell
    const strip = (t: string) =>
      code(t)
        .replace(/import \{ SiteFooter \} from "[./]+sections\/SiteFooter";/g, "")
        .replace(/import \{ FloatingCta, floatingCta \} from "[./]+sections\/FloatingCta";/g, "")
        .replace(/const cta = floatingCta\(ctx\);/g, "")
        .replace(/<SiteFooter ctx=\{ctx\}>\{cta \? <FloatingCta data=\{cta\} \/> : null\}<\/SiteFooter>/g, "")
        .replace(/<SiteFooter ctx=\{ctx\} \/>/g, "")
        .replace(/\{\s*\}/g, "") // what code() leaves of a JSX {/* comment */}
        .replace(/\s+/g, " ");
    assert(strip(before!) === strip(after!), `${p}: code changed beyond moving the footer`);
  }
});

// ------------------------------------------------------------- packages --
if (later) {
  console.log(`\n[packages] skipped — a later release (${newPin.releaseId}) is current; the 1.3.1/1.4.0 packages are no longer retained`);
} else {
  console.log("\n[packages] 1.4.0 packages against the retained 1.3.1 (rollback) packages");
  await check("P1 every site: current built with the Step 5.2 release, previous = its 1.3.1 package, both intact", async () => {
    for (const s of SITES) {
      assert(cur[s]!.record.template.releaseId === step52Id, `${s}: current built with ${cur[s]!.record.template.releaseId}`);
      assert(prev[s]?.record.template.releaseId === POLISH_RELEASE.id, `${s}: previous built with ${prev[s]?.record.template.releaseId}`);
      assert((await packageIntact(cur[s]!.dir)) && (await packageIntact(prev[s]!.dir)), `${s}: package damaged`);
    }
  });
  await check("P2 site-wide CTA: every page of large/small has exactly ONE seat, the footer's last child, → the business email, with the site's label; empty (no destination): none on any page", async () => {
    for (const s of SITES) {
      const business = await readJson(path.join(repoRoot, "data/sites", s, "content/business.json"));
      const email: string | undefined = business.data.contact?.email;
      const slots = await readJson(path.join(repoRoot, "data/sites", s, "slots.json")).catch(() => ({ values: {} }));
      const label: string = slots.values["site.floating-cta"]?.label ?? "Contact";
      const pages = await htmlPages(cur[s]!.site);
      assert(pages.length > 0, `${s}: no pages`);
      for (const f of pages) {
        const h = await readFile(path.join(cur[s]!.site, f), "utf8");
        const found = ctasOf(h);
        if (!email) {
          assert(found.length === 0 && !h.includes("i1-fcta"), `${s}/${f}: seat without a contact destination`);
          continue;
        }
        eq(found, [{ href: `mailto:${email}`, label }], `${s}/${f}: seat`);
        const footer = footerOf(h);
        assert(/<\/a><\/div><\/footer>$/.test(footer) && ctasOf(footer).length === 1, `${s}/${f}: seat is not the footer's last child`);
        assert(!mainOf(h).includes("i1-fcta"), `${s}/${f}: seat inside <main>`);
      }
      // the page families this step is about are all there (404 = the site's own page)
      const need = email ? ["index.html", "404.html", ...(s === "fixture-large" ? ["portfolio.html", "portfolio/page/2.html"] : [])] : ["index.html", "404.html"];
      for (const f of need) assert(pages.includes(f), `${s}: ${f} missing`);
      if (s !== "fixture-empty") assert(pages.some((f) => /^portfolio\/(?!page\/)[^/]+\.html$/.test(f)), `${s}: no detail page`);
    }
  });
  await check("P3 regression: every page's rendered markup = its 1.3.1 markup + the seat (nothing else); stylesheet = 1.3.1 + the one status rule; page set, media, sitemap, robots identical", async () => {
    for (const s of SITES) {
      const [a, b] = [prev[s]!, cur[s]!];
      const [ida, idb] = [a.record.buildInputId.slice(0, 32), b.record.buildInputId.slice(0, 32)];
      // JS chunks are regrouped when the component tree moves (footer → root layout): compared by
      // behaviour (smokes), not by bytes. Every other output file must pair up.
      const byNorm = async (site: string, id: string) =>
        new Map((await walkFiles(site)).filter((f) => !/^_next\/static\/chunks\/[^/]+\.(js|css)$/.test(f)).map((f) => [f.split(id).join("BUILD"), f]));
      const sheet = async (site: string) => {
        const css = (await walkFiles(site)).filter((f) => f.endsWith(".css"));
        assert(css.length === 1, `${s}: ${css.length} stylesheets`);
        return readFile(path.join(site, css[0]!), "utf8");
      };
      const [sa, sb] = await Promise.all([sheet(a.site), sheet(b.site)]);
      const rule = ".i1-pfilter__status{justify-content:flex-start;gap:8px 32px}";
      assert(sb.split(rule).length === 2 && sb.replace(rule, "") === sa, `${s}: stylesheet changed beyond the status rule`);
      const [na0, nb0] = await Promise.all([byNorm(a.site, ida), byNorm(b.site, idb)]);
      eq([...nb0.keys()].sort(), [...na0.keys()].sort(), `${s}: output file set`);
      const keys = [...na0.keys()].sort();
      let pages = 0;
      let added = 0;
      for (const k of keys) {
        const [fa, fb] = [na0.get(k)!, nb0.get(k)!];
        const [x, y] = await Promise.all([readFile(path.join(a.site, fa)), readFile(path.join(b.site, fb))]);
        if (k.endsWith(".html")) {
          const [ma, mb] = [canonicalIds(markup(x.toString("utf8"), ida)), canonicalIds(markup(y.toString("utf8"), idb))];
          const [na, nb] = [ctasOf(ma).length, ctasOf(mb).length];
          assert(ma.replace(CTA, "") === mb.replace(CTA, ""), `${s}/${fb}: markup changed beyond the seat`);
          assert(nb === (s === "fixture-empty" ? 0 : 1) && na <= nb, `${s}/${fb}: seats ${na} → ${nb}`);
          added += nb - na;
          pages++;
        } else if (k.endsWith(".txt") && k !== "robots.txt") {
          continue; // RSC flight payloads serialise the component tree, which moved
        } else if (k.startsWith("_next/static/BUILD/")) {
          continue; // build manifests list the regrouped chunks
        } else {
          const same = /\.(css|xml|txt)$/.test(k) ? x.toString("utf8") === y.toString("utf8") : x.equals(y);
          assert(same, `${s}/${fb} changed`);
        }
      }
      assert(pages > 0, `${s}: nothing compared`);
      // 1.3.1 had the seat on the homepage only: every OTHER page gains exactly one
      if (s !== "fixture-empty") eq(added, pages - 1, `${s}: pages that gained the seat`);
    }
  });

}

// ------------------------------------------------------------- area basis --
console.log("\n[unit] area basis contract");
const small = (await readJson(path.join(repoRoot, "data/sites/fixture-small/content/projects.json"))).items as Project[];
const pyeong = small.find((p) => p.status === "published" && p.area?.unit === "pyeong");
await check("A1 area.basis: exactly supply | exclusive | unknown are accepted; absent stays valid; anything else is refused", () => {
  eq([...AREA_BASES], ["supply", "exclusive", "unknown"], "AREA_BASES");
  assert(pyeong, "fixture-small has no published 평 project");
  const withArea = (area: unknown) => ProjectSchema.safeParse({ ...pyeong, area }).success;
  assert(withArea({ value: 34, unit: "pyeong" }), "absent basis refused");
  for (const b of AREA_BASES) assert(withArea({ value: 34, unit: "pyeong", basis: b }), `${b} refused`);
  for (const b of ["Supply", "gross", "contract", "", null, 1]) assert(!withArea({ value: 34, unit: "pyeong", basis: b }), `${JSON.stringify(b)} accepted`);
  assert(!withArea({ value: 34, unit: "pyeong", basis: "supply", exclusiveValue: 25.4 }), "a second value slipped in (strict object)");
});
await check("A2 every stored fixture area (none states a basis) reads as unknown; a stated basis reads as stated", async () => {
  let n = 0;
  for (const s of SITES) {
    const items = ((await readJson(path.join(repoRoot, "data/sites", s, "content/projects.json")).catch(() => ({ items: [] }))).items ?? []) as Project[];
    for (const p of items.filter((x) => x.area)) {
      assert(ProjectSchema.safeParse(p).success, `${s}/${p.id}: stored project no longer valid`);
      eq(areaBasisOf(p.area!), "unknown", `${s}/${p.id}`);
      n++;
    }
  }
  assert(n > 100, `only ${n} stored areas`);
  for (const b of AREA_BASES) eq(areaBasisOf({ basis: b }), b, "stated basis");
});
await check("A3 authoring default: bare 평 in Korean residential context → supply; every other unstated case → unknown", () => {
  eq(defaultAreaBasis({ unit: "pyeong", locale: "ko-KR", residential: true }), "supply", "34평 아파트 (ko-KR)");
  eq(defaultAreaBasis({ unit: "pyeong", locale: "ko", residential: true }), "supply", "34평 아파트 (ko)");
  eq(defaultAreaBasis({ unit: "m2", locale: "ko-KR", residential: true }), "unknown", "84㎡ — no convention decides it");
  eq(defaultAreaBasis({ unit: "pyeong", locale: "ko-KR", residential: false }), "unknown", "34평 사무실");
  eq(defaultAreaBasis({ unit: "pyeong", locale: "en-GB", residential: true }), "unknown", "non-Korean context");
  eq(defaultAreaBasis({ unit: "sqft", locale: "en-US", residential: true }), "unknown", "sq ft");
  eq(defaultAreaBasis({ unit: "pyeong", locale: "kok-IN", residential: true }), "unknown", "not Korean (Konkani)");
  eq(defaultAreaBasis({ unit: "pyeong", locale: "KO_kr", residential: true }), "supply", "locale case / separator");
});
await check("A4 no auto-equivalence: a supply 34평 stays { 34, pyeong } in the filter record (no basis, no 84㎡ / 25.4평 substitution)", () => {
  const p = { ...pyeong!, area: { value: 34, unit: "pyeong" as const, basis: "supply" as const } };
  eq(toProjectFilterRecord(p).area, { value: 34, unit: "pyeong" }, "filter record area");
  const q = { ...p, area: { ...p.area, basis: "exclusive" as const } };
  eq(toProjectFilterRecord(q).area, toProjectFilterRecord(p).area, "basis must not change the filter record");
});

// ------------------------------------------------------------- throwaway --
console.log("\n[integration] throwaway-root builds (seat off / no destination, basis end-to-end, document compatibility)");
const tmpRoot = await mkdtemp(path.join(os.tmpdir(), "step52-root-"));
async function copySite(from: string, to: string) {
  const dir = path.join(tmpRoot, "data/sites", to);
  await cp(path.join(repoRoot, "data/sites", from), dir, { recursive: true });
  const site = await readJson(path.join(dir, "site.json"));
  site.siteId = to;
  await writeFile(path.join(dir, "site.json"), `${JSON.stringify(site, null, 2)}\n`);
  return dir;
}
/** The fixture's 평 project becomes a "34평" project with the given basis (undefined = unstated). */
async function setPyeongArea(dir: string, basis: string | undefined) {
  const doc = await readJson(path.join(dir, "content/projects.json"));
  const p = doc.items.find((x: Project) => x.id === pyeong!.id);
  p.area = basis === undefined ? { value: 34, unit: "pyeong" } : { value: 34, unit: "pyeong", basis };
  await writeFile(path.join(dir, "content/projects.json"), JSON.stringify(doc, null, 2));
}
try {
  await mkdir(path.join(tmpRoot, "data/sites"), { recursive: true });
  await symlink(path.join(repoRoot, "data/template-releases"), path.join(tmpRoot, "data/template-releases"));
  await symlink(path.join(repoRoot, "node_modules"), path.join(tmpRoot, "node_modules"));
  const at = cur["fixture-small"]!.record.at;
  const detail = `portfolio/${pyeong!.slug}.html`;
  const built: Record<string, string> = {};

  await check("I1 seat disabled (site.floating-cta.enabled = false) → no seat on ANY page; basis = supply builds and renders the detail exactly as without a basis", async () => {
    const dir = await copySite("fixture-small", "off-small");
    const settings = await readJson(path.join(dir, "settings.json"));
    settings.overrides["site.floating-cta"] = { enabled: false };
    await writeFile(path.join(dir, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
    await setPyeongArea(dir, "supply");
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "off-small", at });
    assert(r.status === "built" && r.record.qa.pass, r.status);
    built.supply = path.join(r.packageDir, "site");
    const pages = await htmlPages(built.supply);
    assert(pages.length === (await htmlPages(cur["fixture-small"]!.site)).length, "page count");
    for (const f of pages) assert(!(await readFile(path.join(built.supply, f), "utf8")).includes("i1-fcta"), `${f}: seat rendered while disabled`);
  });
  await check("I2 no contact destination → no seat on ANY page", async () => {
    const dir = await copySite("fixture-small", "nomail-small");
    const business = await readJson(path.join(dir, "content/business.json"));
    delete business.data.contact;
    await writeFile(path.join(dir, "content/business.json"), JSON.stringify(business, null, 2));
    const r = await buildSite({ repoRoot: tmpRoot, siteId: "nomail-small", at });
    assert(r.status === "built" && r.record.qa.pass, r.status);
    const site = path.join(r.packageDir, "site");
    const pages = await htmlPages(site);
    assert(pages.length === (await htmlPages(cur["fixture-small"]!.site)).length, "page count");
    for (const f of pages) assert(!(await readFile(path.join(site, f), "utf8")).includes("i1-fcta"), `${f}: seat without a destination`);
  });
  await check("I3 basis is data only in 1.4.0: detail <main> identical for supply / exclusive / unstated; the value is shown as authored (34평); basis never shipped to the browser", async () => {
    assert(built.supply, "I1 build missing");
    for (const [id, basis] of [["plain-small", undefined], ["excl-small", "exclusive"]] as const) {
      const dir = await copySite("fixture-small", id);
      await setPyeongArea(dir, basis);
      if (id === "excl-small") {
        // same seat setting as the supply build (off), so only the basis differs
        const settings = await readJson(path.join(dir, "settings.json"));
        settings.overrides["site.floating-cta"] = { enabled: false };
        await writeFile(path.join(dir, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
      }
      const r = await buildSite({ repoRoot: tmpRoot, siteId: id, at });
      assert(r.status === "built" && r.record.qa.pass, `${id}: ${r.status}`);
      built[basis ?? "unstated"] = path.join(r.packageDir, "site");
    }
    const mains = await Promise.all([built.unstated, built.supply, built.exclusive].map(async (d) => mainOf(await readFile(path.join(d, detail), "utf8"))));
    assert(mains[0] && mains[0] === mains[1] && mains[0] === mains[2], "detail <main> depends on the basis");
    assert(mains[0].includes("34평"), "area not shown as authored");
    for (const d of Object.values(built)) {
      // plain JSON (.txt/.json) and the escaped flight payload inlined in .html
      for (const f of await walkFiles(d)) if (/\.(html|txt|json)$/.test(f)) assert(!/\\?"basis\\?"/.test(await readFile(path.join(d, f), "utf8")), `${f}: basis shipped`);
    }
  });
  await check("I4 rollback boundary: the 1.3.1 release refuses (fails closed) a document that states a basis — basis data needs ≥ 1.4.0", async () => {
    const dir = await copySite("fixture-small", "old-small");
    await setPyeongArea(dir, "supply");
    const site = await readJson(path.join(dir, "site.json"));
    site.template = { templateId: "interior-01", templateVersion: "1.3.1", releaseId: POLISH_RELEASE.id, releaseHash: POLISH_RELEASE.hash };
    await writeFile(path.join(dir, "site.json"), `${JSON.stringify(site, null, 2)}\n`);
    let message = "";
    try {
      await buildSite({ repoRoot: tmpRoot, siteId: "old-small", at });
    } catch (error) {
      message = (error as Error).message;
    }
    // the release's own frozen schema (its preflight), not the host's, decides
    assert(/area: Unrecognized key: "basis"/.test(message), `1.3.1 built a basis document (or failed for another reason): ${message.slice(-400)}`);
  });
  if (!later) {
    await check("D every site's current documents re-pinned to 1.3.1 reproduce its 1.3.1 buildInputId (no content, setting or slot change)", async () => {
      for (const s of SITES) {
        // the retained 1.3.1 package when there is one; its history record once it is pruned
        const rec = (await history(s)).filter((r) => r.status === "success" && r.releaseId === POLISH_RELEASE.id).at(-1);
        const want = prev[s]?.record.template.releaseId === POLISH_RELEASE.id ? { id: prev[s]!.record.buildInputId as string, at: prev[s]!.record.at as string } : rec && { id: rec.buildInputId, at: rec.finishedAt };
        assert(want, `${s}: no recorded 1.3.1 build`);
        const dir = path.join(tmpRoot, "data/sites", s);
        await cp(path.join(repoRoot, "data/sites", s), dir, { recursive: true });
        const site = await readJson(path.join(dir, "site.json"));
        site.template = { templateId: "interior-01", templateVersion: "1.3.1", releaseId: POLISH_RELEASE.id, releaseHash: POLISH_RELEASE.hash };
        await writeFile(path.join(dir, "site.json"), `${JSON.stringify(site, null, 2)}\n`);
        const { buildInputId } = await prepareSiteInput({ repoRoot: tmpRoot, siteId: s, mode: "public", at: want.at });
        assert(buildInputId === want.id, `${s}: ${buildInputId} ≠ 1.3.1 build ${want.id}`);
      }
    });
  }
} finally {
  await rm(tmpRoot, { recursive: true, force: true });
}

console.log(`\nstep52: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
