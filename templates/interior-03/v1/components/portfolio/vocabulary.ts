import type { ProjectItem } from "../../sections/types";

/**
 * Display words for the CLOSED `propertyType` vocabulary of the content model. The ids are the
 * platform's; the words are presentation only: a Korean site locale reads Korean, every other
 * locale the neutral English form. A row renders only for a field the record authors.
 */
type PropertyType = NonNullable<ProjectItem["propertyType"]>;

const korean = (locale?: string) => locale !== undefined && /^ko(-|$)/i.test(locale);

/** Every canonical id has a word (a new id fails the typecheck here, never renders raw). */
const PROPERTY_TYPE: Record<PropertyType, { ko: string; en: string }> = {
  apartment: { ko: "아파트", en: "Apartment" },
  officetel: { ko: "오피스텔", en: "Officetel" },
  villa: { ko: "빌라", en: "Villa" },
  detached_house: { ko: "단독주택", en: "Detached house" },
  mixed_use: { ko: "주상복합", en: "Mixed-use" },
  commercial: { ko: "상업공간", en: "Commercial" },
};

export function propertyTypeText(type: PropertyType, locale?: string): string {
  const w = PROPERTY_TYPE[type];
  return korean(locale) ? w.ko : w.en;
}
