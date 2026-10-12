import Link from "../../../components/ui/Link";
import { Icon } from "../../../components/ui/Icon";
import type { Ctx } from "../../../sections/types";
import { aboutBase, type AboutBase } from "./shared";

/** about.split-panel (AB-B) — a photograph beside a text panel on the page's brand block; no photograph → the panel alone. */
export type SplitPanelData = AboutBase;

const TITLE_ID = "ds-about-split-panel-title";
const MAX_PARAGRAPHS = 3;

export function data(ctx: Ctx): SplitPanelData | undefined {
  const base = aboutBase(ctx);
  if (!base || (!base.title && base.paragraphs.length === 0)) return undefined;
  return { ...base, paragraphs: base.paragraphs.slice(0, MAX_PARAGRAPHS) };
}

export function Section({ data: d }: { data: SplitPanelData }) {
  const cls = ["ds-about-split-panel", d.media ? "" : "ds-about-split-panel--solo", d.title ? "" : "ds-about-split-panel--untitled"].filter(Boolean).join(" ");
  return (
    <section className={cls} data-section="home.about" aria-labelledby={d.title ? TITLE_ID : undefined} aria-label={d.title ? undefined : d.label}>
      <div className="ds-about-split-panel__inner">
        {d.media ? (
          <div className="ds-about-split-panel__photo">
            <img src={d.media.src} width={d.media.width} height={d.media.height} alt={d.media.alt} loading="lazy" decoding="async" />
          </div>
        ) : null}
        <div className="ds-about-split-panel__panel">
          {d.label ? <p className="ds-about-split-panel__label">{d.label}</p> : null}
          {d.title ? (
            <h2 id={TITLE_ID} className="ds-about-split-panel__title">
              {d.title}
            </h2>
          ) : null}
          {d.paragraphs.length > 0 ? (
            <div className="ds-about-split-panel__body">
              {d.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : null}
          {d.more ? (
            <Link href={d.more.href} className="ds-about-split-panel__more">
              <span>{d.more.label}</span>
              <Icon name="arrow-right" size={18} />
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
