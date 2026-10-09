import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import { sha256 } from "../util/hash";
import {
  PORTFOLIO_RUNTIME_CONTRACT,
  PORTFOLIO_RUNTIME_KEY,
  PortfolioRuntimeCapabilitySchema,
  type PortfolioRuntimeCapability,
  type ReleasePortfolioRuntime,
} from "./capability";
import { KIT_FORMAT, KIT_KIND, PortfolioShellDeclSchema, RUNTIME_SCHEMA, SHELL_FILE, SHELL_SCHEMA, TEMPLATE_RUNTIME_API, TEMPLATE_RUNTIME_MODULE, TEMPLATE_SHELL_MODULE, pageFile, type PortfolioShellDecl } from "./contract";
import type { PortfolioSiteInput, PortfolioSiteResult, RuntimeKitDeps, RuntimeKitInfo, RuntimeRelease } from "./entry";
import { RENDERER_FILE, RuntimeKitError, bundleRuntimeKit, runtimeKitSurface } from "./kit";

/**
 * Release gate `portfolio-runtime-kit` — run by createRelease (release/release.ts) on the files of a
 * release that is ABOUT to be recorded, after the source gates and before anything is written to
 * the release store. A failure throws; nothing is recorded.
 *
 *   the Template does not declare the capability
 *       ships neither runtime module   → not applicable (nothing is added to the record: its hash
 *                                        is what it was before this gate existed)
 *       ships runtime/shell.ts or
 *       runtime/portfolio.ts           → FAIL: a portfolio runtime is declared, never implied
 *   the Template declares `portfolioRuntime: { supported: true, contract }`
 *       1. a valid kit is bundled from the release files — the bundler of every kit
 *          (kit.ts bundleRuntimeKit): one import-free file, exactly the two exports
 *       2. the bundled manifest carries the very declaration read from template.ts; the shell
 *          declaration is valid, is the runtime's own, and names routes the manifest declares
 *       3. the kit is loaded and SMOKE-RENDERS a synthetic site — the smallest snapshot the
 *          platform's schemas accept, shell pages made of the release's own placeholders:
 *            (a) nothing published   EITHER a safe empty state — ok, every shell page a site links
 *                                    to is answered, no placeholder left, no link into the URL space
 *                                    it owns that it did not render, no image it did not list —
 *                                    OR a refusal: ok: false with a problem that says why.
 *                                    Never a throw, never placeholder markup.
 *            (b) one project         ok, the same checks, and exactly one detail page
 *       → gate passed; the detail records `emptyState: supported | refused`
 *
 * The declaration is read STATICALLY from template.ts (a literal member, readDeclaredPortfolioRuntime)
 * — the release says what its own bytes say, not what a caller passed — and step 2 holds the
 * evaluated manifest to it.
 *
 * Identity: a kit states the release it renders, and a release's id is a hash that covers this
 * gate's own detail. So the gate bundles with a PROVISIONAL identity (the all-zero hash); the kit
 * BoostChat vendors is bundled later from the recorded release and differs in that one constant.
 */

export class PortfolioRuntimeGateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortfolioRuntimeGateError";
  }
}

export type PortfolioRuntimeGateResult =
  | { applicable: false; detail: string }
  | {
      applicable: true;
      /** what the release record carries as `portfolioRuntime` */
      portfolioRuntime: ReleasePortfolioRuntime;
      /** what the release record carries as gates["portfolio-runtime-kit"] */
      gate: { pass: true; detail: string };
      emptyState: "supported" | "refused";
    };

const fail = (message: string): never => {
  throw new PortfolioRuntimeGateError(message);
};

// ---------------------------------------------------------- declaration ----

function unwrap(node: ts.Expression): ts.Expression {
  let e = node;
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e) || ts.isTypeAssertionExpression(e)) e = e.expression;
  return e;
}

