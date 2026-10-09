"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import { Icon } from "../ui/Icon";

export interface PolicyDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  paragraphs: string[];
  closeLabel: string;
}

/**
 * The policy layer: a native <dialog> shown modally (showModal — the browser traps focus inside
 * it, makes the page behind inert and closes it on Escape). The dialog element is the full
 * viewport (its ::backdrop is the dim + blur); the white box is centred inside it and scrolls on
 * its own; the close button sits at the top right of the screen. A click on the dim closes it.
 * Scroll lock is CSS (html:has(.i2-dialog[open])). The opener is responsible for focus return.
 */
export function PolicyDialog({ open, onClose, title, paragraphs, closeLabel }: PolicyDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  const onBackdrop = (e: MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <dialog ref={ref} className="i2-dialog" aria-labelledby="i2-policy-title" onClose={onClose} onClick={onBackdrop} data-policy-dialog="">
      <div className="i2-dialog__box">
        <h2 id="i2-policy-title" className="i2-dialog__title">
          {title}
        </h2>
        <div className="i2-dialog__body">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>
      <button type="button" className="i2-dialog__close" aria-label={closeLabel} onClick={onClose} data-policy-close="">
        <Icon name="close" size={32} />
      </button>
    </dialog>
  );
}
