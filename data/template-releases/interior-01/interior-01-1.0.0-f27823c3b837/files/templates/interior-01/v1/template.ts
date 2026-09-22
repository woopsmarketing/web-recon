import { z } from "zod";
import { defineTemplate } from "@platform/site/template-manifest";
import { ProjectSelectionSchema } from "@platform/settings/settings";
import defaultTheme from "./theme.default.json";

/**
 * interior-01 v1 — first authored production Recon Template.
 * Every per-site variation is declared here; anything not declared is code.
 *   settings → enabled / limit / selection (behaviour)
 *   slots    → section-level copy (presentation text), with fallback chain
 */
export const template = defineTemplate({
  id: "interior-01",
  version: "1.0.0",
  vertical: "interior",
  routes: [{ key: "home", path: "/" }],
  sections: {
    "site.header": {
      schema: z.object({}).strict(),
      defaults: {},
      slots: {
        homeLinkLabel: { type: "text", maxLength: 24, neutralDefault: "Home" },
        projectsNavLabel: { type: "text", maxLength: 24, neutralDefault: "Projects" },
        contactLabel: { type: "text", maxLength: 24, neutralDefault: "Contact" },
      },
    },
    "home.projects-a": {
      schema: z
        .object({
          enabled: z.boolean(),
          limit: z.number().int().min(1).max(24),
          selection: ProjectSelectionSchema,
        })
        .strict(),
      defaults: { enabled: true, limit: 8, selection: { mode: "latest" } },
      slots: {
        title: { type: "text", maxLength: 40, neutralDefault: "Selected projects" },
        description: { type: "richText", maxParagraphs: 2, maxParagraphLength: 240 },
      },
    },
    "site.footer": {
      schema: z.object({ showSummary: z.boolean() }).strict(),
      defaults: { showSummary: true },
      slots: {
        summary: { type: "text", maxLength: 280, binding: "business.summary" },
        companyLabel: { type: "text", maxLength: 24, neutralDefault: "Company" },
        emailLabel: { type: "text", maxLength: 24, neutralDefault: "Email" },
      },
    },
  },
  theme: {
    consumes: [
      "color.canvas",
      "color.surface.secondary",
      "color.text.primary",
      "color.text.secondary",
      "color.text.muted",
      "color.text.inverse",
      "color.action.primary",
      "color.action.primaryText",
      "color.border.default",
      "decoration.radius.medium",
      "decoration.radius.pill",
      "typography.body",
      "typography.heading",
    ],
    defaults: defaultTheme,
  },
});

export default template;
