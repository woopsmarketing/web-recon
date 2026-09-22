# 01 — Current System Forensic (Part A)

READ-ONLY. This file records what the code does **today**. It makes no proposal. Proposals start in
`03-…`; the reuse verdicts are in `02-old-system-reuse-audit.md`.

## Verification basis

- **Scope.** Eight read-only investigations of the **current working tree** (not `HEAD` `6c2e723`).
  Many files under `src/` are uncommitted or untracked (`git status`), for example
  `src/production/brand-{bake,census,mark}.ts`, `src/seo/production-plan.ts` and
  `src/content-injection/brand-surfaces.ts`. Everything below describes that uncommitted state.
- **Main agent's own checks.** Nine load-bearing claims were re-checked directly in the source:
  - `src/storage/` holds only `.gitkeep`.
  - `package.json` has no DB, ORM or Supabase dependency and no `workspaces`.
  - `src/recon-template/compile.ts:139` sets `` templateId = `${host}-${options.runId}` ``.
  - `src/recon-template/collections.ts:28` says "There is NO pagination detection anywhere in this repo".
  - `src/production/patch.ts:27-34` adds `output: "export"`.
  - `src/production/patch.ts:59-60` adds `dynamic = "error"` and `dynamicParams = false`.
  - `src/production/static-server.ts:76-78` sends `immutable` for hashed paths and `no-cache` for everything else.
  - `src/slotized-template/` is imported only by its 5 CLI files.
  - `src/` has zero hits for `unstable_cache|revalidateTag|revalidatePath|cacheTag`.
- **Rule.** Findings come from code, not from documents. Where only a document supports a claim, the
  finding says **DOC-ONLY**.
- **Investigation labels.** Later files cite the eight investigations as `A1`–`A8`:

  | Label | Topic |
  |---|---|
  | A1 | Recon Template / Slot V2 |
  | A2 | Slotized Template V1 + SiteIdentity |
  | A3 | Content injection |
  | A4 | Release project / site record / editor |
  | A5 | Production build |
  | A6 | Theme / SEO / assets |
  | A7 | Collections / data / cache |
  | A8 | Apartmentary evidence |

  - `A<n> F<m>` is finding *m* of an investigation. `A8 §n` is section *n* of the Apartmentary evidence.
  - The working notes are not kept in the repository.
  - Load-bearing A1–A7 claims are restated below with FILE/SYMBOL. A8 claims resolve to repository paths
    in `13` § Evidence index.
- **Main-agent correction to A8.** A8 reported 34 crawl-verified URLs in 6 families and "no `/brand`,
  `/terms`, `/stores` or `/journal` route". That is wrong.
  - The canonical crawl run `data/apartmentary.com/2026-09-14T04-00-37-018Z/` holds **56** verified URLs
    (Playwright, all HTTP 200) in **16** families.
  - The 34-URL / 6-family set is a scoped subset in `tmp/apartmentary-scope/`, for an undocumented reason.
    It fed the 8-page structural observation.
  - `03`, `05` and `13` use the corrected numbers.

Layer legend:

- `PRESERVATION` — Source Capture and Faithful Clone evidence.
- `PRODUCTION (legacy DOM-replica path)` — the Observation → SiteSpec → Exact Reconstruction →
  Slot V2 → ProductionSpec chain.
- `TOOLING` — orchestration, QA and authoring tools, which are not part of any shipped site.

---

## 1. Template abstraction

```
FINDING 1.1 — "Recon Template" = one source site's compiled DOM replica + a byte copy of its app
FILE = src/recon-template/types.ts:66-78; src/recon-template/compile.ts:139,216-235;
       src/recon-template/generate-template-app.ts:50-99; src/recon-template/app-templates.ts:18-422
SYMBOL = generateTemplateApp(), TEMPLATE_MANIFEST_FILE…TEMPLATE_APP_DIR, templateId
CURRENT BEHAVIOR = A compile writes data/<host>/recon-templates/<runId>/{manifest, site-map, slots,
  slot-bindings, default-content, slot-overrides.example}.json + report/ + route-policy.json + app/.
  app/ is a recursive copy of the Exact Reconstruction Next.js app plus template-data/*.json, a generated
  src/runtime/slot-content.ts, a rewritten load-page.ts (drift-guarded on the literal
  "JSON.parse(raw) as RuntimePage") and package name wr-template-<host>. templateId = `${host}-${runId}`.
GENERIC OR SITE-SPECIFIC = Mechanism generic; every artifact byte (page trees, CSS, keys) site-specific.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION (legacy DOM-replica path), derived from observation.
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL (copy-then-add-seam doctrine; artifact shape is a clean container).
LIMITATIONS = A template IS one crawled site snapshot; no template exists independent of a source host.
  Every compile duplicates the whole app. No semantic components (see 9, 17).
```

```
FINDING 1.2 — The renderer inside that app is generic, but copied per template/site
FILE = <template app>/app/[[...slug]]/page.tsx; src/runtime/{load-route,PageRenderer,NodeRenderer}.tsx
       (generated from src/reconstruction/{app-template,runtime-template}.ts)
SYMBOL = CatchAllPage, findRoute, PageRenderer, renderNode
CURRENT BEHAVIOR = One catch-all route; renderNode() is a recursive createElement over JSON {k,n,t,p,c,v};
  comment: "No component map, no site-specific substitution". Desktop and mobile trees both render;
  CSS picks one.
GENERIC OR SITE-SPECIFIC = Code generic; data (page JSON, generated-styles.css, generated-config.ts) site-specific.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION (legacy).
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL — generic, but it renders opaque DOM, not maintainable components.
LIMITATIONS = Reuse is "same source copied N times", never "one running artifact for N sites".
```

