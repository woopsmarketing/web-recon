import { CountUp } from "../components/pages/CountUp";
import { ValueIllustration } from "../components/pages/PageIcons";
import { Reveal } from "../components/pages/Reveal";
import { TimelineSlider } from "../components/pages/TimelineSlider";
import { mediaOf, paragraphsOf, type Media } from "../components/pages/shared";
import type { CarouselLabels } from "../components/ui/Carousel";
import { STAT_NUMBERS, SYSTEM_ITEM_NUMBERS, VALUE_NUMBERS, YEAR_NUMBERS, type ValueIcon, type ValueTone } from "../manifest/pages";
import type { Ctx } from "./types";

const SECTION = "about.page";

export interface AboutPageData {
  title: string;
  intro?: string[];
  story?: { media?: Media; title?: string; body?: string[] };
  stats?: { title?: string; items: { key: string; figure: string; unit?: string; label?: string; note?: string }[] };
  values?: { title?: string; items: { key: string; tone: ValueTone; icon: ValueIcon; title: string; text?: string }[] };
  history?: { title?: string; autoplay: boolean; years: { key: string; label: string; items?: string[] }[]; labels: CarouselLabels; slideLabelFormat: string };
  system?: { title?: string; body?: string[]; items: string[]; media?: Media };
}

/**
 * about.page — (1) title block; (2) the photo band with the intro block rising over its bottom
 * edge; (3) the statistics band (figures count up on reveal); (4) four value cards (illustration
 * rotates in); (5) the history slider; (6) the "system" block: heading, copy, a self-drawing
 * check list and the oversized image sliding in from the right. A stat exists when its figure
 * is set, a value card / year when its title / label is; a block with no item is not rendered.
 */
export function aboutPage(ctx: Ctx): AboutPageData {
  const t = (key: string) => ctx.slots.text(SECTION, key);
  const settings = ctx.settings[SECTION];
  const title = t("title") ?? "";
  const intro = paragraphsOf(ctx, SECTION, "intro");

  const photo = mediaOf(ctx, SECTION, "photoMedia");
  const introTitle = t("introTitle");
  const introBody = paragraphsOf(ctx, SECTION, "introBody");
  const story = photo || introTitle || introBody ? { media: photo, title: introTitle, body: introBody } : undefined;

  const statItems: NonNullable<AboutPageData["stats"]>["items"] = [];
  for (const n of STAT_NUMBERS) {
    const figure = t(`stat${n}Figure`);
    if (figure) statItems.push({ key: `stat${n}`, figure, unit: t(`stat${n}Unit`), label: t(`stat${n}Label`), note: t(`stat${n}Note`) });
  }
  const stats = statItems.length > 0 ? { title: t("statsTitle"), items: statItems } : undefined;

  const valueItems: NonNullable<AboutPageData["values"]>["items"] = [];
  for (const n of VALUE_NUMBERS) {
    const valueTitle = t(`value${n}Title`);
    if (valueTitle) valueItems.push({ key: `value${n}`, tone: settings[`value${n}Tone`], icon: settings[`value${n}Icon`], title: valueTitle, text: t(`value${n}Text`) });
  }
  const values = valueItems.length > 0 ? { title: t("valuesTitle"), items: valueItems } : undefined;

  const years: NonNullable<AboutPageData["history"]>["years"] = [];
  for (const n of YEAR_NUMBERS) {
    const label = t(`year${n}Label`);
    if (label) years.push({ key: `year${n}`, label, items: paragraphsOf(ctx, SECTION, `year${n}Items`) });
  }
  const history =
    years.length > 0
      ? {
          title: t("historyTitle"),
          autoplay: settings.historyAutoplay,
          years,
          labels: { previous: t("previousLabel") ?? "", next: t("nextLabel") ?? "", pause: t("pauseLabel") ?? "", play: t("playLabel") ?? "" },
          slideLabelFormat: t("slideLabelFormat") ?? "",
        }
      : undefined;

  const systemItems: string[] = [];
  for (const n of SYSTEM_ITEM_NUMBERS) {
    const item = t(`systemItem${n}`);
    if (item) systemItems.push(item);
  }
  const systemTitle = t("systemTitle");
  const systemBody = paragraphsOf(ctx, SECTION, "systemBody");
  const systemMedia = mediaOf(ctx, SECTION, "systemMedia");
  const system = systemTitle || systemBody || systemItems.length > 0 || systemMedia ? { title: systemTitle, body: systemBody, items: systemItems, media: systemMedia } : undefined;

  return { title, intro, story, stats, values, history, system };
}

/** Without script the entrance states (held by data-revealed="false") are neutralised and the
 *  timeline track wraps so every year is on the page (its controls do nothing without script). */
const NOSCRIPT_CSS = [
  '.i2-ab-hang[data-revealed="false"]{opacity:1;transform:translateY(-18px)}',
  '.i2-ab-value[data-revealed="false"] .i2-ab-value__icon{opacity:1;transform:none}',
  '.i2-ab-sys[data-revealed="false"] .i2-ab-sys__figure{opacity:1;transform:none}',
  '.i2-ab-sys[data-revealed="false"] .i2-ab-check path{stroke-dashoffset:0}',
  ".i2-ab-tl .i2-c__track{flex-wrap:wrap;row-gap:48px}",
  ".i2-ab-tl .i2-c__bar{display:none}",
].join("");

