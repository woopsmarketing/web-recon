import { createElement, type ReactElement } from "react";
import type { Ctx } from "../sections/types";

/**
 * The third-party <script> elements the SITE declares (its scripts.json, validated and assembled
 * by the platform), in authored order. The template knows no vendor: it only places what the
 * site context hands it. Plain createElement: no markup of its own.
 */
export function headScriptTags(ctx: Ctx): ReactElement[] {
  return ctx.headScripts.map((script) => createElement("script", { key: script.id, ...script.attributes }));
}