```
FINDING 1.3 — Slotized Template V1 (Task 29/29.1) is a second, CLI-only template system
FILE = src/slotized-template/slotize.ts:460; render.ts:222-665; store.ts:26-37
SYMBOL = templateId "<host>:<reconstructionRunId>", renderTemplate()
CURRENT BEHAVIOR = Reads a Slot V2 run read-only, emits slots/bindings/groups/repeaters/theme/coverage +
  content-packs/default.json + theme-packs/default.json. renderTemplate copies the WHOLE reconstructed app
  per render and rewrites pages, route-map and a CSS overlay.
GENERIC OR SITE-SPECIFIC = Engine generic; templateId embeds source host + run.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION prototype (legacy path).
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL (see 2.2, 3.1).
LIMITATIONS = Imported only by its 5 CLI files (main-agent verified). No bridge to release/production/editor.
  It does not import src/regions, and src/regions does not import it (two disconnected template worlds on Slot V2).
```

## 2. Slot abstraction

```
FINDING 2.1 — Slot V2: DOM-occurrence slots keyed by template-specific paths
FILE = src/recon-template/types.ts:88-336 (types/scope/roles 178-193/editability), :149-170 & :377-421
       (surfaces, bindings); src/recon-template/assemble.ts:44-76 (keys); grouping.ts:157
SYMBOL = SlotDefinitionSchema, SlotBindingSchema, SLOT_ROLES, REVIEW_REPETITION_THRESHOLD=16
CURRENT BEHAVIOR = type text|url|image; scope global|page; 14 closed roles (hero.headline, cta.label, …);
  editability editable|review. key = "<page|global>.<section>.<name>" derived from DOM structure.
  A binding addresses (pageId, viewport, nodeId[, childIndex|svgTextIndex]) on static/dynamic-template/
  paint-twin surfaces with an expectedValue guard. stripe.com (route policy): 4,661 slots / 13,680 bindings.
GENERIC OR SITE-SPECIFIC = Schema + role vocabulary generic; keys and addresses site- and run-specific
  (types.ts:29-31: "slot KEYS … differ between sites; the ROLE field is the small shared vocabulary").
PRESERVATION OR PRODUCTION LAYER = PRODUCTION (legacy).
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL — role vocabulary is reusable as naming inspiration;
  keys/bindings are not portable (a re-crawl renumbers nodeIds).
LIMITATIONS = Granularity is "every DOM text/attr occurrence". Only customer-value channel = env
  WR_SLOT_VALUES_FILE, a flat {slotKey:value} file read once per process (app-templates.ts). `editability`
  is dropped by the applier's local TemplateSlot type (app-templates.ts:46-51) and never enforced at
  render/build.
```

```
FINDING 2.2 — Slotized V1: hashed slot ids, groups, structural repeaters, content packs
FILE = src/slotized-template/ids.ts:1-119; types.ts:409-575; repeaters.ts; repeaters-apply.ts; packs.ts:339-352
SYMBOL = slotIdOf/bindingIdOf/tokenIdOf (sha256-12), RepeaterDefinitionSchema, ContentPackSchema, MECHANICAL_REPEATERS
CURRENT BEHAVIOR = Slot id = hash of its binding ids. Repeater = container with ≥3 same-fingerprint children;
  add/remove/reorder by deep-cloning a captured prototype (clones keep duplicated data-wr-node ids for CSS).
  ContentPack = {templateId, templateVersion, slots:{slotId:value}, repeaters:{repeaterId:{items}}}; a wrong
  templateId is a hard throw (render.ts:234-238), proven by a negative control (audit.ts:1030-1045).
GENERIC OR SITE-SPECIFIC = Engine generic; MECHANICAL_REPEATERS hardcodes 5 pilot-site keys (packs.ts:346-352);
  corpora fixtures/task29/<host>.corpus.json are keyed by generated slot keys.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION prototype (legacy).
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL (pack↔template identity check and neutrality contract are good doctrine;
  hashed-id content keys are not portable across templates).
LIMITATIONS = Repeaters are page-scoped only and render all items at once: no pagination, no page size, no
  cross-page collection (types.ts:409-497). tokenIdOf ignores templateId, and ThemePack.templateId is never
  checked (render.ts, theme-css.ts).
```

## 3. Site identity

```
FINDING 3.1 — SiteIdentity schema exists only in the CLI prototype
FILE = src/slotized-template/site-identity.ts:1-363; render.ts:600-663
SYMBOL = SiteIdentitySchema {schemaVersion:"1", brandName, legalName?, publicOrigin?, slug, locale}, provenanceOf()
CURRENT BEHAVIOR = Strict zod; publicOrigin must be a bare http(s) origin; locale validated via Intl.
  Applied by text-anchor patches to route-map URLs, <html lang>, package name, generated-config SITE_*
  consts, layout metadata. Provenance (source host/template/run) is recorded separately from identity.
GENERIC OR SITE-SPECIFIC = Generic.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION prototype.
REUSABLE / PARTIAL / NOT REUSABLE = REUSABLE (schema + provenance/identity split). The anchor-patch application is NOT reusable.
LIMITATIONS = Tested on one pilot plus a synthetic fixture. Output dirs are still keyed by source host.
```

```
FINDING 3.2 — Release-layer identity: siteId never derived from host; host remains the storage key
FILE = src/release/create-site.ts:332-477 (resolveCreateSiteIdentity); src/release/types.ts:637-725;
       src/registry/types.ts (SiteEntry siteKey)
SYMBOL = siteId, projectId, source.host, siteKey "<host>/<projectId>"
CURRENT BEHAVIOR = siteId = explicit, or a slug of brief.workingName / goal, or site-<sha>. It is never the
  host slug (a documented defect where one customer overwrote another). Collision → -2, -3, … Registry key
  is host/projectId because legacy siteIds are not unique.
GENERIC OR SITE-SPECIFIC = Generic.
PRESERVATION OR PRODUCTION LAYER = TOOLING.
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL (derivation doctrine reusable; host-scoped keying not).
LIMITATIONS = No tenant/customer/account identity anywhere (grep tenant|customerId|multi-tenant → 0 across
  theme/seo/assets/brand/release). Every project still carries source.host.
```

## 4. Site / customer config

