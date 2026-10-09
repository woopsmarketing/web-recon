/**
 * interior-03 — the third authored Template, its fictional site (nuridam-interior-demo) and its reuse
 * site (boost-interior-demo-03).
 *
 * [source]  the Template's working tree: declared identity and routes, the release gate (imports,
 *           identifiers, siteId literals, forbidden terms) over the tree as it is now, isolation from
 *           BOTH earlier Templates (no import either way, no Template's source terms in another), no
 *           Template-owned static files, and the theming rule: no colour literal anywhere in the
 *           Template (theme.default.json is the only file that holds colour values).
 * [release] the site's pin: an immutable release that exists, verifies byte for byte, froze the
 *           provenance terms, passed every gate, and IS the working tree (no unreleased drift).
 * [package] the site's current package: built with that pin from the site's present data (identity
 *           recomputed here), QA pass, every page the fixture's data plans, no source term of any
 *           Template in any emitted text file, every internal link resolving to an emitted file, and
 *           no site of another Template pinned to this one.
 * [reuse]   a second site on the SAME immutable release: its own identity, origin, content, theme and
 *           third-party key as Site Data only (the theme and the key differ from the other reuse sites'
 *           too), its own package, neither site's brand in the other's package, the vendor nowhere in
 *           the Template or its release, and the corner-widget seam carried as four custom properties.
 *
 * Every expected value is a literal or is read from the site's own authored data — never recomputed
 * with the Template code under test. Reads only: builds nothing, writes nothing.
 *
 * The reuse site's PORTFOLIO is owned by BoostChat (site:portfolio-sync regenerates it; once its
 * tracked marker portfolio.source.json is committed, a checkout without a generated portfolio refuses
 * to load the directory at all). Its portfolio is therefore read through the frozen composition
 * (demo-frozen-dataset.ts: that site's live directory + the frozen dataset it was authored with) —
 * byte for byte the live directory while that is still the hand-authored one. Everything the site
 * itself owns (site.json, settings, theme, scripts, inquiry) is read from the live directory as
 * before, and L2 holds the live directory to what it is in this checkout.
 *
 * Run AFTER `template:release interior-03@1` + `site:build nuridam-interior-demo` +
 * `site:build boost-interior-demo-03`:
 *   tsx --tsconfig platform/tsconfig.json platform/test/interior-03.test.ts
 * With I03_SELFTEST=1 the scanners are run over seeded violations instead (a guard that they bite).
 */
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { prepareSiteInput } from "../build/site-build";
import { collectReleaseSources, gateTemplateSources, loadRelease, scanForbiddenTerms, verifyRelease } from "../release/release";
import { loadSiteInstance } from "../site/load";
import { sha256 } from "../util/hash";
import { frozenDemoRoot, notGenerated } from "./demo-frozen-dataset";
import template from "../../templates/interior-03/v1/template";
import { PORTFOLIO_PAGE_SIZE } from "../../templates/interior-03/v1/manifest/portfolio";

const repoRoot = process.cwd();
const TEMPLATE = "interior-03";
const OTHER_TEMPLATES = ["interior-01", "interior-02"] as const;
const SITE = "nuridam-interior-demo";
/** the same release under another brand: nothing but Site Data differs */
const REUSE_SITE = "boost-interior-demo-03";
/** the earlier reuse sites (other Templates): their theme and third-party key must not be this site's */
const OTHER_REUSE_SITES = ["boost-interior-demo", "boost-interior-demo-02"] as const;
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
const readJsonIf = async (f: string) => ((await exists(f)) ? readJson(f) : undefined);
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
const htmlPages = async (dir: string) => (await walkFiles(dir)).filter((f) => f.endsWith(".html"));
const textFiles = async (dir: string) => (await walkFiles(dir)).filter((f) => TEXT_FILE.test(f));
/** a site's stored projects: the fixture site's own file; the reuse site's through the frozen composition (`reuseFrozen`, below) */
async function storedProjects(siteId: string): Promise<{ slug: string; status: string }[]> {
  if (siteId !== REUSE_SITE) return (await readJson(`data/sites/${siteId}/content/projects.json`)).items;
  return JSON.parse(await readFile(path.join(reuseFrozen.siteDir, "content/projects.json"), "utf8")).items;
}
/** the HTML pages a site's data plans: the fixed pages, one detail per published project, the list's later pages */
async function plannedPages(siteId: string): Promise<string[]> {
  const projects = await storedProjects(siteId);
  const published = projects.filter((p) => p.status === "published");
  assert(published.length > 0, `${siteId}: the dataset has no published project`);
  const pages = Math.ceil(published.length / PORTFOLIO_PAGE_SIZE);
  return [...FIXED_PAGES, ...published.map((p) => `portfolio/${p.slug}.html`), ...Array.from({ length: pages - 1 }, (_, i) => `portfolio/page/${i + 2}.html`)].sort();
}
const emittedPages = async (dir: string) => (await htmlPages(dir)).filter((f) => !/^(404|_not-found)\.html$/.test(f)).sort();

// ------------------------------------------------------ colour literals --
/** every CSS named colour (CSS Color 4) — the keywords that are NOT colours (transparent, currentColor, inherit …) are simply not listed */
const NAMED_COLOURS =
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen".split(
    " ",
  );
