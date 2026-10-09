import { ToTop } from "../components/shell/ToTop";
import type { Ctx } from "./types";

/**
 * site.floater (SHELL) — the fixed bottom-right corner, rendered once by the root layout. The
 * template's only control there is the optional "back to top" button (`site.floater.toTop`).
 * `site.floater.externalWidget` (the box of a third-party corner widget the site loads) is not
 * read here: the root layout marks <html> with it and the shell CSS keeps the button and the
 * footer's last lines clear of that box.
 */
export function SiteFloater({ ctx }: { ctx: Ctx }) {
  if (!ctx.settings["site.floater"].toTop) return null;
  return (
    <div className="i3-floater" data-section="site.floater">
      <ToTop label={ctx.slots.text("site.floater", "topLabel") ?? ""} />
    </div>
  );
}
