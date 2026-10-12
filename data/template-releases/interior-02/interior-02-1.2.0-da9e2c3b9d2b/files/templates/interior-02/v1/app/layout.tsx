import type { Metadata } from "next";
import type { CSSProperties, ReactNode } from "react";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { headScriptTags } from "./head-scripts";
import { isShell } from "../lib/routes";
import { inheritedMetadata } from "../lib/seo";
import { SHELL_NAVIGATION_SCRIPT } from "../runtime/shell";
import { ShellProvider } from "../components/runtime/context";
import { SiteFloater } from "../sections/SiteFloater";
import { Footer, MobileBar } from "../design/chrome";
import { fontStylesheetHref } from "../design/fonts";
import { designId, designOf, isClassicSite } from "../design/resolve";
import { compileDesignTokens } from "../design/tokens";
import "../styles/base.css";
import "../styles/shell.css";
import "../styles/carousel.css";
import "../styles/home.css";
import "../styles/portfolio.css";
import "../styles/pages.css";
import "../styles/support.css";
import "../design/styles";

export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  return {
    ...inheritedMetadata(ctx),
    ...(ctx.identity.publicOrigin ? { metadataBase: new URL(ctx.identity.publicOrigin) } : {}),
    // a site that must not be indexed says so on every page; robots.txt keeps allowing the crawl. Preview: noindex,nofollow.
    robots: ctx.mode === "preview" ? { index: false, follow: false } : ctx.settings["site.seo"].indexing === "noindex" ? { index: false } : undefined,
  };
}

/**
 * The site shell. Every page renders its own header (design/chrome <Header>: variant + current
 * page) and <main>; the footer, the fixed floater and the mobile bar are rendered HERE once, after
 * every page. The bottom tab bar is part of the classic header (it needs the current page).
 *
 * Design (design/**): <html data-design> names what the site is rendered from — "classic" for a
 * site without a design document, else its preset id (or "custom"). For a site WITH a document the
 * head also carries, after the tier-1 theme, the compiled tier-2 custom properties
 * (<style id="site-design">, design/tokens.ts) and the stylesheet of its font set (design/fonts.ts;
 * the files are placed in the package by the site builder). The classic site gets neither: its
 * `--ds-*` values are the static defaults of styles/design/tokens.css, which nothing classic reads.
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
  // A SHELL build (an incrementally published site): links are plain anchors and every move to
  // another page is a document load (runtime/shell.ts). Nothing of this exists in an ordinary build.
  const shell = isShell(ctx);
  const design = designOf(ctx);
  const designed = !isClassicSite(ctx);
  const fontHref = designed ? fontStylesheetHref(design.fontSet) : undefined;
  const body = (
    <>
      {children}
      <Footer ctx={ctx} />
      <SiteFloater ctx={ctx} />
      <MobileBar ctx={ctx} />
    </>
  );
  return (
    <html lang={ctx.identity.locale} data-design={designId(ctx)} {...extAttrs}>
      <head>
        <style id="site-theme" dangerouslySetInnerHTML={{ __html: ctx.themeCss }} />
        {designed ? <style id="site-design" dangerouslySetInnerHTML={{ __html: compileDesignTokens({ theme: design.theme, tier1: ctx.theme, fontSet: design.fontSet }).css }} /> : null}
        {fontHref ? <link rel="stylesheet" href={fontHref} /> : null}
        {shell ? <script id="portfolio-shell-navigation" dangerouslySetInnerHTML={{ __html: SHELL_NAVIGATION_SCRIPT }} /> : null}
        {headScriptTags(ctx)}
      </head>
      <body>{shell ? <ShellProvider>{body}</ShellProvider> : body}</body>
    </html>
  );
}