function CheckMark() {
  return (
    <svg className="i2-ab-check" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M2.5 10.5l5 5" pathLength={1} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
      <path d="M7.5 15.5l10-11" pathLength={1} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
    </svg>
  );
}

export function AboutPage({ data }: { data: AboutPageData }) {
  const { title, intro, story, stats, values, history, system } = data;
  return (
    <div className="i2-pg i2-ab" data-section="about.page">
      <noscript>
        <style>{NOSCRIPT_CSS}</style>
      </noscript>
      <section className="i2-wrap i2-ab-top" aria-labelledby="i2-ab-title">
        <h1 id="i2-ab-title" className="i2-pg-title">
          {title}
        </h1>
        {intro ? (
          <div className="i2-pg-sub">
            {intro.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        ) : null}
      </section>

      {story ? (
        <section className="i2-ab-story" aria-labelledby={story.title ? "i2-ab-story-title" : undefined}>
          {story.media ? (
            <div className="i2-ab-story__photo">
              <img src={story.media.src} width={story.media.width} height={story.media.height} alt={story.media.alt} decoding="async" />
            </div>
          ) : null}
          {story.title || story.body ? (
            <Reveal className="i2-wrap i2-ab-hang" data-hang="">
              {story.title ? (
                <h2 id="i2-ab-story-title" className="i2-ab-hang__title">
                  {story.title}
                </h2>
              ) : null}
              {story.body ? (
                <div className="i2-ab-hang__body">
                  {story.body.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              ) : null}
            </Reveal>
          ) : null}
        </section>
      ) : null}

      {stats ? (
        <section className="i2-ab-stats" aria-labelledby={stats.title ? "i2-ab-stats-title" : undefined}>
          <div className="i2-wrap">
            {stats.title ? (
              <h2 id="i2-ab-stats-title" className="i2-pg-h2 i2-ab-stats__title">
                {stats.title}
              </h2>
            ) : null}
            <ul className="i2-ab-stats__list">
              {stats.items.map((s) => (
                <li key={s.key} className="i2-ab-stat" data-stat={s.key}>
                  <p className="i2-ab-stat__figure">
                    <CountUp value={s.figure} />
                    {s.unit ? <small>{s.unit}</small> : null}
                  </p>
                  <div className="i2-ab-stat__text">
                    {s.label ? <p className="i2-ab-stat__label">{s.label}</p> : null}
                    {s.note ? <p className="i2-ab-stat__note">{s.note}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {values ? (
        <section className="i2-ab-values" aria-labelledby={values.title ? "i2-ab-values-title" : undefined}>
          <div className="i2-wrap">
            {values.title ? (
              <h2 id="i2-ab-values-title" className="i2-pg-h2">
                {values.title}
              </h2>
            ) : null}
            <ul className="i2-ab-values__grid">
              {values.items.map((v) => (
                <Reveal key={v.key} as="li" className={`i2-ab-value i2-ab-value--${v.tone}`} data-value={v.key}>
                  <span className="i2-ab-value__icon">
                    <ValueIllustration icon={v.icon} />
                  </span>
                  <div className="i2-ab-value__body">
                    <h3>{v.title}</h3>
                    {v.text ? <p>{v.text}</p> : null}
                  </div>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {history ? (
        <section className="i2-ab-history" aria-labelledby={history.title ? "i2-ab-history-title" : undefined}>
          <div className="i2-wrap">
            {history.title ? (
              <h2 id="i2-ab-history-title" className="i2-pg-h2">
                {history.title}
              </h2>
            ) : null}
          </div>
          <div className="i2-ab-tl-clip">
            <TimelineSlider label={history.title ?? history.labels.next} autoplay={history.autoplay} labels={history.labels} slideLabelFormat={history.slideLabelFormat}>
              {history.years.map((y) => (
                <article key={y.key} className="i2-ab-year" data-year={y.key}>
                  <h3 className="i2-ab-year__label">{y.label}</h3>
                  {y.items ? (
                    <ul className="i2-ab-year__list">
                      {y.items.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ))}
            </TimelineSlider>
          </div>
        </section>
      ) : null}

      {system ? (
        <Reveal as="section" className="i2-ab-sys" aria-labelledby={system.title ? "i2-ab-sys-title" : undefined} data-system="">
          <div className="i2-wrap i2-ab-sys__cols">
            <div className="i2-ab-sys__text">
              {system.title ? (
                <h2 id="i2-ab-sys-title" className="i2-ab-sys__title">
                  {system.title}
                </h2>
              ) : null}
              {system.body ? (
                <div className="i2-ab-sys__body">
                  {system.body.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              ) : null}
              {system.items.length > 0 ? (
                <ul className="i2-ab-sys__list">
                  {system.items.map((item, i) => (
                    <li key={i}>
                      <CheckMark />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {system.media ? (
              <figure className="i2-ab-sys__figure">
                <img src={system.media.src} width={system.media.width} height={system.media.height} alt={system.media.alt} loading="lazy" decoding="async" />
              </figure>
            ) : null}
          </div>
        </Reveal>
      ) : null}
    </div>
  );
}
