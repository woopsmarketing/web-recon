"use client";

import NextLink from "next/link";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { useShell } from "./runtime/context";

/**
 * Link (1.7.0) — every internal link of the Template.
 *   <Link href="/portfolio" className="…">…</Link>
 * An ordinary build renders next/link (prefetch + client navigation), exactly as before 1.7.0. On a
 * SHELL page (an incrementally published site, see runtime/shell.ts) it is the plain anchor
 * next/link renders and nothing else: the page a visitor moves to is composed at publish time, so
 * it must be loaded as a document, and nothing may be prefetched from the shell package in its place.
 */
export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  children?: ReactNode;
}

export default function Link({ href, children, ...anchor }: LinkProps) {
  const shell = useShell();
  if (shell) {
    return (
      <a {...anchor} href={href}>
        {children}
      </a>
    );
  }
  return (
    <NextLink {...anchor} href={href}>
      {children}
    </NextLink>
  );
}
