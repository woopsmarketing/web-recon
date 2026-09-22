# 03 — Next sequence

Also recorded in `docs/status/source-preservation-v2.md` → *Next*.

| Step | Work | Notes |
|---|---|---|
| 0 | Architecture acceptance | **DONE** (this record) |
| 1 | **Source JSON response body capture DEFAULT ON**, explicit opt-out | Separate bounded implementation task. **NEXT.** |
| 2 | **Apartmentary bounded observation** for home / portfolio list / portfolio detail | Gap filling only (see below). Not a whole-site re-research. Never claim the whole site is reproduced. |
| 3 | **Slice 1:** minimum platform foundation + one small Apartmentary section + one Template + several fictional Site Instances | Prove same Template code with different content, settings and theme, and no per-site fork |
| 4 | Portfolio list + detail + pagination | |
| 5 | Complete Apartmentary v1 homepage Template | |
| 6 | Customer-content replacement proof | |
| 7 | Second Template | First strong measurement of repeatable authoring cost. Widen generic abstractions only on evidence. |

Step 2 minimum evidence:

- `/portfolio?page=0`: desktop + mobile Source Package / preservation evidence
- `/portfolio?page=1`: desktop + mobile
- ≥ 2 portfolio detail pages per currently evidenced structural family
- Faithful Clone/reference for those list/detail pages
- navigation destination mapping
- header/footer logo rendering mechanism
- after Step 1 lands: relevant public JSON response structures, where safely captured

The earlier preservation plan (3D→3G) is no longer the current next step. Real public API capture is covered for
evidence purposes by Steps 1–2. 3F (real-data runtime replay QA) and 3G (preservation-adapter consolidation) are
not scheduled. Revisit them only if the preservation layer itself needs them.
