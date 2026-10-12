import Link from "../../../components/ui/Link";
import type { SiteHeaderProps } from "../../../sections/SiteHeader";
import { BackLink, Brand, MenuButton, MenuPanel, SkipLink, headerModel } from "./shared";

/**
 * header.centered (H-B) — the wordmark centred, the menu on one side, one quiet consult control on
 * the other; a solid bar with a hairline, sticky, no script. Every page uses the same bar: the pages
 * live in the menu panel. The consult control is always its word (the header's contact label) — never
 * an icon alone, which reads as "chat". Phone width: menu · wordmark · the word; where the recipe has
 * the action bar, the bar carries the consultation there and the header's control is not shown
 * (header-centered.css). A sub-page with a title swaps the wordmark for the "← title" back link at
 * phone width, as the classic bar does.
 */
const NS = "ds-header-centered";

export function Section(props: SiteHeaderProps) {
  const m = headerModel(props);
  return (
    <header className={`${NS} ${NS}--${m.variant}${m.title ? ` ${NS}--titled` : ""}`} data-section="site.header" data-variant={m.variant}>
      <SkipLink m={m} ns={NS} />
      <div className={`${NS}__bar`}>
        <div className={`${NS}__side ${NS}__side--start`}>
          <MenuButton m={m} ns={NS} />
        </div>
        <div className={`${NS}__center`}>
          <Brand m={m} ns={NS} />
          <BackLink m={m} ns={NS} />
        </div>
        <div className={`${NS}__side ${NS}__side--end`}>
          {m.consult ? (
            <Link href={m.consult.href} className={`${NS}__consult`} aria-current={m.isCurrent === "contact" ? "page" : undefined} data-nav="contact">
              <span className={`${NS}__consult-label`}>{m.consult.label}</span>
            </Link>
          ) : null}
        </div>
      </div>
      <MenuPanel m={m} ns={NS} />
    </header>
  );
}
