import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { headScriptTags } from "./head-scripts";
import { SiteFooter } from "../sections/SiteFooter";
import { SiteFloater } from "../sections/SiteFloater";
import "../styles/base.css";
import "../styles/shell.css";
import "../styles/carousel.css";
import "../styles/home.css";
import "../styles/portfolio.css";
import "../styles/pages.css";
import "../styles/support.css";

export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  const business = ctx.content.getSingleton("business");
  return {
    title: ctx.identity.brandName,
    description: business.summary,
    ...(ctx.identity.publicOrigin ? { metadataBase: new URL(ctx.identity.publicOrigin) } : {}),
    // a site that must not be indexed says so on every page; robots.txt keeps allowing the crawl. Preview: noindex,nofollow.
    robots: ctx.mode === "preview" ? { index: false, follow: false } : ctx.settings["site.seo"].indexing === "noindex" ? { index: false } : undefined,
  };
}

/**
 * The site shell. Every page renders its own <SiteHeader> (variant + current page) and <main>;
 * the footer and the fixed floater are rendered HERE once, after every page. The bottom tab bar
 * is part of SiteHeader (it needs the current page).
 *
 * A site that loads a third-party fixed widget in the bottom-right corner declares its closed box
 * (`site.floater.externalWidget`); <html> then carries `data-ext-widget` and the four numbers as
 * custom properties (--i2-ext-w / -h / -right / -bottom, inline) for the shell CSS. Nothing is
 * emitted when the site declares none.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  const ctx = getSiteContext(template);
  const ext = ctx.settings["site.floater"].externalWidget;
  const extAttrs = ext
    ? {
        "data-ext-widget": "",
        style: { "--i2-ext-w": `${ext.width}px`, "--i2-ext-h": `${ext.height}px`, "--i2-ext-right": `${ext.right}px`, "--i2-ext-bottom": `${ext.bottom}px` } as CSSProperties,
      }
    : {};
  return (
    <html lang={ctx.identity.locale} {...extAttrs}>
      <head>
        <style id="site-theme" dangerouslySetInnerHTML={{ __html: ctx.themeCss }} />
        {headScriptTags(ctx)}
      </head>
      <body>
        {children}
        <SiteFooter ctx={ctx} />
        <SiteFloater ctx={ctx} />
      </body>
    </html>
  );
}
