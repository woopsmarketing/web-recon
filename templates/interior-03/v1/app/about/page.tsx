import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { SiteHeader } from "../../sections/SiteHeader";
import { AboutPage, aboutPage } from "../../sections/AboutPage";
import { pageMetadata, titleWithBrand } from "../../lib/seo";

/** ABOUT (/about): the company greeting (about.page). Description = the intro, else the lead line. */
export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  const data = aboutPage(ctx);
  return pageMetadata(ctx, { title: titleWithBrand(ctx, data.title), description: data.greeting?.intro?.join(" ") ?? data.lead, path: "/about" });
}

export default function Page() {
  const ctx = getSiteContext(template);
  const data = aboutPage(ctx);
  return (
    <>
      <SiteHeader ctx={ctx} current="about" />
      <main className="i3-main">
        <AboutPage data={data} />
      </main>
    </>
  );
}
