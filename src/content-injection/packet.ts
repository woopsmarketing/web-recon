import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { CONTENT_POLICY } from "./policy.js";
import { buildContentUnits, type BuiltUnits } from "./units.js";
import { loadReconTemplate, type LoadedReconTemplate } from "./load-template.js";
import { contentRunDir, createdAtFromRunId, newContentRunId } from "./store.js";
import {
  CONTENT_ENGINE,
  CONTENT_GENERATOR_CONTRACT_VERSION,
  CONTENT_POLICY_FILE,
  CONTENT_POLICY_ID,
  CONTENT_POLICY_VERSION,
  CONTENT_RUN_MANIFEST_FILE,
  CONTENT_SCHEMA_VERSION,
  CONTENT_UNITS_FILE,
  ContentIntentSchema,
  ContentRunManifestSchema,
  ContentUnitsFileSchema,
  GENERATION_REQUEST_FILE,
  GENERATION_SCHEMA_FILE,
  GenerationRequestSchema,
  INTENT_FILE,
  ContentInputError,
  SLOT_VALUE_SOURCES,
  TEMPLATE_SUMMARY_FILE,
  type ContentIntent,
  type ContentRunManifest,
  type ContentUnit,
  type GenerationBatch,
  type GenerationRequest,
} from "./types.js";

/**
 * Content Task Packet builder (Task 19 §4).
 *
 * One natural-language intent becomes a BOUNDED packet a generator can read:
 * the immutable intent, the fixed policy, a compact template summary, the
 * deterministic content units, a batched generation request and the output
 * JSON schema. The raw SiteSpec and the raw slot inventory never enter the
 * packet — that boundary is the point.
 */

/** Prompt budget: one batch never carries more than this many units. */
export const BATCH_UNIT_LIMIT = 40;

export interface PrepareOptions {
  templateManifestFile: string;
  rawIntent: string;
  routes?: string[];
  includeReview?: boolean;
  preferences?: Record<string, string>;
  providedFacts?: { kind: string; value: string }[];
  /** Output directory override (tests); default data/<host>/content-runs/<id>. */
  outputDir?: string;
  runId?: string;
}

export interface PreparedContentRun {
  runDir: string;
  runId: string;
  manifest: ContentRunManifest;
  intent: ContentIntent;
  units: BuiltUnits;
  request: GenerationRequest;
  template: LoadedReconTemplate;
}

export function intentHash(rawIntent: string): string {
  return createHash("sha256").update(rawIntent, "utf8").digest("hex");
}

function buildBatches(units: ContentUnit[]): GenerationBatch[] {
  const batches: GenerationBatch[] = [];
  let n = 0;
  const push = (scope: "global" | "page", route: string | undefined, ids: string[]): void => {
    for (let i = 0; i < ids.length; i += BATCH_UNIT_LIMIT) {
      n++;
      batches.push({
        batchId: `batch${String(n).padStart(3, "0")}`,
        scope,
        ...(route !== undefined ? { route } : {}),
        unitIds: ids.slice(i, i + BATCH_UNIT_LIMIT),
      });
    }
  };
  // Global content first (§12): site-wide consistency before page passes.
  push("global", undefined, units.filter((u) => u.scope === "global").map((u) => u.unitId));
  const routes = [...new Set(units.filter((u) => u.route !== undefined).map((u) => u.route!))];
  for (const route of routes) {
    push("page", route, units.filter((u) => u.route === route).map((u) => u.unitId));
  }
  return batches;
}

/** JSON Schema for the generation result — provider-neutral output contract. */
function buildGenerationJsonSchema(units: ContentUnit[]): unknown {
  const valueSchemas: Record<string, unknown> = {};
  for (const unit of units) {
    for (const slot of unit.slots) {
      valueSchemas[slot.key] =
        slot.type === "image"
          ? {
              type: "object",
              properties: {
                src: { type: "string" },
                alt: { type: "string" },
                srcset: { type: "string" },
              },
              required: ["src"],
              additionalProperties: false,
            }
          : { type: "string" };
    }
  }
  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    title: "ContentGenerationResult",
    type: "object",
    properties: {
      schemaVersion: { const: CONTENT_SCHEMA_VERSION },
      contractVersion: { const: CONTENT_GENERATOR_CONTRACT_VERSION },
      generator: {
        type: "object",
        properties: { name: { type: "string" }, model: { type: "string" } },
        required: ["name"],
        additionalProperties: false,
      },
      sitePlan: { type: "object" },
      slotValues: {
        type: "object",
        properties: valueSchemas,
        additionalProperties: false,
      },
      sources: {
        type: "object",
        additionalProperties: { enum: [...SLOT_VALUE_SOURCES] },
      },
      unresolved: {
        type: "array",
        items: {
          type: "object",
          properties: { slotKey: { type: "string" }, reason: { type: "string" } },
          required: ["slotKey", "reason"],
          additionalProperties: false,
        },
      },
      imageBriefs: { type: "array" },
      notes: { type: "array", items: { type: "string" } },
    },
    required: [
      "schemaVersion",
      "contractVersion",
      "generator",
      "sitePlan",
      "slotValues",
      "sources",
      "unresolved",
      "imageBriefs",
    ],
    additionalProperties: false,
  };
}