```
FINDING 4.1 — release-project-v1 is a proto Site Instance bound to one lineage of host-scoped runs
FILE = src/release/types.ts:637-725 (ReleaseProjectSchema), :562-575 (ArtifactRef); src/release/store.ts:58-81
SYMBOL = ReleaseProject {siteId, projectId, displayName?, source{host,rootUrl}, acceptedLineage{reconstruction,
  template, content, theme, seo, assets, production{spec,build}}, auxiliary, intent, target{mode,
  productionBaseUrl}, stageStatus, resolutions, authored, releaseState, technicalDebt, runs}
CURRENT BEHAVIOR = Stored at data/<host>/release-projects/<id>/release-project.json. Every lineage entry is
  {id, path, hash(dir-sha256-v1)}. target.mode ∈ preview|indexable-production. Written with plain writeFile
  (no temp+rename, no lock); only revision files use `wx`.
GENERIC OR SITE-SPECIFIC = Schema generic; values per site.
PRESERVATION OR PRODUCTION LAYER = TOOLING.
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL — preview/indexable mode, hash-pinned lineage and requirements
  gate are reusable ideas. The 7-stage lineage body is specific to the DOM-replica pipeline.
LIMITATIONS = Identity, config, content (authored.*), audit trail and pipeline bookkeeping live in one document.
  release/debt.ts reads docs/result/handoffs/24-aggregation-phase1.json as a runtime input.
```

## 5. Content injection

```
FINDING 5.1 — ContentBrief is template-independent but unstructured
FILE = src/content-injection/types.ts:114-120,180-246; brief.ts; brief-writer.ts:65-104
SYMBOL = ContentBriefSchema {goal?, workingName?, category?, audience?, positioning?, primaryConversion?,
  tone?[], routes?[], includeReview?, truthMode?, facts?: ProvidedFact[]}; ProvidedFact {kind:string, value:string}
CURRENT BEHAVIOR = Brief → content units → provider → validated slot-values. `kind` is an open string.
  No phone/address/hours/services field exists in any schema. A grep for phone|address|hours|email in
  src/content-injection/ finds only comments, prompt text and the truth-mode claim pattern "phone-number"
  (truth-mode.ts:72). None of the hits is a schema field.
GENERIC OR SITE-SPECIFIC = Generic.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION input.
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL (good onboarding intake; not a content model).
LIMITATIONS = No structured business facts, no collections, no item identity.
```

```
FINDING 5.2 — All generated/authored content is keyed by template-specific slot keys
FILE = src/content-injection/validate.ts:150-153; units.ts:37-168; types.ts:292-300,440-467
SYMBOL = validateSlotAssignments ("unknown-slot-key"), ContentUnitKind (7 values, no collection)
CURRENT BEHAVIOR = slot-values.json is keyed e.g. "global.header.nav.homepage.href"
  (data/linear.app/content-runs/wr28-vfy-p9-B). A key absent from a template fails validation. `role` is
  used only to classify units locally, never to transfer values. No importer of slotized-template anywhere in
  content-injection, create-site or production.
GENERIC OR SITE-SPECIFIC = Engine generic; persisted content template-specific.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION.
REUSABLE / PARTIAL / NOT REUSABLE = NOT REUSABLE as persisted content (not portable across templates).
LIMITATIONS = Reusing a customer's content on another template means regenerating it from the brief.
```

```
FINDING 5.3 — Honesty machinery around content is generic and strong
FILE = src/content-injection/truth-mode.ts:1-284; accounting.ts:104-289; validate.ts:1-249; providers.ts:40-61;
       run.ts:361-415
SYMBOL = applyTruthMode (verified-only | synthetic-allowed, FACT_CLAIM_PATTERNS, source-fact-carried-over);
  SlotOrigin × SlotDisposition; FORBIDDEN_SCHEMES (javascript:, data:, vbscript:, file:, blob:), HTML_INJECTION;
  ContentGenerator {generate()} (Fake | Brief (deterministic, not an LLM) | manual JSON | AuthoredResult);
  CONTENT_WRITE_DOCTRINE_WARNING
CURRENT BEHAVIOR = Unbacked fact-shaped claims are withheld under verified-only. The accounting is reconciled
  against the template's full slot population. Validation is provider-agnostic. A content run's slot-values.json
  is declared DERIVED; authored.slotValues is authoritative.
GENERIC OR SITE-SPECIFIC = Generic.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION / TOOLING.
REUSABLE / PARTIAL / NOT REUSABLE = REUSABLE (rules, validator, provider seam), after retargeting from slot keys
  to content fields.
LIMITATIONS = Regex claim detection only. No live LLM provider.
```

## 6. Theme

```
FINDING 6.1 — theme-contract-v1 + curated library: already template- and site-agnostic
FILE = src/theme/types.ts:36-243; themes/library/{cool-neutral,dark-accent,warm-editorial}.theme.json;
       src/theme/run.ts:260-273; src/theme/compatibility.ts:42-204; src/theme/stylesheet.ts
SYMBOL = ThemeFileSchema, COLOR_TOKENS(15)/DECORATION_TOKENS(7)/TYPOGRAPHY_TOKENS(2), isSafeThemeValue,
  checkThemeCompatibility, contrastRatio
CURRENT BEHAVIOR = A theme file is a strict map of ≤24 closed token ids → safe CSS values. It structurally cannot
  carry selectors. The compatibility check gives a 3-verdict result with WCAG-style contrast thresholds.
  Overlay variables are named --wr-theme-<token>.
GENERIC OR SITE-SPECIFIC = Generic (library files carry no host/template).
PRESERVATION OR PRODUCTION LAYER = PRODUCTION config.
REUSABLE / PARTIAL / NOT REUSABLE = REUSABLE.
LIMITATIONS = Typography tokens are representable but never applied. Paint-only; no container width, spacing
  scale or button/header style (PRODUCT_VISION §8 lists those).
```

```
FINDING 6.2 — Applying a theme = selector overlay over one compiled template's generated classes
FILE = src/theme/types.ts:335-364 (SiteThemeAdapterSchema); extract.ts:764-897; overlay.ts:65-133;
       serve.ts (preview proxy); src/production/bake.ts:98-105 (bakeTheme)
SYMBOL = extractSiteTheme, generateThemeOverlay, bakeTheme
CURRENT BEHAVIOR = The adapter is keyed by templateId and binds tokens to paint groups of .wr-stNNNNNN selectors.
  Overlay CSS is appended to the cascade (preview proxy) or baked into public/wr/theme-overlay.css plus a
  layout link.
GENERIC OR SITE-SPECIFIC = Engine generic; adapter/overlay bound to one template's generated CSS.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION (legacy).
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL — valid for every site of one compiled template, meaningless for
  authored code that consumes CSS variables directly.
LIMITATIONS = Theme packs in slotized V1 are never checked against templateId.
```

