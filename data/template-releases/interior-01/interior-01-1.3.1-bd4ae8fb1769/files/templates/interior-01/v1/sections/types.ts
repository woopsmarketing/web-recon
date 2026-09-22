import type { SiteContext } from "@platform/site/context";
import type { template } from "../template";

export type Ctx = SiteContext<(typeof template)["sections"]>;
/** A served project, as the ContentReader returns it (template code never imports storage types). */
export type ProjectItem = NonNullable<ReturnType<Ctx["content"]["getBySlug"]>>;
