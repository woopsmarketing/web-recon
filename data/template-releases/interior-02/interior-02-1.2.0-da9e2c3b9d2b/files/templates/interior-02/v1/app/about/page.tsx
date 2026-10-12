import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../../template";
import { Header } from "../../design/chrome";
import { mainId } from "../../design/resolve";
import { AboutPage, aboutPage } from "../../sections/AboutPage";
import { pageMetadata, titleWithBrand } from "../../lib/seo";

export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  const data = aboutPage(ctx);
  return pageMetadata(ctx, { title: titleWithBrand(ctx, data.title), description: data.intro?.join(" "), path: "/about" });
}

export default function Page() {
  const ctx = getSiteContext(template);
  const data = aboutPage(ctx);
  return (
    <>
      <Header ctx={ctx} variant="sub" current="about" title={data.title} />
      <main className="i2-main i2-main--sub" data-page="about" id={mainId(ctx)}>
        <AboutPage data={data} />
      </main>
    </>
  );
}
