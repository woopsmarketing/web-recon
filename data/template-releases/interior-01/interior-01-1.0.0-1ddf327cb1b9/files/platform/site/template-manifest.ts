import type { SectionDeclarations } from "../settings/settings";
import type { ThemeTokenId } from "../theme/theme";

/**
 * Template manifest: only fields with a named consumer.
 *   id/version   → release snapshot, site pin, build record
 *   sections     → settings validation (Effective Settings)
 *   theme        → theme validation (consumed tokens) + default theme
 *   routes       → build QA (which pages must exist in the package)
 */
export interface TemplateManifest<D extends SectionDeclarations = SectionDeclarations> {
  id: string;
  version: string;
  vertical: "interior";
  sections: D;
  theme: { consumes: readonly ThemeTokenId[]; defaults: unknown };
  routes: readonly { key: string; path: string }[];
}

export function defineTemplate<D extends SectionDeclarations>(manifest: TemplateManifest<D>): TemplateManifest<D> {
  return manifest;
}
