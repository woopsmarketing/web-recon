"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { INQUIRY_PHONE_PATTERN, inquirySender, isInquiryPhone, normalizeInquiryText, type InquiryFailure } from "@platform/site/inquiry-client";
import { FIELDS, type Field } from "./fields";
import { PolicyBox } from "./PolicyBox";

/** The form's copy, the same in both modes: a label per field, optional placeholders and hints, errors, buttons. */
export interface InquiryFieldCopy {
  labels: Record<Field, string>;
  placeholders: Partial<Record<Field, string>>;
  hints: Partial<Record<Field, string>>;
  requiredError: string;
  phoneError: string;
  consentError: string;
  consent: string;
  submit: string;
  reset: string;
}

export interface PolicyCopy {
  title: string;
  paragraphs: string[];
}

/** one other way to reach the business — a link the visitor may follow (never opened for them) */
export interface InquiryContact {
  name?: string;
  text: string;
  href: string;
}

/** the mail hand-off's own copy ("{email}" already filled in by the caller) */
export interface MailCopy {
  notice?: string;
  afterSubmit: string;
  /** "{name}" = the name field */
  subject: string;
  tooLong: string;
  tooLongText: string;
  selectText: string;
  email: string;
}

/** online submission's own copy */
export interface OnlineCopy {
  noScript: string;
  submitting: string;
  successTitle: string;
  successBody: string;
  failure: string;
  messagePrefix: string;
  invalid: string;
  conflict: string;
  /** "{minutes}" = the pause the endpoint asked for, in whole minutes */
  rateLimited: string;
  capacity: string;
  fallbackLead: string;
  fallback: InquiryContact[];
}

export type InquiryFormProps = { fields: InquiryFieldCopy; policy?: PolicyCopy } & ({ mode: "mail"; email: string; mail: MailCopy } | { mode: "online"; endpoint: string; online: OnlineCopy });

/** the optional fields folded into the message as labelled lines, in form order */
const DETAIL_FIELDS: readonly Field[] = ["address", "area", "buildingType", "budget"];
type ErrorKey = Field | "consent";
/** the order in which the first invalid control receives focus */
const ERROR_ORDER: readonly ErrorKey[] = ["name", "phone", "message", "consent"];
const MESSAGE_MAX_LENGTH = 500;
const FIELD_MAX_LENGTH = 100;
const SHORT_MAX_LENGTH = 40;
const PHONE_MAX_LENGTH = 20;
/** the longest mailto: URL handed to the mail app (non-ASCII text grows ~9× when encoded; some mail handlers fail around 2,000) */
const MAILTO_MAX_LENGTH = 2000;
/** the longest message sent online (a last line of defence; the caps keep the folded message far below it) */
const ONLINE_MESSAGE_MAX_LENGTH = 2000;
/** the endpoint's honeypot: nothing a browser autofills, nothing a person sees */
const TRAP_FIELD = "topic";
/** the width step of each one-line input (the reference's sizes: 130 / 170 / 250 / 490 px) */
const SIZE: Record<Exclude<Field, "message">, "s" | "m" | "l" | "xl"> = { name: "m", phone: "l", address: "xl", area: "s", buildingType: "m", budget: "m" };

const id = (f: ErrorKey) => `i3-inq-${f}`;
const errorId = (f: ErrorKey) => `i3-inq-${f}-error`;
const hintId = (f: Field) => `i3-inq-${f}-hint`;

type MailOutcome = { kind: "handoff" } | { kind: "tooLong"; text: string };
type OnlineState = { phase: "idle" | "submitting" | "failed" | "paused" | "done"; failures: number; reason?: InquiryFailure; minutes?: number };
/** the one failure after which the other contact channels are NOT offered: another press cures it */
const WITHOUT_FALLBACK: InquiryFailure = "conflict";

type TextControl = HTMLInputElement | HTMLTextAreaElement;
const isTextControl = (c: unknown): c is TextControl => c instanceof HTMLInputElement || c instanceof HTMLTextAreaElement;

