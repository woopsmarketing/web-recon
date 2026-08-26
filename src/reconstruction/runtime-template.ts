/**
 * The generated app's own runtime source (items 9, 17, 87, 88, 110).
 *
 * Everything in this file is a STRING that becomes a file inside the generated
 * app. It is written here rather than copied from a template directory so that
 * a single `pnpm reconstruct` produces a complete app with no hidden asset
 * dependency, and so that the generated code is reviewable next to the reasoning
 * that produced it.
 *
 * The split follows item 9:
 *
 *   SERVER   route resolution · page data load · node tree · style class ·
 *            text · asset URL · interaction annotation
 *   CLIENT   one small generic InteractionRuntime + FormSafetyRuntime
 *
 * The page tree never becomes client React state. That is not a performance
 * preference — it is the mechanism by which 157 MB of SiteSpec provably stays
 * out of the browser bundle (item 8). The client code below is a fixed ~6 KB no
 * matter how large the site is, because it reads `data-wr-*` attributes off the
 * DOM instead of receiving a model.
 */

export const RUNTIME_TYPES_TS = `/**
 * Runtime data shapes. Generated — do not edit.
 *
 * A compact derivative of the SiteSpec, not a copy of it: provenance, geometry,
 * visibility flags, source element ids and diagnostics are absent by
 * construction, because a renderer cannot use them.
 */

export type RuntimePropValue = string | number | boolean | string[];

export interface RuntimeElementNode {
  k: "e";
  /** Viewport-local node id. Powers data-wr-node, pseudo CSS and QA anchoring. */
  n: string;
  t: string;
  p?: Record<string, RuntimePropValue>;
  c?: RuntimeNode[];
  /** Sanitized inline SVG markup. The only innerHTML channel in the app. */
  v?: string;
}

export interface RuntimeTextNode {
  k: "t";
  v: string;
}

export type RuntimeNode = RuntimeElementNode | RuntimeTextNode;

export interface RuntimeViewport {
  id: "desktop" | "mobile";
  width: number;
  doc: RuntimeElementNode;
}

export interface RuntimePage {
  pageId: string;
  desktop: RuntimeViewport;
  mobile: RuntimeViewport;
}

export interface RuntimeRoute {
  routeId: string;
  key: string;
  url: string;
  path: string;
  pageFile: string;
  pageSourceId: string;
  title?: string;
  renderCoverage: "exact-observed" | "validation-sample-observed" | "family-represented";
  behaviorCoverage:
    | "exact-verified"
    | "exact-not-explored"
    | "family-represented-unverified"
    | "none";
  observedOnThisExactUrl: boolean;
  verifiedOnThisRoute: boolean;
}

export interface RuntimeRouteMap {
  schemaVersion: number;
  rootUrl: string;
  breakpoint: number;
  routes: RuntimeRoute[];
}
`;

export const ROUTE_KEY_TS = `/**
 * The clone's route key. Generated — do not edit.
 *
 * This must agree exactly with the generator's own \`routeKeyFromUrl()\`; a
 * divergence would make a verified route unreachable, so the fixture drives both
 * sides with the same query-variant routes.
 *
 * Segments are percent-DECODED because Next.js hands a page its route segments
 * decoded, and the query is rebuilt sorted so that \`?a=1&b=2\` and \`?b=2&a=1\`
 * name the same page — which they do.
 */

export function normalizePathname(pathname: string): string {
  if (pathname === "") return "/";
  const decoded = pathname
    .split("/")
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    })
    .join("/");
  if (decoded.length > 1 && decoded.endsWith("/")) return decoded.slice(0, -1);
  return decoded;
}

export function normalizeSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const pairs: Array<[string, string]> = [];
  for (const [name, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) pairs.push([name, item]);
    } else {
      pairs.push([name, value]);
    }
  }
  if (pairs.length === 0) return "";
  pairs.sort((a, b) =>
    a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0,
  );
  const out = new URLSearchParams();
  for (const [name, value] of pairs) out.append(name, value);
  const serialized = out.toString();
  return serialized === "" ? "" : "?" + serialized;
}

/** slug segments are already decoded by Next.js, so they are used as-is. */
export function routeKeyFromSlug(
  slug: string[] | undefined,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const pathname = slug && slug.length > 0 ? "/" + slug.join("/") : "/";
  return normalizePathname(pathname) + normalizeSearchParams(searchParams);
}
`;

