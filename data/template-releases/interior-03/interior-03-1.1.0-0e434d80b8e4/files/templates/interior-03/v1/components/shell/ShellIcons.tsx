/**
 * Line glyphs of the shell (SHELL): menu, close, plus, phone, arrow-up. Drawn here (stroke,
 * currentColor) so the shell needs no image and no icon font. Decorative: the control that holds
 * one carries the accessible name.
 */
export type ShellIconName = "menu" | "close" | "plus" | "phone" | "arrow-up";

const PATHS: Record<ShellIconName, string> = {
  menu: "M3 6h18M3 12h18M3 18h18",
  close: "M5 5l14 14M19 5 5 19",
  plus: "M12 4v16M4 12h16",
  phone: "M6.6 3.5h3l1.5 4-2 1.4a11 11 0 0 0 6 6l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z",
  "arrow-up": "M12 19V5M6 11l6-6 6 6",
};

export function ShellIcon({ name, size = 24, strokeWidth = 2 }: { name: ShellIconName; size?: number; strokeWidth?: number }) {
  return (
    <svg className="i3-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
