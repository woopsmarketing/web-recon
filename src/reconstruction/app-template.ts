import { breakpointMediaQueries } from "./responsive-plan.js";
import { GENERATED_STYLES_FILE, type BreakpointSpec } from "./types.js";

/**
 * The generated Next.js application shell (items 5, 15, 17, 18, 56–58, 206).
 *
 * One catch-all route handles the whole site (item 17). 112 verified routes do
 * NOT become 112 `page.tsx` files: the route table is data, the renderer is one
 * component, and a site with 10,000 URLs would generate exactly the same app.
 *
 * Dependency versions are the EXACT resolved ones, never `"latest"` (item 206),
 * so the generated `package.json` describes a build that can be reproduced
 * rather than one that happened to work on the day it ran.
 */

export interface AppTemplateInput {
  /** Slug used for the generated package name — host, lowercased. */
  siteSlug: string;
  breakpoint: BreakpointSpec;
  versions: {
    next: string;
    react: string;
    reactDom: string;
    typescript: string;
    typesNode: string;
    typesReact: string;
    typesReactDom: string;
    serverOnly: string;
  };
}

export function packageJson(input: AppTemplateInput): string {
  const { versions } = input;
  return (
    JSON.stringify(
      {
        name: `wr-clone-${input.siteSlug}`,
        version: "0.0.0",
        private: true,
        type: "module",
        scripts: {
          dev: "next dev",
          build: "next build",
          start: "next start",
        },
        dependencies: {
          next: versions.next,
          react: versions.react,
          "react-dom": versions.reactDom,
          "server-only": versions.serverOnly,
        },
        devDependencies: {
          "@types/node": versions.typesNode,
          "@types/react": versions.typesReact,
          "@types/react-dom": versions.typesReactDom,
          typescript: versions.typescript,
        },
      },
      null,
      2,
    ) + "\n"
  );
}

export const NEXT_CONFIG_MJS = `/**
 * Generated Next.js configuration.
 *
 * Deliberately small. Every option here exists to remove a variable between the
 * observed page and the rendered clone, not to add one:
 *
 *  - no image optimizer: the clone uses native <img> (item 70), so no remote
 *    domain allowlist and no size inference sit between the asset and the pixel
 *  - no rewrites or redirects: the route table is the only routing there is
 *
 * The workspace root is deliberately NOT pinned. A generated app is written
 * beside the pipeline data it came from, and its dependencies resolve upward
 * from there; pinning the root to the app directory would cut that lookup off
 * and the build could not find Next.js itself.
 */
/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  trailingSlash: false,
};

export default nextConfig;
`;

/**
 * The generated app's TypeScript configuration.
 *
 * `jsx: react-jsx` and the `.next/dev/types` include are Next.js's own mandatory
 * values. They are written here rather than left for Next to add on first build,
 * because a build that REWRITES a generated file would quietly break the
 * byte-identical-output guarantee the moment anyone built before diffing
 * (item 12).
 */
export const TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts"
  ],
  "exclude": ["node_modules"]
}
`;

export function generatedConfigTs(input: {
  rootUrl: string;
  breakpoint: BreakpointSpec;
  routeCount: number;
  pageCount: number;
}): string {
  return `/**
 * Generated constants. Do not edit — \`pnpm reconstruct\` rewrites this file.
 *
 * \`SOURCE_ROOT_URL\` is provenance: it records which site this clone was
 * reconstructed from. Nothing in the app requests it.
 */

export const SOURCE_ROOT_URL = ${JSON.stringify(input.rootUrl)};
export const GENERATED_STYLES_HREF = ${JSON.stringify(`/${GENERATED_STYLES_FILE}`)};
export const BREAKPOINT = ${input.breakpoint.value};
export const BREAKPOINT_PROVENANCE = ${JSON.stringify(input.breakpoint.provenance)};
export const ROUTE_COUNT = ${input.routeCount};
export const PAGE_SOURCE_COUNT = ${input.pageCount};
`;
}

export const LAYOUT_TSX = `import type { ReactNode } from "react";
import "./globals.css";
import { GENERATED_STYLES_HREF } from "../src/generated/generated-config";
import { InteractionRuntime } from "../src/runtime/InteractionRuntime";
import { FormSafetyRuntime } from "../src/runtime/FormSafetyRuntime";

/**
 * The document shell.
 *
 * The observed \`<html>\` and \`<body>\` are NOT re-emitted here — they are two
 * source nodes and they render as wrappers inside \`<body>\` (item 56). This
 * \`<html>\`/\`<body>\` pair belongs to Next.js.
 *
 * The site's generated stylesheet is a plain static file rather than a bundled
 * import: it is up to ~9 MB of exact computed style for a large site, and
 * pushing that through the bundler buys minification the clone does not need
 * while costing build time and memory it does (item 113).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html>
      <body>
        <link rel="stylesheet" href={GENERATED_STYLES_HREF} precedence="wr-generated" />
        {children}
        <InteractionRuntime />
        <FormSafetyRuntime />
      </body>
    </html>
  );
}
`;

export const CATCH_ALL_PAGE_TSX = `import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { findRoute } from "../../src/runtime/load-route";
import { loadPage } from "../../src/runtime/load-page";
import { PageRenderer } from "../../src/runtime/PageRenderer";

/**
 * Every verified route, including \`/\` (items 17, 18).
 *
 * Rendered per request rather than prerendered: the route table is data the
 * server already holds, and prerendering 112 large trees at build time would
 * trade several minutes of build for a first-byte time nobody is measuring in
 * this Task.
 *
 * A path outside the route table is a 404 — never a redirect to a representative
 * page (item 18).
 */

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const route = await findRoute(slug, await searchParams);
  // The document title is the one piece of <head> that was observed (item 58).
  // Canonical URLs, Open Graph and the rest are not reconstructed.
  return route?.title ? { title: route.title } : {};
}

