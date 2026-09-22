import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getSiteContext } from "@platform/site/bound";
import template from "../template";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  const ctx = getSiteContext(template);
  return (
    <html lang={ctx.identity.locale}>
      <head>
        <style id="site-theme" dangerouslySetInnerHTML={{ __html: ctx.themeCss }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
