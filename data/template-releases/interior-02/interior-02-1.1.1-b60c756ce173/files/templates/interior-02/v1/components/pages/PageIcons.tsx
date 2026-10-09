import { Icon } from "../ui/Icon";
import type { TeamIcon as TeamIconName, ValueIcon } from "../../manifest/pages";

/**
 * PageIcons (PAGES) — pictograms the SERVICE team row and the ABOUT value cards can show, drawn
 * from scratch (stroke = currentColor, decorative: aria-hidden). Which one an item shows is a
 * settings enum of the owning section (manifest/pages.ts: TEAM_ICONS / VALUE_ICONS).
 *   <TeamIcon name="headset" size={42} />          24-unit line icon; "home" and "cube" come from the shared set
 *   <ValueIllustration icon="rings" />              120-unit line illustration, fills its box (width from CSS)
 */

const TEAM_PATHS: Record<Exclude<TeamIconName, "home" | "cube">, string> = {
  people: "M9 11.5a3.25 3.25 0 1 0 0-6.5 3.25 3.25 0 0 0 0 6.5zM16.5 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 20a6 6 0 0 1 12 0M15 16.5a4 4 0 0 1 6 3.5",
  tools: "M4 20l6.5-6.5M9 8.5l5-5 5.5 5.5-5 5zM12.5 5l6.5 6.5M14 15.5 17.5 19a1.5 1.5 0 0 0 2-2L16 13.5",
  pen: "M4 20l2.5-8.5L15 3l6 6-8.5 8.5zM12.5 5.5l6 6M6.5 11.5l6 6M4 20l4.5-4.5M10.5 15.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  headset: "M4 13a8 8 0 0 1 16 0M4 13v4a2 2 0 0 0 2 2h2v-6H4zM20 13v4a2 2 0 0 1-2 2h-2v-6h4zM16 19v1a1.5 1.5 0 0 1-1.5 1.5H12",
  monitor: "M3 5h18v11H3zM12 16v4M8 20h8M7 12l3-3 3 2 4-4",
  clipboard: "M9 4h6v3H9zM9 5.5H7a1 1 0 0 0-1 1V20h12V6.5a1 1 0 0 0-1-1h-2M9 12h6M9 16h4",
};

export function TeamIcon({ name, size = 42 }: { name: TeamIconName; size?: number }) {
  if (name === "home" || name === "cube") return <Icon name={name} size={size} />;
  return (
    <svg className="i2-icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" focusable="false" data-icon={name}>
      <path d={TEAM_PATHS[name]} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const R = 56;
const C = 60;

/** Vertical lines cut to a circle of radius R. */
function lines(step: number): string[] {
  const out: string[] = [];
  for (let x = -R + step / 2; x < R; x += step) {
    const h = Math.sqrt(R * R - x * x);
    out.push(`M${(C + x).toFixed(1)} ${(C - h).toFixed(1)}V${(C + h).toFixed(1)}`);
  }
  return out;
}

function rays(count: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count;
    const x1 = C + Math.cos(a) * 14;
    const y1 = C + Math.sin(a) * 14;
    const x2 = C + Math.cos(a) * R;
    const y2 = C + Math.sin(a) * R;
    out.push(`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`);
  }
  return out;
}

function rings(step: number): number[] {
  const out: number[] = [];
  for (let r = step; r <= R; r += step) out.push(r);
  return out;
}

function dots(step: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = -R; y <= R; y += step) {
    for (let x = -R; x <= R; x += step) {
      if (x * x + y * y <= (R - 2) * (R - 2)) out.push([C + x, C + y]);
    }
  }
  return out;
}

function waves(step: number): string[] {
  const out: string[] = [];
  for (let r = step; r <= R; r += step) out.push(`M${C - r} ${C + 20}a${r} ${r} 0 0 1 ${2 * r} 0`);
  return out;
}

export function ValueIllustration({ icon }: { icon: ValueIcon }) {
  const common = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const };
  let body;
  switch (icon) {
    case "lines":
      body = <path d={lines(6).join("")} strokeWidth={2.2} {...common} />;
      break;
    case "rays":
      body = <path d={rays(36).join("")} strokeWidth={1.6} {...common} />;
      break;
    case "rings":
      body = (
        <g {...common} strokeWidth={1.8}>
          {rings(7).map((r) => (
            <circle key={r} cx={C} cy={C} r={r} />
          ))}
        </g>
      );
      break;
    case "dots":
      body = (
        <g fill="currentColor">
          {dots(8).map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r={2.1} />
          ))}
        </g>
      );
      break;
    case "grid":
      body = <path d={[...lines(10), ...lines(10).map((d) => d.replace(/^M([0-9.]+) ([0-9.]+)V([0-9.]+)$/, (_m, x, y1, y2) => `M${y1} ${x}H${y2}`))].join("")} strokeWidth={1.6} {...common} />;
      break;
    case "waves":
      body = <path d={waves(8).join("")} strokeWidth={2} {...common} />;
      break;
  }
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false" data-illustration={icon}>
      {body}
    </svg>
  );
}
