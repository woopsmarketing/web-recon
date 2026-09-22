"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { CloseIcon, MenuIcon } from "./Icon";

export interface MenuLink {
  key: "portfolio" | "portfolio3d" | "about" | "contact";
  href: string;
  label: string;
  current?: "page" | "true";
}

interface MobileMenuProps {
  links: MenuLink[];
  /** the contact item (the header pill), last and emphasised */
  cta?: MenuLink;
  brandName: string;
  labels: { menu: string; open: string; close: string };
}

const MENU_ID = "i1-menu";

/**
 * The < 900 px header menu (1.5.0): a menu button and, while open, a native modal <dialog> —
 * Esc, the focus trap, the inert page and the top layer (above the floating seat) are the
 * browser's. It closes by Esc, the close button, a press on the backdrop, or a press on any of
 * its links (before the client navigation, so the next page never starts with it open); focus
 * returns to the menu button. The page behind does not scroll while it is open (CSS:
 * `html:has(.i1-menu[open])`). Client-only like the photo viewer: nothing of it is in the
 * server HTML (the same links are in the header's inline nav). ≥ 900 px the button is hidden
 * and an open menu closes (a modal left open there would make the page inert); focus then goes
 * to the header's first visible control (1.5.1), not to the hidden button.
 */
export function MobileMenu({ links, cta, brandName, labels }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="i1-header__menu"
        aria-label={labels.open}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? MENU_ID : undefined}
        data-menu-button=""
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </button>
      {open ? (
        <MenuDialog
          links={links}
          cta={cta}
          brandName={brandName}
          labels={labels}
          onClose={() => {
            setOpen(false);
            returnFocus(button.current);
          }}
        />
      ) : null}
    </>
  );
}

const isRendered = (el: Element) => el.getClientRects().length > 0;

/**
 * 1.5.1: where focus goes when the menu closes — the menu button when it is rendered; when it is
 * not (the menu was closed by the viewport widening past 900 px, where the button is hidden),
 * the header's first rendered link or button, else the header itself — never lost to <body>.
 */
function returnFocus(button: HTMLButtonElement | null) {
  if (!button) return;
  if (isRendered(button)) {
    button.focus();
    return;
  }
  const header = button.closest("header");
  if (!header) return;
  const target = Array.from(header.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")).find(isRendered);
  if (target) {
    target.focus();
    return;
  }
  header.tabIndex = -1;
  header.focus();
}

function MenuDialog({ links, cta, brandName, labels, onClose }: MobileMenuProps & { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  /** where the press began: only a press that starts AND ends on the backdrop closes */
  const pressedOn = useRef<EventTarget | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    // focus starts on the close button (the first control), whatever the browser's dialog focusing rule
    closeButton.current?.focus();
  }, []);
  useEffect(() => {
    const wide = matchMedia("(min-width: 900px)");
    const onChange = () => {
      if (wide.matches) ref.current?.close();
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);
  const close = () => ref.current?.close();
  // the panel fills the dialog box: a press whose target is the dialog itself is on the backdrop
  const onPointerDown = (e: PointerEvent<HTMLDialogElement>) => {
    pressedOn.current = e.target;
  };
  const onClick = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget && pressedOn.current === e.currentTarget) close();
  };
  const item = (l: MenuLink, className: string) => (
    <li key={l.key}>
      <Link href={l.href} className={className} data-menu-link={l.key} aria-current={l.current} onClick={close}>
        {l.label}
      </Link>
    </li>
  );
  return (
    <dialog ref={ref} id={MENU_ID} className="i1-menu" aria-label={labels.menu} data-menu="" onClose={onClose} onPointerDown={onPointerDown} onClick={onClick}>
      <div className="i1-menu__panel">
        <div className="i1-menu__bar">
          <span className="i1-menu__brand">{brandName}</span>
          <button ref={closeButton} type="button" className="i1-menu__close" aria-label={labels.close} data-menu-close="" onClick={close}>
            <CloseIcon />
          </button>
        </div>
        <nav aria-label={labels.menu}>
          <ul className="i1-menu__list">
            {links.map((l) => item(l, "i1-menu__link"))}
            {cta ? item(cta, "i1-menu__cta") : null}
          </ul>
        </nav>
      </div>
    </dialog>
  );
}
