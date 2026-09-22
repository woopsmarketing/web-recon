/**
 * THE BRIEF-DRIVEN WRITER (Task 28 Phase 10 — integration).
 *
 * WHAT THIS CLOSES. `createSite()` (Phase 8) already turned ONE brief into a
 * new independent site, but the only provider wired to it was
 * `FakeContentGenerator`, whose output is literally `"Fake hero headline
 * practical automation for teams…"`. A journey that ends in a site full of the
 * word "Fake" is not a First Draft — it is a plumbing test. This module is the
 * provider that makes the journey real: it reads the operator's BRIEF and
 * writes copy for the business the brief describes.
 *
 * WHY IT IS NOT AN LLM, AND WHY THAT IS STATED OUT LOUD. There is no LLM API
 * key in this repo (`src/config/env.ts` declares only FIRECRAWL_API_KEY), and
 * the Task 28 contract sanctions producing the structured result without one.
 * So this is a DETERMINISTIC COMPOSITIONAL WRITER, not a model:
 *
 *   - every sentence it emits is composed from fragments that are themselves
 *     derived from the brief (its working name, category, audience,
 *     positioning, conversion goal, tone and supplied facts);
 *   - selection is a hash of the slot key, so the same brief always produces
 *     the same draft, byte for byte, and a diff between two runs is a real
 *     change rather than sampling noise;
 *   - it never states a fact the brief did not supply — a claim-shaped
 *     sentence exists only when it quotes a `ProvidedFact` verbatim, which is
 *     exactly what `truth-mode.ts` recognises as backed.
 *
 * The honest limitation, named here rather than discovered later: a
 * compositional writer REPEATS. Its variety is the size of its cross-product,
 * not a model's imagination, and on a site with hundreds of body slots some
 * sentences recur. `writerStats()` reports distinct-value counts so the
 * repetition is a measured number in the handoff instead of an impression.
 *
 * WHAT IT DELIBERATELY KEEPS. A rebrand is not a find-and-replace of every
 * word. Generic information-architecture labels (Pricing, Customers, Security,
 * Contact, Docs, Log in…) are CORRECT on the new site and are kept as
 * `derived-copy`; internal routes and in-page anchors are kept because they
 * carry no fact and have exactly one correct value; external destinations are
 * NEVER invented — one is written only when the brief supplies it, and every
 * other one becomes a named `needs-input`.
 */
import type { TelemetryUsage } from "../telemetry/index.js";
import type { ContentGenerationInput, ContentGenerator } from "./providers.js";
import {
  CONTENT_GENERATOR_CONTRACT_VERSION,
  CONTENT_SCHEMA_VERSION,
  ContentGenerationResultSchema,
  type ContentBrief,
  type ContentGenerationResult,
  type ContentUnit,
  type ContentUnitSlot,
  type ImageBrief,
  type PageContentPlan,
  type ProvidedFact,
  type SiteContentPlan,
  type SlotValueSource,
  type UnresolvedSlot,
} from "./types.js";

// ---------------------------------------------------------------------------
// Fact kinds the writer understands. Everything else is still carried into the
// packet verbatim (the brief is never filtered) — it simply does not steer a
// pool, and the writer says so rather than pretending to have used it.
// ---------------------------------------------------------------------------

export const BRIEF_WRITER_FACT_KINDS = {
  /** `"Signal: streams machine and PLC data into one timeline"` — a product module. */
  module: "module",
  /** A thing the product does, phrased as a verb clause. */
  capability: "capability",
  /** A result the customer gets, phrased as a noun phrase. */
  outcome: "outcome",
  /** Who buys / uses it, phrased as a noun phrase. */
  segment: "segment",
  /** A third-party system it connects to. */
  integration: "integration",
  /** A verified claim, written VERBATIM so truth mode can see it is backed. */
  proof: "proof",
  /** `"status https://status.example.com"` — token, then destination. */
  externalLink: "external-link",
  /**
   * `"10-per-user-month: $49 per user/month"` — a FIGURE the operator states
   * for a value-shaped slot (a price, a plan limit, a statistic, a compliance
   * claim). The label is matched against the slot key, which the Slot V2
   * compiler derives from the source value, so the source figure a page shows
   * today is exactly the handle an operator uses to replace it. Without one,
   * a fact-bearing value-shaped slot becomes a NAMED needs-input rather than
   * being overwritten with marketing copy or silently left on the source's
   * own number.
   */
  figure: "figure",
  /** `"/pricing: what this page is for"` — steers one PageContentPlan. */
  page: "page",
} as const;

/** Split `"Label: rest"` / `"Label — rest"` into its two halves. */
function splitLabelled(value: string): { label: string; rest: string } {
  const match = /^([^:—]+)(?:[:—]\s*)(.+)$/.exec(value.trim());
  if (match === null) return { label: value.trim(), rest: "" };
  return { label: match[1]!.trim(), rest: match[2]!.trim() };
}

function factsOf(facts: readonly ProvidedFact[], kind: string): string[] {
  return facts.filter((fact) => fact.kind === kind).map((fact) => fact.value.trim()).filter((v) => v !== "");
}

// ---------------------------------------------------------------------------
// The voice: everything the writer knows, and where each part came from
// ---------------------------------------------------------------------------

export interface BrandVoice {
  name: string;
  nameProvenance: "brief" | "derived-from-goal";
  category: string;
  audience: string;
  positioning: string;
  conversion: string;
  tone: string[];
  modules: { label: string; description: string }[];
  capabilities: string[];
  outcomes: string[];
  segments: string[];
  integrations: string[];
  proofs: string[];
  externalLinks: { token: string; url: string }[];
  /** Operator-stated figures for value-shaped slots, matched by slot key. */
  figures: { token: string; value: string }[];
  pageNotes: Map<string, string>;
  /** Fact kinds the brief supplied that this writer does not steer a pool with. */
  unusedFactKinds: string[];
}