/**
 * The capability a Template manifest file declares, read from its text (never executed):
 * the ONE member `portfolioRuntime: { … }` whose value is an object literal of literals
 * (`as const` / `satisfies` allowed). undefined = the file does not mention the capability.
 * Anything else that names it — a computed value, a shorthand, a variable, two declarations — is
 * refused: the declaration must be readable without running Template code.
 */
export function readDeclaredPortfolioRuntime(file: string, text: string): PortfolioRuntimeCapability | undefined {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const members: ts.PropertyAssignment[] = [];
  let mentions = 0;
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) && node.name.text === PORTFOLIO_RUNTIME_KEY) members.push(node);
    else if (ts.isIdentifier(node) && node.text === PORTFOLIO_RUNTIME_KEY && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) mentions++;
    ts.forEachChild(node, visit);
  };
  visit(sf);
  const how = `declare it as one literal member of the manifest: ${PORTFOLIO_RUNTIME_KEY}: { supported: true, contract: "${PORTFOLIO_RUNTIME_CONTRACT}" }`;
  if (members.length === 0) {
    if (mentions > 0) fail(`${file} names ${PORTFOLIO_RUNTIME_KEY} but not as a literal member; ${how}`);
    return undefined;
  }
  if (members.length > 1) fail(`${file} declares ${PORTFOLIO_RUNTIME_KEY} ${members.length} times; ${how}`);
  const value = unwrap(members[0]!.initializer);
  if (!ts.isObjectLiteralExpression(value)) return fail(`${file}: ${PORTFOLIO_RUNTIME_KEY} is not an object literal; ${how}`);
  const declared: Record<string, unknown> = {};
  for (const prop of value.properties) {
    if (!ts.isPropertyAssignment(prop) || !(ts.isIdentifier(prop.name) || ts.isStringLiteralLike(prop.name))) return fail(`${file}: ${PORTFOLIO_RUNTIME_KEY} has a member that is not a plain "key: literal"; ${how}`);
    const v = unwrap(prop.initializer);
    if (v.kind === ts.SyntaxKind.TrueKeyword) declared[prop.name.text] = true;
    else if (v.kind === ts.SyntaxKind.FalseKeyword) declared[prop.name.text] = false;
    else if (ts.isStringLiteralLike(v)) declared[prop.name.text] = v.text;
    else return fail(`${file}: ${PORTFOLIO_RUNTIME_KEY}.${prop.name.text} is not a boolean or string literal; ${how}`);
  }
  const parsed = PortfolioRuntimeCapabilitySchema.safeParse(declared);
  if (!parsed.success) return fail(`${file}: ${PORTFOLIO_RUNTIME_KEY} is ${JSON.stringify(declared)} — expected { supported: true, contract: "${PORTFOLIO_RUNTIME_CONTRACT}" } or { supported: false }`);
  return parsed.data;
}

// ------------------------------------------------------- synthetic site ----

/** The provisional identity a gate kit states (see the header). */
function provisionalInfo(templateId: string, templateVersion: string): RuntimeKitInfo {
  const releaseHash = "0".repeat(64);
  return { kitFormat: KIT_FORMAT, kind: KIT_KIND, templateId, templateVersion, releaseId: `${templateId}-${templateVersion}-${releaseHash.slice(0, 12)}`, releaseHash };
}

const SMOKE_SITE = "portfolio-runtime-smoke";
const SMOKE_ORIGIN = "https://portfolio-runtime-smoke.invalid";
const SMOKE_AT = "2026-01-01T00:00:00.000Z";
const SMOKE_COVER = { id: "smoke-cover", file: "smoke-cover.jpg", mediaType: "image/jpeg", width: 1600, height: 1200, sha256: sha256("portfolio-runtime-smoke cover"), size: 1024 };
/** The smallest record the content model accepts: the required fields and nothing else. */
const SMOKE_PORTFOLIO = {
  categories: [{ id: "smoke-category", name: "Smoke" }],
  projects: [{ id: "smoke-project", slug: "smoke-project", title: "Smoke project", status: "published", publishedAt: "2025-01-01T00:00:00.000Z", category: "smoke-category", cover: { asset: SMOKE_COVER.id } }],
  assets: [SMOKE_COVER],
};
const EMPTY_PORTFOLIO = { categories: [], projects: [], assets: [] };

