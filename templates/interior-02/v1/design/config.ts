import { z } from "zod";
import { validateDesignConfig, type DesignConfig } from "./contract";
import { registry } from "./registry";

/**
 * The value of the template setting `site.design.config`: null (the classic site) or a
 * DesignConfig@1 of this Template's registry. Anything else is refused when the site's settings
 * are resolved — before a page is rendered, in a build and in the runtime kit alike — with the
 * code `design_invalid` and the exact path of every offending value:
 *
 *     settings "site.design" invalid: config.home.2.variant: design_invalid: unknown variant …
 */
export const DesignConfigSetting = z
  .unknown()
  .superRefine((value, ctx) => {
    if (value === null) return;
    for (const problem of validateDesignConfig(value, registry)) {
      ctx.addIssue({
        code: "custom",
        message: `${problem.code}: ${problem.message}`,
        path: problem.path === "" ? [] : problem.path.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part)),
      });
    }
  })
  .transform((value) => value as DesignConfig | null);
