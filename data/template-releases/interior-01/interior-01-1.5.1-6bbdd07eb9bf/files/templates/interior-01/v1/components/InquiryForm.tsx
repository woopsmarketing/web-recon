"use client";

import { useRef, useState, type FormEvent } from "react";

export interface InquiryFormProps {
  email: string;
  /** options of the work-type select; none → a free text field */
  workTypes?: string[];
  labels: {
    name: string;
    phone: string;
    region: string;
    area: string;
    workType: string;
    select: string;
    schedule: string;
    message: string;
    required: string;
    submit: string;
    notice: string;
    afterSubmit: string;
    subject: string;
    /** 1.5.1: the status when the inquiry is too long for a mail link ("{email}" already filled in) */
    tooLong: string;
    /** 1.5.1: the label of the composed text shown to copy instead */
    tooLongText: string;
    /** 1.5.1: the button selecting that text */
    selectText: string;
    /** the address's label (the page's "email" label) */
    email: string;
  };
}

type Field = "name" | "phone" | "region" | "area" | "workType" | "schedule" | "message";
const FIELDS: readonly Field[] = ["name", "phone", "region", "area", "workType", "schedule", "message"];
const REQUIRED = new Set<Field>(["name", "phone", "message"]);
/** 1.5.1 field caps: the message, and each one-line field */
const MESSAGE_MAX_LENGTH = 500;
const FIELD_MAX_LENGTH = 100;
/**
 * 1.5.1: the longest mailto: URL handed to the mail app. Non-ASCII text grows ~9× when encoded
 * (one Korean character = 9 URL characters), and some mail handlers (Windows ShellExecute /
 * Outlook desktop) fail or truncate around 2,000 characters. Longer → no hand-off: the address
 * and the composed text are shown to copy instead.
 */
const MAILTO_MAX_LENGTH = 2000;

type Outcome = { kind: "handoff" } | { kind: "tooLong"; text: string };

/**
 * The /contact inquiry form (1.5.0). There is no backend: the button composes an e-mail to the
 * business address (the subject slot with "{name}" filled in + one labelled line per filled field) and hands it to the visitor's
 * mail app through a mailto: link. Nothing is sent, stored or confirmed by the site; afterwards
 * the status line says the e-mail still has to be sent from the mail app. Name, phone and message
 * are required (the browser's own validation).
 * 1.5.1: fields are capped; message line breaks are CRLF (RFC 6068); a link longer than
 * MAILTO_MAX_LENGTH is never opened — the status says so and the business address + the composed
 * text (subject, blank line, body) are shown to copy. The status text sits in a node re-created on
 * every press, so a screen reader announces it again on a repeated press.
 */
export function InquiryForm({ email, workTypes, labels }: InquiryFormProps) {
  const mailLink = useRef<HTMLAnchorElement>(null);
  const copyText = useRef<HTMLTextAreaElement>(null);
  /** the last press's outcome; `n` counts presses (the status node's key → re-announced) */
  const [status, setStatus] = useState<{ n: number; outcome: Outcome } | null>(null);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const value = (f: Field) => String(data.get(f) ?? "").trim();
    const lines = FIELDS.filter((f) => f !== "message" && value(f) !== "").map((f) => `${labels[f]}: ${value(f)}`);
    const message = value("message").replace(/\r?\n/g, "\r\n");
    const body = [...lines, "", `${labels.message}:`, message].join("\r\n");
    const subject = labels.subject.replaceAll("{name}", value("name"));
    const link = mailLink.current;
    if (!link) return;
    const href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (href.length > MAILTO_MAX_LENGTH) {
      link.removeAttribute("href");
      setStatus((s) => ({ n: (s?.n ?? 0) + 1, outcome: { kind: "tooLong", text: `${subject}\r\n\r\n${body}` } }));
      return;
    }
    link.href = href;
    link.click();
    setStatus((s) => ({ n: (s?.n ?? 0) + 1, outcome: { kind: "handoff" } }));
  };
  const fallback = status?.outcome.kind === "tooLong" ? status.outcome.text : undefined;
  const label = (f: Field) => (
    <label className="i1-form__label" htmlFor={`i1-inquiry-${f}`}>
      {labels[f]}
      {REQUIRED.has(f) ? (
        <span className="i1-form__req" aria-hidden="true">
          {" *"}
        </span>
      ) : null}
    </label>
  );
  const input = (f: Field, extra: { type?: string; autoComplete?: string; inputMode?: "tel" | "text" }) => (
    <div className="i1-form__field">
      {label(f)}
      <input id={`i1-inquiry-${f}`} name={f} className="i1-form__input" type={extra.type ?? "text"} autoComplete={extra.autoComplete} inputMode={extra.inputMode} required={REQUIRED.has(f)} maxLength={FIELD_MAX_LENGTH} />
    </div>
  );
  return (
    <form className="i1-form" data-inquiry-form="" onSubmit={onSubmit}>
      <p className="i1-form__required-note">{labels.required}</p>
      <div className="i1-form__grid">
        {input("name", { autoComplete: "name" })}
        {input("phone", { type: "tel", autoComplete: "tel", inputMode: "tel" })}
        {input("region", { autoComplete: "address-level2" })}
        {input("area", { autoComplete: "off" })}
        <div className="i1-form__field">
          {label("workType")}
          {workTypes && workTypes.length > 0 ? (
            <select id="i1-inquiry-workType" name="workType" className="i1-form__input i1-form__select" defaultValue="">
              <option value="">{labels.select}</option>
              {workTypes.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          ) : (
            <input id="i1-inquiry-workType" name="workType" className="i1-form__input" type="text" maxLength={FIELD_MAX_LENGTH} />
          )}
        </div>
        {input("schedule", { autoComplete: "off" })}
        <div className="i1-form__field i1-form__field--wide">
          {label("message")}
          <textarea id="i1-inquiry-message" name="message" className="i1-form__input i1-form__textarea" rows={6} required maxLength={MESSAGE_MAX_LENGTH} />
        </div>
      </div>
      {labels.notice ? <p className="i1-form__notice">{labels.notice}</p> : null}
      <button type="submit" className="i1-button i1-form__submit" data-inquiry-submit="">
        {labels.submit}
      </button>
      {/* the hand-off to the mail app (href set on submit); never a visible or focusable link */}
      <a ref={mailLink} hidden aria-hidden="true" tabIndex={-1} data-inquiry-mailto="" />
      <p className="i1-form__status" role="status" data-inquiry-status="">
        {status ? <span key={status.n}>{status.outcome.kind === "tooLong" ? labels.tooLong : labels.afterSubmit}</span> : null}
      </p>
      {fallback !== undefined ? (
        <div className="i1-form__fallback" data-inquiry-fallback="">
          <p className="i1-form__fallback-to">
            {labels.email}: <a href={`mailto:${email}`}>{email}</a>
          </p>
          <label className="i1-form__label" htmlFor="i1-inquiry-copy">
            {labels.tooLongText}
          </label>
          <textarea ref={copyText} id="i1-inquiry-copy" className="i1-form__input i1-form__textarea" readOnly rows={8} value={fallback} data-inquiry-copy="" />
          <button
            type="button"
            className="i1-form__select-text"
            data-inquiry-select=""
            onClick={() => {
              copyText.current?.focus();
              copyText.current?.select();
            }}
          >
            {labels.selectText}
          </button>
        </div>
      ) : null}
    </form>
  );
}
