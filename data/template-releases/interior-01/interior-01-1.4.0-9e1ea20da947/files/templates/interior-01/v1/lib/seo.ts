import type { Metadata } from "next";
import type { Ctx } from "../sections/types";

/**
 * Per-page metadata over the layout defaults (brand title, business summary,
 * metadataBase, preview noindex). Canonical ONLY when the Site Instance declares a
 * real production origin (no fabricated domain); the path is resolved against it.
 */
export function pageMetadata(ctx: Ctx, page: { title: string; description?: string; path: string }): Metadata {
  return {
    title: page.title,
    ...(page.description ? { description: page.description } : {}),
    ...(ctx.identity.publicOrigin ? { alternates: { canonical: page.path } } : {}),
  };
}
