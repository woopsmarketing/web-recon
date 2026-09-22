# Runtime Preservation — accepted architecture

Accepted decisions only. Status and next steps: [`../status/source-preservation-v2.md`](../status/source-preservation-v2.md).
Proof and reasoning: the evidence directories linked below.

## Product flow

```
SOURCE SITE
→ Source Capture
→ Source-Preserved Faithful Clone
→ Recon Template
→ Slots
→ Customer Site
```

The source-preserved faithful clone is the preservation/reference layer (it may preserve and execute
source HTML, CSS, public JS and public runtime data snapshots). The production/ownership layer
(Recon Template onward) must not depend permanently on source JS/CSS/backend.
See `docs/info/PRODUCT_VISION.md` §3–§4. Recon Template onward: [`recon-template-platform.md`](recon-template-platform.md).

## Invariant

**Interactive runtime replay MUST start from a bootstrap document/state compatible with the source
application's original startup lifecycle.**

- The settled runtime DOM (the post-runtime snapshot) **must not automatically be used as a hydration/mount base.**
- The settled runtime DOM is a static preservation artifact, a visual/fidelity baseline, a fallback, and
  forensic evidence.
- The bootstrap strategy is determined by the source runtime model. **SSR is not a universal assumption.**

## Bootstrap Model vs Adapter

| Term | Meaning |
|---|---|
| **Bootstrap Model** | Classification of how the source application starts: what document/state its runtime expects to find when its code first runs. |
| **Adapter** | The execution implementation that prepares that bootstrap document/state and runs the preserved source runtime for one model. |

Conceptual models (a vocabulary, **not** an implementation list):

| Model | Startup lifecycle | Status |
|---|---|---|
| `SSR_HYDRATION` | server-rendered initial response, client hydrates it | **PROVEN for one build** (see below) |
| `SSG_HYDRATION` | prebuilt static HTML, client hydrates it | unverified |
| `SPA_MOUNT` | near-empty shell, client mounts and renders | unverified |
| `CLASSIC_DOM_ENHANCEMENT` | server HTML, scripts enhance existing DOM (no hydration) | unverified |
| `PARTIAL_HYDRATION` | islands / selective hydration | unverified |
| `UNKNOWN` | not classified; do not replay interactively until classified | — |

## Current proven status

| Item | Status |
|---|---|
| Captured build | Apartmentary (`apartmentary.com` `/`) — Next.js 12.3.4 / React 17 (legacy hydrate) |
| `SSR_HYDRATION` model | **PROVEN for this build** |
| Strategy B (hydrate the compatible captured initial response) | **ACCEPTED** |
| Strategy A (hydrate the Phase 2 settled DOM) | **Not accepted** as the hydration base (positional node-reuse mismatch) |
| Runtime bootstrap base | the compatible captured **initial response** (Phase 1 main document) |
| Phase 2 settled DOM | static preservation artifact · fidelity baseline · fallback/evidence |
| Source JS | byte-identical in the accepted experiment (9/9 sha256) |
| Generic production SSR adapter | **NOT YET PRODUCTIZED** (the accepted run used an experiment harness under `tmp/`) |
| Other frameworks / bootstrap models | **UNVERIFIED** — no universal framework support is claimed |

Evidence: [`docs/result/source-preservation-phase3c1-strategy-b/`](../result/source-preservation-phase3c1-strategy-b/)
(start at `00-summary.md`).

## Known debt (non-blocking)

**Apartmentary intro video is still remote-source dependent.** The `main-introduce.mp4` body (~98 MB) was
not captured (Phase 1 media body policy off), so the video only shows when the S3 origin is reachable and
is blank under the fail-closed network.

- Evidence: [`docs/result/source-preservation-intro-media-forensic/`](../result/source-preservation-intro-media-forensic/)
- Decision: **DEFERRED** unless exact source-media preservation is required. A future Recon Template may
  replace it with customer media.
