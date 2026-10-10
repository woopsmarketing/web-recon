import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { AssetRegistryDocSchema } from "../assets/assets";

/**
 * Site starters — data/site-starters/<templateId>/ (see data/site-starters/README.md).
 *
 * A starter is the content a brand-new site of one Template begins with: the site documents a
 * person would otherwise write by hand (settings, slots, theme, business, banners, the design
 * images), with TOKENS where a value comes from the provisioning spec. It is also the allowlist:
 * a site can be provisioned only for a template that has a starter, and only with a release the
 * starter lists.
 *
 *   starter.json            { "schema": "site-starter@1", "templateId": "…", "releaseIds": ["…"] }
 *   settings.json           required
 *   slots.json              optional
 *   theme.json              optional
 *   content/business.json   required
 *   content/banners.json    optional
 *   assets/registry.json    required, + exactly the image files it lists
 *
 * Anything else in the directory is refused (a starter never carries a portfolio, reviews, a site
 * identity, a widget key or an endpoint — those are written by scaffold.ts from the spec).
 *
 * TOKENS are resolved on the PARSED documents, value by value — the raw text of a file is never
 * searched and replaced, so a brand name with quotes, backslashes or "${…}" cannot change the
 * structure of a document; JSON.stringify writes it.
 *
 *   "… {{brandName}} …"                              inside any string value
 *   {{brandName}} {{phone}} {{phoneHref}} {{email}}  the closed set
 *   { "$if": "phone", "then": <value> }              the value when the spec has a phone; otherwise the
 *   { "$if": "email", "then": <value>, "else": … }   key (or array element) is LEFT OUT, or `else` is used
 *
 * {{phone}} / {{phoneHref}} / {{email}} may only appear inside the matching `$if`: a starter can
 * not print a contact detail the spec does not have, and nothing is ever invented in its place.
 */

export const STARTERS_DIR = "data/site-starters";
export const STARTER_FILE = "starter.json";
export const STARTER_SCHEMA = "site-starter@1";

const Id = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64);
export const StarterDocSchema = z
  .object({
    schema: z.literal(STARTER_SCHEMA),
    templateId: Id,
    releaseIds: z.array(z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*-\d+\.\d+\.\d+-[0-9a-f]{12}$/)).min(1),
  })
  .strict();

export class StarterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StarterError";
  }
}

export interface Starter {
  templateId: string;
  releaseIds: string[];
  /** absolute directory of the starter */
  dir: string;
}

/** The documents a starter may hold (path → required). The site's other documents are written from the spec. */
export const STARTER_DOCUMENTS: Readonly<Record<string, boolean>> = {
  "settings.json": true,
  "slots.json": false,
  "theme.json": false,
  "content/business.json": true,
  "content/banners.json": false,
  "assets/registry.json": true,
};

export function starterDir(repoRoot: string, templateId: string): string {
  if (!Id.safeParse(templateId).success) throw new StarterError(`invalid templateId "${templateId}"`);
  return path.join(repoRoot, STARTERS_DIR, templateId);
}

async function readJson(file: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    throw new StarterError(`cannot read ${file}: ${(error as Error).message}`);
  }
  try {
    return JSON.parse(text, (key, value) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") throw new StarterError(`forbidden key "${key}"`);
      return value;
    });
  } catch (error) {
    throw new StarterError(`${file}: ${error instanceof StarterError ? error.message : "not JSON"}`);
  }
}

