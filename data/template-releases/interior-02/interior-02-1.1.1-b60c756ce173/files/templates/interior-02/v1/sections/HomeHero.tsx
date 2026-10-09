import Link from "../components/ui/Link";
import { Carousel } from "../components/ui/Carousel";
import { Icon } from "../components/ui/Icon";
import { contactHref, sliderLabels } from "../components/home/shared";
import { projectCardModel } from "../lib/projects";
import { hasRoute } from "../lib/routes";
import type { Ctx } from "./types";

/** The content schema stores at most 8 banners; the hero shows every published one. */
const HERO_MAX_SLIDES = 8;

export interface HeroSlide {
  id: string;
  image: { src: string; width: number; height: number; alt: string };
  headline?: string;
  /** a banner aimed at a project: its name, area and total price open the slide's text block */
  project?: { name: string; area?: { figure: string; unit: string }; price?: { figure: string; unit: string } };
  cta?: { label: string; href: string };
}

export interface HomeHeroData {
  label: string;
  autoplay: boolean;
  slides: HeroSlide[];
  labels: ReturnType<typeof sliderLabels>;
}

/**
 * home.hero — banners → full-bleed slides. A banner's call to action names a TARGET, never a URL:
 *   project → that project's detail page (only when served), and the project's facts open the text
 *   contact → the site's contact destination (only with a channel)
 * A slide without a usable target is not a link. Disabled or no banner → nothing.
 */
export function homeHero(ctx: Ctx): HomeHeroData | undefined {
  const settings = ctx.settings["home.hero"];
  if (!settings.enabled) return undefined;
  const { items } = ctx.content.list({ type: "banners", limit: HERO_MAX_SLIDES });
  if (items.length === 0) return undefined;
  const contact = contactHref(ctx);
  const detail = hasRoute(ctx, "portfolio.detail");

  const slides: HeroSlide[] = items.map((b) => {
    let cta: HeroSlide["cta"];
    let project: HeroSlide["project"];
    if (b.cta?.target.kind === "contact" && contact) {
      cta = { label: b.cta.label, href: contact };
    } else if (b.cta?.target.kind === "project") {
      const hit = ctx.content.list({ type: "projects", selection: { mode: "manual", ids: [b.cta.target.project] }, limit: 1 }).items[0];
      if (hit) {
        const m = projectCardModel(ctx, hit);
        project = { name: m.title, area: m.area, price: m.totalPrice };
        if (detail) cta = { label: b.cta.label, href: m.href };
      }
    }
    return { id: b.id, image: { ...ctx.assets.resolve(b.image.asset), alt: b.image.alt ?? "" }, headline: b.headline, project, cta };
  });

  return { label: ctx.slots.text("home.hero", "label") ?? "", autoplay: settings.autoplay, slides, labels: sliderLabels(ctx, "home.hero") };
}

export function HomeHero({ data }: { data: HomeHeroData }) {
  const { slideLabelFormat, ...labels } = data.labels;
  return (
    <section className="i2-hero" data-section="home.hero">
      <Carousel label={data.label} className="i2-hero__slider" autoplay={data.autoplay} dwell={4000} duration={500} progress="fill" controls labels={labels} slideLabelFormat={slideLabelFormat}>
        {data.slides.map((s, i) => (
          <HeroSlideView key={s.id} slide={s} eager={i === 0} />
        ))}
      </Carousel>
    </section>
  );
}

function HeroSlideView({ slide, eager }: { slide: HeroSlide; eager: boolean }) {
  const { image, project, headline, cta } = slide;
  const copy = project || headline || cta;
  const inner = (
    <>
      <img
        className="i2-hero__img"
        src={image.src}
        width={image.width}
        height={image.height}
        alt={image.alt}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : undefined}
        decoding="async"
        draggable={false}
      />
      {copy ? (
        <div className="i2-wrap i2-hero__copy">
          {project ? (
            <p className="i2-hero__info">
              <span className="i2-hero__name">{project.name}</span>
              {project.area ? (
                <span className="i2-hero__spec">
                  {project.area.figure}
                  <small>{project.area.unit}</small>
                </span>
              ) : null}
              {project.price ? (
                <>
                  <span className="i2-hero__sep" aria-hidden="true" />
                  <span className="i2-hero__spec i2-hero__spec--price">
                    {project.price.figure}
                    <small>{project.price.unit}</small>
                  </span>
                </>
              ) : null}
            </p>
          ) : null}
          {headline ? <h2 className="i2-hero__title">{headline}</h2> : null}
          {cta ? (
            <span className="i2-hero__cta">
              {cta.label}
              <Icon name="arrow-right" size={23} />
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
  return cta ? (
    <Link href={cta.href} className="i2-hero__slide" data-hero-slide={slide.id} draggable={false}>
      {inner}
    </Link>
  ) : (
    <div className="i2-hero__slide" data-hero-slide={slide.id}>
      {inner}
    </div>
  );
}
