/**
 * Guarded source patches for the AUTHORING PREVIEW copy of a template app
 * (Task 28 Phase 3).
 *
 * Same discipline as src/production/patch.ts: every patch is anchored on the
 * exact generated text and FAILS LOUDLY when the anchor is missing, ambiguous
 * or already applied. A template compiled by a future generator version must
 * break here, never silently produce a preview that lies about what it serves.
 *
 * WHY A PATCH AT ALL. The generated runtime memoizes the whole content
 * contract for the process lifetime (`contractPromise`) and caches each parsed
 * page tree AFTER `applySlotContent()` has already mutated it. Writing a new
 * WR_SLOT_VALUES_FILE therefore has ZERO effect on a running `next start` —
 * the generated file's own doc comment says so: "change a value, restart the
 * server". These two patches add an authoring EPOCH that invalidates both
 * caches, and nothing else.
 *
 * WHERE IT IS APPLIED. Only to a COPY of the template app, under
 * data/<host>/authoring-previews/<previewId>/app. The immutable template run
 * is never written to, and the production compiler copies from the template
 * run — so the production bake can never see this code. That separation, not
 * a runtime flag, is what keeps the production path byte-identical; the
 * WR_AUTHORING_HOT gate below is the second line of defence.
 *
 * WHY A SEPARATE ENV VAR FOR THE EPOCH. The epoch is read from
 * WR_AUTHORING_EPOCH_FILE, never from WR_SLOT_VALUES_FILE. Reusing the latter
 * would leave a second `process.env.WR_SLOT_VALUES_FILE` occurrence in the
 * file, which src/production/patch.ts's `patchSlotContent` doctrine comment
 * ("No environment variable is consulted") would then textually contradict if
 * a patched copy were ever baked.
 *
 * WHY THE EPOCH IS A FILE'S CONTENT, NOT ITS (mtime,size). Two writes in the
 * same millisecond with the same byte length would not move an (mtime,size)
 * epoch. The epoch file holds a monotonic token as its entire content and is
 * written AFTER the overlay file, so a reader that sees a new epoch is
 * guaranteed to read the new overlay.
 */

export const AUTHORING_PATCH_VERSION = 1;

/** Present in every patched file — the marker the bake proof greps for. */
export const AUTHORING_PATCH_MARKER = "WR_AUTHORING_HOT";

export const AUTHORING_HOT_ENV = "WR_AUTHORING_HOT";
export const AUTHORING_EPOCH_ENV = "WR_AUTHORING_EPOCH_FILE";

function requireOnce(source: string, anchor: string, file: string): void {
  const first = source.indexOf(anchor);
  if (first === -1) {
    throw new Error(`authoring preview patch anchor not found in ${file}: ${JSON.stringify(anchor.slice(0, 80))}`);
  }
  if (source.indexOf(anchor, first + 1) !== -1) {
    throw new Error(`authoring preview patch anchor ambiguous in ${file}: ${JSON.stringify(anchor.slice(0, 80))}`);
  }
}

function requireAbsent(source: string, marker: string, file: string): void {
  if (source.includes(marker)) {
    throw new Error(`authoring preview patch already applied in ${file} (found ${JSON.stringify(marker)})`);
  }
}

const SLOT_CONTENT_ANCHOR =
  "function getContract(): Promise<Map<string, ResolvedOp[]>> {\n" +
  "  if (!contractPromise) contractPromise = buildContract();\n" +
  "  return contractPromise;\n" +
  "}";

const SLOT_CONTENT_REPLACEMENT = `/**
 * Task 28 authoring preview — hot content seam. GENERATED PATCH.
 *
 * Dead unless ${AUTHORING_HOT_ENV}=1 (the production bake never sets it, and
 * the production compiler never copies this file). When on,
 * ${AUTHORING_EPOCH_ENV} names a tiny file whose entire CONTENT is the
 * authoring epoch, written by the preview server AFTER the overlay file. A
 * changed epoch drops the memoized contract; load-page keys its applied trees
 * on the same epoch. Nothing is patched on the client.
 */
const AUTHORING_HOT = process.env.${AUTHORING_HOT_ENV} === "1";
const AUTHORING_EPOCH_FILE = process.env.${AUTHORING_EPOCH_ENV};

let contractEpoch: string | null = null;

/** Current authoring epoch. Invalidates the memoized contract when it moves. */
export async function slotContentEpoch(): Promise<string> {
  if (!AUTHORING_HOT || AUTHORING_EPOCH_FILE === undefined) return "";
  let epoch: string;
  try {
    epoch = (await readFile(path.resolve(process.cwd(), AUTHORING_EPOCH_FILE), "utf8")).trim();
  } catch {
    epoch = "missing";
  }
  if (epoch !== contractEpoch) {
    contractEpoch = epoch;
    contractPromise = null;
  }
  return epoch;
}

function getContract(): Promise<Map<string, ResolvedOp[]>> {
  if (!contractPromise) contractPromise = buildContract();
  return contractPromise;
}`;

