"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { INQUIRY_PHONE_PATTERN, isInquiryPhone, normalizeInquiryText, submitInquiry } from "@platform/site/inquiry-client";

/** the labels both modes of the form show */
export interface InquiryFieldLabels {
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
}

/** the mail hand-off's own labels (never shipped to a page whose form submits online) */
export interface InquiryMailLabels extends InquiryFieldLabels {
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
}

/** 1.6.2: online submission — where the form posts (site data) and the copy only that mode shows */
export interface InquiryOnline {
  endpoint: string;
  labels: {
    /** the required consent checkbox */
    consent: string;
    /** the phone field's format hint (its `title`, shown by the browser's own validation) */
    phoneHint: string;
    /** shown inside the form when scripts do not run (the form cannot be sent then) */
    noScript: string;
    /** the button while the request is on its way */
    submitting: string;
    successTitle: string;
    successBody: string;
    failure: string;
    /** first line of the message the endpoint receives (says where the inquiry came from) */
    messagePrefix: string;
  };
}

export type InquiryFormProps =
  | {
      /** the business address the mail hand-off writes to */
      email: string;
      /** options of the work-type select; none → a free text field */
      workTypes?: string[];
      labels: InquiryMailLabels;
      online?: undefined;
    }
  | {
      workTypes?: string[];
      labels: InquiryFieldLabels;
      online: InquiryOnline;
    };

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
/** 1.6.2 (online): the phone rule's own upper bound (INQUIRY_PHONE_PATTERN, the platform's inquiry door) */
const PHONE_MAX_LENGTH = 20;
/** 1.6.2 (online): the optional fields folded into the message, one labelled line each, in this order */
const DETAIL_FIELDS: readonly Field[] = ["region", "area", "workType", "schedule"];
/**
 * 1.6.2 (online): the longest message sent. The caps above keep the folded message far below it
 * (prefix + four labelled lines + the 500-character message); the cut is a last line of defence.
 */
const ONLINE_MESSAGE_MAX_LENGTH = 2000;
/** 1.6.2 (online): the trap field's name — nothing a browser autofills, nothing a person sees */
const TRAP_FIELD = "topic";

type Outcome = { kind: "handoff" } | { kind: "tooLong"; text: string };

function fieldLabel(labels: InquiryFieldLabels, f: Field) {
  return (
    <label className="i1-form__label" htmlFor={`i1-inquiry-${f}`}>
      {labels[f]}
      {REQUIRED.has(f) ? (
        <span className="i1-form__req" aria-hidden="true">
          {" *"}
        </span>
      ) : null}
    </label>
  );
}

function fieldInput(
  labels: InquiryFieldLabels,
  f: Field,
  extra: { type?: string; autoComplete?: string; inputMode?: "tel" | "text"; maxLength?: number; pattern?: string; title?: string },
) {
  return (
    <div className="i1-form__field">
      {fieldLabel(labels, f)}
      <input
        id={`i1-inquiry-${f}`}
        name={f}
        className="i1-form__input"
        type={extra.type ?? "text"}
        autoComplete={extra.autoComplete}
        inputMode={extra.inputMode}
        required={REQUIRED.has(f)}
        maxLength={extra.maxLength ?? FIELD_MAX_LENGTH}
        pattern={extra.pattern}
        title={extra.title}
      />
    </div>
  );
}

/** the seven fields, the same in both modes; `phone` = the phone field (online adds its format check) */
function fieldGrid(labels: InquiryFieldLabels, workTypes: string[] | undefined, phone: ReactNode) {
  return (
    <div className="i1-form__grid">
      {fieldInput(labels, "name", { autoComplete: "name" })}
      {phone}
      {fieldInput(labels, "region", { autoComplete: "address-level2" })}
      {fieldInput(labels, "area", { autoComplete: "off" })}
      <div className="i1-form__field">
        {fieldLabel(labels, "workType")}
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
      {fieldInput(labels, "schedule", { autoComplete: "off" })}
      <div className="i1-form__field i1-form__field--wide">
        {fieldLabel(labels, "message")}
        <textarea id="i1-inquiry-message" name="message" className="i1-form__input i1-form__textarea" rows={6} required maxLength={MESSAGE_MAX_LENGTH} />
      </div>
    </div>
  );
}

