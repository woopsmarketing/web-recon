import { ImageSlotValueSchema, type SlotDefinition } from "../recon-template/types.js";
import type { LoadedReconTemplate } from "./load-template.js";
import {
  CONTENT_SCHEMA_VERSION,
  SLOT_VALUE_SOURCES,
  ValidationReportSchema,
  type ContentGenerationResult,
  type ContentUnitsFile,
  type ValidationIssue,
  type ValidationReport,
} from "./types.js";

/**
 * Deterministic generated-content validator (Task 19 §21).
 *
 * Every generation result — fake provider, future remote provider, Claude
 * Code's manual JSON, or an operator's hand-edited slot-values file — passes
 * through this gate before it can become an overlay. No LLM is trusted to
 * validate itself, and unknown slot keys FAIL the run instead of being
 * silently dropped.
 */

const HTML_INJECTION = /<\s*[a-z!/]/i;
const CONTROL_CHARS = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/** Scheme extraction tolerant of whitespace/control-char obfuscation. */
function urlScheme(value: string): string | undefined {
  const cleaned = value.replace(/[\s\x00-\x1f\x7f]+/g, "").toLowerCase();
  const match = cleaned.match(/^([a-z][a-z0-9+.-]*):/);
  return match ? match[1] : undefined;
}

const FORBIDDEN_SCHEMES = new Set(["javascript", "data", "vbscript", "file", "blob"]);
const ALLOWED_SCHEMES = new Set(["http", "https", "tel", "mailto"]);

export interface ValidateOptions {
  /**
   * Manual mode (§29): the operator edited slot-values.json directly, so
   * per-key provenance is unavailable — its absence becomes a warning
   * instead of an error. Every safety check stays identical.
   */
  manual?: boolean;
}