## 7. SEO

```
FINDING 7.1 — Source snapshot vs production plan are structurally disjoint; production values carry basis
FILE = src/seo/types.ts:1-461 (7-12 rationale); source-observe.ts:78-315; production-plan.ts:30-543;
       robots-sitemap.ts:1-65; brand-isolation.ts:1-127; store.ts:18-24
SYMBOL = source-seo-snapshot-v1, production-seo-plan-v1, PlannedValue {value, status known|needs-input, basis,
  previewFallback}, buildProductionSeoPlan, deriveRouteHeadings, checkTitleUniqueness, checkForbiddenCopy,
  generateRobotsTxt/generateSitemapXml, deriveForbiddenTerms
CURRENT BEHAVIOR = Plan route universe = the compiled template's route-map.json minus disabledRoutes. Titles are
  `known` only with an authored basis; otherwise needs-input with a brand-only preview fallback. Canonical is
  never invented without a domain. Preview gets `Disallow: /` and a path-only sitemap.preview.xml. Forbidden
  terms are derived from source evidence (host, og:site_name, JSON-LD org).
GENERIC OR SITE-SPECIFIC = Engine generic; plan per site; dirs keyed by host.
PRESERVATION OR PRODUCTION LAYER = snapshot PRESERVATION; plan PRODUCTION.
REUSABLE / PARTIAL / NOT REUSABLE = REUSABLE (rules, schemas, gates). The route universe and heading derivation
  are tied to slot keys (PARTIAL).
LIMITATIONS = Single locale. Production head is applied by HTML splice (postProcessExport) and a route-map title
  bake, not framework metadata. production-plan.ts changes are uncommitted.
```

## 8. Assets

```
FINDING 8.1 — Safe fetch + content-addressed storage + conservative classification; storage per host/run
FILE = src/assets/safe-fetch.ts:1-466; materialize.ts:1-321; classify.ts:1-189 (fonts R1 :71-76); fonts.ts;
       types.ts:373-411 (replacement manifest); store.ts:12-18
SYMBOL = safeFetchAsset, isPrivateAddress, /media/<sha256>.<ext>, classifyEntry R1–R10, ReplacementManifestSchema
CURRENT BEHAVIOR = SSRF-hardened, DNS-pinned, byte-capped fetch limited to observed hosts; identical bytes collapse
  to one file. Logos, favicons, og and brand-term files → replacement-required (never fetched). Fonts are always
  license-needs-review. The replacement manifest's "provided" status is never consumed (seam not closed).
GENERIC OR SITE-SPECIFIC = Engine generic; dirs data/<host>/asset-materializations/<run>/.
PRESERVATION OR PRODUCTION LAYER = inventory reads PRESERVATION; materialization PRODUCTION.
REUSABLE / PARTIAL / NOT REUSABLE = REUSABLE (fetcher, hashing, classification doctrine). Source-asset inventory is
  not a customer-asset model (PARTIAL).
LIMITATIONS = No customer upload model, no per-site asset registry, no responsive variants. Three near-duplicate
  brand-term extractors (seo/brand-isolation, assets/classify, content-injection/brand-surfaces).
```

```
FINDING 8.2 — Brand detection/census is generic; brand resolution rewrites captured IR
FILE = src/content-injection/brand-surfaces.ts:1-538; src/production/brand-census.ts:1-470 (untracked);
       brand-bake.ts:47-878 (untracked); brand-mark.ts:1-164 (untracked)
SYMBOL = BRAND_SURFACES(14), brandSurfaceIdOf, censusServedHtml/censusFlightPayload, RESOLVABLE_BRAND_SURFACES(6),
  bakeBrand (REPLACE|REMOVE|PRESERVE), generatedMarkFor (wordmark/monogram from the customer's own name)
CURRENT BEHAVIOR = The census measures both SSR HTML and the RSC flight payload. bakeBrand mutates the build copy's
  page IR and re-measures residual from disk.
GENERIC OR SITE-SPECIFIC = Generic engines; decisions per site.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION / TOOLING.
REUSABLE / PARTIAL / NOT REUSABLE = census PARTIAL (generic measurement, but it imports legacy code transitively and
  only reports; see the legacy-imports table below); generated marks REUSABLE; bakeBrand (captured-IR resolver) PARTIAL.
LIMITATIONS = CSS background-image brand marks unmeasured; 9 surface classes not resolved by bake.
```

## 9. Page model

```
FINDING 9.1 — A page is a pair of captured DOM trees plus an 11 MB site stylesheet
FILE = src/reconstruction/types.ts:105-165; public/wr/generated-styles.css (linear.app 11.3 MB)
SYMBOL = RuntimePage {pageId, desktop: RuntimeViewport, mobile: RuntimeViewport}, RuntimeNode {k,n,t,p,c,v}
CURRENT BEHAVIOR = One JSON tree per crawled page per viewport; styles are .wr-stNNNNNN classes bucketed from
  computed styles; two-viewport responsive model.
GENERIC OR SITE-SPECIFIC = Schema generic; instances site-specific.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION (legacy).
REUSABLE / PARTIAL / NOT REUSABLE = NOT REUSABLE as a maintainable production page model (PRODUCT_VISION §5/§7).
LIMITATIONS = No components, no data fields, no tokens at node level. Intermediate-width fidelity failures are
  measured in 28.75–28.8 and the responsive audits (DOC-evidence of the model's limits).
```

## 10. Route model

