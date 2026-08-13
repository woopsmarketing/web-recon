# web-recon — Roadmap

High-level plan only. Details are decided per-phase, not up front.

## Phase 1 — Foundation ✅ (current)

Project init, toolchain, directory skeleton, Firecrawl/Playwright ready to run.

## Phase 2 — Firecrawl URL Discovery

Use Firecrawl as a Discovery Adapter to enumerate a site's URLs. Kept behind an
adapter boundary so Firecrawl is not coupled into the rest of the engine.

## Phase 3 — Playwright Static Observation

Per URL: DOM / computed CSS / geometry / assets / screenshot.

## Phase 4 — Interaction Candidate Detection

Detect elements likely to have dynamic behavior.

## Phase 5 — Rule-Based Interaction Explorer

Explore known interaction patterns deterministically.

## Phase 6 — AI Explorer for Unknown Behaviors

AI-assisted exploration for behaviors that rules can't cover.

## Phase 7 — Pattern Registry

Core philosophy: **Explore Once → Automate Forever.**

## Phase 8 — SiteSpec

A structured specification describing an observed site.

## Phase 9 — Next.js Reconstruction

Generate a reconstruction from a SiteSpec.

## Phase 10 — Original vs Clone QA / Automatic Repair

Compare original and clone, repair discrepancies.

## Phase 11 — Full Site Reconstruction

End-to-end reconstruction of a whole site.

---

## Deferred / Future

- SEO analysis over stored observation data
- Competitive analysis over stored observation data
