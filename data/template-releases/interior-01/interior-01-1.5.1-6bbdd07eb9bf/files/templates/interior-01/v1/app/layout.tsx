import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
import { SiteFooter } from "../sections/SiteFooter";
import "../styles/template.css";

export function generateMetadata(): Metadata {
  const ctx = getSiteContext(template);
  const business = ctx.content.getSingleton("business");
  return {
    title: ctx.identity.brandName,
    description: business.summary,
    ...(ctx.identity.publicOrigin ? { metadataBase: new URL(ctx.identity.publicOrigin) } : {}),
    robots: ctx.mode === "preview" ? { index: false, follow: false } : undefined,
  };
}

/**
 * The site shell. The footer (and with it the site-wide floating seat) is rendered HERE, after
 * every page's own header + <main>: one instance for the whole site that survives client-side
 * navigation — a future chat launcher in the seat keeps its state across pages.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  const ctx = getSiteContext(template);
  return (
    <html lang={ctx.identity.locale}>
      <head>
        <style id="site-theme" dangerouslySetInnerHTML={{ __html: ctx.themeCss }} />
      </head>
      <body>
        {children}
        <SiteFooter ctx={ctx} />
      </body>
    </html>
  );
}
