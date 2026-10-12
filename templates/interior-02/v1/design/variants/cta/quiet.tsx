import Link from "../../../components/ui/Link";
import { Icon } from "../../../components/ui/Icon";
import type { Ctx } from "../../../sections/types";
import { ctaData, type CtaData } from "./shared";

/** cta.quiet (CT-D) — a calm inquiry line: heading, one or two sentences, one outlined button (the phone link when there is no consultation button). */
export type QuietData = CtaData;

const TITLE_ID = "ds-cta-quiet-title";

export function data(ctx: Ctx): QuietData | undefined {
  return ctaData(ctx);
}

export function Section({ data: d }: { data: QuietData }) {
  return (
    <section className="ds-cta-quiet" data-section="home.cta" aria-labelledby={TITLE_ID}>
      <div className="ds-cta-quiet__inner">
        {d.label ? <p className="ds-cta-quiet__label">{d.label}</p> : null}
        <h2 id={TITLE_ID} className="ds-cta-quiet__title">
          {d.title}
        </h2>
        {d.text ? <p className="ds-cta-quiet__text">{d.text}</p> : null}
        {d.button ? (
          <Link href={d.button.href} className="ds-cta-quiet__button">
            <span>{d.button.label}</span>
            <Icon name="arrow-right" size={18} />
          </Link>
        ) : d.phone ? (
          <a href={d.phone.href} className="ds-cta-quiet__button">
            <Icon name="phone" size={18} />
            <span>{d.phone.label}</span>
          </a>
        ) : null}
      </div>
    </section>
  );
}