/** The starter of a template, or undefined when the template has none. A starter that exists but is malformed throws. */
export async function loadStarter(repoRoot: string, templateId: string): Promise<Starter | undefined> {
  const dir = starterDir(repoRoot, templateId);
  const st = await lstat(path.join(dir, STARTER_FILE)).catch(() => undefined);
  if (!st?.isFile()) return undefined;
  const parsed = StarterDocSchema.safeParse(await readJson(path.join(dir, STARTER_FILE)));
  if (!parsed.success) throw new StarterError(`${STARTERS_DIR}/${templateId}/${STARTER_FILE} invalid: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
  if (parsed.data.templateId !== templateId) throw new StarterError(`${STARTERS_DIR}/${templateId}/${STARTER_FILE} declares templateId "${parsed.data.templateId}"`);
  return { templateId, releaseIds: parsed.data.releaseIds, dir };
}

/** Every starter of this checkout, by template id. */
export async function listStarters(repoRoot: string): Promise<Starter[]> {
  const root = path.join(repoRoot, STARTERS_DIR);
  const names = (await readdir(root, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory() && Id.safeParse(e.name).success).map((e) => e.name).sort();
  const out: Starter[] = [];
  for (const name of names) {
    const starter = await loadStarter(repoRoot, name);
    if (starter) out.push(starter);
  }
  return out;
}

// ------------------------------------------------------------------ tokens --

/** What a starter may print, taken from the spec. `null` = the spec does not have it: nothing is printed. */
export interface StarterValues {
  brandName: string;
  /** the number as shown and its tel: link */
  phone: { display: string; href: string } | null;
  email: string | null;
}

/**
 * The spec's phone as a starter prints it: shown as given (single spaces), linked as tel: with the
 * digits, the hyphens and a leading "+" only. No digit at all (null, "", "- -") = no phone.
 */
export function phoneOf(phone: string | null): StarterValues["phone"] {
  if (phone === null) return null;
  const display = phone.trim().replace(/\s+/g, " ");
  if (!/[0-9]/.test(display)) return null;
  const body = display.replace(/[^0-9-]/g, "").replace(/^-+/, "");
  return { display, href: `tel:${display.startsWith("+") ? "+" : ""}${body}` };
}

const CONDITIONS = ["phone", "email"] as const;
type Condition = (typeof CONDITIONS)[number];
const TOKEN_RE = /\{\{([A-Za-z]+)\}\}/g;
const OMIT = Symbol("omit");

function tokenValue(name: string, values: StarterValues, open: ReadonlySet<Condition>, where: string): string {
  switch (name) {
    case "brandName":
      return values.brandName;
    case "phone":
    case "phoneHref": {
      if (!open.has("phone") || !values.phone) throw new StarterError(`${where}: {{${name}}} is only allowed inside { "$if": "phone", … }`);
      return name === "phone" ? values.phone.display : values.phone.href;
    }
    case "email": {
      if (!open.has("email") || values.email === null) throw new StarterError(`${where}: {{email}} is only allowed inside { "$if": "email", … }`);
      return values.email;
    }
    default:
      throw new StarterError(`${where}: unknown token {{${name}}}`);
  }
}

function render(value: unknown, values: StarterValues, open: ReadonlySet<Condition>, where: string): unknown {
  if (typeof value === "string") {
    // one pass over the AUTHORED string: a substituted value is never scanned again
    return value.replace(TOKEN_RE, (_, name: string) => tokenValue(name, values, open, where));
  }
  if (Array.isArray(value)) {
    return value.map((v, i) => render(v, values, open, `${where}[${i}]`)).filter((v) => v !== OMIT);
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Object.hasOwn(record, "$if")) {
      const keys = Object.keys(record);
      const condition = record.$if;
      if (!CONDITIONS.includes(condition as Condition) || !Object.hasOwn(record, "then") || keys.some((k) => k !== "$if" && k !== "then" && k !== "else")) {
        throw new StarterError(`${where}: a conditional is { "$if": ${CONDITIONS.map((c) => `"${c}"`).join(" | ")}, "then": …, "else"?: … }`);
      }
      const met = condition === "phone" ? values.phone !== null : values.email !== null;
      if (met) return render(record.then, values, new Set([...open, condition as Condition]), `${where}.then`);
      return Object.hasOwn(record, "else") ? render(record.else, values, open, `${where}.else`) : OMIT;
    }
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(record)) {
      if (key.startsWith("$")) throw new StarterError(`${where}: unknown directive "${key}"`);
      const rendered = render(v, values, open, `${where}.${key}`);
      if (rendered !== OMIT) out[key] = rendered;
    }
    return out;
  }
  return value;
}

/** stand-in values for judging a branch the spec at hand does not take */
const PROBE: StarterValues = { brandName: "", phone: { display: "0", href: "tel:0" }, email: "probe@invalid.example" };

/**
 * The rules of a document, whatever the spec: EVERY branch is walked — also the one this spec does
 * not take — so a starter is valid or invalid as written, never "valid for sites without a phone".
 */
function validate(value: unknown, open: ReadonlySet<Condition>, where: string): void {
  if (typeof value === "string") {
    for (const m of value.matchAll(TOKEN_RE)) tokenValue(m[1]!, PROBE, open, where);
    return;
  }
  if (Array.isArray(value)) return value.forEach((v, i) => validate(v, open, `${where}[${i}]`));
  if (value === null || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (Object.hasOwn(record, "$if")) {
    const condition = record.$if;
    if (!CONDITIONS.includes(condition as Condition) || !Object.hasOwn(record, "then") || Object.keys(record).some((k) => k !== "$if" && k !== "then" && k !== "else")) {
      throw new StarterError(`${where}: a conditional is { "$if": ${CONDITIONS.map((c) => `"${c}"`).join(" | ")}, "then": …, "else"?: … }`);
    }
    validate(record.then, new Set([...open, condition as Condition]), `${where}.then`);
    if (Object.hasOwn(record, "else")) validate(record.else, open, `${where}.else`);
    return;
  }
  for (const [key, v] of Object.entries(record)) {
    if (key.startsWith("$")) throw new StarterError(`${where}: unknown directive "${key}"`);
    validate(v, open, `${where}.${key}`);
  }
}

/** One starter document with its tokens resolved. */
export function renderStarterDocument(doc: unknown, values: StarterValues, where: string): unknown {
  validate(doc, new Set(), where);
  const rendered = render(doc, values, new Set(), where);
  if (rendered === OMIT) throw new StarterError(`${where}: a whole document cannot be conditional`);
  return rendered;
}

// ---------------------------------------------------------------- rendering --

export interface RenderedStarter {
  /** site-relative path → the document, tokens resolved */
  documents: Map<string, unknown>;
  /** site-relative path ("assets/<file>") → absolute source file */
  assets: Map<string, string>;
}

async function walk(dir: string, rel = ""): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.name === ".DS_Store") continue;
    if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), r)));
    else if (e.isFile()) out.push(r);
    else throw new StarterError(`${r} is not a regular file (symlinks are refused)`);
  }
  return out;
}

/**
 * The starter's documents with their tokens resolved for one site, and the image files to copy.
 * Fails closed: an unknown file, a missing required document, an image the registry does not list
 * (or lists and does not have), or anything starterProblems() finds.
 */
export async function renderStarter(starter: Starter, values: StarterValues): Promise<RenderedStarter> {
  const label = `${STARTERS_DIR}/${starter.templateId}`;
  const present = new Set(await walk(starter.dir));
  const documents = new Map<string, unknown>();
  for (const [rel, required] of Object.entries(STARTER_DOCUMENTS)) {
    if (!present.has(rel)) {
      if (required) throw new StarterError(`${label} has no ${rel}`);
      continue;
    }
    documents.set(rel, renderStarterDocument(await readJson(path.join(starter.dir, rel)), values, `${label}/${rel}`));
  }
  const registry = AssetRegistryDocSchema.safeParse(documents.get("assets/registry.json"));
  if (!registry.success) throw new StarterError(`${label}/assets/registry.json invalid: ${registry.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`);
  const assets = new Map<string, string>();
  for (const entry of registry.data.items) {
    // entry.file is a single path segment by the registry schema (no slash, no traversal)
    const rel = `assets/${entry.file}`;
    if (!present.has(rel)) throw new StarterError(`${label}: ${rel} is listed in the registry but is not in the starter`);
    if (assets.has(rel)) throw new StarterError(`${label}: ${rel} is listed twice`);
    assets.set(rel, path.join(starter.dir, rel));
  }
  const known = new Set([STARTER_FILE, ...Object.keys(STARTER_DOCUMENTS), ...assets.keys()]);
  const unknown = [...present].filter((f) => !known.has(f)).sort();
  if (unknown.length > 0) throw new StarterError(`${label} holds file(s) a starter may not carry: ${unknown.join(", ")}`);
  const problems = starterProblems(documents);
  if (problems.length > 0) throw new StarterError(`${label} breaks the starter rules:\n  ${problems.join("\n  ")}`);
  return { documents, assets };
}

/**
 * The rules a starter keeps whatever its Template (data/site-starters/README.md): it names no
 * portfolio project and carries no image nothing shows. Returns what is wrong (empty = nothing).
 */
export function starterProblems(documents: ReadonlyMap<string, unknown>): string[] {
  const problems: string[] = [];
  const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

  // settings: a project selection is "latest" (a manual pick or a category names records the site does not have)
  for (const [section, override] of Object.entries(obj(obj(documents.get("settings.json")).overrides))) {
    const selection = obj(override).selection;
    if (selection !== undefined && obj(selection).mode !== "latest") problems.push(`settings.json "${section}": selection must be { "mode": "latest" } — a starter picks no project`);
  }
  const banners = obj(documents.get("content/banners.json")).items;
  const referenced = new Set<string>();
  for (const banner of Array.isArray(banners) ? banners : []) {
    const b = obj(banner);
    if (obj(obj(b.cta).target).kind === "project") problems.push(`content/banners.json "${String(b.id)}": a banner CTA may not target a project`);
    const asset = obj(b.image).asset;
    if (typeof asset === "string") referenced.add(asset);
  }
  for (const section of Object.values(obj(obj(documents.get("slots.json")).values))) {
    for (const value of Object.values(obj(section))) {
      const asset = obj(value).asset;
      if (typeof asset === "string") referenced.add(asset);
    }
  }
  const items = obj(documents.get("assets/registry.json")).items;
  for (const item of Array.isArray(items) ? items : []) {
    const id = obj(item).id;
    if (typeof id === "string" && !referenced.has(id)) problems.push(`assets/registry.json "${id}": no slot or banner shows this image — a starter carries only the images its pages use`);
  }
  return problems;
}
