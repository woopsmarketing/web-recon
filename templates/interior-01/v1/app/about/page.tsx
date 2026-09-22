import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { SiteHeader } from "../../sections/SiteHeader";
import { AboutPage, aboutPage } from "../../sections/AboutPage";
import { pageMetadata } from "../../lib/seo";

/** /about (1.5.0) — the studio's point of view. */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  const data = aboutPage(ctx);
  return pageMetadata(ctx, { title: `${data.title} | ${ctx.identity.brandName}`, description: data.lead?.[0], path: "/about" });
}

export default function About() {
  const ctx = getSiteContext(template);
  return (
    <>
      <SiteHeader ctx={ctx} current="about" />
      <main className="i1-main" data-page="about">
        <AboutPage data={aboutPage(ctx)} />
      </main>
    </>
  );
}
