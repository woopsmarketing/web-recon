import type { ReactElement } from "react";
import { SiteFooter } from "../sections/SiteFooter";
import { SiteHeader, type SiteHeaderProps } from "../sections/SiteHeader";
import type { Ctx } from "../sections/types";
import { designOf } from "./resolve";
import { Section as HeaderCentered } from "./variants/header/centered";
import { Section as HeaderConversion } from "./variants/header/conversion";
import { Section as FooterMinimal } from "./variants/footer/minimal";
import { Section as ActionBar } from "./variants/action-bar/action-bar";

/**
 * Chrome dispatch: the header, the footer and the mobile bar of the site's design document.
 *
 *   <Header ctx … />      first thing of every page (same props as the classic SiteHeader: the page
 *                         says which nav item is current and, on a sub-page, its title)
 *   <Footer ctx />        once, by the root layout, after every page
 *   <MobileBar ctx />     once, by the root layout, after the footer; "none" renders nothing
 *
 * A header variant owns everything the classic header owns — the bar, the drawer and, in the
 * classic one, the ≤ 640 bottom tab bar (sections/SiteTabBar). The classic site gets SiteHeader and
 * SiteFooter exactly as before.
 */
export type HeaderProps = SiteHeaderProps;

export const HEADERS: Record<string, (props: HeaderProps) => ReactElement | null> = {
  classic: SiteHeader,
  centered: HeaderCentered,
  conversion: HeaderConversion,
};
export const FOOTERS: Record<string, (props: { ctx: Ctx }) => ReactElement | null> = {
  classic: SiteFooter,
  minimal: FooterMinimal,
};
export const MOBILE_BARS: Record<string, ((props: { ctx: Ctx }) => ReactElement | null) | null> = {
  none: null,
  "action-bar": ActionBar,
};

export function Header(props: HeaderProps) {
  const Variant = HEADERS[designOf(props.ctx).chrome.header]!;
  return <Variant {...props} />;
}

export function Footer({ ctx }: { ctx: Ctx }) {
  const Variant = FOOTERS[designOf(ctx).chrome.footer]!;
  return <Variant ctx={ctx} />;
}

export function MobileBar({ ctx }: { ctx: Ctx }) {
  const Variant = MOBILE_BARS[designOf(ctx).chrome.mobileBar];
  return Variant ? <Variant ctx={ctx} /> : null;
}