export const LOAD_ROUTE_TS = `import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RuntimeRoute, RuntimeRouteMap } from "./types";
import { routeKeyFromSlug } from "./route-key";

/**
 * Route resolution. SERVER ONLY (item 110).
 *
 * \`import "server-only"\` makes an accidental client import a BUILD error rather
 * than a silent 200 KB of route table in someone's browser. The data lives
 * outside \`public/\` for the same reason: nothing here is meant to be fetched.
 */

const DATA_DIR = path.join(process.cwd(), "reconstruction-data");

let routeMapPromise: Promise<RuntimeRouteMap> | null = null;
let routeIndex: Map<string, RuntimeRoute> | null = null;

/**
 * A module-level cache, and deliberately nothing more (item 111).
 *
 * One parse per server process instead of one per request. No queue, no LRU, no
 * external cache — the route map is a few hundred kilobytes and the whole point
 * of this Task is a stable baseline, not an infrastructure exercise.
 */
export function loadRouteMap(): Promise<RuntimeRouteMap> {
  if (!routeMapPromise) {
    routeMapPromise = readFile(path.join(DATA_DIR, "route-map.json"), "utf8").then(
      (raw) => {
        const map = JSON.parse(raw) as RuntimeRouteMap;
        routeIndex = new Map(map.routes.map((route) => [route.key, route]));
        return map;
      },
    );
  }
  return routeMapPromise;
}

/**
 * Find the route for a request, or \`undefined\`.
 *
 * \`undefined\` becomes \`notFound()\`. A URL outside the verified route table is
 * NOT quietly rendered from a nearby page (item 18) — a clone that answers every
 * path with something would make Task 15's route coverage meaningless.
 */
export async function findRoute(
  slug: string[] | undefined,
  searchParams: Record<string, string | string[] | undefined>,
): Promise<RuntimeRoute | undefined> {
  await loadRouteMap();
  return routeIndex?.get(routeKeyFromSlug(slug, searchParams));
}
`;

export const LOAD_PAGE_TS = `import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RuntimePage } from "./types";

/**
 * Runtime page data loading. SERVER ONLY (items 110, 111, 112).
 *
 * The page file name comes out of the route map, which this generator wrote, but
 * it is still checked before it is opened: relative, no \`..\`, no absolute path,
 * and the resolved path must still be inside the data directory. That is the
 * same root-escape rule Task 13's loader applies to a SiteSpec, for the same
 * reason — the file naming it is an artifact that can be edited after it was
 * produced.
 */

const DATA_DIR = path.join(process.cwd(), "reconstruction-data");

const cache = new Map<string, Promise<RuntimePage>>();

function resolveInsideDataDir(reference: string): string {
  if (reference === "") throw new Error("page file reference is empty");
  if (reference.startsWith("/") || /^[A-Za-z]:[\\\\/]/.test(reference)) {
    throw new Error("page file reference is an absolute path: " + reference);
  }
  if (reference.includes("\\\\")) {
    throw new Error("page file reference uses a backslash separator: " + reference);
  }
  if (reference.split("/").includes("..")) {
    throw new Error("page file reference escapes the data directory: " + reference);
  }
  const resolved = path.resolve(DATA_DIR, reference);
  const root = path.resolve(DATA_DIR);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("page file reference resolves outside the data directory: " + reference);
  }
  return resolved;
}

export function loadPage(pageFile: string): Promise<RuntimePage> {
  let pending = cache.get(pageFile);
  if (!pending) {
    const file = resolveInsideDataDir(pageFile);
    pending = readFile(file, "utf8").then((raw) => JSON.parse(raw) as RuntimePage);
    cache.set(pageFile, pending);
  }
  return pending;
}
`;

export const NODE_RENDERER_TSX = `import { createElement, type ReactNode } from "react";
import type { RuntimeNode } from "./types";

/**
 * The generic node renderer (items 54, 55, 59, 60, 77, 117, 118).
 *
 * A plain recursive function rather than a component per node: a large page in
 * this corpus is ~14,000 nodes, and a component boundary for each one would buy
 * nothing and cost a reconciler entry each.
 *
 * Three rules that are easy to get wrong and expensive to debug:
 *
 *  - \`createElement(tagName, …)\` for whatever tag was observed. No component
 *    map, no site-specific substitution (item 54).
 *  - text is emitted verbatim. React escapes it, so page content can never
 *    become markup (item 179).
 *  - \`dangerouslySetInnerHTML\` appears exactly once in the whole app, on the
 *    sanitized inline-SVG channel, and nowhere else (item 77).
 */

export function renderNode(node: RuntimeNode, key: number): ReactNode {
  if (node.k === "t") return node.v;

  const props: Record<string, unknown> = { key };
  if (node.p) for (const name in node.p) props[name] = node.p[name];

  if (node.v !== undefined) {
    // Task 13 parsed, sanitized and re-serialized this markup; the generator
    // checked it again and rewrote its root attributes. Nothing else reaches
    // this branch.
    props.dangerouslySetInnerHTML = { __html: node.v };
    return createElement(node.t, props);
  }

  const children = node.c;
  if (!children || children.length === 0) return createElement(node.t, props);
  return createElement(
    node.t,
    props,
    children.map((child, index) => renderNode(child, index)),
  );
}
`;

