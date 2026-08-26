import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_CONTENT_FILE,
  DefaultContentFileSchema,
  SITE_MAP_FILE,
  SLOTS_FILE,
  SLOT_BINDINGS_FILE,
  SiteMapSchema,
  SlotsFileSchema,
  SlotBindingsFileSchema,
  TEMPLATE_APP_DIR,
  TemplateManifestSchema,
  type DefaultContentFile,
  type SiteMap,
  type SlotBinding,
  type SlotBindingsFile,
  type SlotDefinition,
  type SlotsFile,
  type TemplateManifest,
} from "../recon-template/types.js";
import { ContentInputError } from "./types.js";

/**
 * Read-only loader for a Task 18 Recon Template run. Content Injection is a
 * CONSUMER of the template: it validates the artifact against the template's
 * own schemas and never writes into the template directory.
 */

export interface LoadedReconTemplate {
  runDir: string;
  manifestFile: string;
  appDir: string;
  manifest: TemplateManifest;
  slotsFile: SlotsFile;
  bindingsFile: SlotBindingsFile;
  defaultContent: DefaultContentFile;
  siteMap: SiteMap;
  slotByKey: Map<string, SlotDefinition>;
  bindingsBySlotId: Map<string, SlotBinding[]>;
}

async function readJson(file: string): Promise<unknown> {
  let raw: string;
  try {
    raw = await readFile(file, "utf8");
  } catch {
    throw new ContentInputError(`cannot read ${file}`);
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new ContentInputError(`${file} is not valid JSON`);
  }
}

export async function loadReconTemplate(templateManifestFile: string): Promise<LoadedReconTemplate> {
  const manifestFile = path.resolve(templateManifestFile);
  const runDir = path.dirname(manifestFile);

  const manifest = TemplateManifestSchema.parse(await readJson(manifestFile));
  const slotsFile = SlotsFileSchema.parse(await readJson(path.join(runDir, SLOTS_FILE)));
  const bindingsFile = SlotBindingsFileSchema.parse(
    await readJson(path.join(runDir, SLOT_BINDINGS_FILE)),
  );
  const defaultContent = DefaultContentFileSchema.parse(
    await readJson(path.join(runDir, DEFAULT_CONTENT_FILE)),
  );
  const siteMap = SiteMapSchema.parse(await readJson(path.join(runDir, SITE_MAP_FILE)));

  for (const file of [slotsFile, bindingsFile, defaultContent] as const) {
    if (file.templateId !== manifest.templateId) {
      throw new ContentInputError(
        `template artifact mismatch: manifest templateId ${manifest.templateId} vs ${file.templateId}`,
      );
    }
  }

  const appDir = path.join(runDir, TEMPLATE_APP_DIR);
  try {
    if (!(await stat(path.join(appDir, "package.json"))).isFile()) {
      throw new ContentInputError(`template app missing at ${appDir}`);
    }
  } catch (error) {
    if (error instanceof ContentInputError) throw error;
    throw new ContentInputError(`template app missing at ${appDir}`);
  }

  const slotByKey = new Map<string, SlotDefinition>();
  for (const slot of slotsFile.slots) slotByKey.set(slot.key, slot);
  const bindingsBySlotId = new Map<string, SlotBinding[]>();
  for (const binding of bindingsFile.bindings) {
    const list = bindingsBySlotId.get(binding.slotId) ?? [];
    list.push(binding);
    bindingsBySlotId.set(binding.slotId, list);
  }

  return {
    runDir,
    manifestFile,
    appDir,
    manifest,
    slotsFile,
    bindingsFile,
    defaultContent,
    siteMap,
    slotByKey,
    bindingsBySlotId,
  };
}