```
FINDING 10.1 — Closed, crawl-derived route table; many routes may share one captured page
FILE = src/reconstruction/route-plan.ts; src/reconstruction/types.ts:207-229
SYMBOL = RuntimeRouteMap {schemaVersion, rootUrl, breakpoint, pageBreakpoints?, routes: RuntimeRoute[]},
  routeKeyFromUrl (pathname + sorted query)
CURRENT BEHAVIOR = route-map.json written once at reconstruction; a key collision is a hard error; pageFile is
  many-to-one (renderCoverage "family-represented"); unknown path → notFound().
GENERIC OR SITE-SPECIFIC = Mechanism generic; route set = what one crawl verified.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION (legacy).
REUSABLE / PARTIAL / NOT REUSABLE = NOT REUSABLE for content-driven routes.
LIMITATIONS = Adding one portfolio item requires crawl → reconstruction → template → build.
```

## 11. Dynamic routes

```
FINDING 11.1 — One catch-all; dynamic lookup in the template app, fully static export in production
FILE = src/reconstruction/app-template.ts:186-229; runtime-template.ts:139-252; generate-app.ts:377;
       src/production/patch.ts:27-99; src/production/bake.ts:118-131
SYMBOL = CATCH_ALL_PAGE_TSX (force-dynamic), PRODUCTION_PAGE_TSX (dynamic="error", dynamicParams=false,
  generateStaticParams over route-map), patchNextConfig (output:"export"), convertToStaticExport
CURRENT BEHAVIOR = The template app resolves exact route keys per request. The production bake rewrites the same
  file to prerender every route-map key and throws if any key contains "?" (static hosts ignore query strings).
GENERIC OR SITE-SPECIFIC = Generic.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION (legacy).
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL — static export + generateStaticParams + dynamicParams=false is the right
  production mechanism; the parameter source (a crawl table) is not.
LIMITATIONS = No [slug] over a data source; no middleware, route handlers or ISR (verified: no `middleware.ts`, `route.ts` or `export const revalidate` under `src/`; the only `generateStaticParams` is the one `production/patch.ts:66` patches into the catch-all `app/[[...slug]]/page.tsx`). Query-string pagination
  such as Apartmentary's /portfolio?page=0 cannot be exported.
```

## 12. Collection / list / detail behavior

```
FINDING 12.1 — Collections are detected and described, never implemented
FILE = src/recon-template/collections.ts:1-197 (28-35); src/recon-template/types.ts:527-589, :644;
       src/registry/scan.ts:73-101
SYMBOL = CollectionSpec {collectionId, semanticKind, detailPattern, indexRoute, discoveredMemberCount
  (countIsFloor: true), estimatedTotalMembers: z.null(), fieldHints, renderPolicy}
CURRENT BEHAVIOR = Buckets SiteSpec families by routeScope/pattern (≥2 members). Comment: "NOT a blog engine: no
  article CRUD, no category UI, no publishing flow, no CMS". types.ts:644: "Repeated route families, detected —
  not implemented". Sole consumer: the registry summary.
GENERIC OR SITE-SPECIFIC = Generic.
PRESERVATION OR PRODUCTION LAYER = TOOLING (analysis).
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL (a source-analysis signal only).
LIMITATIONS = No item schema, storage, list page or detail page driven by data.
```

```
FINDING 12.2 — Page families and Route Scope Policy choose among crawled routes; they cannot mint routes
FILE = src/selector/types.ts:193-332; src/sitespec/types.ts:1577-1609 (1581-1584); src/recon-template/route-policy.ts
SYMBOL = PageFamilyType (content-duplicate|sibling-pattern|scope-structure|singleton);
  RouteScope (core-reconstruct|collection-index|collection-representative|structure-only|exclude)
CURRENT BEHAVIOR = A family is "a statement about routes, not about a React tree". The policy prunes slot
  extraction at compile time (stripe 9,529 → 4,661 slots); rendering is unchanged.
GENERIC OR SITE-SPECIFIC = Generic engines; policy files site-specific.
PRESERVATION OR PRODUCTION LAYER = TOOLING (compile-time).
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL (useful when analysing a source's collection-like routes).
LIMITATIONS = Bounded by one crawl; "collection-representative" = one captured page reused, not a parametric
  detail template.
```

## 13. Pagination

```
FINDING 13.1 — None, including detection
FILE = src/recon-template/collections.ts:28 (verified), :182-184; src/recon-template/types.ts:571-573;
       src/discovery/normalize-url.ts:14-17
SYMBOL = estimatedTotalMembers: z.null(); countEvidence "…crawl-capped-no-pagination-detection"
CURRENT BEHAVIOR = Query strings are kept as page identity and never interpreted. grep for paginat*/pageSize/
  perPage/rel=next/load more → no domain hits.
GENERIC OR SITE-SPECIFIC = n/a.  PRESERVATION OR PRODUCTION LAYER = n/a.
REUSABLE / PARTIAL / NOT REUSABLE = NOT REUSABLE (absent).
LIMITATIONS = Full gap.
```

## 14. Filtering / sorting

```
FINDING 14.1 — None
FILE = repo-wide grep (sortBy|filterBy|sortOrder|facet) in src/ → no domain hits (verified: the single match is `facetime` inside the URL-scheme regex at `reconstruction/link-rewriter.ts:42`)
SYMBOL = n/a
CURRENT BEHAVIOR = No query vocabulary exists anywhere. The only "selection" is Route Scope Policy (routes)
  and repeater item lists (in-page, all items).
GENERIC OR SITE-SPECIFIC = n/a.  PRESERVATION OR PRODUCTION LAYER = n/a.
REUSABLE / PARTIAL / NOT REUSABLE = NOT REUSABLE (absent).
LIMITATIONS = Full gap. Apartmentary's bundle does contain a price-bucket filter vocabulary (13-apartmentary).
```

## 15. ProductionSpec

