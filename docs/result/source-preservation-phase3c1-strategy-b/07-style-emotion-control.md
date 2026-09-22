# 07 — Style / Emotion control

The question: did the footer get fixed because the hydration structure matched, or does it only look fixed because the
CSS environment changed?

## Sheet inventory (document order; `cssomTextHash` from the 3C StyleFidelityProbe)

| # | B0 | B1 | B2 | B3 | B4 |
|---|---|---|---|---|---|
| sheets / `<style>` | 7 / 5 | 8 / 6 | 8 / 6 | 8 / 6 | 8 / 6 |

Order at B1–B4:
1. `css-global` (SSR, 3,090 B, 20 rules, `1d505f02`)
2. SSR `css …` tag (20,339 B, 107 rules, `df812eac`)
3. client speedy `css` tag (text 0; 43 → 111 → 150 → 183 rules)
4. `/_next/static/css/80139…` (`7fbf1480`)
5. `/_next/static/css/d7c08…` (`e0429fb9`)
6. Roboto font style (`c78e3aba`)
7. Material Icons style (`9ac1fdb0`)
8. empty `css-global 0`

B0 is the same set before Emotion hydrated the tags: the empty `css-global 0` first, no client tag, no `data-s`.

Strategy A settled (F2) had **11** sheets:
- the same SSR `css-global` (`1d505f02`, text emptied) and SSR `css` (`df812eac`);
- the client `css` tag with **150 rules, hash `6d32fac8`, identical to B3's client tag**;
- **plus the A-only Phase 2 preserved tags:** `css-global` 3,028 B (`06244748`), runtime-derived `css` 23,857 B /
  159 rules (`537a0872`), styled-components 2,672 B (`58419472`);
- the same two CSS files by hash;
- Roboto/Material (Phase 2 URL-rewritten bodies, `b4f980b8`/`1efed129`);
- `css-global 0`.

## Rules for the decisive classes

| class (label) | rule origin in B (every point where the class is present) | rule origin in A | same rule? |
|---|---|---|---|
| `css-1rr4qq7` (content wrapper, `flex:1`) | SSR `css` tag, rule 66: `flex-grow 1; flex-shrink 1; flex-basis 0%` | same tag (`df812eac`), rule 66 | **yes** |
| `css-v7v99c` (final spacer, `width:100px`) | SSR `css` tag, rule 106: `width:100px` | same tag, rule 106 | **yes** |
| `css-1qi39fj` (md row) | client tag (`6d32fac8` at B3), rule 101 | client tag, **and** a byte-identical duplicate in A-only `537a0872` | same declarations |
| `css-17taob2` (md logo, 30%) | client tag, rule 102 | client tag + byte-identical duplicate in `537a0872` | same declarations |
| `css-1d3bbye` (md grid) | client tag, rule 103 | client tag + byte-identical duplicate in `537a0872` | same declarations |

No A-only sheet has a rule matching the content wrapper or the final spacer at any probed point. The A-only duplicates
for the row, logo and grid declare the same values as the client-tag rules that both arms share. They cannot produce
different computed values.

## Distinguishing the explanations

| test | result |
|---|---|
| did the `width:100px` rule itself change? | **no**: same tag hash, same rule index, same declaration in A and B |
| did its stylesheet change? | **no**: the SSR `css` tag is byte-identical (`df812eac`, 20,339 B) in both arms |
| does another declaration override it? | **no**: in B, `v7v99c` has one origin and computes to 100 px on the spacer; in A the same single origin computes to 100 px on the content wrapper |
| is the decisive difference **which DOM node carries the class**? | **yes**: B3 `v7v99c` sits on B0#3 (0 children); A F2 `v7v99c` sits on the node holding the 7 columns. `1rr4qq7` (rule 66) sits on the content node in B, and on no settled footer-row child in A. The class is a generic `flex:1` Box class, used on 6 other elements elsewhere in A's settled document |

**Strongest form of confirmation** (`result-consistency.json → S.strongestForm`, `strategy-b-result.json → style.strongestForm`):
- the same `.css-v7v99c { width:100px }` rule exists in both arms;
- in B it applies only to the actual empty spacer;
- in A it applies to the content wrapper;
- the content wrapper in B owns `.css-1rr4qq7 { flex:1 1 0% }` (908 px).

## Confounder assessment

- The style composition **did** change (D3): 11 sheets in A vs 8 in B, because of 3 Phase 2 preserved tags.
- The change is causally irrelevant to the footer width:
  - both decisive rules are shared byte-for-byte;
  - the A-only tags only duplicate client rules;
  - in A the footer had already collapsed at F1 (3C `06`), before the client tag held any footer rule.
- **Style/Emotion: not a material confounder.**
- Also noted: Emotion hydration moved and tagged the SSR tags (`data-s`, `css-global 0` to the end) the same way in
  both arms. No style tag was deleted, reordered or modified by the harness.
