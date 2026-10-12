import { Reveal } from "../components/pages/Reveal";
import { mediaOf, paragraphsOf, type Media } from "../components/pages/shared";
import type { Ctx } from "./types";

const SECTION = "about.page";

export interface AboutStoryData {
  media?: Media;
  title?: string;
  body?: string[];
}

/**
 * The story block of `about.page`: the photo band with the intro block (title + paragraphs) rising
 * over its bottom edge. Exists when the photo, the title or the body is set.
 *
 * Rendered by the about page (sections/AboutPage, block 2) and — as the home section `about` in
 * its classic variant — by a home recipe that asks for it (design/sections.tsx).
 */
export function aboutStory(ctx: Ctx): AboutStoryData | undefined {
  const photo = mediaOf(ctx, SECTION, "photoMedia");
  const introTitle = ctx.slots.text(SECTION, "introTitle");
  const introBody = paragraphsOf(ctx, SECTION, "introBody");
  return photo || introTitle || introBody ? { media: photo, title: introTitle, body: introBody } : undefined;
}

export function AboutStory({ story }: { story: AboutStoryData }) {
  return (
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
  );
}
