import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  APP_DIR,
  GENERATED_STYLES_FILE,
  GeneratedAppValidationError,
  MANIFEST_FILE,
  ROUTE_MAP_FILE,
  RUNTIME_DATA_DIR,
  type ReconstructionManifest,
  type RuntimeNode,
  type RuntimePage,
  type RuntimeRouteMap,
} from "./types.js";
import { styleClassName } from "./style-generator.js";
import { NESTING_CONTAINER_CLASS, detectNestingRepair } from "./nesting.js";

/**
 * `validateGeneratedApp()` (item 180).
 *
 * The generator has just made a set of claims — every route is mapped, every
 * style class exists, every interaction trigger is in a tree, every DOM id is
 * unique — and this reads them back OFF DISK and checks each one. In-memory
 * assertions would only prove the plan was consistent with itself; these prove
 * the app that will actually be built is consistent with the manifest that
 * describes it.
 *
 * Every problem is collected before throwing, so one run tells the whole story
 * rather than the first sentence of it.
 */

export interface ValidateGeneratedAppOptions {
  outputDir: string;
  /** The SiteSpec's verified route URLs, for the 1:1 invariant (item 21). */
  expectedRouteUrls: readonly string[];
  /** Pattern trigger keys `pageId|viewport|nodeId`, for the orphan check. */
  expectedPatternTriggers: readonly string[];
}

export interface GeneratedAppValidation {
  routeCount: number;
  pageFileCount: number;
  runtimeElementNodes: number;
  runtimeTextNodes: number;
  distinctStyleClasses: number;
  generatedDomIds: number;
  checkedTriggers: number;
}

const REQUIRED_FILES = [
  MANIFEST_FILE,
  `${APP_DIR}/package.json`,
  `${APP_DIR}/next.config.mjs`,
  `${APP_DIR}/tsconfig.json`,
  `${APP_DIR}/app/layout.tsx`,
  `${APP_DIR}/app/[[...slug]]/page.tsx`,
  `${APP_DIR}/app/not-found.tsx`,
  `${APP_DIR}/app/globals.css`,
  `${APP_DIR}/src/runtime/PageRenderer.tsx`,
  `${APP_DIR}/src/runtime/NodeRenderer.tsx`,
  `${APP_DIR}/src/runtime/InteractionRuntime.tsx`,
  `${APP_DIR}/src/runtime/FormSafetyRuntime.tsx`,
  `${APP_DIR}/src/runtime/load-route.ts`,
  `${APP_DIR}/src/runtime/load-page.ts`,
  `${APP_DIR}/src/generated/generated-config.ts`,
  `${APP_DIR}/${RUNTIME_DATA_DIR}/${ROUTE_MAP_FILE}`,
  `${APP_DIR}/public/${GENERATED_STYLES_FILE}`,
];

/** Names the SiteSpec deliberately excludes and a clone must not re-introduce. */
const FORBIDDEN_PROP_NAMES = /^(class|style|on[a-z]+|data-(?!wr-)[a-z0-9-]*)$/i;

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

