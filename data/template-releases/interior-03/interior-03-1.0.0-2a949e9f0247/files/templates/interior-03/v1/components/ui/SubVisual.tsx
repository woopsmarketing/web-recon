/**
 * The sub-page banner (SHELL shared block): a short full-width photo with the page name and one
 * line over it. Every page but HOME renders it first inside <main>:
 *   <SubVisual title="…" text="…" media={{ src, width, height, alt }} />
 * `title` is a plain paragraph: the page's <h1> is the page title below the banner (PageTitle),
 * so the banner repeats the name for the eye only (aria-hidden). No media = the quiet surface.
 * Height 252 / 140 (≤ 768) / 90 (≤ 480); the line is hidden ≤ 768 (base.css).
 */
export interface SubVisualMedia {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export function SubVisual({ title, text, media }: { title: string; text?: string; media?: SubVisualMedia }) {
  return (
    <div className="i3-visual" data-sub-visual="">
      {media ? <img className="i3-visual__img" src={media.src} width={media.width} height={media.height} alt="" decoding="async" fetchPriority="high" /> : null}
      <div className="i3-visual__typo" aria-hidden="true">
        <p className="i3-visual__title">{title}</p>
        {text ? <p className="i3-visual__text">{text}</p> : null}
      </div>
    </div>
  );
}