/** Compact template summary — facts a generator needs, nothing more. */
function buildTemplateSummary(
  template: LoadedReconTemplate,
  scopedRoutes: string[],
  units: BuiltUnits,
): unknown {
  const sectionCounts: Record<string, number> = {};
  for (const unit of units.units) {
    sectionCounts[unit.section] = (sectionCounts[unit.section] ?? 0) + 1;
  }
  return {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    templateId: template.manifest.templateId,
    host: template.manifest.source.host,
    rootUrl: template.manifest.source.rootUrl,
    templateRoutes: template.manifest.routes,
    scopedRoutes,
    internalLinkTargets: template.siteMap.internalLinks,
    unitCounts: {
      total: units.units.length,
      bySection: sectionCounts,
      byKind: units.units.reduce<Record<string, number>>((acc, u) => {
        acc[u.kind] = (acc[u.kind] ?? 0) + 1;
        return acc;
      }, {}),
    },
    editableSlotCount: units.editableSlotCount,
    reviewSlotCount: units.reviewSlotKeys.length,
    templateLimitations: template.manifest.limitations,
  };
}

const GENERATION_INSTRUCTIONS = [
  "Produce the Site Content Plan first, then values for the requested units only.",
  "Write values for slot keys listed in the content units — any other key fails validation.",
  "Text and URL slot values are plain strings; image slot values are {src, alt?, srcset?} objects. HTML, scripts, CSS, React code and selectors are rejected.",
  "URLs: keep existing internal routes unless the user asked for a rename; javascript: URLs are rejected; when the user provided no destination for an external link, mark it needs-input instead of inventing one.",
  "Facts the user did not provide (customers, prices, statistics, awards, addresses, phone numbers, testimonials) must become needs-input, never invented values.",
  "Every written value carries a source: user-provided | derived-copy | generated-marketing.",
  "Use the recorded constraints (original character/word counts, line counts, boxes) as references; the browser layout QA decides acceptance.",
  "One value per logical slot — the template propagates it to every bound occurrence (desktop, mobile, dynamic menus).",
];

export async function prepareContentRun(options: PrepareOptions): Promise<PreparedContentRun> {
  const template = await loadReconTemplate(options.templateManifestFile);
  const runId = options.runId ?? newContentRunId();
  const runDir = options.outputDir ?? contentRunDir(template.manifest.source.host, runId);

  const templateRoutes = new Set(template.manifest.routes);
  const routes = options.routes ?? (templateRoutes.has("/") ? ["/"] : [template.manifest.routes[0]]);
  for (const route of routes) {
    if (!templateRoutes.has(route)) {
      throw new ContentInputError(`route ${route} is not a template route`);
    }
  }

  const intent = ContentIntentSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    rawIntent: options.rawIntent,
    requestedScope: { routes, includeReview: options.includeReview ?? false },
    preferences: options.preferences ?? {},
    providedFacts: options.providedFacts ?? [],
  });

  const units = buildContentUnits(template, routes, intent.requestedScope.includeReview);
  if (units.units.length === 0) {
    throw new ContentInputError(`no editable content units in scope for routes ${routes.join(", ")}`);
  }

  const request = GenerationRequestSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contractVersion: CONTENT_GENERATOR_CONTRACT_VERSION,
    runId,
    templateId: template.manifest.templateId,
    policyId: CONTENT_POLICY_ID,
    policyVersion: CONTENT_POLICY_VERSION,
    steps: ["site-content-plan", "unit-values"],
    batches: buildBatches(units.units),
    instructions: GENERATION_INSTRUCTIONS,
    allowedSources: [...SLOT_VALUE_SOURCES, "needs-input (via unresolved)"],
  });

  const manifest = ContentRunManifestSchema.parse({
    schemaVersion: CONTENT_SCHEMA_VERSION,
    schemaName: "content-run-v1",
    engine: CONTENT_ENGINE,
    runId,
    createdAt: createdAtFromRunId(runId),
    templateId: template.manifest.templateId,
    templateManifestFile: template.manifestFile,
    policyId: CONTENT_POLICY_ID,
    policyVersion: CONTENT_POLICY_VERSION,
    intentHash: intentHash(intent.rawIntent),
    scopedRoutes: routes,
    includeReview: intent.requestedScope.includeReview,
    manualEdits: false,
    repairIterations: 0,
    counts: {
      units: units.units.length,
      editableSlots: units.editableSlotCount,
      reviewSlotsListed: units.reviewSlotKeys.length,
      generatedSlots: 0,
      unresolvedSlots: 0,
      imageBriefs: 0,
    },
    provenance: "derived",
  });

  await mkdir(runDir, { recursive: true });
  const write = (name: string, value: unknown): Promise<void> =>
    writeFile(path.join(runDir, name), JSON.stringify(value, null, 2) + "\n", "utf8");
  await write(INTENT_FILE, intent);
  await write(CONTENT_POLICY_FILE, CONTENT_POLICY);
  await write(TEMPLATE_SUMMARY_FILE, buildTemplateSummary(template, routes, units));
  await write(
    CONTENT_UNITS_FILE,
    ContentUnitsFileSchema.parse({
      schemaVersion: CONTENT_SCHEMA_VERSION,
      templateId: template.manifest.templateId,
      units: units.units,
      reviewSlotKeys: units.reviewSlotKeys,
    }),
  );
  await write(GENERATION_REQUEST_FILE, request);
  await write(GENERATION_SCHEMA_FILE, buildGenerationJsonSchema(units.units));
  await write(CONTENT_RUN_MANIFEST_FILE, manifest);

  return { runDir, runId, manifest, intent, units, request, template };
}
