/**
 * pnpm smoke:visual-editor — Task 28 Phase 4 (Visual Editor V1) tests.
 *
 * Everything here runs against the REAL operator app: a real release project,
 * a real Recon Template (linear.app — 3,079 slots / 9,929 bindings), a real
 * authoring preview behind the real editor bridge, and a real Chromium driving
 * the real UI. There is no mock editor, no synthetic template and no stubbed
 * bridge anywhere in this file.
 *
 *   §1  inversion, on the real bindings file (no browser, no server)
 *   §2  the editor server: two origins, bootstrap, viewport semantics
 *   §3  hover: the highlight, and its geometry cost measured to the pixel
 *   §4  click → slot; the multi-binding slot; one edit updates all
 *   §5  text / url / image / logo / theme inspectors and their write paths
 *   §6  revisions: save is the transaction boundary, debounce, undo
 *   §7  postMessage origin rejection, no data-wr-slot, 0 runtime/hydration errors
 *   §8  the AI rewrite contract (keyed values, out-of-scope refusal)
 *
 * WRITES: one release project (data/linear.app/release-projects/wr28-visual-editor,
 * recreated per run) and one authoring preview (…/authoring-previews/
 * wr28-editor-smoke, kept warm between runs). Nothing else under data/ is touched.
 */
import { createServer, type Server } from "node:http";
import { createServer as createNetServer } from "node:net";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { chromium, type Frame, type Page } from "playwright";

import {
  BRIDGE_MARKER,
  EDITOR_STYLE_ATTR,
  renderEditorBridgeScript,
} from "../src/authoring-preview/bridge.js";
import {
  buildGroupInspector,
  buildSlotInspector,
  loadEditorSite,
  occurrenceKey,
  startVisualEditor,
  validateThemeTokens,
  type EditorSite,
  type VisualEditorSession,
} from "../src/editor/index.js";
import { loadRevisionChain } from "../src/release/revisions.js";
import { loadReleaseProject } from "../src/release/store.js";

let checks = 0;
let failures = 0;
function check(name: string, ok: boolean | undefined, detail = ""): void {
  checks++;
  if (ok) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
function section(title: string): void {
  console.log(`\n== ${title}`);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TEMPLATE = path.join("data", "linear.app", "recon-templates", "2026-08-25T21-53-26-980Z");
const SOURCE_PROJECT = path.join("data", "linear.app", "release-projects", "wr28-brand-assets");
const PROJECT = path.join("data", "linear.app", "release-projects", "wr28-visual-editor");
const PREVIEW_DIR = path.join("data", "linear.app", "authoring-previews", "wr28-editor-smoke");
const UPLOADS = path.join("data", "linear.app", "wr28-editor-assets");

/** A 2-slot anchor: navigation.href + navigation.label on ONE element. */
const NAV_NODE = "n000027";
/** static desktop + static mobile + a dynamic portal, on one slot. */
const MULTI_KEY = "plan.main.text.projects";
/** 1 href + TWO label segments — the shape a label/href pair would render wrong. */
const CTA_GROUP = "home.main.cta.new-loops";
const URL_KEY = "global.header.nav.customers.href";
const IMAGE_KEY = "home.main.image.f-auto-fit-scale-down-metadata-none";
const TEXT_KEY = "global.header.nav.customers.label";

/** A tiny solid-colour PNG, so a replaced image is provable by ONE pixel. */
function png(width: number, height: number, rgb: [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0;
    for (let x = 0; x < width; x++) {
      raw[offset++] = rgb[0];
      raw[offset++] = rgb[1];
      raw[offset++] = rgb[2];
    }
  }
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    let crc = 0xffffffff;
    for (const byte of body) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([length, body, crcBuffer]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address() as { port: number };
      probe.close(() => resolve(address.port));
    });
  });
}

