import Link from "../../../components/ui/Link";
import { Icon } from "../../../components/ui/Icon";
import type { Ctx } from "../../../sections/types";
import { designOf } from "../../resolve";
import { ctaData, type CtaData } from "./shared";

/**
 * cta.band (CT-A) — a centred band on the brand block: heading, sub line, one filled button, and the phone link when
 * the site has a phone. `onAccent`: the theme's block is the accent itself (accentUse `blocks`), so the button
 * cannot be the accent fill it is everywhere else.
 */
export interface BandData extends CtaData {
  onAccent: boolean;
}

const TITLE_ID = "ds-cta-band-title";

export function data(ctx: Ctx): BandData | undefined {
  const base = ctaData(ctx);
  return base ? { ...base, onAccent: designOf(ctx).theme.accentUse === "blocks" } : undefined;
}

export function Section({ data: d }: { data: BandData }) {
  return (
    <section className={d.onAccent ? "ds-cta-band ds-cta-band--on-accent" : "ds-cta-band"} data-section="home.cta" aria-labelledby={TITLE_ID}>
      <div className="ds-cta-band__inner">
        {d.label ? <p className="ds-cta-band__label">{d.label}</p> : null}
        <h2 id={TITLE_ID} className="ds-cta-band__title">
          {d.title}
        </h2>
        {d.text ? <p className="ds-cta-band__text">{d.text}</p> : null}
        <div className="ds-cta-band__actions">
          {d.button ? (
            <Link href={d.button.href} className="ds-cta-band__button">
              <span>{d.button.label}</span>
              <Icon name="arrow-right" size={20} />
            </Link>
          ) : null}
          {d.phone ? (
            d.button ? (
              <a href={d.phone.href} className="ds-cta-band__phone">
                <Icon name="phone" size={18} />
                <span>
                  {d.phone.prefix ? <small>{d.phone.prefix}</small> : null}
                  {d.phone.label}
                </span>
              </a>
            ) : (
              <a href={d.phone.href} className="ds-cta-band__button">
                <Icon name="phone" size={20} />
                <span>{d.phone.label}</span>
              </a>
            )
          ) : null}
        </div>
      </div>
    </section>
  );
}
