/**
 * Display words for the CLOSED built-space vocabularies of the content model — `projectType` and
 * `workScopeIds` (Integration Contract V0.2 §5, §7.3). Template code, like the unit symbols in
 * format.ts: the ids are the platform's closed vocabulary, the words are presentation only. A Korean
 * site locale reads Korean (the same words the first-party chat consumer uses for these ids); every
 * other locale reads the neutral English form.
 *
 * Nothing here decides a fact. The caller renders a row only for a field the record authors; no id
 * is ever inferred from the title, the category, the display `scope` text or a price.
 */
import type { ProjectItem } from "../sections/types";

type ProjectType = NonNullable<ProjectItem["projectType"]>;
type WorkScopeId = NonNullable<ProjectItem["workScopeIds"]>[number];

const korean = (locale?: string) => locale !== undefined && /^ko(-|$)/i.test(locale);

const PROJECT_TYPE: Record<ProjectType, { ko: string; en: string }> = {
  full_remodel: { ko: "전체 리모델링", en: "Full remodel" },
  partial_remodel: { ko: "부분 리모델링", en: "Partial remodel" },
};

/** Every canonical id has a word (a new id fails the typecheck here, never renders raw). */
const WORK_SCOPE: Record<WorkScopeId, { ko: string; en: string }> = {
  entrance: { ko: "현관", en: "Entrance" },
  living_room: { ko: "거실", en: "Living room" },
  dining: { ko: "다이닝", en: "Dining" },
  kitchen: { ko: "주방", en: "Kitchen" },
  pantry: { ko: "팬트리", en: "Pantry" },
  bedroom: { ko: "침실", en: "Bedroom" },
  kids_room: { ko: "아이방", en: "Kids' room" },
  dressing_room: { ko: "드레스룸", en: "Dressing room" },
  study: { ko: "서재", en: "Study" },
  bathroom: { ko: "욕실", en: "Bathroom" },
  hallway: { ko: "복도", en: "Hallway" },
  balcony: { ko: "발코니", en: "Balcony" },
  storage: { ko: "창고", en: "Storage" },
  utility: { ko: "다용도실", en: "Utility room" },
  flooring: { ko: "바닥", en: "Flooring" },
  wallpaper: { ko: "도배", en: "Wallpaper" },
  lighting: { ko: "조명", en: "Lighting" },
  windows: { ko: "창호", en: "Windows" },
  doors: { ko: "문", en: "Doors" },
  tiling: { ko: "타일", en: "Tiling" },
  painting: { ko: "도장", en: "Painting" },
  plumbing: { ko: "배관·수전", en: "Plumbing" },
  electrical: { ko: "전기", en: "Electrical" },
  built_in_furniture: { ko: "붙박이·제작 가구", en: "Built-in furniture" },
  expansion: { ko: "확장", en: "Balcony extension" },
  demolition: { ko: "철거", en: "Demolition" },
};

/** full_remodel → "전체 리모델링" / "Full remodel". */
export function projectTypeText(type: ProjectType, locale?: string): string {
  const w = PROJECT_TYPE[type];
  return korean(locale) ? w.ko : w.en;
}

/** The authored work-scope ids, in authored order (a set: no id is added, dropped or merged). */
export function workScopeText(ids: readonly WorkScopeId[], locale?: string): string {
  return ids.map((id) => (korean(locale) ? WORK_SCOPE[id].ko : WORK_SCOPE[id].en)).join(", ");
}
