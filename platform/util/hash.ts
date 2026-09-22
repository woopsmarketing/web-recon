import { createHash } from "node:crypto";

/**
 * Canonical JSON + sha256 used for every platform identity (release hash, site
 * snapshot hash, buildInputId). Object keys are sorted recursively; array order
 * is meaningful and kept. `undefined` object members are dropped (JSON rules).
 *
 * Reimplemented small (not imported) so the new path carries no dependency on
 * the legacy pipeline's copies of the same helper.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const member = (value as Record<string, unknown>)[key];
      if (member !== undefined) out[key] = sortKeysDeep(member);
    }
    return out;
  }
  return value;
}

export function sha256(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hashJson(value: unknown): string {
  return sha256(stableStringify(value));
}
