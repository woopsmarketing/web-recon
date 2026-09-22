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
  };
}

type Field = "name" | "phone" | "region" | "area" | "workType" | "schedule" | "message";
const FIELDS: readonly Field[] = ["name", "phone", "region", "area", "workType", "schedule", "message"];
const REQUIRED = new Set<Field>(["name", "phone", "message"]);

/**
 * The /contact inquiry form (1.5.0). There is no backend: the button composes an e-mail to the
 * business address (the subject slot with "{name}" filled in + one labelled line per filled field) and hands it to the visitor's
 * mail app through a mailto: link. Nothing is sent, stored or confirmed by the site; afterwards
 * the status line says the e-mail still has to be sent from the mail app. Name, phone and message
 * are required (the browser's own validation).
 */
export function InquiryForm({ email, workTypes, labels }: InquiryFormProps) {
  const mailLink = useRef<HTMLAnchorElement>(null);
  const [composed, setComposed] = useState(false);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const value = (f: Field) => String(data.get(f) ?? "").trim();
    const lines = FIELDS.filter((f) => f !== "message" && value(f) !== "").map((f) => `${labels[f]}: ${value(f)}`);
    const body = [...lines, "", `${labels.message}:`, value("message")].join("\r\n");
    const subject = labels.subject.replaceAll("{name}", value("name"));
    const link = mailLink.current;
    if (!link) return;
    link.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    link.click();
    setComposed(true);
  };
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
      <input id={`i1-inquiry-${f}`} name={f} className="i1-form__input" type={extra.type ?? "text"} autoComplete={extra.autoComplete} inputMode={extra.inputMode} required={REQUIRED.has(f)} />
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
            <input id="i1-inquiry-workType" name="workType" className="i1-form__input" type="text" />
          )}
        </div>
        {input("schedule", { autoComplete: "off" })}
        <div className="i1-form__field i1-form__field--wide">
          {label("message")}
          <textarea id="i1-inquiry-message" name="message" className="i1-form__input i1-form__textarea" rows={6} required />
        </div>
      </div>
      {labels.notice ? <p className="i1-form__notice">{labels.notice}</p> : null}
      <button type="submit" className="i1-button i1-form__submit" data-inquiry-submit="">
        {labels.submit}
      </button>
      {/* the hand-off to the mail app (href set on submit); never a visible or focusable link */}
      <a ref={mailLink} hidden aria-hidden="true" tabIndex={-1} data-inquiry-mailto="" />
      <p className="i1-form__status" role="status" data-inquiry-status="">
        {composed ? labels.afterSubmit : ""}
      </p>
    </form>
  );
}