export default async function CatchAllPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const route = await findRoute(slug, await searchParams);
  if (!route) notFound();
  const page = await loadPage(route.pageFile);
  return <PageRenderer page={page} route={route} />;
}
`;

export const NOT_FOUND_TSX = `/**
 * The clone's own not-found page.
 *
 * Reached by any path the SiteSpec never verified. It says so plainly instead of
 * imitating the original site's 404, which was never observed either.
 */
export default function NotFound() {
  return (
    <main className="wr-not-found">
      <h1>Route not reconstructed</h1>
      <p>
        This path is not in the SiteSpec route table, so no observed page exists
        for it. The clone renders only verified routes.
      </p>
    </main>
  );
}
`;

/**
 * The app's own small stylesheet.
 *
 * Everything here is about the CLONE's mechanics — viewport switching, the SVG
 * host, the not-found page — and nothing about the observed site. There is no
 * global reset (item 116): every observed element already carries its complete
 * computed style, so a `* { margin: 0 }` could only introduce error.
 *
 * The two `margin`/`padding` zeroes are the exception that proves the rule: they
 * apply to the FRAMEWORK's `<html>` and `<body>`, which are not observed nodes
 * at all. The observed `<html>` and `<body>` render as wrappers further in, with
 * their own computed style, and the user agent's default 8px body margin would
 * otherwise be an offset the original page never had.
 */
export function globalsCss(
  breakpoint: BreakpointSpec,
  /**
   * Task 15 correction CSS, appended verbatim. Omitted for a baseline
   * reconstruction, so the file stays byte-identical to Task 14 (item 114).
   */
  correctionCss?: string,
): string {
  const media = breakpointMediaQueries(breakpoint.value);
  const corrections =
    correctionCss === undefined || correctionCss === ""
      ? ""
      : `\n/*\n * QA CORRECTIONS (Task 15).\n *\n * Generated from a QaCorrectionSet, never hand-written. Each rule below is one\n * closed-type correction whose value was directly observed — the canvas\n * background from the SiteSpec's own document root, an interaction target's\n * open state from a live QA replay. See the corrected manifest's correctionSet.\n */\n${correctionCss}`;
  return `/* Generated by web-recon. Do not edit. */

/* Framework document elements — not observed nodes (item 56). */
html,
body {
  margin: 0;
  padding: 0;
}

/*
 * Responsive variant switching (items 30, 31).
 *
 * Breakpoint ${breakpoint.value}px, ${breakpoint.provenance} —
 * ${breakpoint.method}, from observed widths
 * ${breakpoint.mobileObservedWidth} and ${breakpoint.desktopObservedWidth}.
 * Convention: ${breakpoint.convention}.
 *
 * The active variant is display:contents so the wrapper generates no box of its
 * own; the inactive one is display:none so it is not laid out and cannot be
 * clicked.
 */
.wr-variant {
  display: contents;
}

@media ${media.mobile} {
  [data-wr-viewport="desktop"] {
    display: none;
  }
}

@media ${media.desktop} {
  [data-wr-viewport="mobile"] {
    display: none;
  }
}

/*
 * Inline SVG host. React needs an element to attach sanitized markup to, and the
 * markup carries its own <svg> root; display:contents keeps the host out of
 * layout so the <svg> is positioned by its real parent (item 76).
 */
.wr-svg-host {
  display: contents;
}

/*
 * Parser-stable nesting container (Task 16 final correction).
 *
 * The observed DOM held an edge the HTML parser refuses to produce — a
 * script-built \`li > li\`. Markup is how the clone travels, so the relationship
 * is written the way HTML requires (\`<li><ul><li>\`) and this class removes the
 * container from layout, leaving the observed geometry unchanged. The reset
 * above must not reintroduce a box here, so the margin/padding are explicit.
 */
.wr-nest {
  display: contents;
  margin: 0;
  padding: 0;
  list-style: none;
}

/*
 * Interaction reveal override (item 93).
 *
 * A verified disclosure/dialog/tabs target is often hidden by the site's own CSS
 * rather than by the \`hidden\` attribute, and the clone carries that as
 * \`display: none\` in the element's observed style class. Toggling an attribute
 * cannot outrank a class, so the runtime sets \`data-wr-revealed\` and this rule —
 * two attribute selectors, so it wins on specificity — takes over.
 *
 * \`revert\` rather than a concrete value on purpose: the region's OPEN-state
 * style was never observed, so the honest reveal is the user-agent default, not
 * a \`flex\` somebody guessed. Recorded as
 * interaction-open-state-style-not-observed.
 */
[data-wr-reveal="1"][data-wr-revealed="1"] {
  display: revert;
  visibility: visible;
}

/*
 * Observed-target hide override (Task 17 §5).
 *
 * A region the explorer SAW disappear when a trigger was clicked is visible at
 * rest, so hiding it needs an override that outranks its observed style class.
 * The runtime sets \`data-wr-obs-hide\` while the trigger is in the state whose
 * observed after-state had the region gone.
 */
.wr-variant [data-wr-obs-hide="1"] {
  display: none;
  visibility: hidden;
}

.wr-not-found {
  font-family: system-ui, sans-serif;
  margin: 4rem auto;
  max-width: 40rem;
  padding: 0 1rem;
}
${corrections}`;
}

export const NEXT_ENV_D_TS = `/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited.
`;
