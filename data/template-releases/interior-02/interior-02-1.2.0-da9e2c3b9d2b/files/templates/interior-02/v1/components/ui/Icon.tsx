/**
 * Icon (SHELL shared block) — inline line icons drawn from scratch, stroke = currentColor.
 *   <Icon name="arrow-right" />            24px (default), decorative (aria-hidden); the owning control carries the name
 *   <Icon name="close" size={20} />        any pixel size; strokeWidth scales with the 24-unit viewBox
 *   <Icon name="home" filled />            "home" and "play" accept a filled variant (active tab / play button)
 * Names: arrow-right, arrow-left, arrow-up, chevron-left, chevron-right, chevron-down, pause, play, close, menu,
 *        search, check, plus, minus, chat, phone, home, image, grid, list, cube, calendar-check, pin, clock.
 */
export type IconName =
  | "arrow-right"
  | "arrow-left"
  | "arrow-up"
  | "chevron-left"
  | "chevron-right"
  | "chevron-down"
  | "pause"
  | "play"
  | "close"
  | "menu"
  | "search"
  | "check"
  | "plus"
  | "minus"
  | "chat"
  | "phone"
  | "home"
  | "image"
  | "grid"
  | "list"
  | "cube"
  | "calendar-check"
  | "pin"
  | "clock";

const PATHS: Record<IconName, string> = {
  "arrow-right": "M4 12h16M13 5l7 7-7 7",
  "arrow-left": "M20 12H4M11 5l-7 7 7 7",
  "arrow-up": "M12 20V4M5 11l7-7 7 7",
  "chevron-left": "M15 5l-7 7 7 7",
  "chevron-right": "M9 5l7 7-7 7",
  "chevron-down": "M5 9l7 7 7-7",
  pause: "M8 5v14M16 5v14",
  play: "M8 5.5v13l10-6.5z",
  close: "M6 6l12 12M18 6L6 18",
  menu: "M3 6.5h18M3 12h18M3 17.5h18",
  search: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5",
  check: "M5 12.5l4.5 4.5L19 7",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  chat: "M12 4c-4.7 0-8.5 3.1-8.5 7 0 2.2 1.2 4.1 3 5.4L6 20.5l4-1.9c.6.1 1.3.2 2 .2 4.7 0 8.5-3.1 8.5-7S16.7 4 12 4zM8.5 11h.01M12 11h.01M15.5 11h.01",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  home: "M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z",
  image: "M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5h.01",
  grid: "M8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM16 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM8 13.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM16 13.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z",
  list: "M4 6h3M10 6h10M4 12h3M10 12h10M4 18h3M10 18h10",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12L4 7.5M12 12v9",
  "calendar-check": "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4",
  pin: "M12 21s-6-5.5-6-10.5a6 6 0 0 1 12 0C18 15.5 12 21 12 21zM12 12.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
};

export function Icon({ name, size = 24, filled = false, className }: { name: IconName; size?: number; filled?: boolean; className?: string }) {
  const fill = filled && (name === "home" || name === "play") ? "currentColor" : "none";
  return (
    <svg
      className={className ? `i2-icon ${className}` : "i2-icon"}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      <path d={PATHS[name]} fill={fill} stroke="currentColor" strokeWidth={name === "menu" ? 2 : 1.7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
