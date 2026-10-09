import Link from "../components/Link";
import { ChevronIcon } from "../components/Icon";
import type { HomeIntroData } from "./homeIntroData";

// 1.7.0: markup only — the data function moved to homeIntroData.ts (no output change).

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