/** The two package documents of a synthetic shell package of this release: a site with an identity and nothing else. */
function smokeDocuments(info: RuntimeKitInfo, shell: PortfolioShellDecl): Pick<PortfolioSiteInput, "runtime" | "shell"> {
  const template = { templateId: info.templateId, templateVersion: info.templateVersion, releaseId: info.releaseId, releaseHash: info.releaseHash };
  return {
    runtime: { schema: RUNTIME_SCHEMA, siteId: SMOKE_SITE, publicOrigin: SMOKE_ORIGIN, template, shell: SHELL_FILE, shellPages: shell.pages.map((p) => pageFile(p.path)) },
    shell: {
      schema: SHELL_SCHEMA,
      snapshot: {
        schemaVersion: 1,
        siteId: SMOKE_SITE,
        mode: "public",
        site: { schemaVersion: 1, siteId: SMOKE_SITE, identity: { brandName: "Smoke Site", publicOrigin: SMOKE_ORIGIN, locale: "en" }, template, theme: { base: "template-default" } },
        settings: { schemaVersion: 1, templateId: info.templateId, overrides: {} },
        content: { business: {}, projects: [], categories: [] },
        assets: [],
      },
    },
  };
}

const shellDocument = (placeholders: readonly string[]) =>
  `<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/></head><body><main>${placeholders.join("")}</main></body></html>`;

// --------------------------------------------------------------- checks ----

const isOwned = (owned: PortfolioShellDecl["owned"], p: string) => owned.exact.includes(p) || owned.prefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}/`));

/** Root-relative path of a URL written in a page, or undefined when it does not point into this site. */
function sitePath(url: string): string | undefined {
  const value = url.replace(/&amp;/g, "&").trim();
  const local = value.startsWith(`${SMOKE_ORIGIN}/`) ? value.slice(SMOKE_ORIGIN.length) : value === SMOKE_ORIGIN ? "/" : value;
  if (!local.startsWith("/") || local.startsWith("//")) return undefined;
  return local.split(/[?#]/)[0];
}

/** Every URL a document refers to: href / src / poster, each candidate of a srcset, each <loc> of a sitemap. */
function referencedPaths(body: string): string[] {
  const urls: string[] = [];
  for (const m of body.matchAll(/\s(?:href|src|poster)="([^"]*)"/gi)) urls.push(m[1]!);
  for (const m of body.matchAll(/\s(?:srcset|imagesrcset)="([^"]*)"/gi)) for (const candidate of m[1]!.split(",")) urls.push(candidate.trim().split(/\s+/)[0] ?? "");
  for (const m of body.matchAll(/<loc>([^<]*)<\/loc>/g)) urls.push(m[1]!);
  return urls.map(sitePath).filter((p): p is string => p !== undefined);
}

/** What is wrong with a successful render (empty = nothing). */
function inspect(result: Extract<PortfolioSiteResult, { ok: true }>, shell: PortfolioShellDecl, placeholders: ReadonlyMap<string, string>, expect: { projects: number }): string[] {
  const problems: string[] = [];
  const rendered = new Set(result.files.map((f) => f.path));
  const images = new Set(result.assets.map((a) => a.publicPath));
  // the shell pages a site's own pages link to (every one but the reserved detail shell) are real URLs once composed
  for (const page of shell.pages) {
    if (page.path.split("/").includes(shell.slug)) continue;
    if (!rendered.has(page.path)) problems.push(`${page.path} is a shell page of the package (its other pages link to it) and was not rendered`);
  }
  if (result.projects.length !== expect.projects) problems.push(`${result.projects.length} detail page(s) for ${expect.projects} published project(s)`);
  for (const project of result.projects) if (!rendered.has(project.path)) problems.push(`the detail page ${project.path} is listed and was not rendered`);
  for (const file of result.files) {
    if (file.contentType.startsWith("text/html")) {
      if (!file.body.startsWith("<!DOCTYPE html>") || !file.body.includes("</html>")) problems.push(`${file.path} is not a whole document`);
      if (!file.body.includes(`id="${shell.data}"`)) problems.push(`${file.path} carries no slot data (#${shell.data})`);
      for (const [slot, markup] of placeholders) if (file.body.includes(markup)) problems.push(`${file.path} still holds the placeholder of slot "${slot}"`);
    }
    for (const p of referencedPaths(file.body)) {
      if (p.startsWith("/assets/")) {
        if (!images.has(p)) problems.push(`${file.path} refers to the image ${p}, which the render does not list`);
      } else if (isOwned(shell.owned, p) && !rendered.has(p)) problems.push(`${file.path} links to ${p}, a URL the portfolio owns and did not render (a dangling link)`);
    }
  }
  return [...new Set(problems)];
}

