import { Floater } from "../components/shell/Floater";
import { contactHref } from "../lib/links";
import type { Ctx } from "./types";

/**
 * site.floater (SHELL) — the fixed bottom-right controls on every page (rendered once by the root
 * layout): a to-top button (always) and a contact link when `site.floater.contact` is on and the
 * contact route exists. The client part (components/shell/Floater) scrolls the document to the top.
 * `site.floater.externalWidget` (the box of a third-party corner widget the site loads) is not read
 * here: the root layout marks <html> with it and the shell CSS moves the column clear of the box.
 */
export function SiteFloater({ ctx }: { ctx: Ctx }) {
  const topLabel = ctx.slots.text("site.floater", "topLabel") ?? "";
  const contactLabel = ctx.slots.text("site.floater", "contactLabel");
  const href = ctx.settings["site.floater"].contact ? contactHref(ctx) : undefined;
  return <Floater topLabel={topLabel} contact={href && contactLabel ? { href, label: contactLabel } : undefined} />;
}
