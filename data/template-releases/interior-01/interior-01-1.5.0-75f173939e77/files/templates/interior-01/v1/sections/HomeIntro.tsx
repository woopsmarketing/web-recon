import Link from "next/link";
import { ChevronIcon } from "../components/Icon";
import { liveLink, type LiveLink } from "./links";
import type { Ctx } from "./types";

export interface HomeIntroData {
  title: string;
  body?: string[];
  media?: { src: string; width: number; height: number; alt: string };
  link?: LiveLink;
}

/**
 * home.intro — the site's own words (slots only). No title → no section: a Template
 * default here would be a claim about the business. Media is optional (image; video is
 * deferred), the link is optional and kept only when its destination exists.
 */
export function homeIntro(ctx: Ctx, anchors: ReadonlySet<string>): HomeIntroData | undefined {
  if (!ctx.settings["home.intro"].enabled) return undefined;
  const title = ctx.slots.text("home.intro", "title");
  if (!title) return undefined;
  const media = ctx.slots.media("home.intro", "media");
  return {
    title,
    body: ctx.slots.richText("home.intro", "body")?.paragraphs,
    media: media ? { ...ctx.assets.resolve(media.asset), alt: media.alt } : undefined,
    link: liveLink(ctx, ctx.slots.link("home.intro", "link"), anchors),
  };
}

export function HomeIntro({ data }: { data: HomeIntroData }) {
  return (
    <section id="intro" className={data.media ? "i1-intro i1-intro--media" : "i1-intro"} data-section="home.intro" aria-labelledby="i1-intro-title">
      <div className="i1-container i1-intro__inner">
        {data.media ? (
          <div className="i1-intro__media">
            <img src={data.media.src} width={data.media.width} height={data.media.height} alt={data.media.alt} loading="lazy" decoding="async" />
          </div>
        ) : null}
        <div className="i1-intro__copy">
          <h2 id="i1-intro-title" className="i1-intro__title">
            {data.title}
          </h2>
          {data.body ? (
            <div className="i1-intro__body">
              {data.body.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : null}
          {data.link ? (
            data.link.internal ? (
              <Link href={data.link.href} className="i1-pill i1-intro__cta">
                {data.link.label}
                <ChevronIcon dir="right" />
              </Link>
            ) : (
              <a href={data.link.href} className="i1-pill i1-intro__cta">
                {data.link.label}
                <ChevronIcon dir="right" />
              </a>
            )
          ) : null}
        </div>
      </div>
    </section>
  );
}