/** A ROGUE editor on an un-allowlisted origin, embedding the same preview. */
async function startRogue(port: number, previewUrl: string): Promise<Server> {
  const html = `<!doctype html><html><body><script>
window.__received = [];
window.addEventListener("message", function (e) { window.__received.push({ origin: e.origin, type: e.data && e.data.type }); });
window.__send = function (m) { document.getElementById("f").contentWindow.postMessage(m, "*"); };
</script><iframe id="f" src="${previewUrl}" style="width:1280px;height:800px;border:0"></iframe></body></html>`;
  const server = createServer((_request, response) => {
    const body = Buffer.from(html, "utf8");
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": String(body.length) });
    response.end(body);
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", () => resolve()));
  return server;
}

const stopServer = async (server: Server): Promise<void> =>
  new Promise((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  });

/** Rebuild the scratch release project from an accepted one, per run. */
async function makeScratchProject(): Promise<void> {
  await rm(PROJECT, { recursive: true, force: true });
  await cp(SOURCE_PROJECT, PROJECT, { recursive: true });
  const projectFile = path.join(PROJECT, "release-project.json");
  const project = JSON.parse(await readFile(projectFile, "utf8")) as Record<string, unknown>;
  project.siteId = "wr28-visual-editor";
  project.projectId = "wr28-visual-editor";
  project.displayName = "WR28 Visual Editor Canary";
  await writeFile(projectFile, JSON.stringify(project, null, 2));
  const requirementsFile = path.join(PROJECT, "requirements.json");
  if (existsSync(requirementsFile)) {
    const requirements = JSON.parse(await readFile(requirementsFile, "utf8")) as Record<string, unknown>;
    requirements.projectId = "wr28-visual-editor";
    await writeFile(requirementsFile, JSON.stringify(requirements, null, 2));
  }
  const revisions = path.join(PROJECT, "revisions");
  for (const entry of await readdir(revisions)) {
    const file = path.join(revisions, entry, "revision.json");
    if (!existsSync(file)) continue;
    const revision = JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
    revision.siteId = "wr28-visual-editor";
    await writeFile(file, JSON.stringify(revision, null, 2));
  }
}

// ---------------------------------------------------------------------------
// Browser helpers — every one of them drives the REAL editor UI
// ---------------------------------------------------------------------------

interface RectSnapshot {
  values: number[];
  count: number;
}

/** Every element's box plus the document's own metrics, in one array. */
const SNAPSHOT_EXPR = `(() => {
  const nodes = Array.from(document.querySelectorAll("*")).filter(
    (el) => !el.hasAttribute("data-wr-editor-style") && !el.hasAttribute("data-wr-authoring-style"),
  );
  const values = [];
  for (const el of nodes) {
    const r = el.getBoundingClientRect();
    values.push(r.x, r.y, r.width, r.height);
  }
  values.push(
    document.documentElement.scrollWidth, document.documentElement.scrollHeight,
    document.documentElement.clientWidth, document.documentElement.clientHeight,
    document.body.scrollWidth, document.body.scrollHeight,
  );
  return { values, count: nodes.length };
})()`;

function maxDelta(a: RectSnapshot, b: RectSnapshot): number {
  if (a.values.length !== b.values.length) return Number.POSITIVE_INFINITY;
  let worst = 0;
  for (let i = 0; i < a.values.length; i++) worst = Math.max(worst, Math.abs(a.values[i] - b.values[i]));
  return worst;
}

/** Marks the preview document a navigation is trying to LEAVE. */
interface StampedPreviewWindow {
  __wrAuthoringBridge?: unknown;
  __wrSmokeDoc?: string;
}

let previewDocSeq = 0;

/**
 * The preview frame — once the document inside it is the one that will still be
 * there for the NEXT click.
 *
 * `[data-wr-viewport]` alone is not that document. It is in the markup of the
 * document being torn down just as much as of the one replacing it, and it is
 * parsed long before the injected editor bridge attaches its capture-phase
 * click listener. `window.__wrAuthoringBridge` is the last thing that bridge
 * sets (bridge.ts, right before it posts `ready`), so its presence is the only
 * honest proof that a click on this document will reach the editor at all.
 *
 * `staleToken`, when given, names the document the caller stamped before
 * navigating; this returns only once that document is gone.
 */
async function previewFrame(page: Page, previewBase: string, staleToken?: string): Promise<Frame> {
  for (let attempt = 0; attempt < 300; attempt++) {
    const frame = page.frames().find((candidate) => candidate.url().startsWith(previewBase));
    if (frame !== undefined) {
      try {
        await frame.waitForSelector("[data-wr-viewport]", { timeout: 1_000 });
        const ready = await frame.evaluate((token: string | undefined) => {
          const w = window as unknown as StampedPreviewWindow;
          if (w.__wrAuthoringBridge === undefined) return false;
          return token === undefined || w.__wrSmokeDoc !== token;
        }, staleToken);
        if (ready) return frame;
      } catch {
        /* still loading, or the document is being replaced right now */
      }
    }
    await page.waitForTimeout(100);
  }
  throw new Error("preview frame never became ready");
}

/**
 * Select a route in the editor and hand back the preview frame the selection
 * produced.
 *
 * WHY THIS IS NOT `selectOption` + `src === expected`. The editor's `navigate()`
 * (src/editor/client.ts:428) ALWAYS re-assigns `#wr-frame.src`, so selecting a
 * route reloads the preview even when it is the route already on screen — and
 * that reload commits roughly half a second later, while `src === expected` is
 * true immediately (for a same-route selection it is true before the selection
 * is even made). Clicking inside that window straddles the document swap: the
 * mousedown and the mouseup land on two different documents, no `click` event is
 * produced at all, the bridge posts nothing, and the panel keeps the note
 * `navigate()` had just written — which is how §6's setup used to time out.
 *
 * So: stamp the outgoing document, arm Playwright's own commit event BEFORE the
 * selection so it cannot be missed, and only then look for a bridged document
 * that is not the stamped one. If nothing commits — nothing in the app promises
 * a reload — the safety valve drops the stale check rather than hanging.
 */
async function gotoRoute(page: Page, previewBase: string, routePath: string): Promise<Frame> {
  const target = previewBase + routePath;
  const token = `wr-smoke-doc-${++previewDocSeq}`;
  const leaving = page.frames().find((candidate) => candidate.url().startsWith(previewBase));
  if (leaving !== undefined) {
    await leaving
      .evaluate((stamp: string) => {
        (window as unknown as StampedPreviewWindow).__wrSmokeDoc = stamp;
      }, token)
      .catch(() => undefined);
  }
  const committed = page
    .waitForEvent("framenavigated", {
      predicate: (frame) => frame !== page.mainFrame() && frame.url() === target,
      timeout: 20_000,
    })
    .catch(() => undefined);
  await page.selectOption("#wr-route", routePath);
  await page.waitForFunction(
    (expected) => (document.getElementById("wr-frame") as HTMLIFrameElement).src === expected,
    target,
  );
  const navigated = await committed;
  return previewFrame(page, previewBase, navigated !== undefined ? token : undefined);
}

/** Wait until the right-hand panel mentions a string. */
async function waitForPanel(page: Page, needle: string, timeout = 15_000): Promise<boolean> {
  try {
    await page.waitForFunction(
      (text) => (document.getElementById("wr-panel")?.textContent ?? "").includes(text),
      needle,
      { timeout },
    );
    return true;
  } catch {
    return false;
  }
}

async function panelText(page: Page): Promise<string> {
  return page.evaluate(() => document.getElementById("wr-panel")?.textContent ?? "");
}

/**
 * The same wait, for the SETUP steps whose result nothing asserts. Swallowing a
 * failure there only moved the death 30s downstream, into a Playwright timeout
 * on a locator whose absence was the symptom and not the cause.
 */
async function requirePanel(page: Page, needle: string, where: string, timeout = 15_000): Promise<void> {
  if (await waitForPanel(page, needle, timeout)) return;
  throw new Error(`${where}: the panel never showed ${JSON.stringify(needle)} — it shows ${JSON.stringify((await panelText(page)).slice(0, 200))}`);
}

async function revisionCount(): Promise<number> {
  return (await loadRevisionChain(PROJECT)).length;
}

async function main(): Promise<void> {
  for (const required of [TEMPLATE, SOURCE_PROJECT]) {
    if (!existsSync(required)) throw new Error(`fixture missing: ${required}`);
  }
  await makeScratchProject();
  await mkdir(UPLOADS, { recursive: true });

  // -------------------------------------------------------------------------
  section("1. DOM → Slot inversion, on the real bindings file");
  // -------------------------------------------------------------------------
  const site: EditorSite = await loadEditorSite(PROJECT);
  const index = site.index;

  const keyToSlots = new Map<string, Set<string>>();
  for (const binding of site.template.bindingsFile.bindings) {
    const key = occurrenceKey(binding);
    const set = keyToSlots.get(key) ?? new Set<string>();
    set.add(binding.slotId);
    keyToSlots.set(key, set);
  }
  const collidingKeys = [...keyToSlots.values()].filter((set) => set.size > 1).length;
  check(
    "28.P4.1 the occurrence key is exactly invertible: every binding has its own key, and no key spans two slots",
    keyToSlots.size === index.bindingCount && collidingKeys === 0,
    `${keyToSlots.size} keys / ${index.bindingCount} bindings, ${collidingKeys} keys spanning >1 slot`,
  );

  // Dynamic addressing: templateNodeId alone vs the recovered trigger.
  // Dynamic addressing. The claim under test is NOT "the trigger makes every
  // dynamic element single-slot" — an element can legitimately carry a label
  // AND an href, which is what the candidate list is for. The claim is that
  // WITHOUT the trigger the candidate set contains slots that are not on this
  // element at all, and that WITH it the set is always sound.
  const dynamic = site.template.bindingsFile.bindings.filter((b) => b.surface === "dynamic-template");
  const byTemplateNode = new Map<string, Set<string>>();
  const byTrigger = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, slotId: string): void => {
    const set = map.get(key) ?? new Set<string>();
    set.add(slotId);
    map.set(key, set);
  };
  const looseKeyOf = (b: (typeof dynamic)[number]): string =>
    `${b.pageId}|${b.viewport}|${b.templateNodeId ?? ""}`;
  const tightKeyOf = (b: (typeof dynamic)[number]): string => `${looseKeyOf(b)}|${b.nodeId}`;
  for (const binding of dynamic) {
    add(byTemplateNode, looseKeyOf(binding), binding.slotId);
    add(byTrigger, tightKeyOf(binding), binding.slotId);
  }
  const looseUnique = dynamic.filter((b) => byTemplateNode.get(looseKeyOf(b))!.size === 1).length;
  const tightUnique = dynamic.filter((b) => byTrigger.get(tightKeyOf(b))!.size === 1).length;
  const widened = dynamic.filter(
    (b) => byTemplateNode.get(looseKeyOf(b))!.size > byTrigger.get(tightKeyOf(b))!.size,
  ).length;
  const sound = dynamic.filter((b) => byTrigger.get(tightKeyOf(b))!.has(b.slotId)).length;
  check(
    "28.P4.2 dynamic-template resolution NEEDS the recovered trigger — without it the candidate set includes slots that are NOT on the element",
    dynamic.length > 0 && sound === dynamic.length && widened > 0 && tightUnique > looseUnique,
    `${dynamic.length} dynamic bindings: sound with trigger ${sound}/${dynamic.length}; ` +
      `${widened} would get a WIDER candidate set without it; single-slot ${looseUnique} → ${tightUnique}`,
  );

  const navResolve = index.resolve({
    node: NAV_NODE,
    dynNode: null,
    pageId: "p000001",
    viewport: "desktop",
  });
  check(
    "28.P4.3 one anchor inverts to BOTH its slots (label + href), sharing a groupId",
    navResolve.kind === "static" &&
      navResolve.slotKeys.length === 2 &&
      navResolve.bindings.some((b) => b.role === "navigation.href" && b.target === "attribute") &&
      navResolve.bindings.some((b) => b.role === "navigation.label" && b.target === "text") &&
      navResolve.groupIds.length === 1 &&
      navResolve.ambiguous,
    JSON.stringify({ keys: navResolve.slotKeys, groups: navResolve.groupIds }),
  );

  const noTrigger = index.resolve({
    node: null,
    dynNode: "t000014",
    dynTrigger: null,
    pageId: "p000006",
    viewport: "desktop",
  });
  check(
    "28.P4.4 a dynamic element whose trigger could NOT be recovered returns every candidate and says so — it does not guess",
    noTrigger.kind === "dynamic-template" &&
      noTrigger.triggerRecovered === false &&
      noTrigger.slotKeys.length > 1 &&
      (noTrigger.note ?? "").includes("could not be recovered"),
    JSON.stringify({ keys: noTrigger.slotKeys, recovered: noTrigger.triggerRecovered }),
  );

  const multiSlot = index.slotByKey.get(MULTI_KEY);
  const multiInspector =
    multiSlot === undefined
      ? null
      : buildSlotInspector({
          index,
          slot: multiSlot,
          authored: site.project.authored,
          pageId: "p000006",
          viewport: "desktop",
          accounting: site.accounting,
          accountingAvailable: site.accounting.size > 0,
          assetLineage: null,
        });
  check(
    "28.P4.5 a slot bound on desktop + mobile + a dynamic portal reports every binding AND the count for this view",
    multiInspector !== null &&
      multiInspector.bindingTotal === 5 &&
      multiInspector.bindingsBySurface["dynamic-template"] === 1 &&
      multiInspector.bindingsBySurface["static"] === 4 &&
      multiInspector.bindingsByViewport["desktop"] === 3 &&
      multiInspector.bindingsByViewport["mobile"] === 2 &&
      multiInspector.bindingsInView === 3,
    JSON.stringify({
      total: multiInspector?.bindingTotal,
      surfaces: multiInspector?.bindingsBySurface,
      viewports: multiInspector?.bindingsByViewport,
      inView: multiInspector?.bindingsInView,
    }),
  );

  const ctaSlot = index.slotByKey.get(`${CTA_GROUP}.label.01`);
  const group = ctaSlot === undefined ? null : buildGroupInspector(index, ctaSlot, site.project.authored);
  check(
    "28.P4.6 the CTA inspector renders 1 href + N labels — it does not assume a label/href PAIR",
    group !== null &&
      group.memberCount === 3 &&
      group.labels.length === 2 &&
      group.href !== null &&
      group.href.urlKind === "internal" &&
      !group.degraded,
    JSON.stringify({ members: group?.memberCount, labels: group?.labels.map((l) => l.currentValue) }),
  );

  const singleGroupSlot = [...index.slotByKey.values()].find(
    (slot) => slot.groupId !== undefined && (index.slotsByGroupId.get(slot.groupId) ?? []).length === 1,
  );
  const degraded =
    singleGroupSlot === undefined
      ? null
      : buildGroupInspector(index, singleGroupSlot, site.project.authored);
  check(
    "28.P4.7 a groupId with ONE member degrades to a single-slot form instead of rendering an empty group",
    degraded !== null && degraded.degraded && degraded.memberCount === 1,
    `${singleGroupSlot?.groupId ?? "(none found)"}`,
  );

  const navSlot = index.slotByKey.get(TEXT_KEY);
  const navInspector =
    navSlot === undefined
      ? null
      : buildSlotInspector({
          index,
          slot: navSlot,
          authored: site.project.authored,
          pageId: "p000001",
          viewport: "desktop",
          accounting: site.accounting,
          accountingAvailable: site.accounting.size > 0,
          assetLineage: null,
        });
  check(
    "28.P4.8 the inspector ships only fields that exist: no maxCharacters, no position, no approval state — and names what it cannot show",
    navInspector !== null &&
      !("maxCharacters" in (navInspector.constraints as Record<string, unknown>)) &&
      !("x" in (navInspector as unknown as Record<string, unknown>)) &&
      !("approved" in (navInspector as unknown as Record<string, unknown>)) &&
      navInspector.fieldsNotAvailable.some((line) => line.startsWith("maxCharacters")) &&
      navInspector.accounting !== null &&
      navInspector.accounting.origin.length > 0,
    JSON.stringify({ constraints: navInspector?.constraints, accounting: navInspector?.accounting?.origin }),
  );

  const themeValidation = validateThemeTokens({
    "color.accent.primary": "rgb(3, 5, 7)",
    "color.text.primary": "url(https://evil.example/x.png)",
    "layout.padding": "12px",
    "decoration.radius.small": "4px; position:absolute",
  });
  check(
    "28.P4.9 the theme panel accepts ONLY theme-contract-v1 tokens and safe paint values — no raw CSS, no layout, no url()",
    Object.keys(themeValidation.accepted).length === 1 &&
      themeValidation.accepted["color.accent.primary"] === "rgb(3, 5, 7)" &&
      themeValidation.rejected.length === 3 &&
      themeValidation.rejected.some((r) => r.token === "layout.padding"),
    JSON.stringify(themeValidation),
  );

  const bridgeSample = renderEditorBridgeScript({
    editorOrigins: ["http://127.0.0.1:1"],
    breakpoint: 915,
    generatedStylesPath: "/wr/generated-styles.css",
  });
  check(
    "28.P4.10 the extended bridge keeps every Phase 3 security property and adds NO DOM attribute of its own",
    bridgeSample.includes(BRIDGE_MARKER) &&
      bridgeSample.includes(EDITOR_STYLE_ATTR) &&
      !bridgeSample.includes('postMessage(message, "*")') &&
      bridgeSample.includes("origins.indexOf(event.origin) === -1") &&
      bridgeSample.includes("event.source !== window.parent && event.source !== window.opener") &&
      !bridgeSample.includes("data-wr-slot"),
  );

  // -------------------------------------------------------------------------
  section("2. the editor server: two origins, one preview");
  // -------------------------------------------------------------------------
  const roguePort = await freePort();
  const editor: VisualEditorSession = await startVisualEditor({
    projectDir: PROJECT,
    previewDir: PREVIEW_DIR,
    title: "WR28 smoke editor",
  });
  let rogue: Server | undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  const jsErrors: string[] = [];
  const hydrationErrors: string[] = [];

  try {
    check(
      "28.P4.11 the editor and the preview are on DIFFERENT origins — the bridge's origin guard is not vacuous",
      new URL(editor.baseUrl).port !== new URL(editor.previewBaseUrl).port &&
        editor.baseUrl.startsWith("http://127.0.0.1:") &&
        editor.previewBaseUrl.startsWith("http://127.0.0.1:"),
      `${editor.baseUrl} vs ${editor.previewBaseUrl}`,
    );

    const boot = (await (await fetch(`${editor.baseUrl}/api/bootstrap`)).json()) as {
      routes: Array<{ path: string; pageId: string }>;
      sites: Array<{ siteKey: string }>;
      breakpoint: number;
      viewports: Array<{ id: string; width: number; height: number }>;
      viewportNote: string;
      site: { slotCount: number; bindingCount: number; templateId: string };
    };
    check(
      "28.P4.12 bootstrap lists every template route and every release project on disk",
      boot.routes.length === site.routes.length &&
        boot.routes[0].path === "/" &&
        boot.sites.some((s) => s.siteKey === "linear.app/wr28-visual-editor") &&
        boot.sites.length > 1,
      `${boot.routes.length} routes, ${boot.sites.length} sites`,
    );
    check(
      "28.P4.13 the viewport toggle uses the CANONICAL observed profiles and the template's own breakpoint, and says what Mobile does NOT reproduce",
      boot.viewports[0].width === 1440 &&
        boot.viewports[0].height === 900 &&
        boot.viewports[1].width === 390 &&
        boot.viewports[1].height === 844 &&
        boot.breakpoint === 915 &&
        boot.viewportNote.includes("deviceScaleFactor 3"),
      JSON.stringify({ viewports: boot.viewports, breakpoint: boot.breakpoint }),
    );

    rogue = await startRogue(roguePort, `${editor.previewBaseUrl}/`);

    browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1680, height: 1000 } });
    const record = (text: string): void => {
      if (/hydrat|minified react error #(418|423|425)/i.test(text)) hydrationErrors.push(text.slice(0, 300));
      else jsErrors.push(text.slice(0, 300));
    };
    context.on("console", (message) => {
      if (message.type() === "error") record(message.text());
    });
    context.on("weberror", (error) => record(error.error().message));
    const page = await context.newPage();
    page.on("pageerror", (error) => record(error.message));

    await page.goto(`${editor.baseUrl}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => (document.getElementById("wr-route") as HTMLSelectElement)?.options.length > 0);
    let frame = await previewFrame(page, editor.previewBaseUrl);
    check(
      "28.P4.14 the editor renders the required layout and embeds the REAL preview in the iframe",
      (await page.locator("#wr-left").count()) === 1 &&
        (await page.locator("#wr-center iframe#wr-frame").count()) === 1 &&
        (await page.locator("#wr-right .tabs").count()) === 1 &&
        (await page.locator("#wr-pages .row").count()) === site.routes.length &&
        frame.url().startsWith(editor.previewBaseUrl),
      frame.url(),
    );

    // Select mode ON: a click on a nav anchor must NOT navigate the preview.
    await page.click("#wr-select-mode");
    await page.waitForTimeout(200);

    // -----------------------------------------------------------------------
    section("3. hover highlight — and its geometry cost, measured");
    // -----------------------------------------------------------------------
    const target = page.frameLocator("#wr-frame").locator(`[data-wr-viewport='desktop'] [data-wr-node='${NAV_NODE}']`).first();
    const baselineA = (await frame.evaluate(SNAPSHOT_EXPR)) as RectSnapshot;
    await page.waitForTimeout(400);
    const baselineB = (await frame.evaluate(SNAPSHOT_EXPR)) as RectSnapshot;
    const noiseFloor = maxDelta(baselineA, baselineB);
    check(
      "28.P4.15 the geometry measurement has a ZERO noise floor, so a nonzero result later would be real",
      noiseFloor === 0 && baselineA.count > 1_000,
      `noise ${noiseFloor} over ${baselineA.count} elements`,
    );

    await target.hover();
    await frame.waitForSelector(`style[${EDITOR_STYLE_ATTR}="1"]`, { state: "attached", timeout: 15_000 });
    await page.waitForTimeout(500);
    const highlighted = await frame.evaluate((attr) => {
      const style = document.querySelector(`style[${attr}="1"]`);
      return { present: style !== null, css: style?.textContent ?? "" };
    }, EDITOR_STYLE_ATTR);
    check(
      "28.P4.16 hovering a selectable element outlines it — one <style> in <head>, keyed on the EXISTING data-wr-node",
      highlighted.present &&
        highlighted.css.includes(`[data-wr-node="${NAV_NODE}"]`) &&
        highlighted.css.includes("outline:2px solid") &&
        !highlighted.css.includes("data-wr-slot"),
      highlighted.css.slice(0, 160),
    );
    const badge = await page.evaluate(() => {
      const node = document.getElementById("wr-badge");
      return { display: node?.style.display ?? "", text: node?.textContent ?? "" };
    });
    check(
      "28.P4.17 the role/type indicator is drawn in the EDITOR document, outside the customer page",
      badge.display === "block" && /navigation\.(href|label) · (url|text)/.test(badge.text),
      JSON.stringify(badge),
    );

    // ONE hovered inline anchor is NOT a sufficient probe. This was measured,
    // not assumed: with the highlight deliberately changed from `outline` to
    // `border`, the anchor-only measurement still read 0 (the template's boxes
    // are border-box, so a border on a childless inline element moves nothing)
    // while a block container with children moved by 131 px. So the check
    // highlights ONE ELEMENT PER TAG KIND — containers included — through the
    // bridge's own highlight command, and takes the worst delta of all of them.
    const probes = (await frame.evaluate(`(() => {
      const wants = ["main", "section", "nav", "div", "ul", "li", "p", "h1", "h2", "a", "span", "button", "img"];
      const out = [];
      for (const tag of wants) {
        const el = document.querySelector('[data-wr-viewport="desktop"] ' + tag + '[data-wr-node]');
        if (el) out.push({ tag, node: el.getAttribute("data-wr-node"), children: el.children.length });
      }
      return out;
    })()`)) as Array<{ tag: string; node: string; children: number }>;
    let worstDelta = 0;
    let worstProbe = "";
    let countStable = true;
    for (const probe of probes) {
      await page.evaluate((node) => {
        const container = document.getElementById("wr-frame") as HTMLIFrameElement;
        container.contentWindow?.postMessage(
          { tag: "wr-authoring-editor", v: 1, type: "highlight", spec: { hover: { node, viewport: "desktop" } } },
          new URL(container.src).origin,
        );
      }, probe.node);
      await page.waitForTimeout(220);
      const snapshot = (await frame.evaluate(SNAPSHOT_EXPR)) as RectSnapshot;
      const delta = maxDelta(baselineB, snapshot);
      if (snapshot.count !== baselineB.count) countStable = false;
      if (delta > worstDelta) {
        worstDelta = delta;
        worstProbe = `${probe.tag}#${probe.node}(${probe.children} children)`;
      }
    }
    check(
      "28.P4.18 the hover overlay changes NO customer geometry: max delta exactly 0 over every element box plus the document metrics, for one probe per tag kind",
      worstDelta === 0 && countStable && probes.length >= 8,
      `${probes.length} probes (${probes.map((p) => p.tag).join(",")}), worst delta ${worstDelta}` +
        (worstProbe === "" ? "" : ` at ${worstProbe}`) +
        `, ${baselineB.count} elements + 6 document metrics`,
    );

    const attributesAdded = await frame.evaluate(() => {
      let stamped = 0;
      for (const el of Array.from(document.querySelectorAll("*"))) {
        for (const attr of Array.from(el.attributes)) {
          if (attr.name.startsWith("data-wr-editor") || attr.name === "data-wr-slot") stamped++;
        }
      }
      const style = document.querySelector('style[data-wr-editor-style="1"]');
      return { stamped, styleInHead: style?.parentElement?.tagName.toLowerCase() ?? null };
    });
    check(
      "28.P4.19 the highlight sets ZERO attributes on customer elements and lives in <head>, not in the customer subtree",
      attributesAdded.stamped === 1 && attributesAdded.styleInHead === "head",
      JSON.stringify(attributesAdded),
    );

    // mobile: the same measurement at 390 CSS px
    await page.click("#wr-vp-mobile");
    await page.waitForTimeout(600);
    const mobileBase = (await frame.evaluate(SNAPSHOT_EXPR)) as RectSnapshot;
    const mobileProbes = (await frame.evaluate(`(() => {
      const wants = ["main", "section", "nav", "div", "ul", "li", "p", "h1", "h2", "a", "span", "button", "img"];
      const out = [];
      for (const tag of wants) {
        const el = document.querySelector('[data-wr-viewport="mobile"] ' + tag + '[data-wr-node]');
        if (el) out.push({ tag, node: el.getAttribute("data-wr-node") });
      }
      return out;
    })()`)) as Array<{ tag: string; node: string }>;
    let mobileWorst = 0;
    for (const probe of mobileProbes) {
      await page.evaluate((node) => {
        const container = document.getElementById("wr-frame") as HTMLIFrameElement;
        container.contentWindow?.postMessage(
          { tag: "wr-authoring-editor", v: 1, type: "highlight", spec: { hover: { node, viewport: "mobile" } } },
          new URL(container.src).origin,
        );
      }, probe.node);
      await page.waitForTimeout(200);
      mobileWorst = Math.max(mobileWorst, maxDelta(mobileBase, (await frame.evaluate(SNAPSHOT_EXPR)) as RectSnapshot));
    }
    check(
      "28.P4.20 the same measurement at the mobile profile (390 CSS px) is also exactly 0",
      mobileWorst === 0 && mobileProbes.length >= 8,
      `${mobileProbes.length} probes, worst delta ${mobileWorst} over ${mobileBase.count} elements`,
    );
    await page.click("#wr-vp-desktop");
    await page.waitForTimeout(500);

    // -----------------------------------------------------------------------
    section("4. click → slot, and one edit updating every binding");
    // -----------------------------------------------------------------------
    const routeBefore = frame.url();
    await target.click();
    const candidatesShown = await waitForPanel(page, "This element renders 2 slots");
    check(
      "28.P4.21 clicking a 2-slot anchor shows BOTH candidates instead of silently picking one",
      candidatesShown && (await panelText(page)).includes(TEXT_KEY) && (await panelText(page)).includes(URL_KEY),
      (await panelText(page)).slice(0, 160),
    );
    check(
      "28.P4.22 select mode stops the click from NAVIGATING the preview away from the edited route",
      frame.url() === routeBefore,
      `${routeBefore} → ${frame.url()}`,
    );

    await page.locator("#wr-panel .row", { hasText: TEXT_KEY }).first().click();
    const opened = await waitForPanel(page, "rendered bindings");
    check(
      "28.P4.23 choosing a candidate opens the Slot inspector with its canonical role, key and binding count",
      opened &&
        (await panelText(page)).includes("navigation.label") &&
        (await panelText(page)).includes(TEXT_KEY) &&
        /16 rendered bindings/.test(await panelText(page)),
      (await panelText(page)).slice(0, 200),
    );

    // The multi-binding slot, on its own page.
    frame = await gotoRoute(page, editor.previewBaseUrl, "/plan");
    // n000086 on /plan is a <p>Projects</p> inside a panel that is not on
    // screen at rest. The click is DISPATCHED rather than synthesized so the
    // test does not depend on scroll position — it still travels the real
    // path: the bridge's capture listener, postMessage, /api/resolve, panel.
    const multiTarget = page
      .frameLocator("#wr-frame")
      .locator("[data-wr-viewport='desktop'] p[data-wr-node='n000086']")
      .first();
    await multiTarget.waitFor({ state: "attached", timeout: 20_000 });
    await multiTarget.dispatchEvent("click");
    await requirePanel(page, "rendered bindings", "28.P4.24 setup (/plan multi-binding element)");
    let panel = await panelText(page);
    if (!panel.includes(MULTI_KEY)) {
      await page.locator("#wr-panel .row", { hasText: MULTI_KEY }).first().click();
      await waitForPanel(page, "rendered bindings");
      panel = await panelText(page);
    }
    check(
      "28.P4.24 the multi-binding Slot shows '5 rendered bindings' and '3 in this view' — desktop + mobile + a dynamic portal",
      panel.includes(MULTI_KEY) && panel.includes("5 rendered bindings") && panel.includes("3 in this view"),
      panel.slice(0, 220),
    );

    const beforeHtml = await (await fetch(`${editor.previewBaseUrl}/plan`)).text();
    const multiValue = `WR28 다중바인딩 ${Date.now()}`;
    const revisionsBeforeMulti = await revisionCount();
    await page.locator("#wr-panel textarea").first().fill(multiValue);
    await page.click("#wr-panel button.on");
    await page.waitForFunction(() => (document.getElementById("wr-status")?.textContent ?? "").startsWith("saved"), undefined, { timeout: 20_000 });
    const afterHtml = await (await fetch(`${editor.previewBaseUrl}/plan`)).text();
    const servedOccurrences = afterHtml.split(multiValue).length - 1;
    check(
      "28.P4.25 ONE edit rewrote EVERY bound occurrence — the served page carries the new value on both viewports and in the dynamic template",
      !beforeHtml.includes(multiValue) && servedOccurrences >= 5,
      `${servedOccurrences} occurrences in the served /plan (was 0)`,
    );
    frame = await previewFrame(page, editor.previewBaseUrl);
    await page.waitForTimeout(800);
    const domOccurrences = await frame.evaluate((value) => document.body.innerHTML.split(value).length - 1, multiValue);
    check(
      "28.P4.26 …and a REAL browser renders it in both the desktop and the mobile tree",
      domOccurrences >= 4,
      `${domOccurrences} DOM occurrences`,
    );
    check(
      "28.P4.27 that Save appended exactly ONE authored revision",
      (await revisionCount()) === revisionsBeforeMulti + 1,
      `${revisionsBeforeMulti} → ${await revisionCount()}`,
    );

    // -----------------------------------------------------------------------
    section("5. inspectors: url, image, logo, theme");
    // -----------------------------------------------------------------------
    frame = await gotoRoute(page, editor.previewBaseUrl, "/");
    await page
      .frameLocator("#wr-frame")
      .locator(`[data-wr-viewport='desktop'] [data-wr-node='${NAV_NODE}']`)
      .first()
      .click();
    await requirePanel(page, "This element renders 2 slots", "28.P4.28 setup (nav anchor candidates)");
    await page.locator("#wr-panel .row", { hasText: URL_KEY }).first().click();
    await requirePanel(page, "Button group", "28.P4.28 setup (URL slot inspector)");
    // This nav item IS a group (label + href), so the URL lives in the group
    // form's DESTINATION field — the label textareas are a different slot.
    const urlValue = `/wr28-editor-${Date.now()}`;
    await page.locator("#wr-panel input[type=text]").first().fill(urlValue);
    await page.locator("#wr-panel button.on").first().click();
    await page.waitForFunction(() => (document.getElementById("wr-status")?.textContent ?? "").startsWith("saved"), undefined, { timeout: 20_000 });
    const urlHtml = await (await fetch(`${editor.previewBaseUrl}/`)).text();
    const urlProject = (await loadReleaseProject(PROJECT)).project;
    check(
      "28.P4.28 a URL slot edit is written as an href, not as text, and lands on the href slot — not on its label sibling",
      urlHtml.includes(`href="${urlValue}"`) &&
        urlProject.authored.slotValues[URL_KEY] === urlValue &&
        urlProject.authored.slotValues[TEXT_KEY] !== urlValue,
      urlHtml.includes(urlValue) ? "present but not as an href" : "absent",
    );

    // CTA group: one Save, N independent slots.
    const ctaSlots = (await loadEditorSite(PROJECT)).index.slotsByGroupId.get(CTA_GROUP) ?? [];
    const ctaResponse = await fetch(`${editor.baseUrl}/api/slot?key=${encodeURIComponent(`${CTA_GROUP}.label.01`)}&pageId=p000001&viewport=desktop`);
    const ctaInspector = (await ctaResponse.json()) as { group: { memberCount: number; labels: unknown[]; href: unknown } };
    check(
      "28.P4.29 the CTA inspector groups a real 3-member group (1 href + 2 label segments) from its groupId",
      ctaSlots.length === 3 && ctaInspector.group.memberCount === 3 && ctaInspector.group.labels.length === 2 && ctaInspector.group.href !== null,
      JSON.stringify({ slots: ctaSlots.map((s) => s.key), members: ctaInspector.group.memberCount }),
    );

    // Image inspector + replacement, through the API the UI calls.
    const replacementFile = path.join(UPLOADS, "wr28-editor-replacement.png");
    await writeFile(replacementFile, png(37, 53, [12, 200, 90]));
    const revisionsBeforeImage = await revisionCount();
    const imageResponse = await fetch(`${editor.baseUrl}/api/asset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slotKey: IMAGE_KEY, file: replacementFile, alt: "WR28 replacement" }),
    });
    const imageResult = (await imageResponse.json()) as { changed: boolean; assetId: string; served: string[] };
    const projectAfterImage = (await loadReleaseProject(PROJECT)).project;
    check(
      "28.P4.30 an image replacement is recorded in authored.assets under the materialization's OWN assetId, and appends a revision",
      imageResult.changed &&
        imageResult.assetId.startsWith("ai") &&
        imageResult.served.length > 0 &&
        projectAfterImage.authored.assets?.[imageResult.assetId]?.file === replacementFile &&
        (await revisionCount()) === revisionsBeforeImage + 1,
      JSON.stringify(imageResult),
    );
    const mediaBytes = Buffer.from(
      await (await fetch(`${editor.previewBaseUrl}/media/${imageResult.served[0]}`)).arrayBuffer(),
    );
    check(
      "28.P4.31 …and the preview immediately serves the replacement BYTES with no stage rerun and no rebuild",
      mediaBytes.equals(png(37, 53, [12, 200, 90])),
      `${mediaBytes.length} bytes served`,
    );

    // Theme: a token override, live, then saved.
    const themeBeforeVar = await frame.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--wr-theme-color-accent-primary").trim(),
    );
    const themeValue = "rgb(9, 11, 13)";
    await page.click("#wr-tab-theme");
    await requirePanel(page, "theme-contract-v1 tokens", "28.P4.32 setup (theme panel)");
    const accentInput = page.locator("#wr-panel input[placeholder]").nth(
      (await page.locator("#wr-panel .kv").allTextContents()).findIndex((t) => t.startsWith("color.accent.primary")),
    );
    await accentInput.fill(themeValue);
    await page.waitForTimeout(1_200);
    let themeVisible = true;
    await frame
      .waitForFunction(
        (expected) =>
          getComputedStyle(document.documentElement).getPropertyValue("--wr-theme-color-accent-primary").trim() === expected,
        themeValue,
        { timeout: 20_000 },
      )
      .catch(() => {
        themeVisible = false;
      });
    check(
      "28.P4.32 a theme TOKEN override repaints the live preview with no navigation and no rebuild",
      themeVisible && themeBeforeVar !== themeValue,
      `before=${themeBeforeVar}`,
    );
    const revisionsBeforeTheme = await revisionCount();
    await page.locator("#wr-panel button.on", { hasText: "Save theme" }).click();
    await page.waitForFunction(() => (document.getElementById("wr-status")?.textContent ?? "").includes("theme saved"), undefined, { timeout: 20_000 });
    const themedProject = (await loadReleaseProject(PROJECT)).project;
    check(
      "28.P4.33 Save writes the token into authored.theme and appends exactly one revision",
      themedProject.authored.theme.tokens?.["color.accent.primary"] === themeValue &&
        (await revisionCount()) === revisionsBeforeTheme + 1,
      JSON.stringify(themedProject.authored.theme),
    );

    // Logo / brand: whole-host replacement, recorded as a decision.
    await page.click("#wr-tab-logo");
    const brandShown = await waitForPanel(page, "Source brand surfaces", 120_000);
    const brandPanel = (await (await fetch(`${editor.baseUrl}/api/brand`)).json()) as {
      rows: Array<{ surfaceId: string; surface: string; resolvable: boolean }>;
      resolvableSurfaces: string[];
    };
    const logoRow = brandPanel.rows.find((row) => row.surface === "svg-aria-label" && row.resolvable);
    const revisionsBeforeBrand = await revisionCount();
    const brandResponse = await fetch(`${editor.baseUrl}/api/brand`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        surfaceId: logoRow?.surfaceId,
        decision: "REPLACE",
        replacement: { file: replacementFile },
        note: "wr28 editor smoke",
      }),
    });
    const brandResult = (await brandResponse.json()) as { changed: boolean; note: string };
    const brandedProject = (await loadReleaseProject(PROJECT)).project;
    check(
      "28.P4.34 the Logo inspector lists the Phase-2 resolvable brand surfaces and records a WHOLE-HOST decision",
      brandShown &&
        logoRow !== undefined &&
        brandPanel.resolvableSurfaces.includes("svg-aria-label") &&
        brandResult.changed &&
        brandedProject.authored.brand?.[logoRow.surfaceId]?.decision === "REPLACE" &&
        (await revisionCount()) === revisionsBeforeBrand + 1,
      JSON.stringify({ surfaceId: logoRow?.surfaceId, rows: brandPanel.rows.length }),
    );
    check(
      "28.P4.35 …and it says plainly that a brand decision is applied by the BAKE, not by this preview",
      brandResult.note.includes("PRODUCTION BAKE"),
      brandResult.note,
    );
    const brandRefusal = await fetch(`${editor.baseUrl}/api/brand`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ surfaceId: logoRow?.surfaceId, decision: "PRESERVE" }),
    });
    check(
      "28.P4.36 a PRESERVE with no reason is REFUSED by the authored-state schema, not silently accepted",
      brandRefusal.status === 400,
      `HTTP ${brandRefusal.status}`,
    );

    // Region panel.
    const regionPanel = (await (await fetch(`${editor.baseUrl}/api/regions?pageId=p000001&viewport=desktop`)).json()) as {
      available: boolean;
      rows: Array<{
        regionId: string;
        routesOnThisPage: string[];
        pages: string[];
        slotCount: number;
        enablement: { enabled: boolean | null; editable: boolean; source: string };
      }>;
      enablementWired: boolean;
      enablementSeam: string;
    };
    check(
      "28.P4.37 the Region panel reports regionId, route ownership, shared-page ownership, slot count and enablement state",
      regionPanel.available &&
        regionPanel.rows.length > 0 &&
        regionPanel.rows.every((row) => row.regionId.length > 0 && row.routesOnThisPage.length > 0) &&
        regionPanel.rows.some((row) => row.pages.length > 1) &&
        regionPanel.rows.every((row) => row.enablement.enabled !== undefined) &&
        regionPanel.enablementSeam.includes("RegionEnablementPort"),
      `${regionPanel.rows.length} regions, wired=${regionPanel.enablementWired}`,
    );

    // -----------------------------------------------------------------------
    section("6. revisions: debounce, save boundary, undo");
    // -----------------------------------------------------------------------
    await page.click("#wr-tab-slot");
    frame = await gotoRoute(page, editor.previewBaseUrl, "/");
    await page
      .frameLocator("#wr-frame")
      .locator(`[data-wr-viewport='desktop'] [data-wr-node='${NAV_NODE}']`)
      .first()
      .click();
    await requirePanel(page, "This element renders 2 slots", "28.P4.38 setup (nav anchor candidates)");
    await page.locator("#wr-panel .row", { hasText: TEXT_KEY }).first().click();
    await requirePanel(page, "rendered bindings", "28.P4.38 setup (text slot inspector)");

    const revisionsBeforeTyping = await revisionCount();
    const typed = "WR28에디터";
    await page.locator("#wr-panel textarea").first().click();
    await page.locator("#wr-panel textarea").first().fill("");
    for (const character of typed) {
      await page.keyboard.type(character);
      await page.waitForTimeout(120);
    }
    await page.waitForTimeout(1_500);
    const typedServed = await (await fetch(`${editor.previewBaseUrl}/`)).text();
    const typedProject = (await loadReleaseProject(PROJECT)).project;
    check(
      "28.P4.38 typing writes NO revision and NO project state — the debounced keystroke updates the PREVIEW only",
      (await revisionCount()) === revisionsBeforeTyping &&
        typedServed.includes(typed) &&
        typedProject.authored.slotValues[TEXT_KEY] !== typed,
      `${revisionsBeforeTyping} → ${await revisionCount()} after ${typed.length} keystrokes; ` +
        `served=${typedServed.includes(typed)} committed=${String(typedProject.authored.slotValues[TEXT_KEY])}`,
    );
    await page.click("#wr-panel button.on");
    await page.waitForFunction(() => (document.getElementById("wr-status")?.textContent ?? "").startsWith("saved"), undefined, { timeout: 20_000 });
    check(
      "28.P4.39 …and the single Save that follows those keystrokes appends exactly ONE revision",
      (await revisionCount()) === revisionsBeforeTyping + 1,
      `${revisionsBeforeTyping} → ${await revisionCount()}`,
    );
    let textVisible = true;
    await page
      .frameLocator("#wr-frame")
      .locator(`text=${typed}`)
      .first()
      .waitFor({ timeout: 20_000 })
      .catch(() => {
        textVisible = false;
      });
    check("28.P4.40 the saved text is visible in a REAL browser", textVisible);

    const revisionsBeforeNoop = await revisionCount();
    await page.click("#wr-panel button.on");
    await page.waitForFunction(() => (document.getElementById("wr-status")?.textContent ?? "").includes("no change"), undefined, { timeout: 20_000 });
    check(
      "28.P4.41 re-saving the identical value writes NOTHING and appends NO revision",
      (await revisionCount()) === revisionsBeforeNoop,
      `${revisionsBeforeNoop} → ${await revisionCount()}`,
    );

    const chainBeforeUndo = await loadRevisionChain(PROJECT);
    await page.click("#wr-undo");
    await page.waitForFunction(() => (document.getElementById("wr-status")?.textContent ?? "").includes("restored"), undefined, { timeout: 20_000 });
    const chainAfterUndo = await loadRevisionChain(PROJECT);
    const undoHead = chainAfterUndo[chainAfterUndo.length - 1];
    const undoTarget = chainBeforeUndo[chainBeforeUndo.length - 2];
    check(
      "28.P4.42 Undo APPENDS a restored state — the earlier revision is untouched and the chain only grows",
      chainAfterUndo.length === chainBeforeUndo.length + 1 &&
        undoHead.origin === "restore" &&
        undoHead.restoredFrom === undoTarget.revisionId &&
        undoHead.authoredStateHash === undoTarget.authoredStateHash &&
        JSON.stringify(chainAfterUndo.slice(0, chainBeforeUndo.length)) === JSON.stringify(chainBeforeUndo),
      JSON.stringify({ before: chainBeforeUndo.length, after: chainAfterUndo.length, restoredFrom: undoHead.restoredFrom }),
    );
    const revertedProject = (await loadReleaseProject(PROJECT)).project;
    check(
      "28.P4.43 …and the undone value is actually gone from the authoritative authored state",
      revertedProject.authored.slotValues[TEXT_KEY] !== typed,
      String(revertedProject.authored.slotValues[TEXT_KEY]),
    );

    // -----------------------------------------------------------------------
    section("7. security, DOM purity, browser health");
    // -----------------------------------------------------------------------
    const roguePage = await context.newPage();
    roguePage.on("pageerror", (error) => record(error.message));
    await roguePage.goto(`http://127.0.0.1:${roguePort}/`, { waitUntil: "domcontentloaded" });
    await roguePage.waitForTimeout(2_500);
    await roguePage.evaluate(() =>
      (window as unknown as { __send: (m: unknown) => void }).__send({
        tag: "wr-authoring-editor",
        v: 1,
        type: "highlight",
        spec: { hover: { node: "n000027", viewport: "desktop" } },
      }),
    );
    await roguePage.waitForTimeout(800);
    const rogueInbox = (await roguePage.evaluate(
      () => (window as unknown as { __received: unknown[] }).__received,
    )) as Array<{ origin: string; type: string }>;
    const rogueHighlight = await roguePage
      .frameLocator("#f")
      .locator('style[data-wr-editor-style="1"]')
      .count();
    check(
      "28.P4.44 an un-allowlisted origin receives NOTHING and cannot command the bridge",
      rogueInbox.length === 0 && rogueHighlight === 0,
      `${rogueInbox.length} messages, ${rogueHighlight} highlight styles`,
    );
    await roguePage.close();

    const slotAttributes = await frame.evaluate(() => document.querySelectorAll("[data-wr-slot]").length);
    const previewHtml = await (await fetch(`${editor.previewBaseUrl}/`)).text();
    check(
      "28.P4.45 the editor adds NO data-wr-slot attribute — DOM identity stays data-wr-node / data-wr-dyn-node",
      slotAttributes === 0 && !previewHtml.includes("data-wr-slot"),
      `${slotAttributes} elements`,
    );

    await page.waitForTimeout(1_200);
    check("28.P4.46 browser runtime errors: 0", jsErrors.length === 0, JSON.stringify(jsErrors.slice(0, 3)));
    check("28.P4.47 hydration errors: 0", hydrationErrors.length === 0, JSON.stringify(hydrationErrors.slice(0, 3)));

    // -----------------------------------------------------------------------
    section("8. the AI rewrite contract");
    // -----------------------------------------------------------------------
    const rewriteResponse = await fetch(`${editor.baseUrl}/api/ai-rewrite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: { kind: "slot", slotKey: "changelog.main.cta.now.label" },
        route: "/changelog",
        provider: "fake",
      }),
    });
    const proposal = (await rewriteResponse.json()) as {
      provider: string;
      proposed: Record<string, unknown>;
      outOfScope: string[];
      context: {
        brief: { rawIntent: string; source: string };
        sitePlan: { siteIdentity: { workingName: string } } | null;
        region: unknown;
        units: unknown[];
        slotKeysInScope: string[];
        constraintsIncluded: number;
        request: { policyId: string; instructions: string[] };
      };
    };
    const revisionsBeforeRewrite = await revisionCount();
    check(
      "28.P4.48 the AI-rewrite request carries the customer brief, the SiteContentPlan, the route, the Content Units and the slot constraints",
      proposal.context.brief.rawIntent.length > 0 &&
        proposal.context.sitePlan !== null &&
        proposal.context.units.length > 0 &&
        proposal.context.slotKeysInScope.length > 0 &&
        proposal.context.constraintsIncluded > 0 &&
        proposal.context.request.policyId === "content-policy-v1" &&
        proposal.context.request.instructions.length > 0,
      JSON.stringify({
        units: proposal.context.units.length,
        keys: proposal.context.slotKeysInScope,
        constraints: proposal.context.constraintsIncluded,
      }),
    );
    check(
      "28.P4.49 the response is KEYED STRUCTURED SLOT VALUES, every key is in scope, and NOTHING is applied by the call",
      Object.keys(proposal.proposed).length > 0 &&
        Object.keys(proposal.proposed).every((key) => proposal.context.slotKeysInScope.includes(key)) &&
        Object.values(proposal.proposed).every((value) => typeof value === "string") &&
        proposal.outOfScope.length === 0 &&
        (await revisionCount()) === revisionsBeforeRewrite,
      JSON.stringify(proposal.proposed),
    );
    const regionRewrite = await fetch(`${editor.baseUrl}/api/ai-rewrite`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope: { kind: "region", regionId: regionPanel.rows.find((r) => r.slotCount > 3)?.regionId },
        route: "/",
        provider: "fake",
      }),
    });
    const regionProposal = (await regionRewrite.json()) as {
      proposed: Record<string, unknown>;
      context: { region: { regionId: string; slotCount: number } | null };
    };
    check(
      "28.P4.50 a PageRegion rewrite is scoped by that region's own slot keys and returns one keyed value per slot",
      regionRewrite.status === 200 &&
        regionProposal.context.region !== null &&
        Object.keys(regionProposal.proposed).length > 0,
      JSON.stringify({
        region: regionProposal.context.region?.regionId,
        proposed: Object.keys(regionProposal.proposed).length,
      }),
    );
  } finally {
    if (browser !== undefined) await browser.close();
    if (rogue !== undefined) await stopServer(rogue);
    await editor.stop();
  }

  console.log(`\nsmoke:visual-editor — ${checks} checks, ${failures} failures`);
  if (failures > 0) process.exit(1);
}

main().catch((error) => {
  console.error("\nsmoke:visual-editor CRASHED —", error);
  process.exit(1);
});