```
FINDING 15.1 — production-spec-v1: hash-pinned lineage, static-export build mode, unparseable-unsafe gate
FILE = src/production/types.ts:15-112; src/production/hash.ts:1-91
SYMBOL = productionSpecSchema {lineage{template, contentRun, theme, seoPlan, assets}{dir,hash,fileCount,byteCount,
  excluded}, baseUrl (PlannedValue-like), buildMode{chosen:"static-export", behaviorDeltas}, indexabilityGate
  {decision preview|indexable, robotsPolicy, blockers[]}}, HASH_METHOD "dir-sha256-v1"
CURRENT BEHAVIOR = One spec = one site build. A zod superRefine makes "indexable with blockers" unparseable.
  Verified on data/linear.app/production-specs/wr28-vfy-p4-prod.
GENERIC OR SITE-SPECIFIC = Generic.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION.
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL→REUSABLE (hashing, gate, baseUrl, buildMode reusable; lineage shape
  names the legacy run types).
LIMITATIONS = Cannot express "template version + site config + content snapshot" lineage.
```

## 16. Production compiler / generator

```
FINDING 16.1 — Copy the template app, patch it with anchor guards, bake data, export statically, package, QA
FILE = src/production/run.ts:203-233 (CompileOptions.host), :248-665; bake.ts; patch.ts; enablement.ts;
       packaging/static-server.ts; qa.ts
SYMBOL = runProductionCompile, copyTemplateApp, applyEnablementToApp, bakeContent, bakeTheme, bakeSeoTitles,
  bakeBrand, convertToStaticExport, buildStaticExport, postProcessExport, assemblePackage, runProductionQa
CURRENT BEHAVIOR = Order: copy (excluding node_modules/.next/out) → enablement → content bake → theme bake →
  SEO title bake → brand bake → static-export patch → `npx --no-install next build` → head splice, asset rewrite,
  robots, brand census → package/{site, server.mjs, deploy-manifest.json, RUN.md}. patch.ts requireOnce/
  requireAbsent throw when the generated text changes. QA runs the package from an OS temp copy with env PATH
  only: Playwright titles/meta/JSON-LD/JS errors/external-request census/link audit/title uniqueness, brand census
  on server bytes and post-hydration DOM.
GENERIC OR SITE-SPECIFIC = Generic; one host per call; output data/<host>/production-builds/<run>/.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION.
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL — copy→build→package→isolated-QA and the static-server cache policy are
  reusable; the patch/bake steps exist only because the template is opaque generated code.
LIMITATIONS = No fan-out across sites. Full `next build` per site. The template never reads data; all data is
  pre-baked into JSON trees.
```

## 17. Generated-code ownership

```
FINDING 17.1 — Everything is machine output; no human-owned boundary exists
FILE = src/reconstruction/app-template.ts:132-152 ("Do not edit — `pnpm reconstruct` rewrites this file");
       src/recon-template/generate-template-app.ts; src/production/bake.ts:63-69
SYMBOL = generatedConfigTs, generateTemplateApp, copyTemplateApp
CURRENT BEHAVIOR = Three successive copy-then-patch generators (reconstruction → recon-template → production).
  No overrides/, components/ or custom/ directory at any layer (verified on the linear.app build tree).
  recon-template/overrides.ts is a template-authoring-time slot-extraction fix, not a code seam.
GENERIC OR SITE-SPECIFIC = n/a (structural).
PRESERVATION OR PRODUCTION LAYER = PRODUCTION.
REUSABLE / PARTIAL / NOT REUSABLE = NOT REUSABLE for maintainable ownership (contradicts PRODUCT_VISION §15).
LIMITATIONS = Any code-level fix must go into a generator and be regenerated for every site.
```

## 18. Template cloning / materialization

```
FINDING 18.1 — Full-tree copies per template, per render, per build; one preview build + overlay per site
FILE = src/recon-template/generate-template-app.ts:50-56; src/slotized-template/render.ts:222-309;
       src/production/bake.ts:63-69; src/authoring-preview/{workspace,session}.ts (writeAtomic :62-66)
SYMBOL = cp(sourceAppDir,…), renderTemplate, copyTemplateApp, materializeAuthoringPreview, AuthoringOverlay
CURRENT BEHAVIOR = Copies are disposable and inputs stay pristine (hash before/after in createSite). The authoring
  preview builds once and hot-reloads an overlay dir (slot-values/theme css/media) via an epoch file and atomic
  writes. Enablement needs a worker restart.
GENERIC OR SITE-SPECIFIC = Generic.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION / TOOLING.
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL — "disposable build copy, pristine input" and atomic write doctrine reusable.
LIMITATIONS = Copies exist because data is baked into the app tree, not read at build/request time.
```

## 19. Storage / data-source abstractions

```
FINDING 19.1 — No storage abstraction, no database; host-scoped file namespaces everywhere
FILE = src/storage/.gitkeep (only file, verified); package.json (no DB deps, verified); src/selector/store.ts:43,
       src/content-injection/run.ts:88, src/content-injection/load-template.ts:43 (private readJson ×3);
       src/release/store.ts:58-60,73-81; src/registry/store.ts:11-21,79-82; src/release/create-site.ts:174-238
SYMBOL = <x>Dir(host, runId) = data/<host>/<namespace>/<runId>; registry data/.registry/{templates,sites}.json;
  findMatchingThemeRun/SeoPlanRun/PageRegionsRun
CURRENT BEHAVIOR = Each module computes its own paths and reads/writes JSON with node:fs + local zod. All stage
  artifacts are shared per HOST; release projects point at them by path+hash. createSite discovers the newest
  run matching templateId with an O(n) scan. The registry is a rebuildable cache ("the artifact always wins").
GENERIC OR SITE-SPECIFIC = Generic convention; host is the partition key.
PRESERVATION OR PRODUCTION LAYER = TOOLING.
REUSABLE / PARTIAL / NOT REUSABLE = NOT REUSABLE as a storage seam; registry "cache never authoritative" doctrine reusable.
LIMITATIONS = No refcount on shared runs; plain writeFile for project/registry docs (no atomic replace/lock);
  data/ is gitignored. A move to a DB would touch every module's call sites.
```

## 20. Caching / revalidation

