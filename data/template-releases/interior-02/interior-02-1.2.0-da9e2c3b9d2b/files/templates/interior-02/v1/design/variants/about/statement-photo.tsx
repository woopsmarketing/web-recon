import Link from "../../../components/ui/Link";
import { Icon } from "../../../components/ui/Icon";
import type { Ctx } from "../../../sections/types";
import { aboutBase, detailRows, statementOf, type AboutBase, type DetailRow } from "./shared";

/** about.statement-photo (AB-A) — a statement line, then the photograph and the details the site really has, in two columns. */
export interface StatementPhotoData {
  label?: string;
  statement: string;
  isTitle: boolean;
  lead?: string;
  media?: AboutBase["media"];
  rows: DetailRow[];
  more?: AboutBase["more"];
}

const ID = "ds-about-statement-photo-statement";

export function data(ctx: Ctx): StatementPhotoData | undefined {
  const base = aboutBase(ctx);
  if (!base) return undefined;
  const s = statementOf(base, 120, 260);
  if (!s) return undefined;
  return { label: base.label, statement: s.statement, isTitle: s.isTitle, lead: s.lead, media: base.media, rows: detailRows(ctx, 5), more: base.more };
}

export function Section({ data: d }: { data: StatementPhotoData }) {
  const hasAside = Boolean(d.lead || d.rows.length > 0 || d.more);
  const cls = ["ds-about-statement-photo", d.media ? "" : "ds-about-statement-photo--text", d.lead && d.rows.length > 0 ? "ds-about-statement-photo--twin" : ""].filter(Boolean).join(" ");
  return (
    <section className={cls} data-section="home.about" aria-labelledby={d.isTitle ? ID : undefined} aria-label={d.isTitle ? undefined : d.label}>
      <div className="ds-about-statement-photo__inner">
        {d.isTitle ? (
          <h2 id={ID} className="ds-about-statement-photo__statement">
            {d.statement}
          </h2>
        ) : (
          <p className="ds-about-statement-photo__statement">{d.statement}</p>
        )}
        {d.media || hasAside ? (
          <div className="ds-about-statement-photo__body">
            {d.media ? (
              <div className="ds-about-statement-photo__photo">
                <img src={d.media.src} width={d.media.width} height={d.media.height} alt={d.media.alt} loading="lazy" decoding="async" />
              </div>
            ) : null}
            {hasAside ? (
              <div className="ds-about-statement-photo__aside">
                {d.lead ? <p className="ds-about-statement-photo__lead">{d.lead}</p> : null}
                {d.rows.length > 0 ? (
                  <ul className="ds-about-statement-photo__rows">
                    {d.rows.map((r, i) => (
                      <li key={i} className="ds-about-statement-photo__row">
                        {r.label ? <span className="ds-about-statement-photo__row-label">{r.label}</span> : null}
                        <span className="ds-about-statement-photo__row-value">{r.value}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {d.more ? (
                  <Link href={d.more.href} className="ds-about-statement-photo__more">
                    <span>{d.more.label}</span>
                    <Icon name="arrow-right" size={18} />
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
