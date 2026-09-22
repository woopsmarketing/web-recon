# 06 — Generic runtime-preservation architecture (proposal, not implementation)

Nothing here is built. This is the conceptual shape Phase 3B would implement, chosen so
that the diagnostic site is one input among many rather than the design's origin.

## Where this layer sits

Three axes already exist in code and must not be collapsed:

| axis | phase | type | question it answers |
|---|---|---|---|
| capture | 1 | `Preservability` | were the bytes obtainable? |
| re-host | 2 | `ResourceOrigin` / `ScriptAction` | can they be served locally? |
| **execute** | **3** | **`RuntimeExecutionClass`** | **can they run?** |

`src/source-package/types.ts:414` pins `executionIndependence` to the literal
`"unknown"`, with the comment *"Phase 1 never proves execution independence."* **Phase 3
must not widen that literal.** Phase 1's honesty is a contract. The runtime layer
references `ScriptEntry` by id and carries its own verdict in its own artifact.

Likewise Phase 2's `ScriptAction` enum is neutralization-only
(`neutralized-inline | neutralized-src | kept-data`). Phase 3 needs the inverse —
activation — and the channel already exists: Phase 2 emits `data-preservation-src`,
`data-preservation-original-type` and `data-preservation-bytes` on every neutralized
node. **Reversing three attributes is the activation mechanism.** It must stay that way:
Phase 2's first design decision is that the runtime DOM is edited *in place*, because
cascade correctness is a consequence of never regenerating the document. Any activation
step that rebuilds markup re-inherits the cascade-ordering problem Phase 2 avoided by
construction.

## Core types

```
RuntimeScriptNode        id · sourceRef(ScriptEntry) · role · executionClass ·
                         viewports[] · domOrder · bodyRef · confidence · reasons[]

RuntimeDependencyEdge    from · to · edgeType · evidence · confidence
                         edgeType ⊇ DOM_ORDER · BUNDLER_RUNTIME_REQUIRED ·
                         CHUNK_REGISTRY · ROUTE_MANIFEST · DYNAMIC_IMPORT ·
                         MODULE_IMPORT · NETWORK_INITIATOR · DATA_FETCH

RuntimeFeatureEvidence   feature · implementedBy[] · evidence[] · confidence ·
                         couplings[]   ← where RUNTIME_COUPLED lives

RuntimeExecutionClass    LOCAL_EXECUTABLE_CANDIDATE · LOCAL_EXECUTABLE_WITH_DEPENDENCIES ·
                         SOURCE_BOUND · EXTERNAL · TRACKER · UNKNOWN

RuntimeRole              BOOTSTRAP_RUNTIME · BUNDLER_RUNTIME · FRAMEWORK_RUNTIME ·
                         APP_RUNTIME · PAGE_CHUNK · LAZY_CHUNK · UI_LIBRARY ·
                         DATA_BOOTSTRAP · RUNTIME_CONFIG · THIRD_PARTY_WIDGET ·
                         ANALYTICS · UNKNOWN

RuntimeReplayPlan        orderedSteps[] · optional[] · blocked[] · excluded[] ·
                         interceptions[] · unresolvedInputs[] · expectedObservables[]
```

Role and execution are **separate axes**, deliberately. This phase produced a node that
is `PAGE_CHUNK / LOCAL_EXECUTABLE_WITH_DEPENDENCIES` yet functionally inert without data —
a state a single merged enum cannot express, and one that changes what Phase 3B should do.

### Two fields the diagnostic forced into the design

- **`RuntimeReplayPlan.unresolvedInputs[]`** — runtime inputs the capture does not
  contain (here: four API responses). Without it, a plan can look complete while being
  unable to render anything. Every plan must state what it cannot supply.
- **`RuntimeFeatureEvidence.couplings[]`** — `BUNDLE_COLOCATED` /
  `RUNTIME_COUPLED` / `UNKNOWN_UNTIL_REPLAY`. "Same file" and "cannot initialize
  without" are different facts and the schema must not merge them.

## Generic core + optional recognizers

The core knows only: scripts, DOM order, network initiators, bytes, and edges with
evidence. It must produce a usable graph for a site with **no bundler at all**.

Recognizers are pure enrichment — they add nodes' roles and higher-confidence edges to a
graph that is already valid without them:

| recognizer | detects via | contributes |
|---|---|---|
| Generic DOM/script | always runs | DOM_ORDER edges, inline/external, defer/async semantics |
| Webpack | chunk-array push protocol, `__webpack_require__` | chunk ids, registry edges, publicPath, chunk tables |
| Next.js | `__NEXT_DATA__`, `__NEXT_P`, `_buildManifest` | route→chunk edges, SSR/SSG mode, page module |
| ESM/Vite | `type="module"`, `modulepreload`, static `import` | module graph edges |
| React evidence | ReactDOM markers, root attach call | hydrate-vs-render mode, **hydration risk flag** |
| Classic/jQuery/vanilla | absence of all the above | DOM_ORDER only; still a valid graph |

**No recognizer may be required.** A WordPress/jQuery site, a legacy script site, or an
unknown bundle must all yield a `RuntimeReplayPlan` — a weaker one, with more `UNKNOWN`,
which is the correct outcome rather than a failure.

The React recognizer's hydration-mode output earns its place here: whether a runtime
hydrates or renders fresh determines whether activating it over a preserved DOM is safe.
That is generic React knowledge, not site knowledge.

## Interception, not byte-patching

The diagnostic's API origin is a build-time literal with no env indirection, so the naive
fix is to edit the bytes. **The architecture should refuse that as its default.** Phase 2's
whole premise is that preserved bytes are preserved.

`RuntimeReplayPlan.interceptions[]` must describe redirection at a layer that **actually
sees the traffic** *(corrected after review, M3)*. Runtimes routinely call absolute
cross-origin hosts, so:

- a **same-origin proxy** is insufficient in general — cross-origin requests bypass it;
- a **service worker** is insufficient for first-load traffic — it does not control the
  navigation that installs it;
- **browser-level request routing** (automation-layer interception, host-resolver
  mapping) is the generic mechanism that sees every request regardless of origin or
  timing.

Every interception is recorded. Byte rewriting remains available, but only as a declared,
logged exception.

## Execution needs its own serving mode

*(Added after review, M1.)* A preservation clone and a runtime replay have **opposite
security requirements**. Phase 2 serves under `script-src 'none'` at variant
subdirectories — correct, because nothing may run. A runtime replay needs scripts
permitted and, for root-relative bundlers, a server root. That is not a flag to flip on
the existing preview; it is a distinct serving mode. The static preview's guarantee must
stay intact for everything that is not an explicit runtime experiment.

This also closes the ledger gap in `04`: an interception is a residual, and recording it
is what Phase 2's own rule demands.

## Generality guard

Searched the proposal above for source coupling. Forbidden in any production identifier,
and absent from it: the diagnostic site's name or hosts, `Swiper`, any carousel library
name, `NextRuntimePreserver` or equivalent, and the observed desktop/mobile breakpoint
number. Site names appear in this phase's *reports and evidence only*, which is permitted.

Two specific traps this phase had to avoid:

- **Next.js is not the universal case.** It is one recognizer. The core must not assume a
  bundler, a route manifest, or a hydration step.
- **The observed breakpoint stays diagnostic.** The finding is that responsive switching
  is a `matchMedia` decision *inside the running program* — mechanism, not constant. No
  number becomes a rule. Phase 3B may later test whether the source JS reproduces the
  switch on its own; that is a measurement, not a configuration value.
