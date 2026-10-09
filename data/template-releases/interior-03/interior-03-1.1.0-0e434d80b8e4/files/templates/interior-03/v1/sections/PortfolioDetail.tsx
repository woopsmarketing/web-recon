import Link from "../components/ui/Link";
import { FactsTable, type FactRow } from "../components/portfolio/FactsTable";
import { PhotoStack, type PhotoGroup } from "../components/portfolio/PhotoStack";
import { PageTitle } from "../components/ui/PageTitle";
import { SubVisual } from "../components/ui/SubVisual";
import type { Media } from "../lib/media";

/**
 * portfolio.detail — one project (/portfolio/[slug]).
 *   <PortfolioDetail data={…} />     the section; its data is built by sections/portfolioDetailData.ts
 *                                    (only facts the record authors; a runtime slot: runtime/portfolio.ts)
 * Banner (title = the project's category) · page title block with the category name as a <p> ·
 * the subject box (the page's <h1> = project title) · the centred text block (summary, then every
 * body paragraph) · with `facts`: the facts table · the photo stack (cover first, then every
 * gallery image in group order, an asset shown once; `before` photos are not shown) · the dark
 * list button over a top rule → the list filtered to this category (only when the list exists).
 */
export interface PortfolioDetailData {
  categoryName: string;
  visual: { media?: Media; text?: string };
  lead?: string;
  title: string;
  paragraphs: string[];
  /** undefined = the facts table is off, or no fact is authored */
  facts?: FactRow[];
  photos: { label: string; groups: PhotoGroup[]; groupLabels: boolean };
  back?: { href: string; label: string };
}

export function PortfolioDetail({ data }: { data: PortfolioDetailData }) {
  return (
    <div className="i3-pdetail" data-section="portfolio.detail">
      <SubVisual title={data.categoryName} text={data.visual.text} media={data.visual.media} />
      <div className="i3-content">
        <div className="i3-wrap">
          <PageTitle as="p" title={data.categoryName} lead={data.lead} />
          <article className="i3-page i3-pview" data-project={data.title}>
            <h1 className="i3-pview__subject">{data.title}</h1>
            {data.paragraphs.length > 0 ? (
              <div className="i3-pview__text" data-detail-text="">
                {data.paragraphs.map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            ) : null}
            {data.facts ? (
              <div className="i3-pview__facts">
                <FactsTable rows={data.facts} />
              </div>
            ) : null}
            <PhotoStack label={data.photos.label} groups={data.photos.groups} groupLabels={data.photos.groupLabels} />
            {data.back ? (
              <div className="i3-pview__actions">
                <Link href={data.back.href} className="i3-btn" data-detail-back="">
                  {data.back.label}
                </Link>
              </div>
            ) : null}
          </article>
        </div>
      </div>
    </div>
  );
}
