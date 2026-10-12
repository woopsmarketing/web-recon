import Link from "../../../components/ui/Link";
import { Icon } from "../../../components/ui/Icon";
import type { Ctx } from "../../../sections/types";
import { servicesData, type ServicesData } from "./shared";

/** services.rows (SV-C) — hairline list rows: the service title and, when written, a one-line descriptor. */
export type RowsData = ServicesData;

const TITLE_ID = "ds-services-rows-title";

export function data(ctx: Ctx): RowsData | undefined {
  return servicesData(ctx);
}

export function Section({ data: d }: { data: RowsData }) {
  return (
    <section className="ds-services-rows" data-section="home.service" aria-labelledby={TITLE_ID}>
      <div className="ds-services-rows__inner">
        <div className="ds-services-rows__head">
          <h2 id={TITLE_ID} className="ds-services-rows__title">
            {d.title}
          </h2>
          {d.more ? (
            <Link href={d.more.href} className="ds-services-rows__more">
              <span>{d.more.label}</span>
              <Icon name="arrow-right" size={18} />
            </Link>
          ) : null}
        </div>
        <ul className="ds-services-rows__list">
          {d.items.map((item, i) => {
            const body = (
              <>
                <span className="ds-services-rows__text">
                  <span className="ds-services-rows__name">{item.title}</span>
                  {item.descriptor ? <span className="ds-services-rows__desc">{item.descriptor}</span> : null}
                </span>
                {d.href ? <Icon name="arrow-right" size={22} className="ds-services-rows__arrow" /> : null}
              </>
            );
            return (
              <li key={i} className="ds-services-rows__item">
                {d.href ? (
                  <Link href={d.href} className="ds-services-rows__row">
                    {body}
                  </Link>
                ) : (
                  <div className="ds-services-rows__row">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
