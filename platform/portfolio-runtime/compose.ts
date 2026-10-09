/**
 * Page composition for the portfolio runtime kit — pure string work, no React, no I/O.
 *
 *   headTags(metadata, base)     the head tags Next.js writes for the Metadata object a page's
 *                                generateMetadata returns (the subset a Template page uses), in
 *                                Next's order, escaped as React escapes them
 *   composePage(shell, parts)    one final document from a shell page: every slot placeholder
 *                                replaced, the head tags + image preloads + inline slot data added
 *   sitemapXml(entries)          the bytes Next's sitemap route writes for the same entries
 *
 * Everything fails CLOSED: a metadata key this module does not serialise, a placeholder that is
 * not found exactly once, a shell that already carries a title — each is a problem, never a guess.
 * platform/test/portfolio-runtime.test.ts holds the output to a real ordinary build, page by page.
 */

export class ComposeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ComposeError";
  }
}

/** React's escapeTextForBrowser: the five characters, for text content and attribute values alike. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#x27;"));
}

/** JSON for the body of a <script type="application/json">: it can never close the element or open a comment. */
export function escapeJsonForScript(json: string): string {
  return json.replace(/[<>&\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], where: string): void {
  for (const key of Object.keys(value)) {
    if (value[key] !== undefined && !allowed.includes(key)) throw new ComposeError(`metadata ${where}${key} is not a field the runtime kit serialises`);
  }
}

function optionalString(value: unknown, where: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new ComposeError(`metadata ${where} must be a string`);
  return value;
}

/** A root-relative path against the page's metadataBase, as Next resolves it ("/" → the bare origin). */
function absoluteUrl(pathOrUrl: string, base: string | undefined, where: string): string {
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  if (!pathOrUrl.startsWith("/") || pathOrUrl.startsWith("//")) throw new ComposeError(`metadata ${where} "${pathOrUrl}" is neither absolute nor root-relative`);
  if (!base) throw new ComposeError(`metadata ${where} is relative but the site declares no public origin`);
  return pathOrUrl === "/" ? base : `${base}${pathOrUrl}`;
}

/**
 * Next.js 16 head serialisation of { title, description, alternates.canonical, openGraph{ type,
 * title, description, url, images[] } } — and of the twitter card Next derives from openGraph when
 * the page declares none. Order as Next emits it: title · description · canonical · og:* · twitter:*.
 */
export function headTags(metadata: unknown, metadataBase: string | undefined): string[] {
  if (!isRecord(metadata)) throw new ComposeError("metadata must be an object");
  onlyKeys(metadata, ["title", "description", "alternates", "openGraph"], "");
  const tags: string[] = [];
  const meta = (attr: "name" | "property", key: string, content: string | number | undefined) => {
    if (content !== undefined) tags.push(`<meta ${attr}="${key}" content="${escapeHtml(String(content))}"/>`);
  };
  const title = optionalString(metadata.title, "title");
  if (title !== undefined) tags.push(`<title>${escapeHtml(title)}</title>`);
  meta("name", "description", optionalString(metadata.description, "description"));

  if (metadata.alternates !== undefined && metadata.alternates !== null) {
    if (!isRecord(metadata.alternates)) throw new ComposeError("metadata alternates must be an object");
    onlyKeys(metadata.alternates, ["canonical"], "alternates.");
    const canonical = optionalString(metadata.alternates.canonical, "alternates.canonical");
    if (canonical !== undefined) tags.push(`<link rel="canonical" href="${escapeHtml(absoluteUrl(canonical, metadataBase, "alternates.canonical"))}"/>`);
  }

  if (metadata.openGraph !== undefined && metadata.openGraph !== null) {
    const og = metadata.openGraph;
    if (!isRecord(og)) throw new ComposeError("metadata openGraph must be an object");
    onlyKeys(og, ["type", "title", "description", "url", "images"], "openGraph.");
    if (og.type !== "website") throw new ComposeError(`metadata openGraph.type "${String(og.type)}" is not serialised by the runtime kit (only "website")`);
    const ogTitle = optionalString(og.title, "openGraph.title");
    const ogDescription = optionalString(og.description, "openGraph.description");
    const url = optionalString(og.url, "openGraph.url");
    const images = (og.images === undefined ? [] : Array.isArray(og.images) ? og.images : [og.images]).map((raw, i) => {
      if (!isRecord(raw)) throw new ComposeError(`metadata openGraph.images.${i} must be an object`);
      onlyKeys(raw, ["url", "width", "height", "alt"], `openGraph.images.${i}.`);
      const src = optionalString(raw.url, `openGraph.images.${i}.url`);
      if (src === undefined) throw new ComposeError(`metadata openGraph.images.${i}.url is missing`);
      for (const k of ["width", "height"] as const) if (raw[k] !== undefined && typeof raw[k] !== "number") throw new ComposeError(`metadata openGraph.images.${i}.${k} must be a number`);
      return { url: absoluteUrl(src, metadataBase, `openGraph.images.${i}.url`), width: raw.width as number | undefined, height: raw.height as number | undefined, alt: optionalString(raw.alt, `openGraph.images.${i}.alt`) };
    });
    meta("property", "og:title", ogTitle);
    meta("property", "og:description", ogDescription);
    meta("property", "og:url", url === undefined ? undefined : absoluteUrl(url, metadataBase, "openGraph.url"));
    for (const image of images) {
      meta("property", "og:image", image.url);
      meta("property", "og:image:width", image.width);
      meta("property", "og:image:height", image.height);
      meta("property", "og:image:alt", image.alt);
    }
    meta("property", "og:type", "website");
    // the twitter card Next derives from openGraph (resolve-opengraph: no `twitter` → card by images)
    meta("name", "twitter:card", images.length > 0 ? "summary_large_image" : "summary");
    meta("name", "twitter:title", ogTitle);
    meta("name", "twitter:description", ogDescription);
    for (const image of images) {
      meta("name", "twitter:image", image.url);
      meta("name", "twitter:image:alt", image.alt);
      meta("name", "twitter:image:width", image.width);
      meta("name", "twitter:image:height", image.height);
    }
  }
  return tags;
}

function occurrences(haystack: string, needle: string): number {
  let n = 0;
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** The leading <link rel="preload" …/> tags React writes in front of a fragment (image preloads), and the rest. */
export function splitPreloads(markup: string): { preloads: string[]; markup: string } {
  const preloads: string[] = [];
  const tag = /^<link rel="preload"[^>]*\/>/;
  for (let m = tag.exec(markup); m; m = tag.exec(markup)) {
    preloads.push(m[0]);
    markup = markup.slice(m[0].length);
  }
  return { preloads, markup };
}

const hrefOf = (linkTag: string) => /\shref="([^"]*)"/.exec(linkTag)?.[1];

