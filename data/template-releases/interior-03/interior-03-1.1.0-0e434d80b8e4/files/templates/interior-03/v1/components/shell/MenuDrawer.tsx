"use client";

import Link from "../ui/Link";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ShellIcon } from "./ShellIcons";

export interface DrawerLink {
  key: string;
  href: string;
  label: string;
  current: boolean;
}

const DRAWER_ID = "i3-drawer";
const WIDE = "(min-width: 769px)";

/**
 * The ≤ 768 menu (client): the button in the bar opens a dark panel that slides in from the left
 * edge (250px wide, full height, 0.3s quartic ease-out — CSS) over the page; the page behind stays
 * where it is and is not dimmed. The panel has a top row (home link left, close button right) and
 * one row per page link. It closes on the close button, on Escape, on any link press (before the
 * client navigation) and when the viewport widens past 768; focus returns to the menu button.
 * While open the panel is a modal dialog with the menu's name and Tab stays inside it; closed, it
 * is inert and hidden from assistive tech.
 */
export function MenuDrawer({ links, home, labels }: { links: DrawerLink[]; home?: { href: string; label: string }; labels: { menu: string; open: string; close: string } }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const wide = matchMedia(WIDE);
    const onChange = () => {
      if (wide.matches) setOpen(false);
    };
    wide.addEventListener("change", onChange);
    panel.current?.querySelector<HTMLElement>("[data-drawer-close]")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Tab wraps inside the open panel. */
  const onPanelKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>("a[href], button") ?? []);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  };

  return (
    <>
      <button ref={button} type="button" className="i3-menu-btn" aria-label={labels.open} aria-expanded={open} aria-controls={DRAWER_ID} data-menu-button="" onClick={() => setOpen(true)}>
        <ShellIcon name="menu" size={24} />
      </button>
      <div
        ref={panel}
        id={DRAWER_ID}
        className="i3-drawer"
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-label={labels.menu}
        aria-hidden={!open}
        inert={!open}
        data-drawer-open={open ? "" : undefined}
        onKeyDown={onPanelKey}
      >
        <div className="i3-drawer__top">
          {home ? (
            <Link href={home.href} className="i3-drawer__home" onClick={close}>
              {home.label}
            </Link>
          ) : null}
          <button type="button" className="i3-drawer__close" aria-label={labels.close} data-drawer-close="" onClick={close}>
            <ShellIcon name="close" size={22} strokeWidth={1.6} />
          </button>
        </div>
        <ul className="i3-drawer__list">
          {links.map((l) => (
            <li key={l.key}>
              {l.current ? (
                <a href={l.href} className="i3-drawer__link" aria-current="page" onClick={close}>
                  <ShellIcon name="plus" size={10} strokeWidth={3} />
                  {l.label}
                </a>
              ) : (
                <Link href={l.href} className="i3-drawer__link" onClick={close}>
                  <ShellIcon name="plus" size={10} strokeWidth={3} />
                  {l.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
