# 02 — Three-site proof

One Template Release, three fictional Site Instances, three static packages, no per-site code.

## Exact release

| Field | Value |
|---|---|
| templateId / version | `interior-01` / `1.0.0` |
| releaseId | `interior-01-1.0.0-f27823c3b837` |
| releaseHash | `f27823c3b8379ece2a341ca93561efb669b9e3e4fa7776d475195795a538b7a4` |
| templateSourceHash | `f489c9b2fbea7190e943beb6dd1ac0485825726c5c3dd62281c69a934bf5a602` |
| files | 26 (13 template, 11 platform runtime + tsconfig, package.json, pnpm-lock.yaml); read-only |
| store | `data/template-releases/interior-01/interior-01-1.0.0-f27823c3b837/` (the superseded `…-1ddf327cb1b9` is kept: it backs the previous packages) |

All three `site.json` pins carry exactly this `releaseId` + `releaseHash`. All three build records carry
the same `releaseHash` and `templateSourceHash` (tests A, B). The test also re-hashes the working tree and
proves it equals the pinned release (no drift).

## Sites

| | fixture-large | fixture-small | fixture-empty |
|---|---|---|---|
| Identity | Harbor & Pine Studio, `en-US`, logo SVG | 마루 아틀리에 (가상), `ko-KR`, wordmark fallback | Quiet Room Works, `en-GB`, wordmark |
| Content | 176 records: 173 published, 2 draft, 1 scheduled (2031); 3 categories; 24 generated covers | 12 projects, 2 categories (6 residential) | 0 projects, 0 categories |
| Settings overrides | none (defaults: latest, limit 8) | `home.projects-a`: `limit 4`, `selection {category: residential}` | none |
| Slot values | `home.projects-a.description` | 3 header labels, `home.projects-a.title` + `description`, 2 footer labels | none |
| Theme | template default | 9 token overrides (warm canvas, brown text, terracotta action, 14px radius, Georgia headings) | template default |
| Email | yes → header Contact + footer | yes | none → no Contact link |
| **Rendered** | header + 8 cards (latest, id tie-break) + footer | header + 4 residential cards + custom title/intro + footer | header + footer, **no section, no wrapper, no anchor** |
| buildInputId | `82412fcf4c1454067491b9396828f26143c7507fa192e5d8c1dbca3b7a54be56` | `8c695e94ed817ef578bde899801a825ab3ec50d5688f6f907e31f66363e8275d` | `63d1a815e1823d9123d120f30308269b06b5796e7b549c8c83be67ba66c8caca` |
| siteSnapshotHash | `1b9d8888dceec207…` | `a00dafbc026c6806…` | `39bbc11057043f6b…` |
| packageHash | `c81867e68fdc514a…` | `ce048bd2c5a8a679…` | `19584a7d5693d2ba…` |
| build time (total / install / next build / QA) | 6.4 s / 1.5 / 4.5 / 0.01 | 6.4 s / 1.5 / 4.5 / 0.01 | 6.5 s / 1.5 / 4.6 / 0.01 |
| package | 48 files, 678 KB (25 content-addressed assets) | 35 files, 659 KB | 23 files, 635 KB |

Shared `toolchainHash` `22e72379efb1…` (node v22.22.3, pnpm 11.21.0, darwin arm64).

## Slot override proof (same code, different copy)

Resolved slot sources recorded in each build record:

| Slot | large | small | empty |
|---|---|---|---|
| `site.header.homeLinkLabel` | neutral-default "Home" | site "홈" | neutral-default |
| `site.header.projectsNavLabel` | neutral-default "Projects" | site "프로젝트" | neutral-default |
| `site.header.contactLabel` | neutral-default "Contact" | site "문의하기" | neutral-default (not rendered: no email) |
| `home.projects-a.title` | neutral-default "Selected projects" | site "주거 공간 프로젝트" | neutral-default (section absent) |
| `home.projects-a.description` | site (English intro) | site (Korean intro) | hidden |
| `site.footer.summary` | binding → business.summary | binding | binding |
| `site.footer.companyLabel` | neutral-default "Company" | site "상호" | neutral-default |
| `site.footer.emailLabel` | neutral-default "Email" | site "이메일" | neutral-default (not rendered: no email) |

Same release, same template files: fixture-large renders "Selected projects"/"Projects"/"Company",
fixture-small renders "주거 공간 프로젝트"/"프로젝트"/"상호" (checked in the built HTML by the test suite).

## Screenshots

`screens/` — `fixture-{large,small,empty}-{desktop-1440,mobile-390}.png` + `visual-smoke.json`.
fixture-small is visibly re-skinned (canvas, serif headings, rounded cards, terracotta CTA) by theme data
alone; fixture-empty shows header + footer with the footer pinned to the bottom and no project hole
beyond the (intentionally) empty main area.

## Rollback foundation

Each site keeps `current.json` + `previous.json` and at most two package directories.

Real fixtures (not only the test): each was first built on release `…-1ddf327cb1b9`, then re-pinned
to `…-f27823c3b837` and rebuilt. The older package stayed intact as `previous`:

| Site | current (f27823c3b837) | previous (1ddf327cb1b9) | package dirs |
|---|---|---|---|
| fixture-large | `82412fcf4c14…` | `fdf9ab7fc163…` | 2 |
| fixture-small | `8c695e94ed81…` | `3db5670a3233…` | 2 |
| fixture-empty | `63d1a815e182…` | `3f2f594f6341…` | 2 |

The full lifecycle is also proven in a throwaway root (test):
- build A, then rebuild with the same inputs: reported up-to-date.
- a failed build leaves A current.
- B replaces A, and A is kept as previous, unmodified.
- a forced rebuild of the same id keeps both.
- rebuilding back to A keeps both, and B becomes previous.
- C prunes B.

A forced rebuild of fixture-large gave the identical packageHash `c81867e68fdc…`, so the build is deterministic.
