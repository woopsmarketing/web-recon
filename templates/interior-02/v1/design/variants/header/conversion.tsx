import Link from "../../../components/ui/Link";
import { Icon } from "../../../components/ui/Icon";
import type { SiteHeaderProps } from "../../../sections/SiteHeader";
import { BackLink, Brand, MenuButton, MenuPanel, SkipLink, headerModel } from "./shared";

/**
 * header.conversion (H-D) — wordmark left, the pages as links, a filled consult pill and the phone
 * link (only when the site has a phone); a solid sticky bar, no script. Phone width and tablet:
 * wordmark + consult pill + menu button (the pages live in the menu panel). A sub-page with a title
 * swaps the wordmark for the "← title" back link below 700 px, as the classic bar does.
 */
const NS = "ds-header-conversion";

export function Section(props: SiteHeaderProps) {
  const m = headerModel(props);
  return (
    <header className={`${NS} ${NS}--${m.variant}${m.title ? ` ${NS}--titled` : ""}`} data-section="site.header" data-variant={m.variant}>
      <SkipLink m={m} ns={NS} />
      <div className={`${NS}__bar`}>
        <div className={`${NS}__start`}>
          <Brand m={m} ns={NS} />
          <BackLink m={m} ns={NS} />
        </div>
        {m.links.length > 1 ? (
          <nav className={`${NS}__nav`} aria-label={m.navLabel}>
            {m.links.map((l) => (
              <Link key={l.key} href={l.href} className={`${NS}__nav-link`} data-nav={l.key} aria-current={m.isCurrent === l.key ? "page" : undefined}>
                {l.label}
              </Link>
            ))}
          </nav>
        ) : null}
        <div className={`${NS}__actions`}>
          {m.phone ? (
            <a href={m.phone.href} className={`${NS}__phone`}>
              <Icon name="phone" size={22} />
              <span className={`${NS}__phone-label`}>{m.phone.label}</span>
            </a>
          ) : null}
          {m.consult ? (
            <Link href={m.consult.href} className={`${NS}__consult`} aria-current={m.isCurrent === "contact" ? "page" : undefined} data-nav="contact">
              <span className={`${NS}__consult-label`}>{m.consult.label}</span>
            </Link>
          ) : null}
          <MenuButton m={m} ns={NS} />
        </div>
      </div>
      <MenuPanel m={m} ns={NS} />
    </header>
  );
}
