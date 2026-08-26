import { createHash } from "node:crypto";
import { STRUCTURE_MAX_ELEMENTS, TEXT_HASH_MAX_LEN, type Fingerprint } from "./types.js";

/**
 * Page identity + fingerprint collection for verification.
 *
 * {@link collectSignalsInBrowser} runs INSIDE the page via `page.evaluate`, so it
 * must be self-contained (no imports / closures) — all tuning is passed via its
 * `config` argument. It reads only lightweight identity signals (title,
 * canonical, meta robots, body text, a DOM tag-structure signature) — never
 * computed styles, geometry, or assets. Hashing happens in Node
 * ({@link buildFingerprints}) so the page body itself is never persisted.
 */

/** Tuning passed into the in-page collector. */
export interface SignalsConfig {
  textHashMaxLen: number;
  structureMaxElements: number;
}

/** Raw signals returned from inside the page (hashed later in Node). */
export interface RawSignals {
  title: string;
  /** Raw `<link rel="canonical">` href (unresolved), or null. */
  canonicalHref: string | null;
  /** `<meta name="robots">` content, or null. */
  metaRobots: string | null;
  /** Length of the whitespace-normalized body text. */
  bodyTextLength: number;
  /** Whitespace-normalized body text, capped to `textHashMaxLen` for hashing. */
  textForHash: string;
  /** `getElementsByTagName('*').length`. */
  domElementCount: number;
  /** `depth:tag` tokens in document order (no attributes/styles). */
  structureSignature: string;
  /** True if the structure walk hit `structureMaxElements`. */
  structureTruncated: boolean;
}

export const SIGNALS_CONFIG: SignalsConfig = {
  textHashMaxLen: TEXT_HASH_MAX_LEN,
  structureMaxElements: STRUCTURE_MAX_ELEMENTS,
};

/**
 * Runs in the browser. Keep dependency-free and self-contained.
 */
export function collectSignalsInBrowser(config: SignalsConfig): RawSignals {
  const { textHashMaxLen, structureMaxElements } = config;
  const norm = (s: string): string => s.replace(/\s+/g, " ").trim();

  const title = document.title || "";

  // Canonical: first <link rel> whose rel token list includes "canonical".
  let canonicalHref: string | null = null;
  for (const link of Array.from(document.querySelectorAll("link[rel]"))) {
    const rel = (link.getAttribute("rel") || "").toLowerCase().split(/\s+/);
    if (rel.includes("canonical")) {
      const href = link.getAttribute("href");
      if (href) {
        canonicalHref = href;
        break;
      }
    }
  }

  // Meta robots (case-insensitive name match).
  let metaRobots: string | null = null;
  for (const meta of Array.from(document.querySelectorAll("meta[name]"))) {
    if ((meta.getAttribute("name") || "").toLowerCase() === "robots") {
      const content = meta.getAttribute("content");
      if (content != null) metaRobots = content;
      break;
    }
  }

  const domElementCount = document.getElementsByTagName("*").length;

  const bodyEl = document.body as HTMLElement | null;
  const rawText = bodyEl ? bodyEl.innerText || "" : "";
  const normText = norm(rawText);
  const bodyTextLength = normText.length;
  const textForHash =
    normText.length > textHashMaxLen ? normText.slice(0, textHashMaxLen) : normText;

  // Lightweight DOM structure signature: `depth:tag` tokens, document order.
  const tokens: string[] = [];
  let count = 0;
  let structureTruncated = false;
  const walk = (el: Element, depth: number): void => {
    if (count >= structureMaxElements) {
      structureTruncated = true;
      return;
    }
    count++;
    tokens.push(depth + ":" + el.tagName.toLowerCase());
    const children = el.children;
    for (let i = 0; i < children.length; i++) {
      if (count >= structureMaxElements) {
        structureTruncated = true;
        break;
      }
      walk(children[i], depth + 1);
    }
  };
  walk(document.documentElement, 0);
  const structureSignature = tokens.join(",");

  return {
    title,
    canonicalHref,
    metaRobots,
    bodyTextLength,
    textForHash,
    domElementCount,
    structureSignature,
    structureTruncated,
  };
}

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Deterministically derive fingerprints from the in-page signals (Node side).
 * `textHash`/`structureHash` fingerprint content and structure independently;
 * `combinedHash` binds them with the title. No AI, no semantic similarity.
 */
export function buildFingerprints(signals: RawSignals): Fingerprint {
  const textHash = sha256(signals.textForHash);
  const structureHash = sha256(signals.structureSignature);
  const combinedHash = sha256(`${signals.title}\n${textHash}\n${structureHash}`);
  return {
    textHash,
    structureHash,
    combinedHash,
    ...(signals.structureTruncated ? { structureTruncated: true } : {}),
  };
}