export const PAGE_RENDERER_TSX = `import type { RuntimePage, RuntimeRoute } from "./types";
import { renderNode } from "./NodeRenderer";

/**
 * Both observed viewports, in one document (items 27, 30, 31).
 *
 * Desktop and mobile are independent observations — Task 13 refuses to claim any
 * node is the same element across them — so they are rendered as two trees and
 * CSS decides which one is visible at the inferred breakpoint. The inactive
 * variant is \`display: none\`, so it is not laid out, cannot be clicked, and
 * cannot be reached by the interaction runtime's visibility check.
 *
 * \`display: contents\` on the active wrapper means the wrapper itself generates
 * no box, so this responsive mechanism adds nothing to the layout it is showing.
 */
export function PageRenderer({
  page,
  route,
}: {
  page: RuntimePage;
  route: RuntimeRoute;
}) {
  return (
    <>
      <div
        className="wr-variant"
        data-wr-viewport="desktop"
        data-wr-page={page.pageId}
        data-wr-route={route.routeId}
        data-wr-render-coverage={route.renderCoverage}
        data-wr-behavior-coverage={route.behaviorCoverage}
        data-wr-verified-on-this-route={route.verifiedOnThisRoute ? "true" : "false"}
      >
        {renderNode(page.desktop.doc, 0)}
      </div>
      <div
        className="wr-variant"
        data-wr-viewport="mobile"
        data-wr-page={page.pageId}
        data-wr-route={route.routeId}
        data-wr-render-coverage={route.renderCoverage}
        data-wr-behavior-coverage={route.behaviorCoverage}
        data-wr-verified-on-this-route={route.verifiedOnThisRoute ? "true" : "false"}
      >
        {renderNode(page.mobile.doc, 0)}
      </div>
    </>
  );
}
`;

export const FORM_SAFETY_RUNTIME_TSX = `"use client";

import { useEffect } from "react";

/**
 * Form safety (items 51, 52, 53, 107).
 *
 * The SiteSpec carries no form action — Task 13 records only a boolean that one
 * existed — so a generated form has nowhere to post. What it WOULD do is submit
 * to the clone's own URL and reload the page, which looks like a broken clone
 * rather than a safe one.
 *
 * So every submit is prevented, in the CAPTURE phase, so nothing downstream can
 * re-enable it. Buttons keep \`type="submit"\` because that is their observed
 * semantics and it changes how they look and where focus goes; what is removed
 * is the network write, not the control.
 */
export function FormSafetyRuntime() {
  useEffect(() => {
    const onSubmit = (event: Event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);
  return null;
}
`;

