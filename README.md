# web-recon

An independent **Web Reconstruction Engine**: observe a public website, turn its
structure / design / behavior into data, then reconstruct it in a different
technology stack.

## Pipeline (long-term vision)

```
URL
→ Discover
→ Observe
→ Understand
→ Reconstruct
→ Verify
→ Learn
```

## Current status: **Phase 1 — Foundation**

Only the project foundation exists today:

- TypeScript + tsx toolchain (Node 22+, pnpm)
- Dependencies installed and importable: `firecrawl`, `playwright`, `zod`, `dotenv`, `pino`
- Basic directory skeleton for future modules
- Environment loading via `.env` (`FIRECRAWL_API_KEY`)
- A minimal CLI and a Playwright/Chromium smoke test

**No** crawling, DOM/CSS/screenshot collection, interaction exploration, AI,
pattern registry, or reconstruction is implemented yet. See `ROADMAP.md`.

## Requirements

- Node.js **>= 22**
- pnpm (via `corepack enable pnpm`)

## Setup

```bash
pnpm install
pnpm exec playwright install chromium

cp .env.example .env   # then fill in FIRECRAWL_API_KEY (optional in Phase 1)
```

## Usage

```bash
# CLI (Phase 1: reads and echoes the target URL only)
pnpm recon https://example.com

# Type check
pnpm typecheck

# Playwright environment smoke test
pnpm smoke:playwright
```

## Project structure

```
web-recon/
├── src/
│   ├── cli.ts            # Phase 1 CLI entry point
│   ├── config/env.ts     # env loading + validation (zod)
│   ├── discovery/        # (Phase 2) Firecrawl URL discovery adapter
│   ├── observer/         # (Phase 3) Playwright static observation
│   ├── explorer/         # (Phase 4-6) interaction exploration
│   ├── patterns/         # (Phase 7) pattern registry
│   ├── schema/           # shared schemas (SiteSpec, etc.)
│   └── storage/          # persisted observation data
├── scripts/
│   └── smoke-playwright.ts
├── data/                 # runtime output (gitignored)
├── .env.example
├── README.md
└── ROADMAP.md
```

## Working principles

- **Small Task Principle** — one clear goal per task.
- **Stop at Task Boundary** — do not start the next task on your own.
- **Persist Decisions** — record important design decisions in Markdown, not just chat context.

See `ROADMAP.md` for the phased plan.
