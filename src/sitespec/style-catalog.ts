import {
  StyleCatalogSchema,
  SCHEMA_VERSION,
  styleTokenId,
  type StyleCatalog,
  type StyleFrequency,
  type StyleToken,
} from "./types.js";
import type { ComputedStyleObservation } from "../observer/types.js";

/**
 * SiteSpec-global computed-style catalog (Task 13, items 43–49).
 *
 * Task 09 deduplicates styles per page AND per viewport, which is the right
 * scope for an observation run and the wrong one for a site IR: the same button
 * style is stored once in every page's desktop table and again in every page's
 * mobile table. Across nextjs.org that is 16,619 local records for 4,485 genuine
 * style maps.
 *
 * So the catalog is rebuilt at site scope with ONE rule: canonical serialization
 * of `{property: value}`, exact equality, nothing else. No similarity metric, no
 * per-site threshold, no "these two only differ in `margin-top`" merge — a
 * threshold is per-site tuning by another name, and it would make the IR's
 * fidelity depend on which site it was compiled from (item 44).
 *
 * What this catalog is NOT is as important as what it is (items 48, 49): it does
 * not turn a style into a Tailwind utility, a CSS class name, or a design token
 * called `primary-color`. The IR truth is the browser's exact computed value.
 * The frequency block at the bottom is a diagnostic — it counts values, it never
 * names them.
 *
 * Ids are assigned AFTER a lexical sort of the canonical strings (item 45), so
 * `st000001` depends only on the set of styles in the site, never on which page
 * happened to be compiled first.
 */

/** Properties the diagnostic frequency block reports on. */
const FREQUENCY_PROPERTIES = [
  "color",
  "background-color",
  "font-family",
  "font-size",
] as const;

/** How many values per property the diagnostic block keeps. */
const FREQUENCY_LIMIT = 12;

/**
 * Canonical serialization of a computed-style map.
 *
 * Property order is not meaningful in CSSOM output, so entries are sorted before
 * serialization: two elements whose styles differ only in enumeration order are
 * the same style and must collapse.
 */
export function canonicalStyleKey(style: ComputedStyleObservation): string {
  const entries = Object.entries(style).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return JSON.stringify(entries);
}

/**
 * Accumulates every style reference in the site, then assigns ids once.
 *
 * Two phases because the id of a token depends on the whole set: a token cannot
 * be numbered until every style in the site is known. Callers therefore record
 * the canonical KEY on each node during compilation and swap it for the final
 * `styleTokenId` afterwards (see `resolveCatalogReferences`).
 */
export class StyleCatalogBuilder {
  private readonly usage = new Map<string, number>();
  private readonly styles = new Map<string, ComputedStyleObservation>();
  private references = 0;
  private localRecords = 0;

  /** Record ONE element/pseudo style reference; returns its canonical key. */
  intern(style: ComputedStyleObservation): string {
    const key = canonicalStyleKey(style);
    this.usage.set(key, (this.usage.get(key) ?? 0) + 1);
    if (!this.styles.has(key)) this.styles.set(key, style);
    this.references++;
    return key;
  }

  /** Count one page+viewport local style table, for the dedup-ratio report. */
  countLocalStyleTable(entryCount: number): void {
    this.localRecords += entryCount;
  }

  /** Assign ids by lexical order of the canonical key (item 45). */
  finalize(): { catalog: StyleCatalog; idByKey: Map<string, string> } {
    const keys = [...this.usage.keys()].sort();
    const idByKey = new Map<string, string>();
    const tokens: StyleToken[] = [];

    keys.forEach((key, index) => {
      const id = styleTokenId(index + 1);
      idByKey.set(key, id);
      const source = this.styles.get(key)!;
      // Re-emit with sorted keys so the persisted object matches the canonical
      // form its id was derived from.
      const properties: Record<string, string> = {};
      for (const name of Object.keys(source).sort()) {
        properties[name] = source[name]!;
      }
      tokens.push({
        styleTokenId: id,
        properties,
        usageCount: this.usage.get(key)!,
      });
    });

    const frequency = {
      color: this.frequencyFor(tokens, "color"),
      backgroundColor: this.frequencyFor(tokens, "background-color"),
      fontFamily: this.frequencyFor(tokens, "font-family"),
      fontSize: this.frequencyFor(tokens, "font-size"),
    };

    const dedupReductionRate =
      this.localRecords > 0
        ? Number((1 - tokens.length / this.localRecords).toFixed(4))
        : 0;

    const catalog = StyleCatalogSchema.parse({
      schemaVersion: SCHEMA_VERSION,
      tokenCount: tokens.length,
      sourceStyleReferenceCount: this.references,
      sourceLocalStyleRecordCount: this.localRecords,
      dedupReductionRate,
      styles: tokens,
      frequency,
    } satisfies StyleCatalog);

    return { catalog, idByKey };
  }

  private frequencyFor(
    tokens: readonly StyleToken[],
    property: (typeof FREQUENCY_PROPERTIES)[number],
  ): StyleFrequency[] {
    const counts = new Map<string, number>();
    for (const token of tokens) {
      const value = token.properties[property];
      if (value === undefined) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
      .slice(0, FREQUENCY_LIMIT)
      .map(([value, tokenCount]) => ({ property, value, tokenCount }));
  }
}
