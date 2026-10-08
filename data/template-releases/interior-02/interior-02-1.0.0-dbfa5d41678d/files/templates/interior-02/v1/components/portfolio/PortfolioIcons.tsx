/**
 * Three line glyphs the shared Icon set does not have (stroke = currentColor, 24-unit viewBox):
 *   refresh  the filter strip's reset button          sliders  the filter strip's open button
 *   single   the gallery's one-column view switch (a framed photo)
 */
export type PortfolioIconName = "refresh" | "sliders" | "single";

const PATHS: Record<PortfolioIconName, string> = {
  refresh: "M4 12a8 8 0 0 1 13.7-5.6M20 12a8 8 0 0 1-13.7 5.6M17.5 3v3.5H14M6.5 21v-3.5H10",
  sliders: "M4 7h9M17 7h3M4 17h3M11 17h9M13 4.5v5M7 14.5v5",
  single: "M5 5h14v14H5zM3 3h18M3 21h18",
};

export function PortfolioIcon({ name, size = 24, className }: { name: PortfolioIconName; size?: number; className?: string }) {
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
      <path d={PATHS[name]} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