export const INTERACTION_RUNTIME_TSX = `"use client";

import { useEffect } from "react";

/**
 * The whole client-side behavior of the clone (items 84–108).
 *
 * ONE delegated listener, reading \`data-wr-*\` annotations off the DOM. It owns
 * no page state, receives no model and knows nothing about this particular site
 * — which is why the client bundle is a fixed few kilobytes whether the SiteSpec
 * was 11 MB or 83 MB (items 8, 87).
 *
 * It also refuses to do anything it was not told was observed:
 *
 *  - an element with no \`data-wr-op\` gets no behavior, whatever its label says.
 *    seoworld's 16 unmatched \`메뉴 열기\` triggers stay inert (items 89, 163).
 *  - \`data-wr-op="native"\` means the browser already does it — \`<details>\`,
 *    checkbox, radio — so no listener runs and nothing toggles twice (item 92).
 *  - a dynamically mounted region gets the observed tag and role and NO
 *    children, because its contents were never observed (item 94).
 *
 * Direct DOM mutation is deliberate (item 88). The page tree is a Server
 * Component that React does not re-render, so attribute flips and mounts are the
 * smallest possible implementation — several orders of magnitude smaller than
 * lifting 14,000 nodes into client state to change one \`aria-expanded\`.
 */

const NATIVE_FIELDS = new Set(["open", "checked"]);

function isVisibleVariant(element: Element): boolean {
  // Node ids are viewport-local and BOTH variants are in the document, so an
  // event must only ever be handled inside the variant that is actually shown
  // (item 31). The hidden variant is display:none and cannot be clicked, but the
  // check is cheap and makes the invariant explicit rather than incidental.
  const root = element.closest("[data-wr-viewport]");
  if (!root) return false;
  return window.getComputedStyle(root).display !== "none";
}

function nextValue(element: Element, field: string, from: string, to: string): string {
  return element.getAttribute(field) === to ? from : to;
}

/**
 * Show or hide a declared region.
 *
 * Two mechanisms, because the observed pages use two. A region hidden by the
 * \`hidden\` ATTRIBUTE is revealed by removing it. A region hidden by CSS — which
 * is most of them, since the original site swapped a class — keeps
 * \`display: none\` from its observed style class no matter what the attribute
 * says, so the generator marks it \`data-wr-reveal\` and a higher-specificity rule
 * takes over while \`data-wr-revealed\` is set.
 *
 * What the region's style becomes while OPEN was never observed (only its
 * closed-state computed style was), so the override is a neutral
 * \`display: revert\` rather than a guess at the original layout. The manifest
 * records this as \`interaction-open-state-style-not-observed\`.
 */
function setVisible(target: Element | null, visible: boolean): void {
  if (!target) return;
  if (visible) {
    target.removeAttribute("hidden");
    if (target.hasAttribute("data-wr-reveal")) target.setAttribute("data-wr-revealed", "1");
    return;
  }
  target.removeAttribute("data-wr-revealed");
  // Only re-add an attribute the observed page actually used.
  if (!target.hasAttribute("data-wr-reveal")) target.setAttribute("hidden", "");
}

function targetOf(trigger: Element): Element | null {
  const id = trigger.getAttribute("data-wr-target-id");
  return id ? document.getElementById(id) : null;
}

/**
 * Build one observed template node into real DOM (Task 16, item 76).
 *
 * \`createElement\` + \`setAttribute\` + \`createTextNode\`, and nothing else. No
 * \`innerHTML\` anywhere on this path: the region's markup was never captured as
 * markup — it was captured as a node tree by the Observer's own walk — so there
 * is no HTML string to parse and no reason to introduce one.
 *
 * Text is created as a text NODE, so page content can never become markup, which
 * is the same guarantee React gives the server-rendered tree.
 */
function buildTemplateNode(node: any): Node | null {
  if (!node || typeof node !== "object") return null;
  if (node.k === "t") return document.createTextNode(String(node.v ?? ""));
  if (node.k !== "e" || typeof node.t !== "string") return null;

  let element: HTMLElement;
  try {
    element = document.createElement(node.t);
  } catch {
    return null; // a tag name the parser rejects is dropped, never coerced
  }
  const props = node.p;
  if (props && typeof props === "object") {
    for (const name in props) {
      const value = props[name];
      if (typeof value !== "string") continue;
      // An event handler could not be here — the SiteSpec cannot carry one —
      // but the guard is cheap and makes the property structural.
      if (name.toLowerCase().startsWith("on")) continue;
      try {
        element.setAttribute(name, value);
      } catch {
        // An attribute name the DOM rejects is skipped, not forced.
      }
    }
  }
  const children = node.c;
  if (Array.isArray(children)) {
    for (const child of children) {
      const built = buildTemplateNode(child);
      if (built) element.appendChild(built);
    }
  }
  return element;
}

function mountDynamicRegion(trigger: Element): void {
  const id = trigger.getAttribute("data-wr-dyn-id");
  if (!id || document.getElementById(id)) return;
  const tag = trigger.getAttribute("data-wr-dyn-tag") || "div";

  /*
   * Task 17.1 — the captured template's single root IS the observed region
   * (the capture walked from the region's own element), so building it as the
   * region reproduces the observed tag, attributes, styles and child count.
   * Wrapping it in a second element made the clone's region one level deeper
   * than the original's — a permanent \`dynamic-target:children\` mismatch.
   */
  const rawTemplate = trigger.getAttribute("data-wr-dyn-template");
  if (rawTemplate) {
    try {
      const nodes = JSON.parse(rawTemplate);
      if (Array.isArray(nodes) && nodes.length === 1) {
        const built = buildTemplateNode(nodes[0]);
        if (built && (built as Element).nodeType === 1) {
          const region = built as HTMLElement;
          region.id = id;
          const role = trigger.getAttribute("data-wr-dyn-role");
          if (role && !region.getAttribute("role")) region.setAttribute("role", role);
          region.setAttribute("data-wr-dynamic-target", "1");
          region.setAttribute("data-wr-dynamic-content", "observed");
          trigger.insertAdjacentElement("afterend", region);
          return;
        }
      }
    } catch {
      // Fall through to the Task 14 empty-region mount below.
    }
  }

  const region = document.createElement(tag);
  region.id = id;
  const role = trigger.getAttribute("data-wr-dyn-role");
  if (role) region.setAttribute("role", role);
  region.setAttribute("data-wr-dynamic-target", "1");

  /*
   * Task 16: mount the OBSERVED contents when there are any.
   *
   * Task 14 mounted an empty region because nothing had ever looked inside one,
   * and Task 15 measured all nine of nextjs.org's menus as
   * \`dynamic-target-content-unobserved\` for exactly that reason. When the
   * explorer captured a bounded subtree it travels here as JSON on the trigger,
   * and the region is filled with it — one observed instance, marked as such.
   * With no template the behavior is byte-for-byte the Task 14 one.
   */
  const raw = trigger.getAttribute("data-wr-dyn-template");
  if (raw) {
    try {
      const nodes = JSON.parse(raw);
      if (Array.isArray(nodes)) {
        for (const node of nodes) {
          const built = buildTemplateNode(node);
          if (built) region.appendChild(built);
        }
        region.setAttribute("data-wr-dynamic-content", "observed");
      }
    } catch {
      // A template that will not parse leaves an empty region rather than a
      // partial one; the clone under-claims instead of inventing.
    }
  }

  // Nothing observed says WHERE the region appeared, so it goes next to its
  // trigger and the manifest records that the position is a renderer choice.
  trigger.insertAdjacentElement("afterend", region);
}

function unmountDynamicRegion(trigger: Element): void {
  const id = trigger.getAttribute("data-wr-dyn-id");
  if (!id) return;
  const region = document.getElementById(id);
  if (!region) return;
  /*
   * Task 26 — when the region was mounted INSIDE an observed host (the
   * observed-target channel), removing it must also clear the host's
   * once-only mount marker, or the next opening transition would find the
   * marker set and mount nothing into an emptied host.
   */
  const parent = region.parentElement;
  if (parent && parent.hasAttribute("data-wr-obs-mounted")) {
    parent.removeAttribute("data-wr-obs-mounted");
  }
  region.remove();
}

function applyState(trigger: Element, field: string, value: string): void {
  if (NATIVE_FIELDS.has(field)) return; // the browser owns these
  trigger.setAttribute(field, value);
}

/**
 * Apply the OBSERVED user-visible targets of one trigger (Task 17 §5).
 *
 * \`data-wr-obs\` carries what the explorer actually saw appear, disappear or
 * change when this trigger was clicked — independent of anything the markup
 * declares. Three shapes, all closed over observation:
 *
 *  - a resolved region that APPEARED is revealed (attribute flips + the
 *    \`data-wr-revealed\` CSS override carrying its observed open-state paint),
 *    and hidden again on the reverse transition;
 *  - a region that gained or replaced its contents has the observed
 *    after-state subtree mounted into it — once, with the same safe node
 *    construction as a dynamic template (no innerHTML anywhere);
 *  - a region that never resolved to a static node is mounted next to the
 *    trigger, exactly like a declared dynamic target.
 */
function applyObservedTargets(trigger: Element, opening: boolean): void {
  const raw = trigger.getAttribute("data-wr-obs");
  if (!raw) return;
  let entries: any;
  try {
    entries = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(entries)) return;

  const mountInto = (region: Element, tpl: any): void => {
    if (!Array.isArray(tpl) || region.hasAttribute("data-wr-obs-mounted")) return;
    // Task 17.1 defense-in-depth: never replace the children of a region that
    // contains the live trigger — that would tear the trigger out of the DOM
    // mid-click. The compiler already suppresses these templates
    // (\`observed-target-contains-trigger\`); this guard keeps the invariant
    // even against a stale annotation.
    if (region.contains(trigger)) return;
    // The observed AFTER-state subtree replaces the region's closed-state
    // children: it was captured from the region root, so it IS the whole
    // contents the user saw.
    region.replaceChildren();
    /*
     * Task 26 — the capture WALKED FROM the region's own root, so a
     * single-root template whose root repeats the region's tag is the region
     * itself. Mount its children; building the root too would nest a second
     * copy of the region inside the region (host > host-copy > panel instead
     * of the observed host > panel).
     */
    let list: any[] = tpl;
    const only = tpl.length === 1 ? tpl[0] : undefined;
    if (
      only &&
      typeof only === "object" &&
      only.k === "e" &&
      String(only.t).toLowerCase() === region.tagName.toLowerCase()
    ) {
      list = Array.isArray(only.c) ? only.c : [];
    }
    for (const node of list) {
      const built = buildTemplateNode(node);
      if (built) region.appendChild(built);
    }
    region.setAttribute("data-wr-obs-mounted", "1");
    region.setAttribute("data-wr-dynamic-content", "observed");
    /*
     * Task 26 — declared-region identity. A framework-portal disclosure keeps
     * a STATIC wrapper in the DOM and mounts its panel inside it on open,
     * while \`aria-controls\` names the mounted PANEL — a DESCENDANT of the
     * wrapper's mounted subtree, not the wrapper itself. The compiler marks
     * the template node whose SOURCE html id equals the declared target's
     * (\`data-wr-declared-region\`); giving that mounted element the declared
     * id makes the aria relation resolve to the real panel — with its
     * observed positioning chain intact — and lets mountDynamicRegion's
     * already-mounted guard stop a second, unpositioned copy from appearing
     * next to the trigger. Without a marker the mounted root stands in.
     */
    const declaredId = trigger.getAttribute("data-wr-dyn-id");
    if (declaredId && !document.getElementById(declaredId)) {
      const marked = region.querySelector('[data-wr-declared-region="1"]');
      const target = marked || region.firstElementChild;
      if (target) target.id = declaredId;
    }
  };

  const show = (region: Element, entry: any): void => {
    region.removeAttribute("data-wr-obs-hide");
    if (entry.ch) region.removeAttribute("hidden");
    if (typeof entry.ah === "string") {
      if (!region.hasAttribute("data-wr-obs-prev-ah")) {
        region.setAttribute(
          "data-wr-obs-prev-ah",
          region.getAttribute("aria-hidden") ?? "",
        );
      }
      region.setAttribute("aria-hidden", entry.ah);
    }
    if (region.hasAttribute("data-wr-reveal")) region.setAttribute("data-wr-revealed", "1");
  };

  const hide = (region: Element, entry: any): void => {
    region.removeAttribute("data-wr-revealed");
    if (region.hasAttribute("data-wr-obs-prev-ah")) {
      const previous = region.getAttribute("data-wr-obs-prev-ah") ?? "";
      if (previous === "") region.removeAttribute("aria-hidden");
      else region.setAttribute("aria-hidden", previous);
      region.removeAttribute("data-wr-obs-prev-ah");
    }
    if (entry.ch) {
      region.setAttribute("hidden", "");
    } else if (!region.hasAttribute("data-wr-reveal")) {
      // The region is visible at rest (a disappeared-direction target), so
      // hiding it needs an explicit override the stylesheet provides.
      region.setAttribute("data-wr-obs-hide", "1");
    }
  };

  // Mount anchor: each unresolved region is inserted AFTER the previous one,
  // so several mounted regions keep their discovery (document) order instead
  // of stacking in reverse.
  let anchor: Element = trigger;
  entries.forEach((entry: any, index: number) => {
    if (!entry || typeof entry !== "object") return;
    // \`appeared\` follows the trigger's opening; \`disappeared\` mirrors it.
    const appearing = entry.d === "disappeared" ? !opening : opening;

    if (entry.i) {
      const region = document.getElementById(String(entry.i));
      if (!region) return;
      if (entry.tpl && appearing) mountInto(region, entry.tpl);
      if (entry.d === "content-changed") return; // contents only, no visibility
      if (appearing) show(region, entry);
      else hide(region, entry);
      return;
    }

    if (typeof entry.tag === "string" && entry.tag) {
      const patternId = trigger.getAttribute("data-wr-pattern-id") || "p";
      // Task 17.1: the region id carries the explorer's DISCOVERY id when the
      // annotation has one — a stable identity QA can address directly —
      // falling back to the entry index for older annotations.
      const id =
        "wr-obs-" +
        patternId +
        "-" +
        (typeof entry.di === "string" && entry.di ? entry.di : String(index));
      if (appearing) {
        const existing = document.getElementById(id);
        if (existing) {
          anchor = existing;
          return;
        }
        /*
         * Task 17.1 — build the observed copy from its own captured root
         * rather than wrapping it: the captured root carries the region's
         * observed style token (a fixed/absolute portal overlay positions
         * itself), and QA measures the element it names, not a 0-height
         * wrapper around it.
         */
        let regionOrNull: HTMLElement | null = null;
        const extras: Node[] = [];
        if (Array.isArray(entry.tpl) && entry.tpl.length > 0) {
          const first = buildTemplateNode(entry.tpl[0]);
          if (first && (first as Element).nodeType === 1) {
            regionOrNull = first as HTMLElement;
            for (let extra = 1; extra < entry.tpl.length; extra++) {
              const built = buildTemplateNode(entry.tpl[extra]);
              if (built) extras.push(built);
            }
            regionOrNull.setAttribute("data-wr-obs-mounted", "1");
            regionOrNull.setAttribute("data-wr-dynamic-content", "observed");
          }
        }
        if (!regionOrNull) {
          let created: HTMLElement;
          try {
            created = document.createElement(entry.tag);
          } catch {
            return;
          }
          if (entry.tpl) mountInto(created, entry.tpl);
          regionOrNull = created;
        }
        const region = regionOrNull;
        region.id = id;
        if (typeof entry.role === "string" && entry.role && !region.getAttribute("role")) {
          region.setAttribute("role", entry.role);
        }
        region.setAttribute("data-wr-dynamic-target", "1");

        /*
         * Task 17.1 — attach under the OBSERVED host when the explorer
         * resolved one (a body-level portal container, a grid cell), at the
         * observed child position. Without a host the Task 17 fallback stays:
         * next to the trigger, discovery order preserved via the anchor.
         */
        let host: Element | null = null;
        if (typeof entry.h === "string" && entry.h) {
          host = document.getElementById(entry.h);
        }
        if (!host && typeof entry.hn === "string" && entry.hn) {
          const scope = trigger.closest("[data-wr-viewport]") || document;
          try {
            host = scope.querySelector('[data-wr-node="' + entry.hn + '"]');
          } catch {
            host = null;
          }
        }
        if (host) {
          const children = host.children;
          const at =
            typeof entry.x === "number" && entry.x >= 0
              ? Math.min(Math.floor(entry.x), children.length)
              : children.length;
          const reference = at < children.length ? children[at] : null;
          host.insertBefore(region, reference);
          for (const extra of extras) host.appendChild(extra);
        } else {
          anchor.insertAdjacentElement("afterend", region);
          for (const extra of extras) {
            if (extra.nodeType === 1) {
              region.insertAdjacentElement("afterend", extra as Element);
            }
          }
          anchor = region;
        }
      } else {
        document.getElementById(id)?.remove();
      }
    }
  });
}

function handleTabs(trigger: Element, field: string, from: string, to: string): void {
  // Always select — the observed transition is unselected → selected, never a
  // toggle back to unselected (item 97).
  applyState(trigger, field, to);
  const list = trigger.closest('[role="tablist"]');
  const own = targetOf(trigger);
  if (own) setVisible(own, true);
  // Task 17 §5: a tab activation is always an "opening" of its own panel — the
  // observed targets (a panel appearing, a sibling panel disappearing, or an
  // in-place content replacement) apply in that direction.
  applyObservedTargets(trigger, true);
  if (!list) return;
  const tabs = list.querySelectorAll('[role="tab"]');
  for (const tab of Array.from(tabs)) {
    if (tab === trigger) continue;
    tab.setAttribute(field, from);
    const panelId = tab.getAttribute("data-wr-target-id");
    if (panelId && own) {
      const panel = document.getElementById(panelId);
      if (panel && panel !== own) setVisible(panel, false);
    }
  }
}

function handleClick(event: Event): void {
  const origin = event.target;
  if (!(origin instanceof Element)) return;
  const trigger = origin.closest("[data-wr-op]");
  if (!trigger) return;

  const op = trigger.getAttribute("data-wr-op");
  if (!op || op === "native") return;
  if (!isVisibleVariant(trigger)) return;

  const field = trigger.getAttribute("data-wr-field") || "";
  const from = trigger.getAttribute("data-wr-from") || "";
  const to = trigger.getAttribute("data-wr-to") || "";
  const targetOp = trigger.getAttribute("data-wr-target-op") || "none";

  if (op === "dismiss") {
    // Task 12's evidence is "the candidate element itself was removed". It is
    // not evidence that a parent dialog closed, so no parent is touched (item 102).
    trigger.remove();
    return;
  }

  if (op === "tabs") {
    handleTabs(trigger, field, from, to);
    return;
  }

  const value = field ? nextValue(trigger, field, from, to) : to;
  if (field) applyState(trigger, field, value);
  const opening = value === to;

  /*
   * The mount signal is the OBSERVED dynamic target, not the pattern's
   * taxonomy name: the generator emits \`data-wr-dyn-id\` only when the compiled
   * pattern declared a target that was seen to MOUNT on click, and a
   * framework-portal nav disclosure (aria-expanded, no menu role anywhere)
   * mounts its panel exactly like a menu does. Gating this on
   * op === "menu" || op === "dialog" dropped every such disclosure's panel —
   * the trigger state flipped and nothing appeared (Task 26 generic
   * correction; first measured on a fresh non-Stripe source).
   */
  // Task 17 §5: what the user actually SAW change. Task 26 — applied BEFORE
  // the declared-region branch, because an observed host-mount may itself BE
  // the declared dynamic region (it assigns the declared id to the content it
  // mounts), and the declared mount below must see that and not add a second
  // copy. Idempotent where the two channels name the same region.
  applyObservedTargets(trigger, opening);

  if (trigger.getAttribute("data-wr-dyn-id")) {
    if (opening) mountDynamicRegion(trigger);
    else unmountDynamicRegion(trigger);
  } else if (targetOp === "visibility") {
    setVisible(targetOf(trigger), opening);
  }
}

/**
 * Restore enumerated \`hidden\` values.
 *
 * React DOM types \`hidden\` as a boolean and its server renderer emits
 * \`hidden=""\` for any truthy value, so \`hidden="until-found"\` cannot survive as
 * a prop. Collapsing it would change what the page does, so the generator keeps
 * the exact value in \`data-wr-hidden\` and it is put back here. The element is
 * hidden either way, so nothing flashes.
 */
function restoreEnumeratedHidden(): void {
  const nodes = document.querySelectorAll("[data-wr-hidden]");
  for (const node of Array.from(nodes)) {
    const value = node.getAttribute("data-wr-hidden");
    if (value) node.setAttribute("hidden", value);
  }
}

/**
 * Restore observed NESTED scroll offsets (Task 16, A2).
 *
 * \`element.scrollTop\` is a DOM property with no HTML attribute and no React
 * prop, so a server-rendered clone always starts every internal scroller at 0 —
 * and every descendant of an internally-scrolled container then sits exactly
 * \`scrollTop\` pixels away from where the snapshot recorded it. Task 15 measured
 * that as a median y delta of 19,739px on one MDN page whose document height
 * matched to the pixel.
 *
 * Three properties of this function matter:
 *
 *  - **Only what was observed.** An element gets an offset because the Observer
 *    read one off a real scroll container, never because this code decided a
 *    region ought to be scrolled.
 *  - **Nested only.** \`window.scrollTo\` is never called. Top-level page scroll
 *    is a different fact with a different answer, and the Observer captures the
 *    page at scroll 0 (item 21).
 *  - **Bounded and deterministic.** Two animation frames after hydration, once.
 *    No site-specific delay, no polling, no retry — if the layout is not final
 *    two frames after mount, that is a finding for QA rather than something to
 *    paper over with a timeout (item 19).
 */
function restoreScrollState(): void {
  const nodes = document.querySelectorAll(
    "[data-wr-scroll-top],[data-wr-scroll-left]",
  );
  for (const node of Array.from(nodes)) {
    if (!(node instanceof HTMLElement)) continue;
    const top = Number(node.getAttribute("data-wr-scroll-top") || "0");
    const left = Number(node.getAttribute("data-wr-scroll-left") || "0");
    if (Number.isFinite(top) && top !== 0) node.scrollTop = top;
    if (Number.isFinite(left) && left !== 0) node.scrollLeft = left;
  }
}

export function InteractionRuntime() {
  useEffect(() => {
    restoreEnumeratedHidden();
    // Two frames: one for React to commit, one for layout to settle, so a
    // scroller whose content height is only correct after the first paint still
    // accepts the offset. \`scrollTop\` on a too-short element clamps silently.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(restoreScrollState);
    });
    document.addEventListener("click", handleClick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("click", handleClick);
    };
  }, []);
  return null;
}
`;
