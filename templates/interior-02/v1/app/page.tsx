import type { Metadata } from "next";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { isShell } from "../lib/routes";
import { SHELL_METADATA, homePage } from "../runtime/portfolio";
import { Header } from "../design/chrome";
import { mainId } from "../design/resolve";
import { HomeSections } from "../design/sections";

export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  return isShell(ctx) ? SHELL_METADATA : homePage(ctx).metadata;
}

/**
 * Homepage — header, then the sections of the site's HOME RECIPE in the recipe's order
 * (design/sections.tsx; the footer, the fixed floater and the mobile bar come from the root layout).
 *
 * The recipe is the `home` list of the site's design document (settings `site.design`): which
 * sections, in which order, each in which variant — every value a member of the Template's registry
 * (design/registry.ts), nothing free-form. A site WITHOUT a design document gets the classic recipe,
 * which is the 1.1 home page:
 *   hero · projects · promos · keywords · service · recent · brands · showrooms
 *
 * Every section resolves its own data first and is omitted entirely when it has none. The sections
 * that show the portfolio (hero · projects · keywords · recent) are runtime slots
 * (runtime/portfolio.ts): rendered here in an ordinary build, placeholders in a shell build; their
 * variant travels inside the slot data. The page's one <h1> is the brand name, here — a home
 * section never renders an <h1>.
 */
export default function HomePage() {
  const ctx = getSiteContext(template);
  const shell = isShell(ctx);
  const { slots } = homePage(ctx);
  return (
    <>
      <Header ctx={ctx} variant="home" />
      <main className="i2-main i2-main--home" id={mainId(ctx)}>
        <h1 className="i2-sr">{ctx.identity.brandName}</h1>
        <HomeSections ctx={ctx} slots={slots} shell={shell} />
      </main>
    </>
  );
}