function failureText(copy: OnlineCopy, reason: InquiryFailure | undefined, minutes: number | undefined): string {
  switch (reason) {
    case "invalid":
      return copy.invalid;
    case "conflict":
      return copy.conflict;
    case "rate_limited":
      return copy.rateLimited.replaceAll("{minutes}", String(minutes ?? 1));
    case "capacity":
      return copy.capacity;
    default:
      return copy.failure;
  }
}

/** the required mark at the right end of a required field (decorative; the control itself is `required`) */
const MustMark = () => (
  <svg className="i3-form__must" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
    <circle cx="8" cy="8" r="7" fill="currentColor" />
    <path className="i3-form__must-tick" d="M4.8 8.3l2.2 2.1 4.2-4.6" fill="none" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The /contact inquiry form in this template's form-table look: one table row per field (the label
 * cell on the quiet surface, the field cell with a 35px input and a grey hint), the textarea row,
 * the policy box, the consent row and two centred buttons — the dark submit and the grey reset
 * (a native reset that also clears the messages). Its BEHAVIOUR is the platform's inquiry door, in
 * the mode the SITE's data selects (never the visitor):
 *
 * Mail hand-off (a site with a business e-mail and no endpoint): no backend. The button composes
 * an e-mail — the subject slot with "{name}" filled in, one labelled line per filled optional
 * field, the message — and hands it to the visitor's mail app through a mailto: link. Nothing is
 * sent, stored or confirmed by the site; the status says so afterwards. A link longer than
 * MAILTO_MAX_LENGTH is never opened: the status says so and the address + the composed text are
 * shown to copy.
 *
 * Online (a site that declares an inquiry endpoint): the button POSTs through the door
 * (inquirySender — this file never touches the network). The endpoint takes a name, a phone and
 * one message, so the optional fields are folded into the message as labelled lines under the
 * site's prefix line; the request body stays the door's fixed one. Success is claimed only after
 * the endpoint confirmed it (the fields are then replaced by the confirmation, which receives
 * focus); every failure is an alert above the buttons saying what kind it was, the fields keep
 * their values, and after every failure but a conflict the site's other contact channels are
 * offered as links. The button is disabled while a request is on its way or a pause the endpoint
 * asked for still holds.
 *
 * Both modes: the button is disabled until this island is mounted (a press before that would be a
 * native GET with the details in the address bar). On a press every text value is normalised in place (the door's normalizeInquiryText),
 * then validated here — name, phone (the door's phone rule) and message are required, and so is the
 * consent — with an inline message under each invalid field (aria-describedby) and focus on the
 * first one. The browser's own bubbles are not used (noValidate). The trap field is the honeypot.
 */
export function InquiryForm(props: InquiryFormProps) {
  const { fields, policy } = props;
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [mounted, setMounted] = useState(false);
  /** mail: the last press's outcome; `n` counts presses (the status node's key → announced again) */
  const [mailStatus, setMailStatus] = useState<{ n: number; outcome: MailOutcome } | null>(null);
  const mailLink = useRef<HTMLAnchorElement>(null);
  const copyText = useRef<HTMLTextAreaElement>(null);
  /** online */
  const [online, setOnline] = useState<OnlineState>({ phase: "idle", failures: 0 });
  const inFlight = useRef(false);
  const statusNode = useRef<HTMLParagraphElement>(null);
  const alertNode = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // online: after a failure the alert (right above the buttons) is brought into view, focus stays
  // where it is; after the confirmation the fields are gone and the status receives focus
  useEffect(() => {
    if (props.mode !== "online") return;
    if (online.phase === "failed" || online.phase === "paused") {
      alertNode.current?.scrollIntoView({ block: "nearest" });
      return;
    }
    if (online.phase !== "done") return;
    const node = statusNode.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollIntoView({ block: "nearest" });
  }, [props.mode, online]);

  const clearError = (key: ErrorKey) => () =>
    setErrors((e) => {
      if (!(key in e)) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });

  /** read + normalise every value in place; report what is invalid and focus the first invalid control */
  const collect = (form: HTMLFormElement) => {
    const control = (name: string) => {
      const c = form.elements.namedItem(name);
      return isTextControl(c) ? c : undefined;
    };
    const data = new FormData(form);
    const values = {} as Record<Field, string>;
    for (const f of FIELDS) {
      const text = normalizeInquiryText(String(data.get(f) ?? ""), f === "message");
      values[f] = text;
      const c = control(f);
      if (c && c.value !== text) c.value = text;
    }
    const consent = form.elements.namedItem("consent");
    const consented = consent instanceof HTMLInputElement && consent.checked;
    const found: Partial<Record<ErrorKey, string>> = {};
    if (values.name === "") found.name = fields.requiredError;
    if (values.phone === "") found.phone = fields.requiredError;
    else if (!isInquiryPhone(values.phone)) found.phone = fields.phoneError;
    if (values.message === "") found.message = fields.requiredError;
    if (!consented) found.consent = fields.consentError;
    setErrors(found);
    const first = ERROR_ORDER.find((k) => found[k]);
    if (first) {
      const c = form.elements.namedItem(first);
      if (c instanceof HTMLElement) c.focus();
      return undefined;
    }
    return values;
  };

  const detailLines = (values: Record<Field, string>) => DETAIL_FIELDS.filter((f) => values[f] !== "").map((f) => `${fields.labels[f]}: ${values[f]}`);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (props.mode === "mail") {
      const values = collect(form);
      if (!values) return;
      const message = values.message.replace(/\n/g, "\r\n");
      const body = [...detailLines(values), "", `${fields.labels.message}:`, message].join("\r\n");
      const subject = props.mail.subject.replaceAll("{name}", values.name);
      const link = mailLink.current;
      if (!link) return;
      const href = `mailto:${props.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      if (href.length > MAILTO_MAX_LENGTH) {
        link.removeAttribute("href");
        setMailStatus((s) => ({ n: (s?.n ?? 0) + 1, outcome: { kind: "tooLong", text: `${subject}\r\n\r\n${body}` } }));
        return;
      }
      link.href = href;
      link.click();
      setMailStatus((s) => ({ n: (s?.n ?? 0) + 1, outcome: { kind: "handoff" } }));
      return;
    }
    if (inFlight.current) return;
    const values = collect(form);
    if (!values) return;
    const head = [props.online.messagePrefix, ...detailLines(values)].filter((line) => line !== "");
    const message = (head.length > 0 ? [...head, "", values.message] : [values.message]).join("\n").slice(0, ONLINE_MESSAGE_MAX_LENGTH);
    const trap = form.elements.namedItem(TRAP_FIELD);
    inFlight.current = true;
    setOnline((s) => ({ phase: "submitting", failures: s.failures }));
    const result = await inquirySender(props.endpoint)({
      consent: true,
      name: values.name,
      phone: values.phone,
      message,
      hp: trap instanceof HTMLInputElement ? trap.value : "",
    });
    if (result.status === "ok") {
      setOnline((s) => ({ phase: "done", failures: s.failures }));
      return;
    }
    inFlight.current = false;
    const pause = result.wait;
    setOnline((s) => ({ phase: pause ? "paused" : "failed", failures: s.failures + 1, reason: result.reason, minutes: pause ? Math.ceil(pause.seconds / 60) : undefined }));
    if (pause) void pause.over.then(() => setOnline((s) => (s.phase === "paused" ? { phase: "idle", failures: s.failures } : s)));
  };

  /** the grey button: the browser clears the controls; the messages of the last press go with them (a pause holds) */
  const onReset = () => {
    setErrors({});
    setMailStatus(null);
    setOnline((s) => (s.phase === "failed" ? { phase: "idle", failures: s.failures } : s));
  };

  const hintLine = (f: Field) =>
    fields.hints[f] ? (
      <span id={hintId(f)} className="i3-form__hint" data-inquiry-hint={f}>
        {fields.hints[f]}
      </span>
    ) : null;
  const errorLine = (f: ErrorKey) =>
    errors[f] ? (
      <p id={errorId(f)} className="i3-form__error" data-inquiry-field-error={f}>
        {errors[f]}
      </p>
    ) : null;
  const describedBy = (f: ErrorKey, ...more: (string | undefined)[]) => [errors[f] ? errorId(f) : undefined, ...more].filter(Boolean).join(" ") || undefined;
  /** one row of the form table: the label cell and the field cell (input + hint + error) */
  const textRow = (f: Exclude<Field, "message">, extra: { type?: string; autoComplete?: string; inputMode?: "tel" | "text"; maxLength?: number; pattern?: string; required?: boolean }) => (
    <tr className="i3-form__row" data-inquiry-field={f} key={f}>
      <th scope="row" className="i3-form__label">
        <label htmlFor={id(f)}>{fields.labels[f]}</label>
      </th>
      <td className="i3-form__field">
        <span className={`i3-form__control i3-form__control--${SIZE[f]}${extra.required ? " i3-form__control--must" : ""}`}>
          <input
            id={id(f)}
            name={f}
            className="i3-input"
            type={extra.type ?? "text"}
            autoComplete={extra.autoComplete}
            inputMode={extra.inputMode}
            required={extra.required}
            maxLength={extra.maxLength ?? FIELD_MAX_LENGTH}
            pattern={extra.pattern}
            placeholder={fields.placeholders[f]}
            aria-invalid={errors[f] ? true : undefined}
            aria-describedby={describedBy(f, fields.hints[f] ? hintId(f) : undefined)}
            onInput={clearError(f)}
          />
          {extra.required ? <MustMark /> : null}
        </span>
        {hintLine(f)}
        {errorLine(f)}
      </td>
    </tr>
  );

  const isMail = props.mode === "mail";
  const done = !isMail && online.phase === "done";
  const submitting = !isMail && online.phase === "submitting";
  const paused = !isMail && online.phase === "paused";
  const alerting = !isMail && (online.phase === "failed" || paused);
  const contacts = !isMail && alerting && online.reason && online.reason !== WITHOUT_FALLBACK ? props.online.fallback : [];
  const mailFallback = isMail && mailStatus?.outcome.kind === "tooLong" ? mailStatus.outcome.text : undefined;

  return (
    <form className="i3-form" data-inquiry-form="" data-inquiry-mode={props.mode} noValidate onSubmit={onSubmit} onReset={onReset} aria-busy={submitting ? true : undefined}>
      {done ? null : (
        <>
          <table className="i3-form__table">
            <colgroup>
              <col className="i3-form__col-label" />
              <col className="i3-form__col-field" />
            </colgroup>
            <tbody>
              {textRow("name", { autoComplete: "name", required: true })}
              {textRow("phone", { type: "tel", autoComplete: "tel", inputMode: "tel", maxLength: PHONE_MAX_LENGTH, pattern: INQUIRY_PHONE_PATTERN, required: true })}
              {textRow("address", { autoComplete: "street-address" })}
              {textRow("area", { autoComplete: "off", maxLength: SHORT_MAX_LENGTH })}
              {textRow("buildingType", { autoComplete: "off", maxLength: SHORT_MAX_LENGTH })}
              {textRow("budget", { autoComplete: "off", maxLength: SHORT_MAX_LENGTH })}
              <tr className="i3-form__row i3-form__row--message" data-inquiry-field="message">
                <th scope="row" className="i3-form__label">
                  <label htmlFor={id("message")}>{fields.labels.message}</label>
                </th>
                <td className="i3-form__field">
                  <span className="i3-form__control i3-form__control--area i3-form__control--must">
                    <textarea
                      id={id("message")}
                      name="message"
                      className="i3-input i3-textarea"
                      rows={11}
                      required
                      maxLength={MESSAGE_MAX_LENGTH}
                      placeholder={fields.placeholders.message}
                      aria-invalid={errors.message ? true : undefined}
                      aria-describedby={describedBy("message", fields.hints.message ? hintId("message") : undefined)}
                      onInput={clearError("message")}
                    />
                    <MustMark />
                  </span>
                  {hintLine("message")}
                  {errorLine("message")}
                </td>
              </tr>
            </tbody>
          </table>
          {isMail ? null : (
            <div className="i3-sr" aria-hidden="true">
              <input type="text" name={TRAP_FIELD} tabIndex={-1} autoComplete="off" aria-hidden="true" data-inquiry-trap="" />
            </div>
          )}
          {policy ? <PolicyBox title={policy.title} paragraphs={policy.paragraphs} /> : null}
          <div className="i3-consent" data-inquiry-consent="">
            <div className="i3-consent__row">
              <input
                id={id("consent")}
                name="consent"
                className="i3-consent__check"
                type="checkbox"
                required
                aria-invalid={errors.consent ? true : undefined}
                aria-describedby={describedBy("consent")}
                onChange={clearError("consent")}
              />
              <label className="i3-consent__label" htmlFor={id("consent")}>
                {fields.consent}
              </label>
            </div>
            {errorLine("consent")}
          </div>
          {isMail && props.mail.notice ? <p className="i3-form__notice">{props.mail.notice}</p> : null}
          {isMail ? null : (
            <p className="i3-form__alert" role="alert" data-inquiry-error="" ref={alertNode}>
              {alerting ? (
                <span key={online.failures}>
                  {failureText(props.online, online.reason, online.minutes)}
                  {contacts.length > 0 ? (
                    <span className="i3-form__contacts" data-inquiry-contacts="">
                      {props.online.fallbackLead ? <span className="i3-form__contacts-lead">{props.online.fallbackLead}</span> : null}
                      {contacts.map((c) => (
                        <span key={c.href} className="i3-form__contact">
                          {c.name ? `${c.name}: ` : null}
                          <a href={c.href}>{c.text}</a>
                        </span>
                      ))}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </p>
          )}
          <div className="i3-form__actions">
            <button type="submit" className="i3-btn i3-form__submit" data-inquiry-submit="" disabled={!mounted || (!isMail && (submitting || paused))}>
              {submitting ? props.online.submitting : fields.submit}
            </button>
            <button type="reset" className="i3-btn i3-btn--gray i3-form__reset" data-inquiry-reset="" disabled={submitting || undefined}>
              {fields.reset}
            </button>
          </div>
          {!isMail && props.online.noScript ? (
            <noscript>
              <p className="i3-form__noscript">{props.online.noScript}</p>
            </noscript>
          ) : null}
        </>
      )}
      {isMail ? (
        <>
          {/* the hand-off to the mail app (href set on submit); never a visible or focusable link */}
          <a ref={mailLink} hidden aria-hidden="true" tabIndex={-1} data-inquiry-mailto="" />
          <p className="i3-form__status" role="status" data-inquiry-status="">
            {mailStatus ? <span key={mailStatus.n}>{mailStatus.outcome.kind === "tooLong" ? props.mail.tooLong : props.mail.afterSubmit}</span> : null}
          </p>
          {mailFallback !== undefined ? (
            <div className="i3-form__fallback" data-inquiry-fallback="">
              <p className="i3-form__fallback-to">
                {props.mail.email}: <a href={`mailto:${props.email}`}>{props.email}</a>
              </p>
              <label className="i3-form__fallback-label" htmlFor="i3-inq-copy">
                {props.mail.tooLongText}
              </label>
              <textarea ref={copyText} id="i3-inq-copy" className="i3-input i3-textarea i3-textarea--copy" readOnly rows={8} value={mailFallback} data-inquiry-copy="" />
              <button
                type="button"
                className="i3-form__select-text"
                data-inquiry-select=""
                onClick={() => {
                  copyText.current?.focus();
                  copyText.current?.select();
                }}
              >
                {props.mail.selectText}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className={done ? "i3-form__status i3-form__status--done" : "i3-form__status"} role="status" data-inquiry-status="" tabIndex={done ? -1 : undefined} ref={statusNode}>
          {done ? (
            <>
              <strong className="i3-form__done-title">{props.online.successTitle}</strong>
              <span className="i3-form__done-body">{props.online.successBody}</span>
            </>
          ) : null}
        </p>
      )}
    </form>
  );
}
