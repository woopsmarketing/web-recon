# web-recon documentation

Entry point. Read this first, then only what the task needs.

| Need | Read |
|---|---|
| Product vision | [`info/PRODUCT_VISION.md`](info/PRODUCT_VISION.md) |
| Accepted architecture — preservation layer | [`architecture/runtime-preservation.md`](architecture/runtime-preservation.md) |
| Accepted architecture — Recon Template platform (production path) | [`architecture/recon-template-platform.md`](architecture/recon-template-platform.md) |
| Current state / next phase | [`status/source-preservation-v2.md`](status/source-preservation-v2.md) |
| Historical / experimental evidence | [`result/README.md`](result/README.md) |

## Rules for agents

- **Architecture and status are the current authoritative navigation layer.** Consult them before
  reusing any decision found in an older report.
- **Do not read `docs/result/` sequentially.** Use `result/README.md` to jump to the one directory
  that holds the evidence you need, and start from its `00-summary.md` / `README.md`.
- **Old experiment reports are historical evidence.** Do not rewrite them to match later conclusions.
  When a later decision supersedes one, record that in architecture/status, not in the old report.
- New task reports go under `docs/result/<task-name>/`. Update `status/` only when the current milestone
  changes, and `architecture/` only when an architecture decision is accepted.
