import type { SiteContext } from "@platform/site/context";
import type { template } from "../template";

/** The site context bound to THIS template's section declarations (typed settings). */
export type Ctx = SiteContext<(typeof template)["sections"]>;
/** A served project, as the ContentReader returns it (template code never imports storage types). */
export type ProjectItem = NonNullable<ReturnType<Ctx["content"]["getBySlug"]>>;
/** The nav item a page belongs to ("portfolio" covers the list, its later pages and every detail). */
export type NavKey = "home" | "portfolio" | "service" | "about" | "faq" | "contact";
