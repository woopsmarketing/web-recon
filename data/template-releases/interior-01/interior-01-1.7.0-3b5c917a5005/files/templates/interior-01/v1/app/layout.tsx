import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { headScriptTags } from "./head-scripts";
import { isShell } from "../lib/routes";
import { inheritedMetadata } from "../lib/seo";
import { SHELL_NAVIGATION_SCRIPT } from "../runtime/shell";
import { ShellProvider } from "../components/runtime/context";
import { SiteFooter } from "../sections/SiteFooter";
import "../styles/template.css";

export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  return {
    ...inheritedMetadata(ctx),
    ...(ctx.identity.publicOrigin ? { metadataBase: new URL(ctx.identity.publicOrigin) } : {}),
    // 1.5.2: a site that must not be indexed (site.seo indexing "noindex") says so on every page;
    // robots.txt keeps allowing the crawl so that crawlers can read it. Preview stays noindex,nofollow.
    robots: ctx.mode === "preview" ? { index: false, follow: false } : ctx.settings["site.seo"].indexing === "noindex" ? { index: false } : undefined,
  };
}

/**
 * The site shell. The footer (and with it the site-wide floating seat) is rendered HERE, after
 * every page's own header + <main>: one instance for the whole site that survives client-side
 * navigation — a future chat launcher in the seat keeps its state across pages.
 *
 * The head carries the site's own theme plus whatever third-party scripts the SITE declares
 * (head-scripts.ts). Those load async unless the site's document says defer, so nothing a site
 * adds to its head can block the page from rendering.
 *
 * 1.7.0, a SHELL build only (an incrementally published site, runtime/shell.ts): links are plain
 * anchors (ShellProvider) and every move to another page is a document load (the navigation
 * script). Nothing of this exists in an ordinary build.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  const ctx = getSiteContext(template);
  const shell = isShell(ctx);
  const body = (
    <>
      {children}
      <SiteFooter ctx={ctx} />
    </>
  );
  return (
    <html lang={ctx.identity.locale}>
      <head>
        <style id="site-theme" dangerouslySetInnerHTML={{ __html: ctx.themeCss }} />
        {shell ? <script id="portfolio-shell-navigation" dangerouslySetInnerHTML={{ __html: SHELL_NAVIGATION_SCRIPT }} /> : null}
        {headScriptTags(ctx)}
      </head>
      <body>{shell ? <ShellProvider>{body}</ShellProvider> : body}</body>
    </html>
  );
}
