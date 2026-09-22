# Recon Template Platform — Architecture Acceptance

Date: 2026-09-18 · Mode: architecture acceptance only (docs). No implementation, no source/runtime change, no commit.

**ARCHITECTURE_STATUS = ACCEPTED_WITH_MODIFICATIONS**

The proposal in [`../recon-template-platform-architecture-study/`](../recon-template-platform-architecture-study/)
(`00`–`16`) was independently reviewed. Its core direction is accepted with five modifications. The study is
kept unchanged as historical design evidence. Where it differs from the accepted architecture, the
architecture document wins.

| File | Contents |
|---|---|
| [`01-accepted-decisions.md`](01-accepted-decisions.md) | What was accepted |
| [`02-modifications-to-proposal.md`](02-modifications-to-proposal.md) | The five modifications and which proposal statements they override |
| [`03-next-sequence.md`](03-next-sequence.md) | Steps 0–7 |

Authoritative docs updated:

- **New:** `docs/architecture/recon-template-platform.md` (accepted boundaries, invariants, deferrals)
- `docs/status/source-preservation-v2.md`: architecture status and a new *Next* sequence (JSON default-ON → bounded Apartmentary observation → Slice 1)
- `docs/README.md`: navigation row for the new architecture file
- `docs/architecture/runtime-preservation.md`: one-line pointer
- `docs/result/README.md`: index rows for the study and this record

Unchanged: the study reports, `CLAUDE.md`, `PRODUCT_VISION.md`, all `src/`, scripts, and frozen artifacts.