/**
 * The /contact inquiry form. Two modes, chosen by the SITE's data (never by the visitor):
 *
 * Mail hand-off (1.5.0; a site that declares no inquiry endpoint). There is no backend: the button
 * composes an e-mail to the business address (the subject slot with "{name}" filled in + one
 * labelled line per filled field) and hands it to the visitor's mail app through a mailto: link.
 * Nothing is sent, stored or confirmed by the site; afterwards the status line says the e-mail
 * still has to be sent from the mail app. Name, phone and message are required (the browser's own
 * validation).
 * 1.5.1: fields are capped; message line breaks are CRLF (RFC 6068); a link longer than
 * MAILTO_MAX_LENGTH is never opened — the status says so and the business address + the composed
 * text (subject, blank line, body) are shown to copy. The status text sits in a node re-created on
 * every press, so a screen reader announces it again on a repeated press.
 *
 * Online (1.6.2; a site that declares an inquiry endpoint): see OnlineInquiryForm below.
 */
export function InquiryForm(props: InquiryFormProps) {
  return props.online ? <OnlineInquiryForm workTypes={props.workTypes} labels={props.labels} online={props.online} /> : <MailInquiryForm email={props.email} workTypes={props.workTypes} labels={props.labels} />;
}

function MailInquiryForm({ email, workTypes, labels }: { email: string; workTypes?: string[]; labels: InquiryMailLabels }) {
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
  return (
    <form className="i1-form" data-inquiry-form="" onSubmit={onSubmit}>
      <p className="i1-form__required-note">{labels.required}</p>
      {fieldGrid(labels, workTypes, fieldInput(labels, "phone", { type: "tel", autoComplete: "tel", inputMode: "tel" }))}
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

/** idle → submitting → done, or → failed (→ submitting again on a retry); `failures` keys the alert node */
type OnlineState = { phase: "idle" | "submitting" | "failed" | "done"; failures: number };

type TextControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const isTextControl = (control: unknown): control is TextControl => control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement;

/**
 * Online mode (1.6.2): the button POSTs the inquiry to the endpoint the site declares, through the
 * platform's inquiry door (@platform/site/inquiry-client — this file never touches the network
 * itself). The endpoint takes a name, a phone number and one message, so the optional fields
 * (area / city, home size, type of work, timing) are folded into the message as labelled lines
 * under the site's prefix line; empty ones are left out.
 *
 * On a press every text field is first normalised in place (the door's normalizeInquiryText: a TAB
 * becomes a space, control / zero-width / bidi characters a paste brought along are removed, the
 * value is trimmed), so what is validated is what is sent and what the visitor sees. Then the
 * browser's own validation reports the first problem: name, phone (the door's phone rule, as the
 * field's `pattern` and again in script) and message are required, and so is the consent checkbox.
 * The form is `noValidate` only so that this order — normalise, then validate — is possible.
 *
 * The button is DISABLED in the server HTML and enabled once this island is mounted: before that
 * (or without scripts at all) a press would be a native GET of the form, i.e. the visitor's details
 * in the address bar. Without scripts the noscript line says the form cannot be sent.
 *
 * While the request is on its way the button is disabled and says so; a second press does nothing.
 * Success is claimed ONLY after the endpoint confirmed it: the fields are then removed (nothing
 * left to send twice) and the confirmation takes their place in the status region, which receives
 * focus and is scrolled clear of the sticky header. Anything else is a failure: the alert right
 * above the button says so (scrolled into view only if it is not already), every field keeps what
 * the visitor typed, focus stays where it is, and the button is ready for another try. Nothing
 * falls back to the mail app.
 *
 * The trap field is the endpoint's honeypot: hidden from sight, from the tab order and from
 * assistive technology; whatever a script typed into it is forwarded as `hp`.
 */
function OnlineInquiryForm({ workTypes, labels, online }: { workTypes?: string[]; labels: InquiryFieldLabels; online: InquiryOnline }) {
  const [state, setState] = useState<OnlineState>({ phase: "idle", failures: 0 });
  /** false in the server HTML and until the island is mounted — see the button */
  const [mounted, setMounted] = useState(false);
  /** true from the press until the endpoint answered (state updates are not synchronous) */
  const inFlight = useRef(false);
  const statusNode = useRef<HTMLParagraphElement>(null);
  const alertNode = useRef<HTMLParagraphElement>(null);
  const { phase, failures } = state;
  useEffect(() => {
    setMounted(true);
  }, []);
  useEffect(() => {
    if (phase === "failed") {
      // focus stays where it is. The alert takes the place the button had: when that was the bottom
      // edge of the viewport, bring the alert (and, by its scroll margin, the button under it) back
      // into view — a no-op when both are already visible
      alertNode.current?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (phase !== "done") return;
    // the fields are gone: put focus on the confirmation, and bring it into view below the sticky
    // header (its scroll-margin-top) — a plain focus() may leave its first line under the header
    const node = statusNode.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest" });
  }, [phase, failures]);
  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (inFlight.current) return;
    const form = e.currentTarget;
    const control = (name: string) => {
      const c = form.elements.namedItem(name);
      return isTextControl(c) ? c : undefined;
    };
    // 1. normalise, in place (a select's value is one of its own options: read, never rewritten)
    const values = {} as Record<Field, string>;
    for (const f of FIELDS) {
      const c = control(f);
      const text = normalizeInquiryText(c?.value ?? "", f === "message");
      values[f] = text;
      if (c && !(c instanceof HTMLSelectElement) && c.value !== text) c.value = text;
    }
    // 2. validate the normalised values: the browser's own report, plus the phone rule in script
    //    (a browser that could not compile the pattern attribute would otherwise skip that check)
    const phone = control("phone");
    if (phone instanceof HTMLInputElement) phone.setCustomValidity(values.phone === "" || isInquiryPhone(values.phone) ? "" : online.labels.phoneHint);
    if (!form.reportValidity()) return;
    const consent = form.elements.namedItem("consent");
    if (!(consent instanceof HTMLInputElement) || !consent.checked) return;
    if (values.name === "" || values.message === "" || !isInquiryPhone(values.phone)) return;
    const details = DETAIL_FIELDS.filter((f) => values[f] !== "").map((f) => `${labels[f]}: ${values[f]}`);
    const head = [online.labels.messagePrefix, ...details].filter((line) => line !== "");
    const message = (head.length > 0 ? [...head, "", values.message] : [values.message]).join("\n").slice(0, ONLINE_MESSAGE_MAX_LENGTH);
    inFlight.current = true;
    setState((s) => ({ phase: "submitting", failures: s.failures }));
    const result = await submitInquiry(online.endpoint, {
      consent: true,
      name: values.name,
      phone: values.phone,
      message,
      hp: control(TRAP_FIELD)?.value ?? "",
    });
    inFlight.current = false;
    setState((s) => (result.status === "ok" ? { phase: "done", failures: s.failures } : { phase: "failed", failures: s.failures + 1 }));
  };
  const done = phase === "done";
  const submitting = phase === "submitting";
  return (
    <form className="i1-form" data-inquiry-form="" noValidate onSubmit={onSubmit} aria-busy={submitting ? true : undefined}>
      {done ? null : (
        <>
          <p className="i1-form__required-note">{labels.required}</p>
          {fieldGrid(
            labels,
            workTypes,
            fieldInput(labels, "phone", { type: "tel", autoComplete: "tel", inputMode: "tel", maxLength: PHONE_MAX_LENGTH, pattern: INQUIRY_PHONE_PATTERN, title: online.labels.phoneHint }),
          )}
          <div className="i1-sr" aria-hidden="true">
            <input type="text" name={TRAP_FIELD} tabIndex={-1} autoComplete="off" aria-hidden="true" data-inquiry-trap="" />
          </div>
          <div className="i1-form__consent">
            <input id="i1-inquiry-consent" name="consent" className="i1-form__check" type="checkbox" required />
            <label className="i1-form__consent-label" htmlFor="i1-inquiry-consent">
              {online.labels.consent}
              <span className="i1-form__req" aria-hidden="true">
                {" *"}
              </span>
            </label>
          </div>
          {labels.notice ? <p className="i1-form__notice">{labels.notice}</p> : null}
          {/* the failure alert sits right above the button the visitor pressed */}
          <p className="i1-form__error" role="alert" data-inquiry-error="" ref={alertNode}>
            {phase === "failed" ? <span key={failures}>{online.labels.failure}</span> : null}
          </p>
          <button type="submit" className="i1-button i1-form__submit" data-inquiry-submit="" disabled={!mounted || submitting}>
            {submitting ? online.labels.submitting : labels.submit}
          </button>
          {online.labels.noScript ? (
            <noscript>
              <p className="i1-form__noscript">{online.labels.noScript}</p>
            </noscript>
          ) : null}
        </>
      )}
      <p className={done ? "i1-form__status i1-form__status--done" : "i1-form__status"} role="status" data-inquiry-status="" tabIndex={done ? -1 : undefined} ref={statusNode}>
        {done ? (
          <>
            <strong className="i1-form__done-title">{online.labels.successTitle}</strong>
            <span className="i1-form__done-body">{online.labels.successBody}</span>
          </>
        ) : null}
      </p>
    </form>
  );
}
