import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { SiteHeader } from "../sections/SiteHeader";
import { SiteFooter } from "../sections/SiteFooter";
import { HomeProjectsA, homeProjectsA } from "../sections/HomeProjectsA";

export default function HomePage() {
  const ctx = getSiteContext(template);
  const projects = homeProjectsA(ctx);
  return (
    <>
      <SiteHeader ctx={ctx} />
      <main className="i1-main">{projects ? <HomeProjectsA data={projects} /> : null}</main>
      <SiteFooter ctx={ctx} />
    </>
  );
}
