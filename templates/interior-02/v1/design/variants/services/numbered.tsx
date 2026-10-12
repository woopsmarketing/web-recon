import Link from "../../../components/ui/Link";
import { Icon } from "../../../components/ui/Icon";
import type { Ctx } from "../../../sections/types";
import { servicesData, type ServicesData } from "./shared";

/**
 * services.numbered (SV-A) — a numbered set ("01", "02" … from the position): each service stands under an ink rule,
 * its number in the accent, its name in the display face, the one-line descriptor when the site wrote one. A lineup
 * without any descriptor (`--bare`) is set one step larger, so the names themselves carry the section.
 */
export type NumberedData = ServicesData;

const TITLE_ID = "ds-services-numbered-title";

export function data(ctx: Ctx): NumberedData | undefined {
  return servicesData(ctx);
}

/** a position number, two digits — a count of places, not a fact about the business */
const numeral = (i: number) => String(i + 1).padStart(2, "0");

export function Section({ data: d }: { data: NumberedData }) {
  const bare = d.items.every((item) => !item.descriptor);
  return (
    <section className={bare ? "ds-services-numbered ds-services-numbered--bare" : "ds-services-numbered"} data-section="home.service" aria-labelledby={TITLE_ID}>
      <div className="ds-services-numbered__inner">
        <div className="ds-services-numbered__head">
          <h2 id={TITLE_ID} className="ds-services-numbered__title">
            {d.title}
          </h2>
          {d.more ? (
            <Link href={d.more.href} className="ds-services-numbered__more">
              <span>{d.more.label}</span>
              <Icon name="arrow-right" size={18} />
            </Link>
          ) : null}
        </div>
        <ol className="ds-services-numbered__list" data-count={d.items.length}>
          {d.items.map((item, i) => {
            const body = (
              <>
                <span className="ds-services-numbered__no" aria-hidden="true">
                  {numeral(i)}
                </span>
                <span className="ds-services-numbered__text">
                  <span className="ds-services-numbered__name">{item.title}</span>
                  {item.descriptor ? <span className="ds-services-numbered__desc">{item.descriptor}</span> : null}
                </span>
              </>
            );
            const cls = "ds-services-numbered__card";
            return (
              <li key={i} className="ds-services-numbered__item">
                {d.href ? (
                  <Link href={d.href} className={cls}>
                    {body}
                  </Link>
                ) : (
                  <div className={cls}>{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