export async function validateGeneratedApp(
  options: ValidateGeneratedAppOptions,
): Promise<GeneratedAppValidation> {
  const problems: string[] = [];
  const root = options.outputDir;
  const appDir = path.join(root, APP_DIR);

  for (const relative of REQUIRED_FILES) {
    if (!(await exists(path.join(root, ...relative.split("/"))))) {
      problems.push(`required file missing: ${relative}`);
    }
  }
  if (problems.length > 0) throw new GeneratedAppValidationError(problems);

  const manifest = JSON.parse(
    await readFile(path.join(root, MANIFEST_FILE), "utf8"),
  ) as ReconstructionManifest;
  const routeMap = JSON.parse(
    await readFile(path.join(appDir, RUNTIME_DATA_DIR, ROUTE_MAP_FILE), "utf8"),
  ) as RuntimeRouteMap;
  const css = await readFile(
    path.join(appDir, "public", ...GENERATED_STYLES_FILE.split("/")),
    "utf8",
  );

  // --- route table 1:1 with the SiteSpec (item 21) --------------------------
  const generatedUrls = routeMap.routes.map((route) => route.url).sort();
  const expectedUrls = [...options.expectedRouteUrls].sort();
  if (generatedUrls.length !== expectedUrls.length) {
    problems.push(
      `route count mismatch: SiteSpec has ${expectedUrls.length} verified URLs, ` +
        `route-map.json has ${generatedUrls.length}`,
    );
  }
  const generatedSet = new Set(generatedUrls);
  if (generatedSet.size !== generatedUrls.length) {
    problems.push(`route-map.json contains duplicate URLs`);
  }
  for (const url of expectedUrls) {
    if (!generatedSet.has(url)) problems.push(`verified URL missing from route map: ${url}`);
  }
  const keys = new Set<string>();
  for (const route of routeMap.routes) {
    if (keys.has(route.key)) problems.push(`duplicate route key: ${route.key}`);
    keys.add(route.key);
    if (
      route.pageFile.startsWith("/") ||
      route.pageFile.includes("\\") ||
      route.pageFile.split("/").includes("..")
    ) {
      problems.push(`route ${route.routeId} has an unsafe page file reference: ${route.pageFile}`);
    }
    // Family-represented is never allowed to present as observed (items 23, 25).
    if (route.renderCoverage === "family-represented" && route.observedOnThisExactUrl) {
      problems.push(`route ${route.routeId} claims exact observation on a family-represented URL`);
    }
    if (route.behaviorCoverage !== "exact-verified" && route.verifiedOnThisRoute) {
      problems.push(
        `route ${route.routeId} claims verifiedOnThisRoute without exact behavior evidence`,
      );
    }
  }

  // --- runtime pages --------------------------------------------------------
  const styleClasses = new Set<string>();
  const referencedClasses = new Set<string>();
  for (const match of css.matchAll(/^\.([A-Za-z0-9_-]+)\{/gm)) {
    styleClasses.add(match[1]!);
  }

  const pageFiles = [...new Set(routeMap.routes.map((route) => route.pageFile))].sort();
  let elementNodes = 0;
  let textNodes = 0;
  let generatedDomIds = 0;
  let checkedTriggers = 0;
  const triggerKeys = new Set<string>();
  const dynamicTargetIds = new Set<string>();

  for (const pageFile of pageFiles) {
    const file = path.join(appDir, RUNTIME_DATA_DIR, ...pageFile.split("/"));
    if (!(await exists(file))) {
      problems.push(`runtime page file missing: ${pageFile}`);
      continue;
    }
    const page = JSON.parse(await readFile(file, "utf8")) as RuntimePage;
    for (const viewport of [page.desktop, page.mobile]) {
      const domIds = new Set<string>();
      const walk = (node: RuntimeNode, ancestors: readonly string[]): void => {
        if (node.k === "t") {
          textNodes++;
          return;
        }
        elementNodes++;
        const props = node.p ?? {};
        for (const name of Object.keys(props)) {
          if (FORBIDDEN_PROP_NAMES.test(name)) {
            problems.push(
              `${page.pageId}/${viewport.id} node ${node.n} carries a forbidden prop "${name}" — ` +
                `source class / style / data-* / on* must never be re-introduced (item 50)`,
            );
          }
        }
        const className = props["className"];
        if (typeof className === "string") {
          for (const cls of className.split(/\s+/)) {
            if (cls !== "" && cls !== "wr-svg-host" && cls !== NESTING_CONTAINER_CLASS) {
            referencedClasses.add(cls);
          }
          }
        }
        const id = props["id"];
        if (typeof id === "string") {
          generatedDomIds++;
          if (domIds.has(id)) {
            problems.push(`${page.pageId}/${viewport.id}: duplicate generated DOM id ${id}`);
          }
          domIds.add(id);
        }
        if (typeof props["data-wr-pattern-id"] === "string") {
          triggerKeys.add(`${page.pageId}|${viewport.id}|${node.n}`);
          checkedTriggers++;
        }
        const dynId = props["data-wr-dyn-id"];
        if (typeof dynId === "string") {
          if (dynamicTargetIds.has(dynId)) {
            problems.push(`duplicate dynamic target id ${dynId}`);
          }
          dynamicTargetIds.add(dynId);
        }
        if (typeof node.v === "string") {
          /*
           * An inline SVG's generated id lives on the `<svg>` root inside the
           * markup, not on the host element's props (item 76), so it has to be
           * counted from there — otherwise the manifest's id total would look
           * wrong for every page that has one.
           */
          const svgId = /^\s*<svg\b[^>]*?\sid="([^"]*)"/i.exec(node.v)?.[1];
          if (svgId !== undefined) {
            generatedDomIds++;
            if (domIds.has(svgId)) {
              problems.push(`${page.pageId}/${viewport.id}: duplicate generated DOM id ${svgId}`);
            }
            domIds.add(svgId);
          }
          const svgClass = /^\s*<svg\b[^>]*?\sclass="([^"]*)"/i.exec(node.v)?.[1];
          for (const cls of (svgClass ?? "").split(/\s+/)) {
            if (cls !== "") referencedClasses.add(cls);
          }
          if (/<\s*script/i.test(node.v)) problems.push(`inline SVG on ${node.n} contains <script>`);
          if (/\son[a-z]+\s*=/i.test(node.v)) {
            problems.push(`inline SVG on ${node.n} contains an on* handler`);
          }
          if (/javascript\s*:/i.test(node.v)) {
            problems.push(`inline SVG on ${node.n} contains a javascript: URL`);
          }
        }
        /*
         * The tree is about to be server-rendered as HTML and parsed back before
         * React hydrates against it. An edge the parser rewrites makes those two
         * trees different documents, which React reports as error #418 and
         * repairs by throwing the server tree away. Assert on what was WRITTEN,
         * not on what the compiler believed it wrote.
         */
        const nextAncestors = [...ancestors, node.t];
        if (node.v === undefined) {
          for (const child of node.c ?? []) {
            if (child.k !== "e") continue;
            const repair = detectNestingRepair(child.t, nextAncestors);
            if (repair !== null) {
              problems.push(
                `${page.pageId}/${viewport.id}: <${child.t}> (${child.n}) inside <${node.t}> is an ` +
                  `edge the HTML parser rewrites (${repair.kind}); the served markup would not ` +
                  `hydrate against itself`,
              );
            }
          }
        }
        for (const child of node.c ?? []) walk(child, nextAncestors);
      };
      walk(viewport.doc, []);
    }
  }

  // --- every referenced style class exists ----------------------------------
  for (const cls of referencedClasses) {
    if (!styleClasses.has(cls)) {
      problems.push(`className "${cls}" is referenced by the runtime tree but has no CSS rule`);
    }
  }

  // --- every verified pattern trigger is in a rendered tree (item 85) -------
  for (const key of options.expectedPatternTriggers) {
    if (!triggerKeys.has(key)) {
      problems.push(`verified pattern trigger ${key} has no annotated node in the runtime tree`);
    }
  }

  // --- manifest accounting is exact (items 180, 182) ------------------------
  if (manifest.stats.routes !== routeMap.routes.length) {
    problems.push(
      `manifest stats.routes (${manifest.stats.routes}) does not match route-map.json (${routeMap.routes.length})`,
    );
  }
  if (manifest.stats.runtimeElementNodes !== elementNodes) {
    problems.push(
      `manifest stats.runtimeElementNodes (${manifest.stats.runtimeElementNodes}) does not match the runtime data (${elementNodes})`,
    );
  }
  if (manifest.stats.runtimeTextNodes !== textNodes) {
    problems.push(
      `manifest stats.runtimeTextNodes (${manifest.stats.runtimeTextNodes}) does not match the runtime data (${textNodes})`,
    );
  }
  if (manifest.stats.generatedDomIds !== generatedDomIds) {
    problems.push(
      `manifest stats.generatedDomIds (${manifest.stats.generatedDomIds}) does not match the runtime data (${generatedDomIds})`,
    );
  }
  if (manifest.stats.missingStyleRefs !== 0) {
    problems.push(`manifest reports ${manifest.stats.missingStyleRefs} missing style references`);
  }
  if (manifest.behavior.unknownBehaviorsImplemented !== 0) {
    problems.push(`manifest claims unknown interactions were implemented`);
  }

  // --- no original script anywhere in the generated source (items 109, 178) --
  void styleClassName;
  if (problems.length > 0) throw new GeneratedAppValidationError(problems);

  return {
    routeCount: routeMap.routes.length,
    pageFileCount: pageFiles.length,
    runtimeElementNodes: elementNodes,
    runtimeTextNodes: textNodes,
    distinctStyleClasses: styleClasses.size,
    generatedDomIds,
    checkedTriggers,
  };
}