```
FINDING 20.1 — No data or page cache; one blanket HTTP policy in the generated server
FILE = src/production/static-server.ts:74-78 (verified); src/reconstruction/runtime-template.ts:163-186;
       src/authoring-preview/serve.ts:196,266; repo grep (verified 0 hits: unstable_cache|revalidateTag|revalidatePath|cacheTag)
SYMBOL = cacheControl(urlPath), loadRouteMap/loadPage module memo, revalidateSlotValues (unrelated: content re-validation)
CURRENT BEHAVIOR = /_next/static/* and /media/* → "public, max-age=31536000, immutable"; everything else →
  "no-cache". In-process memo in the dynamic template server ("no queue, no LRU, no external cache").
  Authoring preview forces no-store.
GENERIC OR SITE-SPECIFIC = Generic.
PRESERVATION OR PRODUCTION LAYER = PRODUCTION (server.mjs) / TOOLING (preview).
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL (the immutable-vs-no-cache split is a sane static default).
LIMITATIONS = Freshness = full re-bake + redeploy. No per-route or per-collection invalidation concept.
```

## 21. Site-specific overrides

```
FINDING 21.1 — AuthoredState: the one authoritative per-site delta, folded last
FILE = src/release/types.ts:224-482; src/release/instance.ts:76-153; src/release/authored.ts:477-529;
       src/release/stages.ts:107-120,358-363; src/release/graph.ts (AUTHORED_FIELD_IMPACTS)
SYMBOL = AuthoredState {slotValues, theme{themeSourceFile?,tokens?}, assets?, brand?, disabledRoutes?,
  disabledRegions?, updatedAt}, foldResolutionIntoAuthored, commitAuthoredEdits
CURRENT BEHAVIOR = Resolution packs fold INTO authored and are kept as an audit trail. At build every stage applies
  authored last. Field→stage impact tables mark what goes stale.
GENERIC OR SITE-SPECIFIC = Schema generic; values per site, keyed by template slot keys / region ids.
PRESERVATION OR PRODUCTION LAYER = TOOLING → PRODUCTION input.
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL (precedence doctrine reusable; keys not portable).
LIMITATIONS = No "template default vs allowed override" declaration; anything with a slot key can be set.
```

```
FINDING 21.2 — Enablement: safety-checked subtraction of captured regions/routes
FILE = src/release/enablement.ts:1-1323; src/production/enablement.ts:117-189; src/regions/{compile,skeleton,enablement}.ts
SYMBOL = ENABLEMENT_REFUSAL_CODES (shared-page-blast-radius, global-region-requires-explicit-global,
  interaction-cut-*, last-route, …), dead-internal-link requirement, regionId "<scope>:rgn:<landmark>:<childPath>"
CURRENT BEHAVIOR = A disable is recorded as data and physically removed only in the build copy. It is
  re-evaluated on every read/build. Links to disabled routes are removed only when that is deterministic;
  otherwise they become a requirement.
GENERIC OR SITE-SPECIFIC = Generic engines.
PRESERVATION OR PRODUCTION LAYER = TOOLING → PRODUCTION.
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL — the safety doctrine is reusable; the region model exists because
  sections are not declared.
LIMITATIONS = Region ids reroute under upstream inserts (45 of 68, `docs/result/27-authoring-foundation-template-factory-v2-2026-08-27.md:134`). No template-author-locked concept (grep for `author-locked`, `authorLocked`, `template-author` in `src/`: 0 hits).
```

```
FINDING 21.3 — Route Scope Policy and recon-template overrides are compile-time, not per-site
FILE = src/recon-template/route-policy.ts; src/recon-template/overrides.ts; src/release/create-site.ts:110-139
SYMBOL = RouteScopePolicy, selectRouteScope
CURRENT BEHAVIOR = createSite trusts the template's frozen per-route scope; a site cannot change it.
GENERIC OR SITE-SPECIFIC = Generic.  PRESERVATION OR PRODUCTION LAYER = TOOLING.
REUSABLE / PARTIAL / NOT REUSABLE = NOT REUSABLE as a site-override mechanism.
LIMITATIONS = Conflating these with site overrides would be a mistake.
```

## 22. Multi-site reuse

```
FINDING 22.1 — "N sites per template" exists as N independent pipelines over shared host-scoped runs
FILE = src/release/create-site.ts:1-716; src/production/run.ts:203-233; src/theme/types.ts:335-364;
       src/editor/server.ts:693; src/editor/session.ts:53-83
SYMBOL = createSite({templateManifestFile, brief, siteId?, contentProvider?}), CompileOptions.host
CURRENT BEHAVIOR = createSite hashes the template before and after (proof of non-mutation), generates content from
  the brief, reuses the newest theme/SEO/assets runs matching templateId, compiles production, registers a new
  project. The theme adapter is valid for every site of one templateId. A "Switchyard" customer reusing a
  linear.app template run is DOC-ONLY corroborated (28-visual-production-workflow). The editor is a single-tenant
  127.0.0.1 node:http server with one mutable runtime.
GENERIC OR SITE-SPECIFIC = Generic.
PRESERVATION OR PRODUCTION LAYER = TOOLING → PRODUCTION.
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL — "template never mutated, site = deltas" is exactly right. Mechanics
  (full app copy + full build per site; host as template proxy; O(n) discovery; no refcount) do not scale.
LIMITATIONS = A template bug fix means recompiling the template → new templateId → every site needs a new
  production-spec and prepare (no upgrade flow, see 23). No auth, no tenancy, no concurrency control.
```

## 23. Template versioning

```
FINDING 23.1 — Engine counters + exact run pin; no site-level template version or upgrade path
FILE = src/recon-template/types.ts:41-64; src/release/types.ts:668-681; src/release/prepare.ts:211-343;
       src/release/build.ts:185-194; src/slotized-template/ids.ts (templateVersionOf), render.ts:234-238
SYMBOL = RECON_TEMPLATE_SCHEMA_VERSION=1, SLOT_SCHEMA_VERSION=2, TEMPLATE_COMPILER_VERSION=3;
  acceptedLineage.template ArtifactRef{id,path,hash}; ContentPack.templateVersion
CURRENT BEHAVIOR = A site pins one template run dir by id+path+hash. Drift in a frozen stage → build refuses. No
  --template-run flag on release:prepare. The only upgrade logic in release/registry/editor is the
  release-project schema adapter from revision 1 to 2 (adaptReleaseProject, release/instance.ts:186-202).
  Nothing upgrades a site's template.
  Slotized packs carry templateVersion; a mismatch only warns.
GENERIC OR SITE-SPECIFIC = Generic.
PRESERVATION OR PRODUCTION LAYER = TOOLING.
REUSABLE / PARTIAL / NOT REUSABLE = PARTIAL (hash pin + refuse-on-drift doctrine reusable).
LIMITATIONS = No semantic version, no compatibility rule, no bulk upgrade, no deprecation.
```

