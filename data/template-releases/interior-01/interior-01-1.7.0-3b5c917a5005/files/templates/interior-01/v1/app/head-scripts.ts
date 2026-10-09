import { createElement, type ReactElement } from "react";
import type { Ctx } from "../sections/types";

/**
 * The third-party <script> elements the SITE declares (its scripts.json, validated and assembled
 * by the platform), in authored order. The Template knows nothing about any vendor: no host, no
 * key, no attribute list — it only places what the site context hands it.
 *
 * Plain createElement, not JSX: this module has no markup of its own, just the already-validated
 * attributes of each element.
 */
export function headScriptTags(ctx: Ctx): ReactElement[] {
  return ctx.headScripts.map((script) => createElement("script", { key: script.id, ...script.attributes }));
}
