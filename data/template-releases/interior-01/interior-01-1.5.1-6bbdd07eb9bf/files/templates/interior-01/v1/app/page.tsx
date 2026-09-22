import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { SiteHeader } from "../sections/SiteHeader";
import { HomeHero, homeHero } from "../sections/HomeHero";
import { HomeIntro, homeIntro } from "../sections/HomeIntro";
import { HomeProjects, homeProjects } from "../sections/HomeProjects";
import { HomeReviews, homeReviews } from "../sections/HomeReviews";
import { HomeImageBand, homeImageBand } from "../sections/HomeImageBand";

/**
 * Homepage — the section ORDER is Template code (never a setting):
 *   header · hero · intro · projects A · projects B · reviews · image band
 *   (the footer and the site-wide fixed contact CTA come from the root layout).
 * Every section resolves its own data first and is omitted entirely when it has none.
 */
export default function HomePage() {
  const ctx = getSiteContext(template);
  const hero = homeHero(ctx);
  const projectsA = homeProjects(ctx, "home.projects-a");
  const projectsB = homeProjects(ctx, "home.projects-b");
  const reviews = homeReviews(ctx);
  const band = homeImageBand(ctx);
  // in-page anchors an intro link may point at: only sections that are actually rendered
  const anchors = new Set([projectsA?.anchor, projectsB?.anchor, reviews ? "reviews" : undefined].filter((a): a is string => !!a));
  const intro = homeIntro(ctx, anchors);
  return (
    <>
      <SiteHeader ctx={ctx} />
      <main className="i1-main">
        <h1 className="i1-sr">{ctx.identity.brandName}</h1>
        {hero ? <HomeHero data={hero} /> : null}
        {intro ? <HomeIntro data={intro} /> : null}
        {projectsA ? <HomeProjects data={projectsA} /> : null}
        {projectsB ? <HomeProjects data={projectsB} /> : null}
        {reviews ? <HomeReviews data={reviews} /> : null}
        {band ? <HomeImageBand data={band} /> : null}
      </main>
    </>
  );
}