---

## Supplementary anchors (added after independent review)

`02` cites these concepts. The main agent located them in code after the review.

| Concept | FILE / SYMBOL |
|---|---|
| Append-only revision chain | `src/release/revisions.ts` — `AuthoredRevisionSchema`, `hashAuthoredState`, `diffAuthoredState`, `REVISION_ORIGINS` (prepare/resolve/edit/restore); `"wx"` exclusive writes |
| Resolution packs (natural-language intake) | `src/release/nl.ts:48` `resolveResolutionParser`; `src/release/instance.ts:80` `foldResolutionIntoAuthored` |
| 7-stage DAG + freshness | `src/release/types.ts:46` `RELEASE_STAGES`; `src/release/graph.ts:43` `STAGE_ORDER`; `src/release/freshness.ts`; `stageStatus` in `src/release/build.ts:93-207` |
| Editor API contracts | `src/editor/server.ts:401` `/api/preview-value`, `:413` `/api/save`, `:438` `/api/undo` |
| Site / page content plans | `src/content-injection/types.ts:252` `PageContentPlanSchema`, `:265` `SiteContentPlanSchema` |
| Extracted original theme | `src/theme/run.ts:94,127`: `originalTheme` written to `ORIGINAL_THEME_FILE` |

**Legacy imports inside reuse candidates** (checked by grep on `from "../<module>"`):

| Module | Status |
|---|---|
| `src/content-injection/truth-mode.ts:1-2` | Imports `SlotValue`, `LoadedReconTemplate`. `applyTruthMode` takes a template; `claimBackedByFacts` takes `ProvidedFact` |
| `src/content-injection/validate.ts:1-2` | Imports `ImageSlotValueSchema`, `SlotDefinition`, `LoadedReconTemplate` |
| `src/content-injection/brand-surfaces.ts:27` | Imports `ROUTE_MAP_FILE`, `RUNTIME_DATA_DIR` from reconstruction |
| `src/slotized-template/site-identity.ts:4` | Imports reconstruction runtime page types |
| `src/theme/compatibility.ts:43` | `checkThemeCompatibility(adapter: SiteThemeAdapter, …)` |
| `src/production/brand-census.ts:18-25` | Imports `content-injection/brand-surfaces.ts`, which imports reconstruction constants (transitive legacy import) |
| `src/production/qa.ts:19` | Runtime import of `brandTokensFromHost` from `brand-surfaces.ts`. `qa.ts:681`: "The census is REPORTED, never gated". Terms come from `manifest.sourceHost` (`qa.ts:360`); served HTML and hydrated DOM are scanned (`:416`, `:489`), static JS chunks are not |
| `src/production/packaging.ts` (`assemblePackage`) | Clean itself; its `production/types.ts:12-13` type-imports the legacy `brand-bake` and `brand-census` reports |
| `src/production/bake.ts:63` (`copyTemplateApp`), `:135-145` (`buildStaticExport`) | The file imports `brand-surfaces.ts` (`:24`) and the asset rewrite (`:23`). The build runs `npx --no-install next build` with the full `process.env`, and dependencies "resolve upward" from the app copy |
| `src/release/revisions.ts:36-37` | Imports the release-project store and `AuthoredState` (superseded `release-project-v1`) |
| `writeAtomic` | Only implementation is a private function in the superseded `src/authoring-preview/workspace.ts:62` |
| brand-mark, `seo/production-plan.ts`, `seo/brand-isolation.ts`, `assets/safe-fetch.ts`, `assets/classify.ts`, static-server, `production/hash.ts`, `theme/stylesheet.ts` (contrast math) | No legacy imports, direct or through their local `types`/`store` modules (checked after the second independent review) |

---

## Summary table

| # | Area | Current reality (one line) | Verdict |
|---|---|---|---|
| 1 | Template | Compiled DOM replica of one crawled host, copied per site | PARTIAL |
| 2 | Slot | DOM-occurrence slots, template-specific keys | PARTIAL |
| 3 | Site identity | SiteIdentity (CLI prototype); siteId doctrine; host is storage key | PARTIAL/REUSABLE |
| 4 | Site config | release-project-v1 mixes identity/config/content/pipeline | PARTIAL |
| 5 | Content injection | Brief → slot values; honesty machinery strong; no content model | PARTIAL |
| 6 | Theme | Contract + library reusable; selector overlay legacy | REUSABLE / PARTIAL |
| 7 | SEO | Snapshot/plan split + needs-input + robots/sitemap gates | REUSABLE |
| 8 | Assets | Safe fetch + content addressing; no customer asset model | REUSABLE / PARTIAL |
| 9 | Page model | Captured desktop/mobile trees + generated CSS | NOT REUSABLE |
| 10 | Route model | Closed crawl table | NOT REUSABLE |
| 11 | Dynamic routes | Static export over fixed table | PARTIAL |
| 12 | Collections | Detected, not implemented | PARTIAL (analysis) |
| 13 | Pagination | Absent | NOT REUSABLE |
| 14 | Filter/sort | Absent | NOT REUSABLE |
| 15 | ProductionSpec | Hash lineage + gate | REUSABLE (extend lineage) |
| 16 | Compiler | Copy→patch→bake→export→package→QA | PARTIAL |
| 17 | Code ownership | All generated, no human boundary | NOT REUSABLE |
| 18 | Materialization | Disposable copies; atomic overlay preview | PARTIAL |
| 19 | Storage | None; host-scoped files | NOT REUSABLE |
| 20 | Cache | Blanket static header only | PARTIAL |
| 21 | Overrides | AuthoredState + enablement safety | PARTIAL |
| 22 | Multi-site | Independent full pipelines per site | PARTIAL |
| 23 | Versioning | Exact run pin, no upgrade | PARTIAL |
