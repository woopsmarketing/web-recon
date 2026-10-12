import pins from "./fonts.json";
import type { FontSetId } from "./contract";

/**
 * Font sets of the design system.
 *
 * design/fonts.json is the pinned declaration: per set, the OFL npm packages (exact version) the
 * files come from and the sha256 of the generated @font-face stylesheet — which names every font
 * file by the hash of its bytes, so that one hash pins the whole set. A Template directory holds no
 * binary file: the SITE BUILDER places the files of the site's set in the package
 * (platform/design/font-step.ts) at
 *
 *     /_fonts/<set>/<sha256[0:20] of the stylesheet>.css
 *     /_fonts/<set>/<sha256[0:20] of the file>.woff2
 *
 * and refuses the build when what it produces is not what this file pins. A path therefore never
 * changes content. The `system` set has no file and emits nothing.
 */
export const FONT_DIR = pins.dir;

const SANS_FALLBACK = 'system-ui, "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
const SERIF_FALLBACK = '"Nanum Myeongjo", "Apple Myungjo", Batang, ui-serif, Georgia, serif';

/**
 * The font-family lists of a set (null = the tier-1 tokens `typography.heading` / `typography.body`
 * decide, as on the classic site). Family names are those of the pinned packages. Every list is
 * also a valid tier-1 typography value (theme-contract-v1 font grammar): a preset writes the same
 * list into `typography.heading` / `typography.body`, so the classic inner pages use the set too.
 */
export const FONT_STACKS: Record<FontSetId, { display: string; body: string } | null> = {
  system: null,
  "sans-pretendard": {
    display: `"Pretendard Variable", Pretendard, ${SANS_FALLBACK}`,
    body: `"Pretendard Variable", Pretendard, ${SANS_FALLBACK}`,
  },
  "serif-noto": {
    display: `"Noto Serif KR Variable", "Noto Serif KR", ${SERIF_FALLBACK}`,
    body: `"Pretendard Variable", Pretendard, ${SANS_FALLBACK}`,
  },
};

/** Root-relative URL of the set's stylesheet in the package; undefined for `system`. */
export function fontStylesheetHref(fontSet: FontSetId): string | undefined {
  if (fontSet === "system") return undefined;
  const set = pins.sets[fontSet];
  return `/${pins.dir}/${fontSet}/${set.css.file}`;
}