const HEX_COLOUR = /#[0-9a-fA-F]{3,8}(?![\w-])/g;
const COLOUR_FUNCTION = /(?<![\w.$-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/g;
/** a named colour as a whole word: `var(--i3-gold)` and `.i3-btn--gold` are not one (joined by `-`), `white-space` is not one */
const NAMED_COLOUR_WORD = new RegExp(`(?<![\\w-])(${NAMED_COLOURS.join("|")})(?![\\w-])`, "gi");
const stripBlockComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, " ");
/** `// …` to end of line, when it starts the line or follows whitespace (never the `//` of a URL) */
const stripLineComments = (text: string) => text.replace(/(^|\s)\/\/.*$/gm, "$1");
/** quoted strings and url(...) carry no colour value in CSS: they are dropped before a value is scanned */
const stripCssStrings = (value: string) => value.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|url\([^)]*\)/g, '""');
/**
 * Colour literals in a stylesheet: every `property: value` declaration's value (the regex cannot match a
 * selector or an at-rule prelude — those end in `{`, a value ends in `;` or `}`) must hold no hex colour,
 * no colour function and no named colour. Colours come from var(--color-…) / var(--i3-…) / color-mix() only.
 */
function cssColourLiterals(text: string): string[] {
  const hits: string[] = [];
  for (const m of stripBlockComments(text).matchAll(/([\w-]+)\s*:\s*([^;{}]+?)\s*(?=[;}])/g)) {
    const value = stripCssStrings(m[2]!);
    for (const re of [HEX_COLOUR, COLOUR_FUNCTION, NAMED_COLOUR_WORD]) for (const hit of value.matchAll(re)) hits.push(`${m[1]}: … ${hit[0]}`);
  }
  return hits;
}
/**
 * Colour literals in code (TS / TSX / MJS / JSON): a hex colour or a colour function anywhere outside a
 * comment, or a string literal that IS a named colour (`"white"`, `'gold'`). A class name such as
 * "i3-btn--gold" or an anchor such as "#top" is not a colour.
 */
