import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Deterministic JSON: object keys are emitted in sorted order at every depth,
 * arrays keep their (already deterministic) order. Two runs over the same
 * evidence produce byte-identical files apart from timings.
 */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child === undefined) continue;
      out[key] = sortKeysDeep(child);
    }
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(sortKeysDeep(value), null, 2)}\n`;
}

export async function writeStableJson(file: string, value: unknown): Promise<number> {
  await mkdir(path.dirname(file), { recursive: true });
  const text = stableStringify(value);
  await writeFile(file, text, "utf8");
  return Buffer.byteLength(text);
}
