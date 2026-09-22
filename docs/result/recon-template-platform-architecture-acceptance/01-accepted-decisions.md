# 01 — Accepted decisions

Canonical wording: `docs/architecture/recon-template-platform.md`. Summary only.

1. A production Recon Template is a maintainable **Next.js code module authored once per design**.
2. The **Source-Preserved Faithful Clone** remains the strongest preservation/fidelity/reference baseline.
3. The **legacy DOM-replica production-template path is superseded** for the new multi-site production path
   and stays frozen as historical/evidence tooling.
4. **One Template codebase → many Site Instances.**
5. Customer differences come from content, site settings / controlled overrides, theme, assets, SEO / identity.
   No per-customer code forks.
6. Content: **small shared Core + vertical-specific extensions**.
7. Content describes what the business IS/HAS, not how a Template places it.
8. **Collections stored once, queried per view** (e.g. 174 projects → home featured 4, `/portfolio` all paginated).
9. **Slots** = narrow section-level copy/media placeholders. Not DOM, CSS, per-item or arbitrary config slots.
10. **No separate Template Mapper.** Settings → closed collection query; item → props in component code;
    transfer function only when Template switching is implemented.
11. **Template Defaults + sparse Site Overrides = Effective Settings.**
12. **Next.js App Router is the router.** No custom route DSL; the manifest keeps only useful route metadata.
13. **Storage boundary:** Template → site-scoped `ContentReader` / `SiteContext` → JSON now → Supabase later if introduced.
14. Template code **never depends on Supabase syntax**.
15. **MVP cache = the static per-site build.** No per-request DB read for public visitors.
16. Template versioning accepted. **A live site pins an exact immutable Template Release.** A major groups Releases
    and is not a floating pointer (Modification 1).
17. New implementation in **`templates/` + `platform/`**, same repository initially, separate from the legacy pipeline.
18. **Publication immutability:** a published site's presentation is frozen to its Release by default. Design changes
    affect new sites or explicit upgrades only.
