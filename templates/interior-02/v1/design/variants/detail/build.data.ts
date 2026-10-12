import { formatArea } from "../../../lib/format";
import { portfolioDetail } from "../../../sections/PortfolioDetail";
import type { Ctx, ProjectItem } from "../../../sections/types";
import type { DetailData, DetailImage } from "./model";

/**
 * The data of both detail variants — build / kit side, pure, plain JSON.
 *
 * It is the classic detail data (`portfolioDetail`: the facts in the classic order with the
 * classic labels and formatters, the consult link, the price figure, the gallery groups, the
 * story, the before / after pairs, the customer review, the related projects and the way back),
 * re-shaped for a page that is laid out as a sequence of photographs instead of a tile grid with a
 * viewer. Nothing is added to it and no field changes meaning:
 *   - the cover opens the page, so the first gallery photograph that IS the cover is not repeated
 *     (its alt text is used for the opening image when the cover has none);
 *   - the price rows that repeat a fact (area, duration, period) are left to the facts;
 *   - the classic viewer's words travel with the data (`viewer`), so the variants can enlarge a photograph with the classic viewer;
 *   - a related project is named with its 지역 and 면적, as the facts write them.
 */
export function detailData(ctx: Ctx, project: ProjectItem): DetailData {
  const classic = portfolioDetail(ctx, project);
  const fact = (key: string) => classic.facts.find((f) => f.key === key)?.value;

  let cover: DetailImage = classic.cover;
  let repeated = false;
  const groups = (classic.gallery?.groups ?? [])
    .map((group) => ({
      name: group.name,
      items: group.items
        .map((item) => item.image)
        .filter((image) => {
          if (repeated || image.src !== classic.cover.src) return true;
          repeated = true;
          if (cover.alt === "") cover = { ...cover, alt: image.alt };
          return false;
        }),
    }))
    .filter((group) => group.items.length > 0);

  return {
    title: classic.title,
    location: fact("location"),
    area: fact("area"),
    summary: classic.description[0],
    cover,
    facts: classic.facts.map((f) => ({ key: f.key, label: f.label, value: f.value })),
    consult: classic.consult,
    reviewJump: classic.reviewJump,
    price: {
      title: classic.totalLabels.details,
      label: classic.totalLabels.total,
      total: classic.total ? { figure: classic.total.figure, unit: classic.total.unit } : undefined,
      withheld: classic.totalLabels.withheld,
      rows: classic.rows.filter((row) => !classic.facts.some((f) => f.label === row.label && f.value === row.value)),
      notes: classic.notes,
    },
    scope: classic.scope,
    viewer: classic.gallery?.labels,
    photos: groups.length > 0 && classic.gallery ? { title: classic.gallery.labels.photos, groups } : undefined,
    story: classic.story,
    beforeAfter: classic.beforeAfter,
    quote: classic.quote,
    related: classic.related
      ? {
          title: classic.related.title,
          items: classic.related.cards.map((card) => {
            const record = ctx.content.getBySlug("projects", card.slug);
            return { id: card.id, href: card.href, title: card.title, location: card.location, area: record?.area ? formatArea(record.area) : undefined, cover: card.cover };
          }),
        }
      : undefined,
    back: classic.back,
  };
}
