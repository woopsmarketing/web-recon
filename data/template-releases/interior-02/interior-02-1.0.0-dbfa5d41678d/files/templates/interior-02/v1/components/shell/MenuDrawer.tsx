"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Icon } from "../ui/Icon";

export interface DrawerLink {
  key: string;
  href: string;
  label: string;
  internal: boolean;
  current: boolean;
}
export interface DrawerGroup {
  label: string;
  links: DrawerLink[];
}

const DRAWER_ID = "i2-drawer";
const WIDE = "(min-width: 1281px)";

/**
 * The ≤ 1280 drawer (client). The navy square button toggles it (menu icon ↔ close icon); the panel
 * slides in from the right (.25s, CSS) under the header and fills the viewport. While open: body
 * scroll is locked (CSS `html:has([data-drawer-open])`), Escape closes, Tab cycles between the
 * button and the panel's links, the panel is a modal dialog with the menu's name. It closes on
 * any link press (before the client navigation) and when the viewport widens past 1280; focus
 * returns to the button. Closed, the panel is inert and hidden from assistive tech.
 */
export function MenuDrawer({ slogan, groups, labels }: { slogan: string[]; groups: DrawerGroup[]; labels: { menu: string; open: string; close: string } }) {
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
      if (wide.matches) close();
    };
    wide.addEventListener("change", onChange);
    panel.current?.querySelector<HTMLElement>("a[href]")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const focusables = () => Array.from(panel.current?.querySelectorAll<HTMLElement>("a[href]") ?? []);
  /** Tab from the last link wraps to the button; Shift+Tab from the button wraps to the last link. */
  const onPanelKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const items = focusables();
    const first = items[0];
    const last = items[items.length - 1];
    if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      button.current?.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      button.current?.focus();
    }
  };
  const onButtonKey = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!open || e.key !== "Tab") return;
    const items = focusables();
    const target = e.shiftKey ? items[items.length - 1] : items[0];
    if (target) {
      e.preventDefault();
      target.focus();
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        className="i2-square i2-square--navy i2-menu-btn"
        aria-label={open ? labels.close : labels.open}
        aria-expanded={open}
        aria-controls={DRAWER_ID}
        data-menu-button=""
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onButtonKey}
      >
        <Icon name={open ? "close" : "menu"} size={28} />
      </button>
      <div
        ref={panel}
        id={DRAWER_ID}
        className="i2-drawer"
        role="dialog"
        aria-modal={open ? "true" : undefined}
        aria-label={labels.menu}
        aria-hidden={!open}
        inert={!open}
        data-drawer-open={open ? "" : undefined}
        onKeyDown={onPanelKey}
      >
        <div className="i2-drawer__scroll">
          {slogan.length > 0 ? (
            <div className="i2-drawer__slogan">
              {slogan.map((line, i) => (
                <p key={i}>{line}</p>
              ))}
            </div>
          ) : null}
          <nav className="i2-drawer__groups" aria-label={labels.menu}>
            {groups.map((g, gi) => (
              <div key={gi} className="i2-drawer__group">
                {g.label ? <p className="i2-drawer__label">{g.label}</p> : null}
                <ul className="i2-drawer__list">
                  {g.links.map((l) => (
                    <li key={l.key}>
                      {l.internal ? (
                        <Link href={l.href} className="i2-drawer__link" aria-current={l.current ? "page" : undefined} onClick={close}>
                          {l.label}
                        </Link>
                      ) : (
                        <a href={l.href} className="i2-drawer__link" onClick={close}>
                          {l.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </div>
    </>
  );
}