const said = (result: Extract<PortfolioSiteResult, { ok: false }>) => result.problems.map((p) => `${p.path}: ${p.message}`).join("; ");

interface GateProbe {
  template: { routes?: readonly { key: string }[] } & Record<string, unknown>;
  portfolioShell: unknown;
  release: RuntimeRelease;
  renderToString: RuntimeKitDeps["renderToString"];
  createPortfolioSiteRenderer(deps: RuntimeKitDeps): (input: PortfolioSiteInput) => PortfolioSiteResult;
}

// ----------------------------------------------------------------- gate ----

export async function gatePortfolioRuntimeKit(opts: {
  templateId: string;
  templateVersion: string;
  /** templates/<id>/v<major> */
  templateRel: string;
  /** snapshot path → bytes: the files of the release about to be recorded */
  contents: ReadonlyMap<string, Uint8Array>;
}): Promise<PortfolioRuntimeGateResult> {
  const { templateId, templateVersion, templateRel, contents } = opts;
  const manifestFile = `${templateRel}/template.ts`;
  const manifestText = contents.get(manifestFile);
  if (!manifestText) return fail(`the release has no ${manifestFile}`);
  const declared = readDeclaredPortfolioRuntime(manifestFile, Buffer.from(manifestText).toString("utf8"));
  const modules = [TEMPLATE_SHELL_MODULE, TEMPLATE_RUNTIME_MODULE].map((f) => `${templateRel}/${f}`);
  const shipped = modules.filter((f) => contents.has(f));

  if (!declared?.supported) {
    if (shipped.length > 0) {
      fail(`the release ships ${shipped.join(" and ")} but its manifest ${declared ? "says supported: false" : "does not declare the capability"}: a portfolio runtime is declared, never implied — add ${PORTFOLIO_RUNTIME_KEY}: { supported: true, contract: "${PORTFOLIO_RUNTIME_CONTRACT}" } to ${manifestFile}, or remove the runtime modules`);
    }
    return { applicable: false, detail: `not applicable: ${manifestFile} does not declare ${PORTFOLIO_RUNTIME_KEY}.supported, and the release ships no portfolio runtime module` };
  }
  const missing = runtimeKitSurface(templateRel).filter((f) => !contents.has(f));
  if (missing.length > 0) fail(`${manifestFile} declares the portfolio runtime but the release has no ${missing.join(", ")}`);

  const info = provisionalInfo(templateId, templateVersion);
  const scratch = await mkdtemp(path.join(os.tmpdir(), "recon-runtime-gate-"));
  try {
    const filesDir = path.join(scratch, "files");
    for (const [rel, bytes] of contents) {
      const target = path.join(filesDir, rel);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
    }

    // 1. the kit, exactly as every kit is bundled — and the same bundle with the gate's probe
    let renderer: string;
    let probeSource: string;
    try {
      renderer = (await bundleRuntimeKit({ filesDir, templateRel, info })).renderer;
      probeSource = (await bundleRuntimeKit({ filesDir, templateRel, info, probe: true })).renderer;
    } catch (error) {
      if (error instanceof RuntimeKitError) return fail(`no runtime kit can be produced from the release files — ${error.message}`);
      throw error;
    }
    const load = async (name: string, source: string): Promise<Record<string, unknown>> => {
      const file = path.join(scratch, name, RENDERER_FILE);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, source);
      try {
        return (await import(pathToFileURL(file).href)) as Record<string, unknown>;
      } catch (error) {
        return fail(`the bundled runtime kit does not load: ${(error as Error).message}`);
      }
    };
    const kit = (await load("kit", renderer)) as { kit: RuntimeKitInfo; renderPortfolioSite(input: PortfolioSiteInput): PortfolioSiteResult };
    const probe = (await load("probe", probeSource)).probe as GateProbe;
    if (JSON.stringify(kit.kit) !== JSON.stringify(info) || typeof kit.renderPortfolioSite !== "function") fail("the bundled runtime kit does not export its identity and renderPortfolioSite");

    // From here on the release's own code runs outside the kit's catch-all (the probe): whatever it
    // throws is this gate's failure, said as one.
    try {
      // 2. the declaration, as the bundle carries it
      const P = probe.release.portfolioRuntime;
      if (JSON.stringify(probe.template[PORTFOLIO_RUNTIME_KEY]) !== JSON.stringify(declared)) {
        fail(`${manifestFile} declares ${PORTFOLIO_RUNTIME_KEY} ${JSON.stringify(declared)}, but the manifest it exports carries ${JSON.stringify(probe.template[PORTFOLIO_RUNTIME_KEY]) ?? "none"}: the declaration must be a member of the exported manifest`);
      }
      if (P.api !== TEMPLATE_RUNTIME_API) fail(`${TEMPLATE_RUNTIME_MODULE} speaks api ${String(P.api)}; contract ${PORTFOLIO_RUNTIME_CONTRACT} is api ${TEMPLATE_RUNTIME_API}`);
      const parsedShell = PortfolioShellDeclSchema.safeParse(probe.portfolioShell);
      if (!parsedShell.success) return fail(`${TEMPLATE_SHELL_MODULE} exports an unexpected portfolioShell: ${parsedShell.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
      const shell = parsedShell.data;
      if (JSON.stringify(P.shell) !== JSON.stringify(probe.portfolioShell)) fail(`${TEMPLATE_RUNTIME_MODULE} composes from another shell declaration than ${TEMPLATE_SHELL_MODULE} exports`);
      const routeKeys = new Set((probe.template.routes ?? []).map((r) => r.key));
      for (const page of shell.pages) if (!routeKeys.has(page.route)) fail(`${TEMPLATE_SHELL_MODULE} declares a shell page for route "${page.route}", which the manifest does not declare`);
      if (!Array.isArray(P.slots) || P.slots.length === 0) fail(`${TEMPLATE_RUNTIME_MODULE} declares no runtime slot`);

      const placeholders = new Map<string, string>();
      for (const slot of P.slots) {
        const markup = probe.renderToString(P.placeholder(slot));
        if (markup === "" || [...placeholders.values()].includes(markup)) fail(`the placeholder of slot "${slot}" is empty or not unique: a shell page could not be composed`);
        placeholders.set(slot, markup);
      }

      // 3. the synthetic shell pages. Which slots a shell page holds is the runtime's own account of
      // its pages: a renderer over the same release with a recording pages() says so (its result is
      // not used — it composes from blank documents).
      const documents = smokeDocuments(info, shell);
      const shellFiles = shell.pages.map((p) => pageFile(p.path));
      const slotsOf = new Map<string, Set<string>>(shellFiles.map((f) => [f, new Set<string>()]));
      const recording: RuntimeRelease["portfolioRuntime"] = Object.assign(Object.create(P) as RuntimeRelease["portfolioRuntime"], {
        pages(ctx: unknown) {
          const pages = P.pages(ctx);
          for (const page of pages) for (const slot of Object.keys(page.slots)) slotsOf.get(pageFile(page.shell))?.add(slot);
          return pages;
        },
      });
      const blank = Object.fromEntries(shellFiles.map((f) => [f, shellDocument([])]));
      const discovery = probe.createPortfolioSiteRenderer({ kit: info, release: { ...probe.release, portfolioRuntime: recording }, renderToString: probe.renderToString })({ ...documents, shellPages: blank, portfolio: SMOKE_PORTFOLIO, at: SMOKE_AT });
      if ([...slotsOf.values()].every((slots) => slots.size === 0)) {
        fail(`the release's runtime describes no page for the smallest valid site with one project${discovery.ok ? "" : ` — ${said(discovery)}`}`);
      }
      const shellPages = Object.fromEntries(
        shellFiles.map((f) => [
          f,
          shellDocument(
            [...slotsOf.get(f)!].sort().map((slot) => placeholders.get(slot) ?? fail(`a page composed from ${f} has the slot "${slot}", which ${TEMPLATE_RUNTIME_MODULE} does not list in slots`)),
          ),
        ]),
      );

      const smoke = (portfolio: PortfolioSiteInput["portfolio"], what: string): PortfolioSiteResult => {
        try {
          const result = kit.renderPortfolioSite({ ...documents, shellPages, portfolio, at: SMOKE_AT });
          if (typeof result !== "object" || result === null || typeof result.ok !== "boolean") return fail(`the kit returned no result for ${what}`);
          return result;
        } catch (error) {
          return fail(`the kit THREW for ${what} (${(error as Error).message}); a kit refuses with { ok: false, problems }, it never throws`);
        }
      };

      // (b) first: it proves the synthetic site itself renders, so a refusal in (a) is about "nothing published"
      const one = smoke(SMOKE_PORTFOLIO, "a site with one published project");
      if (!one.ok) return fail(`the kit refuses the smallest valid site with one published project — ${said(one)}`);
      const oneProblems = inspect(one, shell, placeholders, { projects: 1 });
      if (oneProblems.length > 0) fail(`one published project: ${oneProblems.join("; ")}`);

      const none = smoke(EMPTY_PORTFOLIO, "a site with nothing published");
      let emptyState: "supported" | "refused";
      let emptyDetail: string;
      if (none.ok) {
        const problems = inspect(none, shell, placeholders, { projects: 0 });
        if (problems.length > 0) fail(`nothing published: the kit answers ok but the result is not a safe empty state — ${problems.join("; ")}. Render a real empty state, or refuse with { ok: false, problems }`);
        emptyState = "supported";
        emptyDetail = `${none.files.length} files`;
      } else {
        if (none.problems.length === 0 || none.problems.some((p) => typeof p.message !== "string" || p.message.trim() === "")) fail("nothing published: the kit refuses without a problem that says why");
        emptyState = "refused";
        emptyDetail = `"${said(none).slice(0, 200)}"`;
      }

      return {
        applicable: true,
        portfolioRuntime: { supported: true, contract: declared.contract },
        emptyState,
        gate: {
          pass: true,
          detail:
            `contract ${declared.contract}; the runtime kit bundles import-free from the release files (${shell.pages.length} shell pages, ${P.slots.length} slots); ` +
            `smoke render of a synthetic site — nothing published → emptyState: ${emptyState} (${emptyDetail}); one project → ${one.files.length} files, 1 detail page`,
        },
      };
    } catch (error) {
      if (error instanceof PortfolioRuntimeGateError) throw error;
      return fail(`the release's portfolio runtime threw while the gate examined it: ${(error as Error)?.message ?? String(error)}`);
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