interface Ctx {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function error(ctx: Ctx, code: string, message: string, slotKey?: string): void {
  ctx.errors.push({ code, message, ...(slotKey !== undefined ? { slotKey } : {}) });
}
function warning(ctx: Ctx, code: string, message: string, slotKey?: string): void {
  ctx.warnings.push({ code, message, ...(slotKey !== undefined ? { slotKey } : {}) });
}

function checkUrlValue(ctx: Ctx, template: LoadedReconTemplate, key: string, value: string): void {
  const scheme = urlScheme(value);
  if (scheme !== undefined && FORBIDDEN_SCHEMES.has(scheme)) {
    error(ctx, "forbidden-url-scheme", `URL uses forbidden scheme "${scheme}:"`, key);
    return;
  }
  if (scheme !== undefined && !ALLOWED_SCHEMES.has(scheme)) {
    error(ctx, "unsupported-url-scheme", `URL scheme "${scheme}:" is not in the allowlist`, key);
    return;
  }
  if (/[<>"]/.test(value)) {
    error(ctx, "url-unsafe-characters", "URL contains <, > or a quote", key);
    return;
  }
  if (scheme === undefined && !value.startsWith("/") && !value.startsWith("#") && !value.startsWith("?")) {
    warning(ctx, "relative-url-form", `relative URL "${value}" is neither /path, #hash nor ?query`, key);
  }
  if (value.startsWith("/")) {
    const routePart = value.split(/[?#]/)[0];
    const known =
      template.siteMap.routes.some((r) => r.route === routePart) ||
      template.siteMap.internalLinks.includes(routePart);
    if (!known) {
      warning(
        ctx,
        "broken-internal-route",
        `internal URL "${routePart}" matches no template route or observed internal link`,
        key,
      );
    }
  }
}

function checkTextValue(ctx: Ctx, key: string, value: string): void {
  if (HTML_INJECTION.test(value)) {
    error(ctx, "html-injection", "text value contains HTML/script markup", key);
  }
  if (CONTROL_CHARS.test(value)) {
    error(ctx, "control-characters", "text value contains control characters", key);
  }
}

function checkValue(
  ctx: Ctx,
  template: LoadedReconTemplate,
  slot: SlotDefinition,
  value: unknown,
): void {
  if (slot.type === "image") {
    const parsed = ImageSlotValueSchema.safeParse(value);
    if (!parsed.success) {
      error(
        ctx,
        "image-shape-invalid",
        "image slot value must be a strict {src, alt?, srcset?} object",
        slot.key,
      );
      return;
    }
    checkUrlValue(ctx, template, slot.key, parsed.data.src);
    if (parsed.data.alt !== undefined) checkTextValue(ctx, slot.key, parsed.data.alt);
    return;
  }
  if (typeof value !== "string") {
    error(ctx, "type-mismatch", `${slot.type} slot value must be a string`, slot.key);
    return;
  }
  if (slot.type === "url") {
    checkUrlValue(ctx, template, slot.key, value);
    if (CONTROL_CHARS.test(value)) {
      error(ctx, "control-characters", "URL value contains control characters", slot.key);
    }
    return;
  }
  checkTextValue(ctx, slot.key, value);
}

export function validateSlotAssignments(
  template: LoadedReconTemplate,
  unitsFile: ContentUnitsFile,
  slotValues: Record<string, unknown>,
  unresolved: { slotKey: string; reason: string }[],
  sources: Record<string, string>,
  imageBriefs: { slotKey: string; action: string }[],
  options: ValidateOptions = {},
): ValidationReport {
  const ctx: Ctx = { errors: [], warnings: [] };
  const scopedKeys = new Set<string>();
  for (const unit of unitsFile.units) for (const slot of unit.slots) scopedKeys.add(slot.key);

  const assignedKeys = Object.keys(slotValues);
  for (const key of assignedKeys) {
    const slot = template.slotByKey.get(key);
    if (!slot) {
      error(ctx, "unknown-slot-key", "slot key does not exist in the template", key);
      continue;
    }
    if (!scopedKeys.has(key)) {
      if (slot.editability === "review") {
        error(
          ctx,
          "review-slot-not-writable",
          "review slot was written without opt-in (§11: review is never auto-written)",
          key,
        );
      } else {
        error(ctx, "out-of-scope-slot", "slot is outside the requested generation scope", key);
      }
      continue;
    }
    checkValue(ctx, template, slot, slotValues[key]);
    const source = sources[key];
    if (source === undefined) {
      if (options.manual) {
        warning(ctx, "missing-source", "manually edited value carries no provenance", key);
      } else {
        error(ctx, "missing-source", "assigned value carries no source provenance", key);
      }
    } else if (!(SLOT_VALUE_SOURCES as readonly string[]).includes(source)) {
      error(ctx, "invalid-source", `source "${source}" is not a known provenance`, key);
    }
  }

  const unresolvedKeys = new Set<string>();
  for (const item of unresolved) {
    if (unresolvedKeys.has(item.slotKey)) {
      error(ctx, "duplicate-unresolved", "slot listed as unresolved more than once", item.slotKey);
    }
    unresolvedKeys.add(item.slotKey);
    if (!template.slotByKey.has(item.slotKey)) {
      error(ctx, "unknown-slot-key", "unresolved entry references a slot that does not exist", item.slotKey);
      continue;
    }
    if (!scopedKeys.has(item.slotKey)) {
      error(ctx, "out-of-scope-slot", "unresolved entry is outside the generation scope", item.slotKey);
    }
  }
  for (const key of assignedKeys) {
    if (unresolvedKeys.has(key)) {
      error(ctx, "assigned-and-unresolved", "slot is both assigned a value and marked needs-input", key);
    }
  }

  for (const brief of imageBriefs) {
    const slot = template.slotByKey.get(brief.slotKey);
    if (!slot) {
      error(ctx, "unknown-slot-key", "image brief references a slot that does not exist", brief.slotKey);
      continue;
    }
    if (slot.type !== "image") {
      error(ctx, "image-brief-on-non-image", "image brief references a non-image slot", brief.slotKey);
      continue;
    }
    if (brief.action === "replaced" && slotValues[brief.slotKey] === undefined) {
      error(
        ctx,
        "image-brief-inconsistent",
        'image brief says "replaced" but no replacement value was assigned',
        brief.slotKey,
      );
    }
  }

  const report: ValidationReport = {
    schemaVersion: CONTENT_SCHEMA_VERSION,
    pass: ctx.errors.length === 0,
    errors: ctx.errors,
    warnings: ctx.warnings,
    stats: {
      assignedSlots: assignedKeys.length,
      unresolvedSlots: unresolvedKeys.size,
      reviewSlotsSkipped: unitsFile.reviewSlotKeys.filter((k) => !scopedKeys.has(k)).length,
      imageBriefs: imageBriefs.length,
    },
  };
  return ValidationReportSchema.parse(report);
}

export function validateGenerationResult(
  template: LoadedReconTemplate,
  unitsFile: ContentUnitsFile,
  result: ContentGenerationResult,
): ValidationReport {
  return validateSlotAssignments(
    template,
    unitsFile,
    result.slotValues,
    result.unresolved,
    result.sources,
    result.imageBriefs,
  );
}
