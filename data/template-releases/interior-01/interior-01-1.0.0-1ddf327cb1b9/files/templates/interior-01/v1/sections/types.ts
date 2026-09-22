import type { SiteContext } from "@platform/site/context";
import type { template } from "../template";

export type Ctx = SiteContext<(typeof template)["sections"]>;
