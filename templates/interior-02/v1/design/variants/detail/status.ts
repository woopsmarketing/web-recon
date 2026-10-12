/**
 * Status of the detail variants (owner: E-TB-P). No import.
 *   "placeholder"  the variant is registered and its files exist, but it still renders the classic implementation
 *   "ready"        implemented, checked at 375 / 390 / 768 / 1440 with the thin-content fixtures, kit parity proven
 * Flip a value here — and only here — when a variant is done (platform/design/README.md, "Finishing a variant").
 * design/registry.ts reads this file; a release is not cut while a preset names a placeholder.
 */
export const status = {
  "typographic": "ready",
  "gallery": "ready",
} as const satisfies Record<string, "placeholder" | "ready">;