/** src/runtime/slot-content.ts — add the epoch-gated contract invalidation. */
export function patchSlotContentForAuthoring(source: string): string {
  // "already applied" is checked FIRST: a re-application would otherwise fail
  // on a rewritten anchor and report a missing anchor, which is the wrong
  // diagnosis for the caller.
  requireAbsent(source, AUTHORING_PATCH_MARKER, "src/runtime/slot-content.ts");
  requireOnce(source, SLOT_CONTENT_ANCHOR, "src/runtime/slot-content.ts");
  requireOnce(source, "let contractPromise: Promise<Map<string, ResolvedOp[]>> | null = null;", "src/runtime/slot-content.ts");
  requireOnce(source, 'import { readFile } from "node:fs/promises";', "src/runtime/slot-content.ts");
  requireOnce(source, "  const overlayFile = process.env.WR_SLOT_VALUES_FILE;", "src/runtime/slot-content.ts");
  return source.replace(SLOT_CONTENT_ANCHOR, SLOT_CONTENT_REPLACEMENT);
}

const LOAD_PAGE_IMPORT_ANCHOR = 'import { applySlotContent } from "./slot-content";';

const LOAD_PAGE_ANCHOR = `export function loadPage(pageFile: string): Promise<RuntimePage> {
  let pending = cache.get(pageFile);
  if (!pending) {
    const file = resolveInsideDataDir(pageFile);
    pending = readFile(file, "utf8")
      .then((raw) => JSON.parse(raw) as RuntimePage)
      .then((page) => applySlotContent(page));
    cache.set(pageFile, pending);
  }
  return pending;
}`;

const LOAD_PAGE_REPLACEMENT = `/**
 * Task 28 authoring preview — hot page seam. GENERATED PATCH.
 *
 * Dead unless ${AUTHORING_HOT_ENV}=1; the untouched loader below is what runs
 * otherwise, byte-for-byte. When on, the raw page JSON is parsed ONCE per
 * process and the APPLIED tree is keyed on pageFile|epoch. A fresh JSON.parse
 * per epoch is required, not an optimisation: applySlotContent mutates the
 * tree in place and its own expectedValue guard would refuse a second
 * application to an already-written tree.
 */
const AUTHORING_HOT = process.env.${AUTHORING_HOT_ENV} === "1";

const rawCache = new Map<string, Promise<string>>();
const hotCache = new Map<string, Promise<RuntimePage>>();

function loadRawPage(pageFile: string): Promise<string> {
  let pending = rawCache.get(pageFile);
  if (!pending) {
    pending = readFile(resolveInsideDataDir(pageFile), "utf8");
    rawCache.set(pageFile, pending);
  }
  return pending;
}

async function loadPageHot(pageFile: string): Promise<RuntimePage> {
  const epoch = await slotContentEpoch();
  const key = pageFile + "|" + epoch;
  let pending = hotCache.get(key);
  if (!pending) {
    // Authoring keeps exactly one live epoch per page — drop the others.
    for (const existing of [...hotCache.keys()]) {
      if (existing.startsWith(pageFile + "|")) hotCache.delete(existing);
    }
    pending = loadRawPage(pageFile)
      .then((raw) => JSON.parse(raw) as RuntimePage)
      .then((page) => applySlotContent(page));
    hotCache.set(key, pending);
  }
  return pending;
}

export function loadPage(pageFile: string): Promise<RuntimePage> {
  if (AUTHORING_HOT) return loadPageHot(pageFile);
  let pending = cache.get(pageFile);
  if (!pending) {
    const file = resolveInsideDataDir(pageFile);
    pending = readFile(file, "utf8")
      .then((raw) => JSON.parse(raw) as RuntimePage)
      .then((page) => applySlotContent(page));
    cache.set(pageFile, pending);
  }
  return pending;
}`;

/** src/runtime/load-page.ts — epoch-keyed applied-tree cache. */
export function patchLoadPageForAuthoring(source: string): string {
  requireAbsent(source, AUTHORING_PATCH_MARKER, "src/runtime/load-page.ts");
  requireOnce(source, LOAD_PAGE_IMPORT_ANCHOR, "src/runtime/load-page.ts");
  requireOnce(source, LOAD_PAGE_ANCHOR, "src/runtime/load-page.ts");
  return source
    .replace(LOAD_PAGE_IMPORT_ANCHOR, 'import { applySlotContent, slotContentEpoch } from "./slot-content";')
    .replace(LOAD_PAGE_ANCHOR, LOAD_PAGE_REPLACEMENT);
}

/** True when a file already carries the authoring patch. */
export function isAuthoringPatched(source: string): boolean {
  return source.includes(AUTHORING_PATCH_MARKER);
}