function codeColourLiterals(text: string): string[] {
  const code = stripLineComments(stripBlockComments(text));
  const hits = [...code.matchAll(HEX_COLOUR), ...code.matchAll(COLOUR_FUNCTION)].map((m) => m[0]);
  for (const m of code.matchAll(/(["'`])([A-Za-z]+)\1/g)) if (NAMED_COLOURS.includes(m[2]!.toLowerCase())) hits.push(m[0]);
  return hits;
}
const colourLiterals = (file: string, text: string) => (file.endsWith(".css") ? cssColourLiterals(text) : codeColourLiterals(text));
/** `#rrggbb` / `#rgb` / `rgb(r, g, b)` → "r,g,b", so a value re-spelt in another notation is still the same colour */
function colourKey(value: string): string {
  const s = value.trim().toLowerCase();
  let m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return [0, 2, 4].map((i) => parseInt(m![1]!.slice(i, i + 2), 16)).join(",");
  m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return [...m[1]!].map((c) => parseInt(c + c, 16)).join(",");
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*1\s*)?\)$/.exec(s);
  if (m) return `${m[1]},${m[2]},${m[3]}`;
  return s;
}

// --------------------------------------------------------- link resolver --
/**
 * The emitted file an href of `page` must resolve to, or undefined when the href is not internal (an
 * in-page anchor, mailto:/tel:, a foreign origin). An own-origin absolute URL is internal. `/x` → x.html
 * or x/index.html (or the file x as emitted); `/` → index.html; query and fragment are not part of a file.
 */
function hrefTarget(page: string, href: string, ownOrigin: string | undefined): string[] | undefined {
  let p = href;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith("//")) {
    if (!ownOrigin || !(p === ownOrigin || p.startsWith(`${ownOrigin}/`))) return undefined;
    p = p.slice(ownOrigin.length) || "/";
  }
  p = p.replace(/[#?].*$/, "");
  if (p === "") return undefined; // "#anchor" / "?query": the page itself
  if (!p.startsWith("/")) p = "/" + path.posix.join(path.posix.dirname(page), p);
  p = p.replace(/^\/+/, "");
  if (p === "" || p.endsWith("/")) return [`${p}index.html`];
  return [p, `${p}.html`, `${p}/index.html`];
}
async function unresolvedHrefs(dir: string, ownOrigin: string | undefined): Promise<{ page: string; href: string }[]> {
  const emitted = new Set(await walkFiles(dir));
  const out: { page: string; href: string }[] = [];
  for (const page of await htmlPages(dir)) {
    for (const m of (await readFile(path.join(dir, page), "utf8")).matchAll(/\shref="([^"]*)"/g)) {
      const href = m[1]!.replace(/&amp;/g, "&");
      const targets = hrefTarget(page, href, ownOrigin);
      if (targets && !targets.some((t) => emitted.has(t))) out.push({ page, href });
    }
  }
  return out;
}
/** the portfolio cards of a page: each is one link (ProjectCard: li.i3-card[data-project-card] > a[href]) */
const cardHrefs = (html: string) => [...html.matchAll(/<li class="i3-card"[^>]*>\s*<a\b[^>]*\shref="([^"]*)"/g)].map((m) => m[1]!);

// ------------------------------------------------------------ self-test --
if (process.env.I03_SELFTEST === "1") {
  const seeded: [string, string, number][] = [
    ["ok.css", ".a { color: var(--i3-gold); white-space: nowrap; border: 1px solid color-mix(in srgb, var(--color-canvas) 50%, transparent) } /* #fff */ .b--gold:hover { background: var(--color-action-primary) }", 0],
    ["hex.css", ".a { color: #abc; }", 1],
    ["fn.css", ".a { background: rgba(0, 0, 0, .5); }", 1],
    ["named.css", ".a { border-color: white; }", 1],
    ["named-list.css", ".a { box-shadow: 0 0 0 1px gold, 0 0 2px black; }", 2],
    ["string.css", ".a { content: \"#fff white\"; background: url(#white) }", 0],
    ["ok.tsx", "const c = \"i3-btn i3-btn--gold\"; // #ffffff\nconst a = href.startsWith(\"#\"); /* rgb(1,2,3) */ const u = \"https://x.example/#top\";", 0],
    ["hex.tsx", "<path fill=\"#333\" />", 1],
    ["fn.tsx", "const s = { color: \"rgb(1, 2, 3)\" };", 1],
    ["named.tsx", "const s = { color: 'white' };", 1],
    ["theme.json", "{ \"color.canvas\": \"#ffffff\" }", 1],
  ];
  for (const [file, text, expected] of seeded) {
    const hits = colourLiterals(file, text);
    console.log(`  ${hits.length === expected ? "ok  " : "FAIL"} colour scanner ${file}: ${hits.length} hit(s), expected ${expected}${hits.length ? ` (${hits.join(" | ")})` : ""}`);
    if (hits.length !== expected) failed.push(`selftest ${file}`);
  }
  const term = scanForbiddenTerms("x.html", "<p>DAGAM home</p>", ["dagam", "누리담"]);
  console.log(`  ${term.length === 1 ? "ok  " : "FAIL"} forbidden-term scan catches a seeded, differently-cased term: ${JSON.stringify(term)}`);
  if (term.length !== 1) failed.push("selftest terms");
  const keys = colourKey("#ffffff") === colourKey("rgb(255, 255, 255)") && colourKey("#fff") === colourKey("rgb(255,255,255)") && colourKey("#333333") !== colourKey("rgb(34, 66, 56)");
  console.log(`  ${keys ? "ok  " : "FAIL"} colour key equates #ffffff / #fff / rgb(255, 255, 255) and keeps #333333 ≠ rgb(34, 66, 56)`);
  if (!keys) failed.push("selftest colourKey");
  const links: [string, string, string | undefined, string[] | undefined][] = [
    ["index.html", "/portfolio/foo", undefined, ["portfolio/foo", "portfolio/foo.html", "portfolio/foo/index.html"]],
    ["index.html", "/", undefined, ["index.html"]],
    ["index.html", "/portfolio?category=x#top", undefined, ["portfolio", "portfolio.html", "portfolio/index.html"]],
    ["portfolio/page/2.html", "../foo", undefined, ["portfolio/foo", "portfolio/foo.html", "portfolio/foo/index.html"]],
    ["index.html", "#top", undefined, undefined],
    ["index.html", "mailto:a@b.example", undefined, undefined],
    ["index.html", "https://own.example/about", "https://own.example", ["about", "about.html", "about/index.html"]],
    ["index.html", "https://other.example/about", "https://own.example", undefined],
    ["index.html", "//cdn.example/x.js", undefined, undefined],
  ];
  for (const [page, href, origin, expected] of links) {
    const got = hrefTarget(page, href, origin);
    const ok = JSON.stringify(got) === JSON.stringify(expected);
    console.log(`  ${ok ? "ok  " : "FAIL"} href ${href} on ${page} → ${JSON.stringify(got)}`);
    if (!ok) failed.push(`selftest href ${href}`);
  }
  const cards = cardHrefs(
    '<ul><li class="i3-card" data-project-card="x-01"><a class="i3-card__link" href="/portfolio/a">…</a></li>\n<li class="i3-card" data-project-card="x-02"><a href="https://other.example/b" class="i3-card__link">…</a></li><li class="i3-hero"><a href="/c"></a></li></ul>',
  );
  const cardsOk = JSON.stringify(cards) === JSON.stringify(["/portfolio/a", "https://other.example/b"]);
  console.log(`  ${cardsOk ? "ok  " : "FAIL"} card links read in either attribute order, other links ignored: ${JSON.stringify(cards)}`);
  if (!cardsOk) failed.push("selftest cards");
  console.log(`\ninterior-03 self-test: ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
}

/** the reuse site as a buildable site: its live directory with the frozen portfolio dataset (data/site-builds stays in repoRoot) */
const reuseFrozen = await frozenDemoRoot(repoRoot, REUSE_SITE);

// ----------------------------------------------------------------- source --
console.log("\n[source] the third Template's working tree");
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
await check("C the three Templates stand alone: no import reaches another one, and no Template holds another's source terms", async () => {
  const hits: string[] = [];
  const pairs = OTHER_TEMPLATES.flatMap((other) => [[TEMPLATE, other], [other, TEMPLATE]] as const);
  for (const [self, other] of pairs) {
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
      hits.push(...scanForbiddenTerms(`${self}/${f}`, text, otherTerms).map((h) => `${h.file}: ${h.why} (${other})`));
    }
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
});
await check("D the Template ships no static files of its own (every image is a site asset) and names its source only in provenance.json", async () => {
  assert(!(await exists(`${templateDir(TEMPLATE)}/public`)), "templates/interior-03/v1/public exists");
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
await check("S the theming rule: no colour literal (hex, colour function, named colour) in any stylesheet or code file — theme.default.json is the only file with colour values", async () => {
  const dir = path.join(repoRoot, templateDir(TEMPLATE));
  const hits: string[] = [];
  const scanned: string[] = [];
  for (const f of await walkFiles(dir)) {
    if (f === "theme.default.json" || !/\.(css|tsx?|mjs|json)$/.test(f)) continue;
    scanned.push(f);
    hits.push(...colourLiterals(f, await readFile(path.join(dir, f), "utf8")).map((h) => `${f}: ${h}`));
  }
  assert(hits.length === 0, hits.slice(0, 16).join("\n"));
  // the scan read the real tree: every stylesheet, and the tokens the Template consumes all resolve through var(--color-…)
  const css = scanned.filter((f) => f.endsWith(".css"));
  assert(css.length >= 4 && scanned.some((f) => f.endsWith(".tsx")) && scanned.includes("provenance.json"), `only ${scanned.length} files scanned (${css.length} stylesheets)`);
  const defaults: Record<string, string> = (await readJson(`${templateDir(TEMPLATE)}/theme.default.json`)).tokens;
  const colourTokens = template.theme.consumes.filter((t) => t.startsWith("color."));
  assert(colourTokens.length >= 10, `the Template consumes only ${colourTokens.length} colour tokens`);
  for (const t of colourTokens) assert(/^(#[0-9a-f]{3,8}|rgba?\(.*\))$/i.test(defaults[t] ?? ""), `${t}: the default is not a colour value (${defaults[t]})`);
  const allCss = (await Promise.all(css.map((f) => readFile(path.join(dir, f), "utf8")))).join("\n");
  // the platform's variable name for a token: dots to dashes, camelCase to kebab (color.action.primaryText → --color-action-primary-text)
  const cssVar = (t: string) => `--${t.replace(/\./g, "-").replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}`;
  const unread = colourTokens.filter((t) => !allCss.includes(`var(${cssVar(t)})`));
  eq(unread, [], "colour tokens the Template consumes but no stylesheet reads");
});

// ---------------------------------------------------------------- release --
console.log("\n[release] the site's pin");
const site = await loadSiteInstance(repoRoot, SITE);
const pin = site.template;
await check("E the site pins an exact interior-03 release (id + full hash) that verifies byte for byte", async () => {
  eq([pin.templateId, pin.templateVersion], [TEMPLATE, template.version], "pin");
  const record = await loadRelease(repoRoot, TEMPLATE, pin.releaseId);
  eq(record.releaseHash, pin.releaseHash, "releaseHash");
  await verifyRelease(repoRoot, record);
});
await check("F the release froze the provenance terms and passed every gate", async () => {
  const record = await loadRelease(repoRoot, TEMPLATE, pin.releaseId);
  eq([...record.forbiddenTerms].sort(), [...(await termsOf(TEMPLATE))].sort(), "forbiddenTerms");
  const gates = Object.entries(record.gates);
  assert(gates.length > 0, "the release recorded no gate");
  eq(gates.filter(([, g]) => !g.pass).map(([k]) => k), [], "failed gates");
  assert(!record.files.some((f) => f.path.endsWith("provenance.json")), "provenance.json is inside the release");
});
await check("G the pinned release IS the working tree: same files, same bytes (no unreleased drift)", async () => {
  const record = await loadRelease(repoRoot, TEMPLATE, pin.releaseId);
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

// ---------------------------------------------------------------- package --
console.log("\n[package] the site's current package");
const current = await readJson(`data/site-builds/${SITE}/current.json`);
const record = await readJson(`${current.packageDir}/build-record.json`);
const siteDir = path.join(repoRoot, current.packageDir, "site");
/** every Template's frozen source terms plus the other Templates' names: none may reach an emitted file */
const allTerms = async () => [...(await termsOf(TEMPLATE)), ...(await Promise.all(OTHER_TEMPLATES.map(termsOf))).flat(), ...OTHER_TEMPLATES];
/** the remote references of a page (src / href / srcset / poster / action to another origin); `own` undefined = the site has no origin, every one is remote */
function remoteRefs(html: string, own: string | undefined, allowed: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/\s(?:src|href|srcset|poster|action)="(https?:)?\/\/([^"]*)"/g)) {
    const url = `${m[1] ?? "https:"}//${m[2]}`;
    if (!(own && (url.startsWith(`${own}/`) || url === own)) && !allowed.has(url)) out.push(url.slice(0, 120));
  }
  return out;
}
await check("H the current package was built with the pin, from the site's present data, and passed package QA", async () => {
  eq([record.siteId, record.status, record.parts.mode], [SITE, "success", "public"], "record");
  eq([record.template.templateId, record.template.releaseId, record.template.releaseHash], [pin.templateId, pin.releaseId, pin.releaseHash], "the package's Template");
  eq([record.qa.pass, record.qa.failures], [true, []], "package QA");
  const input = await prepareSiteInput({ repoRoot, siteId: SITE, mode: "public", at: record.at });
  eq([input.parts.siteSnapshotHash, input.buildInputId], [record.parts.siteSnapshotHash, current.buildInputId], "identity = the site's present data");
});
await check("I every page the fixture's data plans is emitted: the fixed pages, one detail per published project, the list's later pages", async () => {
  const published = ((await readJson(`data/sites/${SITE}/content/projects.json`)).items as { status: string }[]).filter((p) => p.status === "published");
  assert(published.length > PORTFOLIO_PAGE_SIZE, `the fixture must fill more than one list page (${published.length} ≤ ${PORTFOLIO_PAGE_SIZE})`);
  eq(await emittedPages(siteDir), await plannedPages(SITE), "pages");
  for (const f of ["404.html", "robots.txt", "sitemap.xml"]) assert(await exists(path.join(current.packageDir, "site", f)), `${f} missing`);
});
await check("J no emitted text file holds a source term of any Template, another Template's name, or a remote stylesheet / script / image", async () => {
  const terms = await allTerms();
  const own = site.identity.publicOrigin ? new URL(site.identity.publicOrigin).origin : undefined;
  const hits: string[] = [];
  for (const f of await textFiles(siteDir)) {
    const text = await readFile(path.join(siteDir, f), "utf8");
    hits.push(...scanForbiddenTerms(f, text, terms).map((h) => `${h.file}: ${h.why}`));
    if (f.endsWith(".html")) hits.push(...remoteRefs(text, own).map((u) => `${f}: remote reference ${u}`));
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
});
await check("K interior-03 is pinned by its own two sites only: no other site pins it", async () => {
  const pins: Record<string, string> = {};
  for (const id of (await readdir(path.join(repoRoot, "data/sites"))).filter((d) => !d.startsWith(".")).sort()) pins[id] = (await loadSiteInstance(repoRoot, id)).template.templateId;
  eq(Object.entries(pins).filter(([, t]) => t === TEMPLATE).map(([id]) => id), [REUSE_SITE, SITE].sort(), "sites on interior-03");
  const others = Object.entries(pins).filter(([id]) => id !== SITE && id !== REUSE_SITE);
  assert(others.length > 0, "no other site exists to compare against");
  eq(others.filter(([, t]) => t === TEMPLATE).map(([id]) => id), [], "other sites on interior-03");
});
await check("W every internal href of every emitted page resolves to an emitted file (an in-page anchor, mailto: and tel: aside)", async () => {
  const own = site.identity.publicOrigin ? new URL(site.identity.publicOrigin).origin : undefined;
  const broken = await unresolvedHrefs(siteDir, own);
  eq(broken.slice(0, 12), [], "unresolved hrefs");
  // the resolver read real links: the home page's cards each link one detail page the data plans
  const cards = cardHrefs(await readFile(path.join(siteDir, "index.html"), "utf8"));
  assert(cards.length > 0, "the home page shows no project card");
  const planned = new Set(await plannedPages(SITE));
  for (const href of cards) assert(/^\/portfolio\/[^/?#]+$/.test(href) && planned.has(`${href.slice(1)}.html`), `card link ${href} is not a planned detail page`);
});

// ------------------------------------------------------------------ reuse --
console.log("\n[reuse] a second site on the same release");
const reuse = await loadSiteInstance(repoRoot, REUSE_SITE);
const reuseCurrent = await readJsonIf(`data/site-builds/${REUSE_SITE}/current.json`);
const reuseRecord = reuseCurrent ? await readJson(`${reuseCurrent.packageDir}/build-record.json`) : undefined;
const reuseSiteDir = reuseCurrent ? path.join(repoRoot, reuseCurrent.packageDir, "site") : undefined;
/** the reuse site's package — or a clear failure when `site:build boost-interior-demo-03` has not run */
function reusePackage() {
  assert(reuseCurrent && reuseRecord && reuseSiteDir, `data/site-builds/${REUSE_SITE}/current.json does not exist: the reuse site is not built`);
  return { reuseCurrent, reuseRecord, reuseSiteDir };
}
const reuseScripts = async (): Promise<{ src: string; attrs?: Record<string, string> }[]> => (await readJson(`data/sites/${REUSE_SITE}/scripts.json`)).headScripts;
await check("L the reuse site pins the SAME release as the first site (id + full hash), and its current package was built with it from its present data, package QA pass", async () => {
  eq(reuse.template, pin, "pin");
  const { reuseCurrent, reuseRecord } = reusePackage();
  eq([reuseRecord.siteId, reuseRecord.status, reuseRecord.parts.mode], [REUSE_SITE, "success", "public"], "record");
  eq([reuseRecord.template.templateId, reuseRecord.template.releaseId, reuseRecord.template.releaseHash], [pin.templateId, pin.releaseId, pin.releaseHash], "the package's Template");
  eq([reuseRecord.qa.pass, reuseRecord.qa.failures], [true, []], "package QA");
  const input = await prepareSiteInput({ repoRoot: reuseFrozen.root, siteId: REUSE_SITE, mode: "public", at: reuseRecord.at });
  eq([input.parts.siteSnapshotHash, input.buildInputId], [reuseRecord.parts.siteSnapshotHash, reuseCurrent.buildInputId], "identity = the site's present data");
  assert(reuseCurrent.buildInputId !== current.buildInputId && reuseCurrent.packageDir !== current.packageDir, "the two sites share a package");
});
await check("L2 the reuse site's live directory: its portfolio is the frozen dataset or a generated one; while it is the frozen dataset and loads, it has the tracked package's identity; generated, it loads; adopted without a generated portfolio, it is refused", async () => {
  const { live } = reuseFrozen;
  const { reuseCurrent, reuseRecord } = reusePackage();
  assert(live.identical || live.managed, `data/sites/${REUSE_SITE}: the portfolio is neither the frozen dataset nor a generated one`);
  if (live.dataset) {
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
  assert(reuse.identity.publicOrigin && new URL(reuse.identity.publicOrigin).origin !== (site.identity.publicOrigin && new URL(site.identity.publicOrigin).origin), "the reuse site has no origin of its own");
  const slugs = async (id: string): Promise<string[]> => (await storedProjects(id)).map((p) => p.slug);
  const [a, b] = [await slugs(SITE), await slugs(REUSE_SITE)];
  assert(a.length > 0 && b.length > 0, `a site stores no project (${a.length} / ${b.length})`);
  eq(a.filter((s) => b.includes(s)), [], "project slugs in both sites");
  // the first site authors no theme.json (it shows the Template's default values); the reuse site overrides them
  assert(!(await exists(`data/sites/${SITE}/theme.json`)), "the first site authors a theme.json: compare the two documents instead");
  eq(site.theme, { base: "template-default" }, "the first site's theme base");
  assert(await exists(`data/sites/${REUSE_SITE}/theme.json`), "the reuse site authors no theme.json");
});
await check("T the reuse site's theme is its own Site Data: declared tokens only, the tonal roles differ from the Template defaults (as colours, not spellings) and from the other reuse site's theme", async () => {
  const defaults: Record<string, string> = (await readJson(`${templateDir(TEMPLATE)}/theme.default.json`)).tokens;
  const overrides: Record<string, string> = (await readJson(`data/sites/${REUSE_SITE}/theme.json`)).tokens;
  eq(Object.keys(overrides).filter((t) => !(t in defaults)), [], "tokens the Template does not declare");
  eq(Object.keys(overrides).filter((t) => !(template.theme.consumes as readonly string[]).includes(t)), [], "tokens the Template does not consume");
  // the tonal roles a visitor sees first: the dark block colour, both accents, the body text
  for (const t of ["color.action.primary", "color.accent.primary", "color.accent.secondary", "color.text.primary"]) {
    assert(typeof defaults[t] === "string" && typeof overrides[t] === "string", `${t} is not set on both sides`);
    assert(colourKey(defaults[t]!) !== colourKey(overrides[t]!), `${t}: the reuse site repeats the Template default (${defaults[t]} = ${overrides[t]})`);
  }
  const other: Record<string, string> = (await readJson(`data/sites/boost-interior-demo-02/theme.json`)).tokens;
  const roles = ["color.canvas", "color.action.primary", "color.accent.primary"] as const;
  for (const t of roles) assert(typeof overrides[t] === "string" && typeof other[t] === "string", `${t} is not set in both reuse sites`);
  const same = roles.filter((t) => colourKey(overrides[t]!) === colourKey(other[t]!));
  assert(same.length < roles.length, `the reuse site repeats boost-interior-demo-02's theme in every tonal role`);
  for (const t of ["color.action.primary", "color.accent.primary"]) assert(!same.includes(t as (typeof roles)[number]), `${t}: the reuse site repeats boost-interior-demo-02's value (${other[t]})`);
});
await check("N the reuse site's package: the pages its data plans, no source term of any Template, neither site's brand in the other's package", async () => {
  const { reuseSiteDir } = reusePackage();
  eq(await emittedPages(reuseSiteDir), await plannedPages(REUSE_SITE), "pages");
  const terms = await allTerms();
  const hits: string[] = [];
  // a brand name, its Latin spelling, the site id and (the reuse site) the origin's host: none of them may cross into the other package
  const foreign: [string, string[]][] = [
    [reuseSiteDir, [site.identity.brandName, site.siteId, "누리담", "nuridam"]],
    [siteDir, [reuse.identity.brandName, reuse.siteId, "부스트", "boostinterior", new URL(reuse.identity.publicOrigin!).host]],
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
  const scripts = await reuseScripts();
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
  const { reuseSiteDir } = reusePackage();
  const own = new URL(reuse.identity.publicOrigin!).origin;
  const declared = new Set(scripts.map((sc) => sc.src));
  let pages = 0;
  for (const f of await htmlPages(reuseSiteDir)) {
    const html = await readFile(path.join(reuseSiteDir, f), "utf8");
    for (const sc of scripts) {
      assert(html.includes(`src="${sc.src}"`), `${f}: the declared script ${sc.src} is missing`);
      for (const [k, v] of Object.entries(sc.attrs ?? {})) assert(html.includes(`${k}="${v}"`), `${f}: the declared attribute ${k} is missing`);
    }
    hits.push(...remoteRefs(html, own, declared).map((u) => `${f}: remote reference ${u}`));
    pages++;
  }
  assert(pages >= FIXED_PAGES.length, `only ${pages} pages scanned in the reuse package`);
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
});
await check("U the reuse site's third-party key is its own: not the key of either earlier reuse site; its inquiry endpoint is under the same host with the same key; host and all three keys nowhere in the Template or release", async () => {
  const keysOf = async (id: string): Promise<string[]> => ((await readJson(`data/sites/${id}/scripts.json`)).headScripts as { attrs?: Record<string, string> }[]).flatMap((sc) => Object.values(sc.attrs ?? {}));
  const scripts = await reuseScripts();
  const ownKeys = scripts.flatMap((sc) => Object.values(sc.attrs ?? {}));
  assert(ownKeys.length > 0 && ownKeys.every((k) => k.length >= 16), `the reuse site's script carries no key: ${JSON.stringify(ownKeys)}`);
  const otherKeys = (await Promise.all(OTHER_REUSE_SITES.map(keysOf))).flat();
  assert(otherKeys.length >= OTHER_REUSE_SITES.length, `the earlier reuse sites carry ${otherKeys.length} keys`);
  eq(ownKeys.filter((k) => otherKeys.includes(k)), [], "keys shared with an earlier reuse site");
  const hosts = [...new Set(scripts.map((sc) => new URL(sc.src).host))];
  eq(hosts.length, 1, "script hosts");
  const endpoint = new URL((await readJson(`data/sites/${REUSE_SITE}/inquiry.json`)).endpoint);
  eq([endpoint.protocol, endpoint.host], ["https:", hosts[0]], "the inquiry endpoint's host is the script's host");
  assert(ownKeys.some((k) => endpoint.pathname.includes(k)), `the inquiry endpoint ${endpoint.pathname} carries none of the site's keys`);
  for (const k of otherKeys) assert(!endpoint.href.includes(k), `the inquiry endpoint carries an earlier reuse site's key`);
  const needles = [...hosts, ...ownKeys, ...otherKeys];
  const hits: string[] = [];
  const releaseDir = path.join(repoRoot, "data/template-releases", TEMPLATE, pin.releaseId);
  let scanned = 0;
  for (const dir of [path.join(repoRoot, templateDir(TEMPLATE)), releaseDir]) {
    for (const f of await walkFiles(dir)) {
      if (/(^|\/)(node_modules|\.next|out)\//.test(f)) continue;
      scanned++;
      const text = await readFile(path.join(dir, f), "utf8");
      const found = needles.filter((n) => text.includes(n));
      if (found.length) hits.push(`${path.relative(repoRoot, dir)}/${f}: ${found.join(", ")}`);
    }
  }
  // the scan read real trees: every file the release lists (its platform share included) plus the Template's working tree
  const release = await loadRelease(repoRoot, TEMPLATE, pin.releaseId);
  const ownShare = release.files.filter((r) => r.path.startsWith(`${templateDir(TEMPLATE)}/`)).length;
  assert(ownShare > 0 && scanned >= release.files.length + ownShare, `only ${scanned} files scanned (the release lists ${release.files.length}, ${ownShare} of them the Template's)`);
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
});
await check("V no brand leaks: the fixture brand in no text file of the reuse package, the reuse site's origin / handle in none of the fixture's, and no source term of any of the three Templates in either package, the Template or its release", async () => {
  const { reuseSiteDir } = reusePackage();
  /** the frozen source terms of all three Templates (the packages are also held to the other Templates' names, see allTerms) */
  const provenanceTerms = [...(await termsOf(TEMPLATE)), ...(await Promise.all(OTHER_TEMPLATES.map(termsOf))).flat()];
  const hits: string[] = [];
  const scan = async (label: string, dir: string, needles: string[], textOnly: boolean, except: string[]) => {
    let n = 0;
    for (const f of await walkFiles(dir)) {
      if (/(^|\/)(node_modules|\.next|out)\//.test(f) || (textOnly && !TEXT_FILE.test(f)) || except.includes(f)) continue;
      n++;
      hits.push(...scanForbiddenTerms(f, await readFile(path.join(dir, f), "utf8"), needles).map((h) => `${label}/${h.file}: ${h.why}`));
    }
    assert(n >= FIXED_PAGES.length, `${label}: only ${n} files scanned`);
  };
  const reuseHost = new URL(reuse.identity.publicOrigin!).host;
  await scan(REUSE_SITE, reuseSiteDir, [...(await allTerms()), "누리담", "nuridam", site.identity.brandName, site.siteId], true, []);
  await scan(SITE, siteDir, [...(await allTerms()), reuseHost, reuse.identity.publicOrigin!, "boostinterior", reuse.identity.brandName, reuse.siteId], true, []);
  // the Template's own provenance.json and the release record that froze its terms are the two places the terms belong
  await scan(TEMPLATE, path.join(repoRoot, templateDir(TEMPLATE)), provenanceTerms, false, ["provenance.json"]);
  await scan(pin.releaseId, path.join(repoRoot, "data/template-releases", TEMPLATE, pin.releaseId), provenanceTerms, false, ["release.json"]);
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
});
await check("W2 every internal href of every page of the reuse package resolves to an emitted file, and its portfolio cards link on-site detail pages (/portfolio/<slug>)", async () => {
  const { reuseSiteDir } = reusePackage();
  const own = new URL(reuse.identity.publicOrigin!).origin;
  eq((await unresolvedHrefs(reuseSiteDir, own)).slice(0, 12), [], "unresolved hrefs");
  const planned = new Set(await plannedPages(REUSE_SITE));
  let cards = 0;
  for (const f of ["index.html", "portfolio.html"]) {
    for (const href of cardHrefs(await readFile(path.join(reuseSiteDir, f), "utf8"))) {
      assert(/^\/portfolio\/[^/?#]+$/.test(href) && planned.has(`${href.slice(1)}.html`), `${f}: card link ${href} is not an on-site detail page`);
      cards++;
    }
  }
  assert(cards > 0, "no project card on the reuse site's home or list page");
});

// --------------------------------------------------------- corner widget --
console.log("\n[corner] the reuse site's third-party corner widget is Site Data");
/** the Site Data declaration (settings.json, read as authored — never through the Template's manifest) */
const EXT_KEYS = ["width", "height", "right", "bottom"] as const;
const extOf = async (id: string): Promise<Record<string, unknown> | undefined> => (await readJsonIf(`data/sites/${id}/settings.json`))?.overrides?.["site.floater"]?.externalWidget;
await check("P the reuse site declares the widget's closed box as Site Data (site.floater.externalWidget: four integer px, a positive width and height), the first site declares none", async () => {
  const ext = await extOf(REUSE_SITE);
  assert(ext && typeof ext === "object", `${REUSE_SITE} declares no site.floater.externalWidget`);
  eq(Object.keys(ext).sort(), [...EXT_KEYS].sort(), "keys");
  for (const k of EXT_KEYS) assert(Number.isInteger(ext[k]) && (ext[k] as number) >= (k === "width" || k === "height" ? 1 : 0), `${k} is not a non-negative integer (width / height positive): ${JSON.stringify(ext[k])}`);
  eq(await extOf(SITE), undefined, `${SITE} declares an external widget`);
});
await check("Q the reuse site's package marks every page for the widget (html[data-ext-widget] + the four --i3-ext-* custom properties = the declared numbers); no page of the first site's package carries the marker or a property", async () => {
  const ext = await extOf(REUSE_SITE);
  assert(ext, `${REUSE_SITE} declares no site.floater.externalWidget`);
  const { reuseSiteDir } = reusePackage();
  const expectStyle = `--i3-ext-w:${ext.width}px;--i3-ext-h:${ext.height}px;--i3-ext-right:${ext.right}px;--i3-ext-bottom:${ext.bottom}px`;
  const htmlTag = (html: string) => /<html\b[^>]*>/.exec(html)?.[0] ?? "";
  let reusePages = 0;
  for (const f of await emittedPages(reuseSiteDir)) {
    const tag = htmlTag(await readFile(path.join(reuseSiteDir, f), "utf8"));
    assert(/\sdata-ext-widget(=""|\s|>)/.test(tag), `${REUSE_SITE}/${f}: <html> has no data-ext-widget: ${tag.slice(0, 200)}`);
    assert(tag.includes(`style="${expectStyle}"`), `${REUSE_SITE}/${f}: <html> does not carry ${expectStyle}: ${tag.slice(0, 240)}`);
    reusePages++;
  }
  assert(reusePages >= FIXED_PAGES.length, `only ${reusePages} pages scanned in the reuse package`);
  let firstPages = 0;
  for (const f of await htmlPages(siteDir)) {
    const html = await readFile(path.join(siteDir, f), "utf8");
    assert(!html.includes("data-ext-widget") && !html.includes("--i3-ext-"), `${SITE}/${f}: carries the corner-widget marker without declaring one`);
    firstPages++;
  }
  assert(firstPages >= FIXED_PAGES.length, `only ${firstPages} pages scanned in the first site's package`);
});
await check("R the Template knows no vendor: no source file of the Template names the widget's vendor, its key or either site, and its CSS reads the box through the custom properties only", async () => {
  const scripts = await reuseScripts();
  const vendorHost = new URL(scripts[0]!.src).host; // e.g. vendor.example
  const vendorName = vendorHost.split(".")[0]!; // the brand word of the host
  const needles = ["boost", vendorName, ...scripts.flatMap((sc) => Object.values(sc.attrs ?? {})), SITE, REUSE_SITE];
  const ext = (await extOf(REUSE_SITE)) ?? {};
  const declared = [...new Set(EXT_KEYS.map((k) => ext[k]).filter((v): v is number => Number.isInteger(v)))];
  const dir = path.join(repoRoot, templateDir(TEMPLATE));
  const hits: string[] = [];
  let cssReadsExt = false;
  for (const f of await walkFiles(dir)) {
    if (f === "provenance.json") continue;
    const text = await readFile(path.join(dir, f), "utf8");
    const lower = text.toLowerCase();
    for (const n of needles) if (lower.includes(n.toLowerCase())) hits.push(`${f}: "${n}"`);
    if (f.endsWith(".css") && /html\[data-ext-widget\]/.test(text) && /var\(--i3-ext-(w|h|right|bottom)\)/.test(text)) cssReadsExt = true;
    // no site-specific coordinate: the declared numbers appear in no CSS rule under the marker
    if (f.endsWith(".css") && declared.length) {
      const coordinate = new RegExp(`(?<![\\d.])(${declared.join("|")})px`);
      for (const m of text.matchAll(/html\[data-ext-widget\][^{]*\{([^}]*)\}/g)) assert(!coordinate.test(m[1]!), `${f}: a site's coordinate is hard-coded under html[data-ext-widget]: ${m[1]!.slice(0, 120)}`);
    }
  }
  assert(hits.length === 0, hits.slice(0, 12).join("\n"));
  assert(cssReadsExt, "no Template stylesheet reads the widget box through html[data-ext-widget] + var(--i3-ext-*)");
});

console.log(`\ninterior-03: ${passed} passed, ${failed.length} failed`);
if (failed.length) {
  for (const f of failed) console.log(`  - ${f}`);
  process.exit(1);
}
