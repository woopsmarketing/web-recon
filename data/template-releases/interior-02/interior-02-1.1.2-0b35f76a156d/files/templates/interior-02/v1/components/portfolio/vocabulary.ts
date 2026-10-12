import type { ProjectItem } from "../../sections/types";

/**
 * Display words for the CLOSED built-space vocabularies of the content model (`projectType`,
 * `propertyType`). The ids are the platform's closed vocabulary; the words are presentation only:
 * a Korean site locale reads Korean, every other locale the neutral English form. Nothing here
 * decides a fact — a row renders only for a field the record authors.
 */
type ProjectType = NonNullable<ProjectItem["projectType"]>;
type PropertyType = NonNullable<ProjectItem["propertyType"]>;

const korean = (locale?: string) => locale !== undefined && /^ko(-|$)/i.test(locale);

const PROJECT_TYPE: Record<ProjectType, { ko: string; en: string }> = {
  full_remodel: { ko: "전체 리모델링", en: "Full remodel" },
  partial_remodel: { ko: "부분 리모델링", en: "Partial remodel" },
};

/** Every canonical id has a word (a new id fails the typecheck here, never renders raw). */
const PROPERTY_TYPE: Record<PropertyType, { ko: string; en: string }> = {
  apartment: { ko: "아파트", en: "Apartment" },
  officetel: { ko: "오피스텔", en: "Officetel" },
  villa: { ko: "빌라", en: "Villa" },
  detached_house: { ko: "단독주택", en: "Detached house" },
  mixed_use: { ko: "주상복합", en: "Mixed-use" },
  commercial: { ko: "상업공간", en: "Commercial" },
};

export function projectTypeText(type: ProjectType, locale?: string): string {
  const w = PROJECT_TYPE[type];
  return korean(locale) ? w.ko : w.en;
}

export function propertyTypeText(type: PropertyType, locale?: string): string {
  const w = PROPERTY_TYPE[type];
  return korean(locale) ? w.ko : w.en;
}