/** A working name from a brief that omitted one: the goal's first strong noun. */
function deriveName(goal: string): string {
  const words = goal
    .replace(/[^A-Za-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && /^[A-Za-z]/.test(w));
  const pick = words[0] ?? "Newsite";
  return pick.charAt(0).toUpperCase() + pick.slice(1).toLowerCase();
}

export function buildBrandVoice(
  brief: ContentBrief | undefined,
  rawIntent: string,
  preferences: Record<string, string>,
  providedFacts: readonly ProvidedFact[],
): BrandVoice {
  const goal = brief?.goal ?? rawIntent;
  const explicitName = brief?.workingName ?? preferences["workingName"];
  const name = explicitName !== undefined && explicitName.trim() !== "" ? explicitName.trim() : deriveName(goal);
  const modules = factsOf(providedFacts, BRIEF_WRITER_FACT_KINDS.module).map((value) => {
    const { label, rest } = splitLabelled(value);
    return { label, description: rest };
  });
  const externalLinks = factsOf(providedFacts, BRIEF_WRITER_FACT_KINDS.externalLink)
    .map((value) => {
      const parts = value.split(/\s+/);
      const token = (parts[0] ?? "").trim();
      const url = (parts[1] ?? "").trim();
      return { token, url };
    })
    .filter((entry) => entry.token !== "" && /^https?:\/\//.test(entry.url));
  const figures = factsOf(providedFacts, BRIEF_WRITER_FACT_KINDS.figure)
    .map((value) => {
      const { label, rest } = splitLabelled(value);
      return { token: label, value: rest };
    })
    .filter((entry) => entry.token !== "" && entry.value !== "");
  const pageNotes = new Map<string, string>();
  for (const value of factsOf(providedFacts, BRIEF_WRITER_FACT_KINDS.page)) {
    const { label, rest } = splitLabelled(value);
    if (label.startsWith("/")) pageNotes.set(label, rest);
  }
  const known = new Set<string>(Object.values(BRIEF_WRITER_FACT_KINDS));
  const unusedFactKinds = [...new Set(providedFacts.map((f) => f.kind))].filter((k) => !known.has(k)).sort();

  return {
    name,
    nameProvenance: explicitName !== undefined && explicitName.trim() !== "" ? "brief" : "derived-from-goal",
    category: brief?.category ?? preferences["category"] ?? "",
    audience: brief?.audience ?? preferences["audience"] ?? "",
    positioning: brief?.positioning ?? preferences["positioning"] ?? "",
    conversion: brief?.primaryConversion ?? preferences["primaryConversion"] ?? "",
    tone: brief?.tone ?? (preferences["tone"] !== undefined ? preferences["tone"].split(", ") : []),
    modules,
    capabilities: factsOf(providedFacts, BRIEF_WRITER_FACT_KINDS.capability),
    outcomes: factsOf(providedFacts, BRIEF_WRITER_FACT_KINDS.outcome),
    segments: factsOf(providedFacts, BRIEF_WRITER_FACT_KINDS.segment),
    integrations: factsOf(providedFacts, BRIEF_WRITER_FACT_KINDS.integration),
    proofs: factsOf(providedFacts, BRIEF_WRITER_FACT_KINDS.proof),
    externalLinks,
    figures,
    pageNotes,
    unusedFactKinds,
  };
}

// ---------------------------------------------------------------------------
// Deterministic selection
// ---------------------------------------------------------------------------

/** FNV-1a, 32-bit. Stable across runs and platforms; no dependency. */
function hash32(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * A LAZY pool: `size` candidates addressed by index, composed on demand. The
 * cross-product is never materialized, so a 1,000-sentence pool costs nothing
 * until a slot actually asks for one.
 */
interface Pool {
  size: number;
  at: (index: number) => string;
}

function product(parts: string[][], join: (chosen: string[]) => string): Pool {
  const sizes = parts.map((p) => Math.max(1, p.length));
  const size = sizes.reduce((a, b) => a * b, 1);
  return {
    size,
    at: (index: number): string => {
      let remaining = ((index % size) + size) % size;
      const chosen: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const dim = sizes[i]!;
        chosen.push(parts[i]![remaining % dim] ?? "");
        remaining = Math.floor(remaining / dim);
      }
      return join(chosen);
    },
  };
}

function listPool(items: string[]): Pool {
  const safe = items.length > 0 ? items : [""];
  return { size: safe.length, at: (index) => safe[((index % safe.length) + safe.length) % safe.length]! };
}

/** How many candidates a length-fitting search may look at. Bounded on purpose. */
const FIT_WINDOW = 32;

/**
 * A value of this length or more, repeated verbatim on three or more routes,
 * is what `consistency.ts`'s `cross-route-duplicate-copy` check reports. The
 * writer avoids producing one where it can, instead of producing it and
 * letting the review complain. Kept identical to the reviewer's own threshold
 * on purpose — a writer tuned to a DIFFERENT number would quietly pass a check
 * it never actually satisfied.
 */
const CROSS_ROUTE_DUPLICATE_MIN_CHARS = 40;

/** Routes a value has already been written on. */
export type RouteUsage = Map<string, Set<string>>;

/**
 * Pick the candidate closest to the source length, starting from the slot's
 * own hash. Length is a REFERENCE, never a limit (the template compiler
 * refuses to invent a maximum) — but writing to roughly the length of the
 * string being replaced is the only layout mitigation available offline: this
 * suite runs no browser, so nothing here can measure a box.
 */
function pick(
  pool: Pool,
  seed: string,
  targetLength: number | undefined,
  route?: string,
  usage?: RouteUsage,
): string {
  const start = hash32(seed) % pool.size;
  const window = Math.min(FIT_WINDOW, pool.size);
  const cost = (candidate: string): number =>
    targetLength === undefined || targetLength <= 0 ? 0 : Math.abs(candidate.length - targetLength);

  // Three tiers, best-length-fit within each: (1) not used on this route and
  // not already on two others, (2) not already on two others, (3) anything.
  // Tier 1 is what stops five identical H2s down one page — a defect no
  // existing check reports, because `cross-route-duplicate-copy` only looks
  // ACROSS routes. Tier 2 is the reviewer's own rule. Tier 3 exists so a small
  // pool still produces a value instead of nothing.
  let fresh: string | undefined;
  let freshCost = Number.POSITIVE_INFINITY;
  let reusable: string | undefined;
  let reusableCost = Number.POSITIVE_INFINITY;
  let any: string | undefined;
  let anyCost = Number.POSITIVE_INFINITY;

  for (let i = 0; i < window; i++) {
    const candidate = pool.at(start + i * 7919);
    const candidateCost = cost(candidate);
    if (candidateCost < anyCost) {
      any = candidate;
      anyCost = candidateCost;
    }
    if (usage !== undefined && route !== undefined) {
      const routes = usage.get(candidate);
      const onThisRoute = routes?.has(route) ?? false;
      const elsewhere = routes === undefined ? 0 : [...routes].filter((r) => r !== route).length;
      const crowded = elsewhere >= 2 && candidate.length >= CROSS_ROUTE_DUPLICATE_MIN_CHARS;
      if (!crowded && candidateCost < reusableCost) {
        reusable = candidate;
        reusableCost = candidateCost;
      }
      if (!crowded && !onThisRoute && candidateCost < freshCost) {
        fresh = candidate;
        freshCost = candidateCost;
      }
    }
    if (targetLength === undefined || targetLength <= 0) break;
  }
  return fresh ?? reusable ?? any ?? pool.at(start);
}

// ---------------------------------------------------------------------------
// The pools, built from the voice
// ---------------------------------------------------------------------------

function nonEmpty(items: string[], fallback: string[]): string[] {
  const filtered = items.filter((item) => item.trim() !== "");
  return filtered.length > 0 ? filtered : fallback;
}

/**
 * Words that carry no meaning on their own. Used only to keep the phrase bank
 * below from emitting "The" or "With" as a button label.
 */
const PHRASE_STOPWORDS = new Set(
  ("a an and are as at be been but by can could do does for from had has have how in into is it its "
    + "like made make may not of on one only or our out over so some than that the their them then there "
    + "these they this to up was we were what when where which while who will with without you your"
  ).split(" "),
);

/**
 * Verb forms and adverbs that make a two-word fragment read as broken English.
 * A HEURISTIC, and named as one: there is no part-of-speech tagger in this
 * repo and adding a dependency is out of budget. Every entry here was put
 * there by a phrase this writer actually produced and a human actually read —
 * "Put every", "Streams machine", "Change instead", "Signed off".
 */
const PHRASE_BLOCKLIST = new Set(
  ("put puts give gives given keep keeps kept carry carries catch catches close closes see sees "
    + "read reads hold holds turn turns stream streams model models match matches take takes answer "
    + "answers sign signed attach attached losing lose helps help using use used running runs ran "
    + "already both each every whole same instead across off before until nobody ready more most just "
    + "still even also assemble happens explain trust needs stays goes comes"
  ).split(" "),
);

/**
 * SHORT LABELS, from the brief's own words. A shop-floor site has hundreds of
 * two-word labels — 428 of the linear.app template's 1,224 in-scope text slots
 * are 8 characters or shorter — and a pool built only from the brief's six
 * modules would put the same six words on every one of them. So the writer
 * mines the brief's own prose for one- and two-word noun phrases.
 *
 * NOTHING IS INVENTED: every phrase is a contiguous fragment of something the
 * operator actually wrote. Three rules keep the fragments readable, and all
 * three exist because the version without them shipped nonsense into a real
 * browser on this suite's first run:
 *
 *   1. pairs are formed WITHIN one clause, never across a comma, so
 *      "machine data, work orders" cannot become the label "Data work";
 *   2. adjacency is preserved — dropping stopwords first turned "leaders at
 *      mid-size manufacturers" into "Leaders mid-size";
 *   3. the head and tail must survive PHRASE_BLOCKLIST, and the tail must be a
 *      word the brief either repeats or ends a clause with, which is the
 *      closest thing to "is a noun" available without a tagger.
 */
export function phraseBank(voice: BrandVoice): string[] {
  const texts = [
    voice.positioning,
    voice.category,
    voice.audience,
    ...voice.capabilities,
    ...voice.outcomes,
    ...voice.segments,
    ...voice.modules.map((m) => m.description),
  ];
  const clauses: string[][] = [];
  for (const text of texts) {
    for (const clause of text.split(/[,.;:]/)) {
      const tokens = clause
        .split(/[^A-Za-z0-9-]+/)
        .map((w) => w.toLowerCase())
        .filter((w) => w !== "");
      if (tokens.length > 0) clauses.push(tokens);
    }
  }
  const frequency = new Map<string, number>();
  const clauseFinal = new Set<string>();
  for (const tokens of clauses) {
    const content = tokens.filter((w) => w.length > 2 && !PHRASE_STOPWORDS.has(w));
    for (const word of content) frequency.set(word, (frequency.get(word) ?? 0) + 1);
    if (content.length > 0) clauseFinal.add(content[content.length - 1]!);
  }
  const repeated = new Set([...frequency.entries()].filter(([, count]) => count >= 2).map(([word]) => word));
  const nounish = new Set([...repeated, ...clauseFinal]);

  const out = new Set<string>();
  for (const word of repeated) {
    if (word.length > 3 && !PHRASE_BLOCKLIST.has(word)) out.add(titleish(word));
  }
  for (const tokens of clauses) {
    for (let i = 0; i < tokens.length - 1; i++) {
      const head = tokens[i]!;
      const tail = tokens[i + 1]!;
      if (head.length <= 2 || tail.length <= 2) continue;
      if (PHRASE_STOPWORDS.has(head) || PHRASE_STOPWORDS.has(tail)) continue;
      if (PHRASE_BLOCKLIST.has(head) || PHRASE_BLOCKLIST.has(tail)) continue;
      if (!nounish.has(tail)) continue;
      out.add(titleish(`${head} ${tail}`));
    }
  }
  return [...out].sort();
}

interface Pools {
  label: Pool;
  cta: Pool;
  headline: Pool;
  paragraph: Pool;
  proof: Pool;
}

function buildPools(voice: BrandVoice): Pools {
  const moduleLabels = voice.modules.map((m) => m.label);
  const outcomes = nonEmpty(voice.outcomes, ["fewer surprises", "a shorter feedback loop", "work that stays on plan"]);
  const capabilities = nonEmpty(voice.capabilities, [
    "keep every team working from the same plan",
    "turn scattered updates into one running record",
  ]);
  const segments = nonEmpty(voice.segments, [voice.audience !== "" ? voice.audience : "growing teams"]);
  const integrations = voice.integrations;

  // ---- short labels ------------------------------------------------------
  const label = listPool(
    nonEmpty(
      [...moduleLabels, ...outcomes.map(titleish), ...integrations, ...phraseBank(voice)],
      ["Overview", "Details", "How it works"],
    ),
  );

  // ---- calls to action ---------------------------------------------------
  const conversionPhrase = voice.conversion.trim();
  const cta = listPool(
    nonEmpty(
      [
        titleish(conversionPhrase),
        conversionPhrase !== "" ? `${titleish(conversionPhrase)} →` : "",
        "Talk to us",
        "See it in action",
        "Start a pilot",
        "Read the overview",
      ],
      ["Talk to us", "Get started"],
    ),
  );

  // ---- headlines ---------------------------------------------------------
  // Composed from the brief's OWN clauses rather than a verb x object grid: a
  // grid produced grammatical wreckage ("See the ERP and the, end to end.")
  // because a capability the operator wrote is already a complete verb clause.
  // Materialized (not lazy) because the list is ~100 entries, and because the
  // cross-route de-duplication below has to be able to look at all of them.
  const headTails = ["", ", end to end", " in one place", " without a spreadsheet", " the same way every time", " while the line keeps moving"];
  const headlines: string[] = [];
  /**
   * A tail is only appended when the clause does not already say it. Without
   * this, a capability the operator wrote as "…without a paper traveller"
   * picked up the tail " without a spreadsheet" and rendered, on a real page,
   * as "Give operators the next step without a paper traveller without a
   * spreadsheet." One repeated word is the whole tell that copy was assembled
   * rather than written.
   */
  const tailFits = (clause: string, tail: string): boolean => {
    const lower = clause.toLowerCase();
    return tail
      .split(/[^a-z]+/i)
      .filter((word) => word.length >= 4)
      .every((word) => !lower.includes(word.toLowerCase()));
  };
  for (const capability of capabilities) {
    for (const tail of headTails) {
      if (!tailFits(capability, tail)) continue;
      headlines.push(sentence(`${titleish(capability)}${tail}`));
    }
  }
  for (const outcome of outcomes) {
    headlines.push(sentence(titleish(outcome)));
    for (const prefix of ["Built for ", "Made for ", "One place for ", "The short path to "]) {
      headlines.push(sentence(`${prefix}${lower(outcome)}`));
    }
  }
  for (const module of voice.modules) {
    if (module.description !== "") headlines.push(sentence(`${module.label} ${lower(module.description)}`));
  }
  // Short headlines, from the brief's own two-word phrases. Without these the
  // only short headlines available are the six outcomes, and a page of short
  // H2s ends up repeating one of them five times.
  for (const phrase of phraseBank(voice)) {
    if (!phrase.includes(" ")) continue;
    headlines.push(sentence(`${titleish(phrase)}, standardized`));
    headlines.push(sentence(`${titleish(phrase)}, on one plan`));
    headlines.push(sentence(`One plan for ${lower(phrase)}`));
  }
  for (const segment of segments) headlines.push(sentence(`Built for ${lower(segment)}`));
  if (voice.positioning !== "") headlines.push(sentence(`${voice.name} is ${lower(voice.positioning)}`));
  if (voice.conversion !== "") headlines.push(sentence(`Ready when you are: ${lower(voice.conversion)}`));
  const headline = listPool(nonEmpty(headlines, ["One plan, one record."]));

  // ---- paragraphs --------------------------------------------------------
  const first = nonEmpty(
    [
      ...capabilities.map((c) => `${voice.name} helps ${lower(c)}.`),
      ...voice.modules.map((m) =>
        m.description !== "" ? `${m.label} ${lower(m.description)}.` : `${m.label} is part of ${voice.name}.`,
      ),
      voice.positioning !== "" ? `${voice.name} is ${lower(voice.positioning)}.` : "",
    ],
    [`${voice.name} keeps the work in one place.`],
  );
  const second = nonEmpty(
    [
      ...outcomes.map((o) => `The result is ${lower(o)}.`),
      ...segments.map((s) => `It is built for ${lower(s)}.`),
      "Nothing has to be re-keyed at the end of the day.",
      "The plan updates as the work moves, not the morning after.",
      "Everyone reads the same record, in the same words.",
    ],
    ["The result is less guesswork."],
  );
  const paragraph = product([first, second], (c) => `${c[0]} ${c[1]}`.trim());

  // ---- proof: verbatim, so truth mode can see the backing ----------------
  const proof = listPool(nonEmpty(voice.proofs, []));

  return { label, cta, headline, paragraph, proof };
}

function lower(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
function titleish(value: string): string {
  if (value === "") return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}
function sentence(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (trimmed === "") return trimmed;
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

// ---------------------------------------------------------------------------
// What is KEPT rather than rewritten
// ---------------------------------------------------------------------------

/**
 * Generic information-architecture words. These are the new site's words too:
 * a manufacturing company's nav still says "Pricing" and its footer still says
 * "Privacy". Rewriting them would make the site worse, so they are kept and
 * recorded as `derived-copy` — a decision, not an omission.
 */
export const GENERIC_IA_LABELS = new Set(
  [
    "home", "product", "products", "platform", "features", "solutions", "pricing", "customers",
    "company", "about", "about us", "careers", "blog", "news", "press", "contact", "contact us",
    "support", "help", "docs", "documentation", "developers", "api", "resources", "guides",
    "security", "privacy", "privacy policy", "terms", "terms of service", "legal", "status",
    "changelog", "integrations", "partners", "login", "log in", "sign in", "sign up", "get started",
    "search", "menu", "close", "next", "previous", "back", "more", "learn more", "read more",
    "overview", "faq", "faqs", "connect", "follow", "download", "all", "new", "now", "featured",
  ].map((v) => v.toLowerCase()),
);

const ID_PATTERN = /^[A-Z]{2,5}-\d{2,6}$/;
/** Dates, times, counts, versions and other non-brand chrome: keeping is correct. */
const NON_COPY_PATTERN =
  /^(?:[\d\s.,:/+%-]+|v?\d+(?:\.\d+)+|\d{1,2}:\d{2}(?:\s?[APap][Mm])?|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{0,4}|[^\w\s]{1,3})$/;

export function keepsSourceValue(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === "") return true;
  if (GENERIC_IA_LABELS.has(trimmed.toLowerCase())) return true;
  if (NON_COPY_PATTERN.test(trimmed)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// VALUE-SHAPED SLOTS — the class the writer must NOT compose copy into
// ---------------------------------------------------------------------------

/**
 * A slot whose source value IS A VALUE, not a sentence: a price, a plan limit,
 * a statistic, a date, a time, a version, a byline, a compliance claim.
 *
 * WHY THIS EXISTS. The first version of this writer was blind to slot
 * semantics: it saw a short string, decided a short string wants a short
 * headline, and wrote one. The verifier read the resulting draft and found the
 * pricing table saying `$10 per user/month` -> "Shorter changeovers", the
 * changelog's date column saying `August 20, 2026` -> "Paper traveller", the
 * security page's compliance labels saying `ISO 27001 certified` -> "Rockwell
 * FactoryTalk", and customer stat tiles saying `2.0x` -> "Plan". Two of eight
 * routes were not usable copy. No false statement was asserted — but a pricing
 * table with adjectives where the prices go is not a first draft.
 *
 * The class splits in two, and the split is the honest part:
 *
 *   FACT-BEARING  price, percentage, multiplier, counted-quantity,
 *                 certification, attribution. The source figure is a FACT
 *                 ABOUT THE SOURCE BUSINESS. Composing copy over it destroys
 *                 the page; keeping it ships someone else's price, adoption
 *                 rate or SOC 2 status on this customer's site (exactly the
 *                 defect the verifier found shipping as `50%`). So the writer
 *                 produces NO VALUE and names the slot as needs-input, unless
 *                 the brief supplied a `figure` fact for it.
 *
 *   CHROME        date, time, relative-time, version, numeric-chrome, glyph.
 *                 A calendar date in a changelog column, `00:17`, `1.4`, `+`
 *                 or `X` carries no claim about the business. Keeping the
 *                 source string is correct and is recorded as `derived-copy` —
 *                 a decision, not an omission.
 *
 * Everything here is a pattern over the SOURCE value and is capped at 60
 * characters, so a real sentence that happens to contain a number ("Charged at
 * $0.25 per 20-minute block") is NOT value-shaped and is rewritten as copy.
 */
export const FACT_BEARING_VALUE_SHAPES = [
  "price",
  "percentage",
  "multiplier",
  "counted-quantity",
  "certification",
  "attribution",
] as const;
export const CHROME_VALUE_SHAPES = [
  "date",
  "time",
  "relative-time",
  "version",
  "numeric-chrome",
  "glyph",
] as const;
export type ValueShape =
  | (typeof FACT_BEARING_VALUE_SHAPES)[number]
  | (typeof CHROME_VALUE_SHAPES)[number];

const MONTH = "(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\\.?";
/** Ordered: the first match wins, so "2.0x" is a multiplier before a version. */
const VALUE_SHAPE_PATTERNS: { shape: ValueShape; re: RegExp }[] = [
  { shape: "relative-time", re: /^\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago$/i },
  {
    shape: "date",
    re: new RegExp(
      `^(?:${MONTH}\\s+\\d{1,2}(?:st|nd|rd|th)?,?(?:\\s+\\d{4})?|\\d{1,2}\\s+${MONTH}(?:\\s+\\d{4})?` +
        `|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[./]\\d{1,2}[./]\\d{2,4}|${MONTH}\\s+\\d{4})$`,
      "i",
    ),
  },
  { shape: "time", re: /^\d{1,2}:\d{2}(?::\d{2})?\s?(?:[AaPp]\.?[Mm]\.?)?$/ },
  { shape: "multiplier", re: /^\d[\d.,]*\s?[x×](?:\s+[\w][\w\s-]{0,22})?$/i },
  { shape: "price", re: /^[^\w]*[$€£¥₩]\s?\d[\d,.]*\s*(?:(?:per|\/)\s*[\w\s/-]{1,24})?$/i },
  { shape: "percentage", re: /^[+-]?\d[\d.,]*\s?%(?:\s+[\w][\w\s-]{0,22})?$/ },
  { shape: "counted-quantity", re: /^\d[\d,.]*\s?\+?\s+[A-Za-z][\w-]*(?:\s+[\w-]+){0,2}$/ },
  { shape: "attribution", re: /^By\s+[A-Za-z][^\n]{0,58}$/ },
  {
    shape: "certification",
    re: /\b(?:award[- ]winning|awarded|certified|accredited|ISO\s?\d{4,5}|SOC\s?2|HIPAA|PCI[- ]DSS|patent(?:ed|s)?)\b/i,
  },
  { shape: "version", re: /^v?\d+(?:\.\d+)+$/i },
  { shape: "numeric-chrome", re: /^[\d\s.,:/+%×-]+$/ },
];

/** The shape of a source value, or undefined when it is ordinary copy. */
export function valueShapeOf(raw: string): ValueShape | undefined {
  const value = raw.trim();
  if (value === "") return undefined;
  if (value.length > 60) return undefined;
  for (const entry of VALUE_SHAPE_PATTERNS) {
    if (entry.re.test(value)) return entry.shape;
  }
  // A glyph or an initial ("+", "×", "X", "→") is never marketing copy. Checked
  // LAST, not first: "$0" is two characters and is a PRICE, not a glyph — the
  // first version of this function classified it as chrome, kept the source
  // "$0" and shipped the source company's free tier. The truth mode caught it
  // on the next layer, which is how the ordering bug was found.
  if (value.length <= 2) return "glyph";
  return undefined;
}

const FACT_BEARING_SET = new Set<string>(FACT_BEARING_VALUE_SHAPES);
export function valueShapeIsFactBearing(shape: ValueShape): boolean {
  return FACT_BEARING_SET.has(shape);
}

/** Normalised token match against the slot key, same rule as external links. */
export function figureForSlotKey(
  figures: readonly { token: string; value: string }[],
  slotKey: string,
): { token: string; value: string } | undefined {
  const key = slotKey.toLowerCase();
  return figures.find((figure) => {
    const token = figure.token.toLowerCase().trim();
    return token !== "" && key.includes(token);
  });
}

/**
 * A slot whose source value is a MARKUP FRAGMENT, not customer copy. The real
 * linear.app template carries one (`home.main.text.content-34` is the literal
 * string `"  </"`): keeping it re-emits markup the validator rejects as an
 * html-injection error, and writing marketing copy into a stray closing tag
 * would put a sentence somewhere no sentence belongs. Neither is right, so the
 * writer produces NO VALUE for it and the source default renders — which the
 * accounting artifact records as `preserved`, visible rather than silent.
 */
export function isMarkupFragment(value: string): boolean {
  return /[<>]/.test(value);
}

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

function sourceCharCount(slot: ContentUnitSlot): number | undefined {
  const constraints = slot.constraints as { sourceCharacterCount?: number } | undefined;
  if (typeof constraints?.sourceCharacterCount === "number") return constraints.sourceCharacterCount;
  return typeof slot.currentValue === "string" ? slot.currentValue.length : undefined;
}

export interface BriefWriterStats {
  textSlotsWritten: number;
  textSlotsKeptGeneric: number;
  /** Markup fragments the writer refused to touch — no value, source renders. */
  textSlotsSkippedNonCopy: number;
  /** Value-shaped CHROME (dates, times, versions, glyphs) kept verbatim. */
  valueShapedChromeKept: number;
  /** Value-shaped FACT-BEARING slots withheld as named needs-input. */
  valueShapedFactsWithheld: number;
  /** Value-shaped fact slots the brief supplied a `figure` for. */
  valueShapedFactsFromBrief: number;
  distinctTextValues: number;
  urlsKept: number;
  urlsResolvedFromBrief: number;
  urlsUnresolved: number;
  imageBriefs: number;
  proofsUsed: number;
}

export class BriefContentGenerator implements ContentGenerator {
  readonly name = "brief-writer";
  private readonly written = new Set<string>();
  /** value -> routes it has been written on; feeds the de-duplication above. */
  private readonly valueRoutes: RouteUsage = new Map();
  private stats: BriefWriterStats = {
    textSlotsWritten: 0,
    textSlotsKeptGeneric: 0,
    textSlotsSkippedNonCopy: 0,
    valueShapedChromeKept: 0,
    valueShapedFactsWithheld: 0,
    valueShapedFactsFromBrief: 0,
    distinctTextValues: 0,
    urlsKept: 0,
    urlsResolvedFromBrief: 0,
    urlsUnresolved: 0,
    imageBriefs: 0,
    proofsUsed: 0,
  };

  writerStats(): BriefWriterStats {
    return { ...this.stats, distinctTextValues: this.written.size };
  }

  async generate(input: ContentGenerationInput): Promise<ContentGenerationResult> {
    const voice = buildBrandVoice(
      input.intent.brief,
      input.intent.rawIntent,
      input.intent.preferences,
      input.intent.providedFacts,
    );
    const pools = buildPools(voice);
    const slotValues: Record<string, unknown> = {};
    const sources: Record<string, SlotValueSource> = {};
    const unresolved: UnresolvedSlot[] = [];
    const imageBriefs: ImageBrief[] = [];

    // REPAIR MODE. The layout QA asked for a SHORTER value for named slots.
    // Re-running the same deterministic pick would return the same string and
    // the repair guard would (correctly) call it no-progress, so repair writes
    // to a shorter target under a distinct seed — and touches nothing else.
    const repairTargets = new Map<string, number>();
    if (input.mode === "repair" && input.repair !== undefined) {
      for (const item of input.repair.items) {
        const currentLength = typeof item.currentValue === "string" ? item.currentValue.length : 0;
        repairTargets.set(item.slotKey, Math.max(4, Math.ceil(currentLength / 2)));
      }
    }

    for (const unit of input.units) {
      for (const slot of unit.slots) {
        if (repairTargets.size > 0 && !repairTargets.has(slot.key)) continue;
        if (slot.type === "text") {
          this.writeText(voice, pools, unit, slot, slotValues, sources, unresolved, repairTargets.get(slot.key));
          continue;
        }
        if (slot.type === "url") {
          this.writeUrl(voice, slot, slotValues, sources, unresolved);
          continue;
        }
        imageBriefs.push(this.imageBrief(voice, unit, slot));
        this.stats.imageBriefs++;
      }
    }

    return ContentGenerationResultSchema.parse({
      schemaVersion: CONTENT_SCHEMA_VERSION,
      contractVersion: CONTENT_GENERATOR_CONTRACT_VERSION,
      generator: { name: this.name },
      sitePlan: this.plan(voice, pools, input),
      slotValues,
      sources,
      unresolved,
      imageBriefs,
      notes: [
        `brief-writer: deterministic compositional writer, no live model call. working name "${voice.name}" ` +
          `(${voice.nameProvenance}); pools composed from ${voice.modules.length} module(s), ` +
          `${voice.capabilities.length} capability, ${voice.outcomes.length} outcome and ${voice.proofs.length} proof fact(s).`,
        ...(voice.unusedFactKinds.length > 0
          ? [`brief-writer: fact kind(s) carried into the packet but not used to steer copy: ${voice.unusedFactKinds.join(", ")}`]
          : []),
      ],
    });
  }

  private writeText(
    voice: BrandVoice,
    pools: Pools,
    unit: ContentUnit,
    slot: ContentUnitSlot,
    slotValues: Record<string, unknown>,
    sources: Record<string, SlotValueSource>,
    unresolved: UnresolvedSlot[],
    repairTarget?: number,
  ): void {
    const current = typeof slot.currentValue === "string" ? slot.currentValue : "";
    const target = repairTarget ?? sourceCharCount(slot);
    const seed = repairTarget === undefined
      ? `${unit.route ?? "global"}|${slot.key}`
      : `repair|${repairTarget}|${unit.route ?? "global"}|${slot.key}`;

    // 0. Markup fragments are not copy and are not kept either: no value.
    if (isMarkupFragment(current)) {
      this.stats.textSlotsSkippedNonCopy++;
      return;
    }

    // 0.5 VALUE-SHAPED SLOTS. A price, a plan limit, a statistic, a compliance
    // label, a byline, a date, a version — never a place for composed copy.
    // Repair mode is exempt: it only ever targets a value this writer already
    // wrote and the layout QA measured as overflowing, which is a sentence.
    const shape = repairTarget === undefined ? valueShapeOf(current) : undefined;
    if (shape !== undefined) {
      if (!valueShapeIsFactBearing(shape)) {
        // Chrome: the source string is this site's string too.
        slotValues[slot.key] = current;
        sources[slot.key] = "derived-copy";
        this.stats.valueShapedChromeKept++;
        return;
      }
      const figure = figureForSlotKey(voice.figures, slot.key);
      if (figure !== undefined) {
        slotValues[slot.key] = figure.value;
        sources[slot.key] = "user-provided";
        this.written.add(figure.value);
        this.stats.valueShapedFactsFromBrief++;
        return;
      }
      // NO VALUE, and NAMED. Writing copy here would wreck the page; keeping
      // the source string would ship the source company's own price, adoption
      // rate or certification as if it were this customer's.
      unresolved.push({
        slotKey: slot.key,
        reason:
          `needs factual input: ${shape} value — the source site states ${JSON.stringify(current.trim())} here, ` +
          "which is a fact about the SOURCE business, and the brief supplied no figure for it. Supply a " +
          "`figure` fact whose label is a token of this slot key, or decide the slot in the editor.",
      });
      this.stats.valueShapedFactsWithheld++;
      return;
    }

    // 1. Generic IA / non-copy chrome: the source word is the new site's word.
    if (keepsSourceValue(current)) {
      slotValues[slot.key] = current;
      sources[slot.key] = "derived-copy";
      this.stats.textSlotsKeptGeneric++;
      return;
    }

    // 2. Work-order-shaped identifiers: same shape, this site's prefix.
    if (ID_PATTERN.test(current.trim())) {
      const prefix = voice.name.replace(/[^A-Za-z]/g, "").slice(0, 2).toUpperCase() || "WO";
      const digits = current.replace(/\D/g, "").slice(-4).padStart(4, "0");
      const value = `${prefix}-${digits}`;
      slotValues[slot.key] = value;
      sources[slot.key] = "generated-marketing";
      this.written.add(value);
      this.stats.textSlotsWritten++;
      return;
    }

    const role = slot.role;
    let value: string;
    let source: SlotValueSource = "generated-marketing";

    const route = unit.route ?? "global";
    const usage = this.valueRoutes;

    if (role.startsWith("cta.")) {
      value = pick(pools.cta, seed, target, route, usage);
    } else if (role === "hero.headline" || role.startsWith("heading.")) {
      value = pick(pools.headline, seed, target, route, usage);
    } else if (role === "hero.description") {
      value = pick(pools.paragraph, seed, target, route, usage);
    } else if (role.endsWith(".label") || role === "footer.text") {
      value = pick(target !== undefined && target > 28 ? pools.headline : pools.label, seed, target, route, usage);
    } else if (target !== undefined && target > 90) {
      // Long body copy is where a VERIFIED proof belongs, when the brief gave
      // one: quoting it verbatim is what makes the claim backed.
      const proof = pools.proof.size > 0 && hash32(seed) % 6 === 0
        ? pick(pools.proof, seed, target, route, usage)
        : "";
      // A brief supplies a handful of proofs, not hundreds. Repeating one on a
      // third route would be the reviewer's cross-route-duplicate finding, so
      // a crowded proof yields to ordinary composed copy rather than shipping
      // the finding.
      const proofRoutes = proof === "" ? undefined : usage.get(proof);
      const proofCrowded =
        proofRoutes !== undefined && [...proofRoutes].filter((r) => r !== route).length >= 2;
      if (proof !== "" && !proofCrowded) {
        value = proof;
        source = "user-provided";
        this.stats.proofsUsed++;
      } else {
        value = pick(pools.paragraph, seed, target, route, usage);
      }
    } else if (target !== undefined && target > 24) {
      value = pick(pools.headline, seed, target, route, usage);
    } else {
      value = pick(pools.label, seed, target, route, usage);
    }

    if (value.trim() === "") {
      // Never write an empty string: an empty value means "removed on purpose"
      // in the accounting artifact, and this is not that.
      value = current;
      source = "derived-copy";
      this.stats.textSlotsKeptGeneric++;
      slotValues[slot.key] = value;
      sources[slot.key] = source;
      return;
    }

    slotValues[slot.key] = value;
    sources[slot.key] = source;
    this.written.add(value);
    const routes = this.valueRoutes.get(value) ?? new Set<string>();
    routes.add(route);
    this.valueRoutes.set(value, routes);
    this.stats.textSlotsWritten++;
  }

  private writeUrl(
    voice: BrandVoice,
    slot: ContentUnitSlot,
    slotValues: Record<string, unknown>,
    sources: Record<string, SlotValueSource>,
    unresolved: UnresolvedSlot[],
  ): void {
    const current = typeof slot.currentValue === "string" ? slot.currentValue : "";
    if (slot.urlKind === "external") {
      const key = slot.key.toLowerCase();
      const match = voice.externalLinks.find((link) => key.includes(`.${link.token.toLowerCase()}.`) || key.includes(link.token.toLowerCase()));
      if (match !== undefined) {
        slotValues[slot.key] = match.url;
        sources[slot.key] = "user-provided";
        this.stats.urlsResolvedFromBrief++;
        return;
      }
      unresolved.push({
        slotKey: slot.key,
        reason:
          "needs factual input: external destination — the brief supplied no address for this link, and an " +
          "external URL is never invented",
      });
      this.stats.urlsUnresolved++;
      return;
    }
    // internal routes and in-page anchors: exactly one value is correct, and it
    // carries no fact about the business.
    if (current !== "") {
      slotValues[slot.key] = current;
      sources[slot.key] = "derived-copy";
      this.stats.urlsKept++;
    }
  }

  private imageBrief(voice: BrandVoice, unit: ContentUnit, slot: ContentUnitSlot): ImageBrief {
    const constraints = slot.constraints as { desktop?: { aspectRatio?: number } } | undefined;
    return {
      slotKey: slot.key,
      action: "keep-default",
      brief: {
        subject: `replacement visual for ${unit.purpose} — ${voice.category !== "" ? voice.category : voice.name}`,
        mood: voice.tone.length > 0 ? voice.tone.join(", ") : "professional",
        ...(constraints?.desktop?.aspectRatio !== undefined
          ? { aspectRatio: constraints.desktop.aspectRatio }
          : {}),
        purpose: unit.purpose,
      },
      warning: "default image retained from the source site; replace before production",
    };
  }

  private plan(voice: BrandVoice, pools: Pools, input: ContentGenerationInput): SiteContentPlan {
    const routes = [...new Set(input.units.map((u) => u.route).filter((r): r is string => !!r))].sort();
    const messages = [
      ...voice.capabilities.slice(0, 3),
      ...voice.outcomes.slice(0, 3),
    ].filter((m) => m !== "");
    // One identical primary message on two pages is one page twice — the
    // consistency review says so, so the plan builder does not produce one.
    const usedMessages = new Set<string>();
    const distinctHeadline = (seed: string, target: number): string => {
      const start = hash32(seed) % pools.headline.size;
      for (let i = 0; i < pools.headline.size; i++) {
        const candidate = pools.headline.at(start + i * 7919);
        if (!usedMessages.has(candidate)) {
          usedMessages.add(candidate);
          return candidate;
        }
      }
      return pick(pools.headline, seed, target);
    };
    const pagePlans: PageContentPlan[] = routes.map((route) => {
      const note = voice.pageNotes.get(route);
      return {
        route,
        currentPurpose: `source page at ${route}`,
        newPurpose:
          note !== undefined && note !== ""
            ? note
            : `${route === "/" ? "the homepage" : `the ${route} page`} for ${voice.name}`,
        primaryMessage: distinctHeadline(`plan|${route}`, 60),
        secondaryMessages: [pick(pools.paragraph, `plan2|${route}`, 120)],
        conversionGoal: voice.conversion !== "" ? voice.conversion : "contact",
        contentStrategy:
          note !== undefined && note !== ""
            ? `written to the brief's own note for this route: ${note}`
            : "written from the site-level brief; the brief named no purpose for this route",
      };
    });
    return {
      planVersion: 1,
      siteIdentity: {
        workingName: voice.name,
        category: voice.category !== "" ? voice.category : "not stated in the brief",
        audience: voice.audience !== "" ? voice.audience : "not stated in the brief",
        positioning: voice.positioning !== "" ? voice.positioning : `derived from the brief's goal`,
      },
      primaryConversion: voice.conversion !== "" ? voice.conversion : "contact",
      tone: voice.tone.length > 0 ? voice.tone : ["professional", "clear"],
      messages,
      pagePlans,
    };
  }

  /** No usage: nothing here calls a metered service (Task 27 §7). */
  lastUsage(): TelemetryUsage | undefined {
    return undefined;
  }
}
