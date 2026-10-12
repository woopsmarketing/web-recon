import Link from "../components/ui/Link";
import { contactHref } from "../lib/links";
import { hasRoute } from "../lib/routes";
import type { Ctx } from "./types";

type Media = { src: string; width: number; height: number; alt: string };

export interface FooterBandHalf {
  title: string;
  label?: string;
  text?: string;
  /** the button — only when its destination exists and its label is set */
  button?: { href: string; label: string };
}

export interface FooterBandData {
  cta?: FooterBandHalf & { mark?: Media };
  showcase?: FooterBandHalf & { media?: Media };
}

/**
 * The two-half call-to-action band (slots of `site.footer`): left half on the accent with label /
 * title / line / button → contact route (+ an optional mark), right half over `showcaseMedia` with
 * the same structure → portfolio route. A half without a title is omitted; no half → nothing.
 *
 * Rendered by the classic footer on every page (sections/SiteFooter) and — as the home section
 * `cta` in its classic variant — by a home recipe that asks for it (design/sections.tsx).
 */
export function footerBand(ctx: Ctx): FooterBandData | undefined {
  const t = (key: string) => ctx.slots.text("site.footer", key);
  const media = (key: string) => {
    const m = ctx.slots.media("site.footer", key);
    return m ? { ...ctx.assets.resolve(m.asset), alt: m.alt } : undefined;
  };
  const ctaTitle = t("ctaTitle");
  const showcaseTitle = t("showcaseTitle");
  if (!ctaTitle && !showcaseTitle) return undefined;
  const half = (kind: "cta" | "showcase", title: string, href: string | undefined): FooterBandHalf => {
    const buttonLabel = t(`${kind}ButtonLabel`);
    return { title, label: t(`${kind}Label`), text: t(`${kind}Text`), button: href && buttonLabel ? { href, label: buttonLabel } : undefined };
  };
  const ctaMark = media("ctaMark");
  const showcaseMedia = media("showcaseMedia");
  return {
    cta: ctaTitle ? { ...half("cta", ctaTitle, contactHref(ctx)), mark: ctaMark } : undefined,
    showcase: showcaseTitle ? { ...half("showcase", showcaseTitle, hasRoute(ctx, "portfolio.index") ? "/portfolio" : undefined), media: showcaseMedia } : undefined,
  };
}

function Half({ kind, half, media }: { kind: "cta" | "showcase"; half: FooterBandHalf; media?: Media }) {
  return (
    <div className={`i2-fcta__half i2-fcta__half--${kind}`}>
      {kind === "showcase" && media ? <img className="i2-fcta__bg" src={media.src} width={media.width} height={media.height} alt={media.alt} loading="lazy" decoding="async" /> : null}
      <div className="i2-fcta__body">
        {half.label ? <p className="i2-fcta__label">{half.label}</p> : null}
        <p className="i2-fcta__title">{half.title}</p>
        {half.text ? <p className="i2-fcta__text">{half.text}</p> : null}
        {half.button ? (
          <Link href={half.button.href} className={`i2-btn ${kind === "cta" ? "i2-btn--navy" : "i2-btn--mint"}`}>
            {half.button.label}
          </Link>
        ) : null}
      </div>
      {kind === "cta" && media ? <img className="i2-fcta__mark" src={media.src} width={media.width} height={media.height} alt={media.alt} loading="lazy" decoding="async" /> : null}
    </div>
  );
}

export function FooterBand({ data }: { data: FooterBandData }) {
  return (
    <div className="i2-fcta">
      {data.cta ? <Half kind="cta" half={data.cta} media={data.cta.mark} /> : null}
      {data.showcase ? <Half kind="showcase" half={data.showcase} media={data.showcase.media} /> : null}
    </div>
  );
}