export interface ComposeParts {
  /** placeholder markup (exactly as the shell build wrote it) → the markup that replaces it ("" = the section is omitted) */
  slots: { placeholder: string; markup: string }[];
  /** placeholders of slots this page does not have: none may be present in the shell */
  foreignPlaceholders: string[];
  /** from headTags() */
  head: string[];
  /** <link rel="preload" …/> tags the slot renders asked for */
  preloads: string[];
  /** id + canonical JSON text of the inline slot data */
  data: { id: string; json: string };
}

export function composePage(shell: string, parts: ComposeParts): string {
  if (occurrences(shell, "</head>") !== 1) throw new ComposeError("the shell page does not have exactly one </head>");
  if (/<title[\s>]/i.test(shell.slice(0, shell.indexOf("</head>")))) throw new ComposeError("the shell page already has a <title>: it is not a shell");
  if (shell.includes(`id="${parts.data.id}"`)) throw new ComposeError("the shell page already carries slot data");
  let html = shell;
  for (const slot of parts.slots) {
    const n = occurrences(html, slot.placeholder);
    if (n !== 1) throw new ComposeError(`the shell page holds ${n} placeholder(s) ${slot.placeholder} (expected exactly one)`);
    const at = html.indexOf(slot.placeholder);
    html = html.slice(0, at) + slot.markup + html.slice(at + slot.placeholder.length);
  }
  // judged on the SHELL: slot markup is free to contain anything
  for (const p of parts.foreignPlaceholders) if (shell.includes(p)) throw new ComposeError(`the shell page holds a placeholder the page has no slot for: ${p}`);

  const headEnd = html.indexOf("</head>");
  const head = html.slice(0, headEnd);
  const present = new Set([...head.matchAll(/<link rel="preload"[^>]*>/g)].map((m) => hrefOf(m[0])));
  const preloads: string[] = [];
  for (const tag of parts.preloads) {
    const href = hrefOf(tag);
    if (href === undefined || present.has(href)) continue;
    present.add(href);
    preloads.push(tag);
  }
  const dataTag = `<script type="application/json" id="${parts.data.id}">${escapeJsonForScript(parts.data.json)}</script>`;
  if (!/<head[\s>]/.test(head)) throw new ComposeError("the shell page has no <head>");

  // Where Next writes them in an ordinary build of the same page, so a composed head reads like a built one:
  //   image preloads   in front of the stylesheet (behind the layout's own preloads)
  //   title, description · [the layout's robots tag] · canonical, og:*, twitter:*
  // A shell without those anchors gets them right behind the viewport tag. The slot data goes last.
  const inserts: { at: number; order: number; text: string }[] = [];
  const viewport = /<meta name="viewport"[^>]*\/>/.exec(head);
  const fallback = viewport ? viewport.index + viewport[0].length : head.indexOf(">", head.search(/<head[\s>]/)) + 1;
  const stylesheet = head.indexOf('<link rel="stylesheet"');
  inserts.push({ at: stylesheet >= 0 ? stylesheet : fallback, order: 1, text: preloads.join("") });
  const robots = /<meta name="robots"[^>]*\/>/.exec(head);
  const leading = parts.head.filter((tag) => tag.startsWith("<title>") || tag.startsWith('<meta name="description"'));
  const trailing = parts.head.filter((tag) => !leading.includes(tag));
  if (robots) {
    inserts.push({ at: robots.index, order: 2, text: leading.join("") });
    inserts.push({ at: robots.index + robots[0].length, order: 3, text: trailing.join("") });
  } else {
    inserts.push({ at: fallback, order: 0, text: parts.head.join("") });
  }
  inserts.push({ at: headEnd, order: 4, text: dataTag });
  inserts.sort((x, y) => x.at - y.at || x.order - y.order);
  let out = "";
  let cursor = 0;
  for (const insert of inserts) {
    out += html.slice(cursor, insert.at) + insert.text;
    cursor = insert.at;
  }
  return out + html.slice(cursor);
}

/** Next's sitemap.xml for entries that carry only a URL. */
export function sitemapXml(entries: readonly { url: string }[]): string {
  const xmlEscape = (s: string) => s.replace(/[&<>"']/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&apos;"));
  let out = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  for (const e of entries) out += `<url>\n<loc>${xmlEscape(e.url)}</loc>\n</url>\n`;
  return `${out}</urlset>\n`;
}
