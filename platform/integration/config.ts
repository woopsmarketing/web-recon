import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { BuildMode } from "../site/instance";
import { siteDir } from "../site/load";

/**
 * Site-level integration opt-in: data/sites/<siteId>/integration.json (OPTIONAL).
 *
 *   { "schemaVersion": 1, "firstPartyData": { "enabled": true } }
 *
 * Absent file, or `enabled: false` = the integration is OFF: the package has no /_integration/
 * and is byte-identical to a build made before this document existed (02 §4, INV-11).
 * Owner decision OD-2 (04): per-site opt-in, default off. No site is named anywhere in code.
 *
 * The document is a BUILDER input, not part of the SiteSnapshot: the snapshot is exactly what the
 * pinned Template Release renders and its (strict) schema is frozen inside every stored release,
 * so it cannot grow without a Release change. The integration documents are projected by the
 * builder from the same snapshot and placed beside the Template's output. For an opted-in public
 * build this document and the producer version enter the buildInputId (platform/build/build-input),
 * so an ON package and an OFF package never share a build identity.
 */
export const INTEGRATION_FILE = "integration.json";

export const IntegrationConfigSchema = z
  .object({
    schemaVersion: z.literal(1),
    firstPartyData: z.object({ enabled: z.boolean() }).strict(),
  })
  .strict();
export type IntegrationConfig = z.infer<typeof IntegrationConfigSchema>;

export class IntegrationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IntegrationConfigError";
  }
}

/** The site's integration document, or undefined when the site has none (= off). */
export async function loadIntegrationConfig(repoRoot: string, siteId: string): Promise<IntegrationConfig | undefined> {
  const file = path.join(siteDir(repoRoot, siteId), INTEGRATION_FILE);
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new IntegrationConfigError(`cannot read ${file}: ${(error as Error).message}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text, (key, value) => {
      if (key === "__proto__" || key === "constructor" || key === "prototype") throw new Error(`forbidden key "${key}"`);
      return value;
    });
  } catch (error) {
    throw new IntegrationConfigError(`${siteId}/${INTEGRATION_FILE}: ${(error as Error).message}`);
  }
  const parsed = IntegrationConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new IntegrationConfigError(
      `${siteId}/${INTEGRATION_FILE} invalid: ${parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")}`,
    );
  }
  return parsed.data;
}

/** Does a build with this config and mode emit integration documents? public + opted in (02 §4, SE5). */
export function integrationEmits(config: IntegrationConfig | undefined, mode: BuildMode): boolean {
  return mode === "public" && config?.firstPartyData.enabled === true;
}
