import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * `next/link` for the preview renderer kit (platform/preview/kit.ts replaces the import with this
 * module when it bundles a release). Outside a Next.js app `next/link` cannot run; in the server HTML
 * of a static export it is exactly the anchor it renders — the Template's own attributes plus `href`.
 * This shim is that anchor and nothing else; platform/test/preview-parity.test.ts proves it against a
 * real build (every <a> of every compared page).
 *
 * The router-only props never reach the DOM (as in Next). A non-string `href` (Next formats a
 * UrlObject) is NOT supported: it throws, so a release that starts using one fails the kit's render
 * and its parity test instead of silently producing a different link.
 */
export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  children?: ReactNode;
  prefetch?: unknown;
  replace?: unknown;
  scroll?: unknown;
  shallow?: unknown;
  passHref?: unknown;
  legacyBehavior?: unknown;
  locale?: unknown;
  as?: unknown;
  onNavigate?: unknown;
}

export default function Link(props: LinkProps) {
  const { href, children, prefetch: _p, replace: _r, scroll: _s, shallow: _h, passHref: _a, legacyBehavior: _l, locale: _o, as: _as, onNavigate: _n, ...anchor } = props;
  if (typeof href !== "string") throw new Error("preview kit: next/link with a non-string href is not supported by the shim");
  return (
    <a {...anchor} href={href}>
      {children}
    </a>
  );
}
