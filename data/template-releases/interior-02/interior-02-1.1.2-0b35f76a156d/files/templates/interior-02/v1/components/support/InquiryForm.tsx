"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { INQUIRY_PHONE_PATTERN, inquirySender, isInquiryPhone, normalizeInquiryText, type InquiryFailure } from "@platform/site/inquiry-client";
import { Icon } from "../ui/Icon";
import { PolicyDialog } from "./PolicyDialog";

/** The form's copy, the same in both modes: labels of the door's seven fields, placeholders, hints, options, errors. */
export interface InquiryFieldCopy {
  name: string;
  phone: string;
  region: string;
  schedule: string;
  area: string;
  workType: string;
  message: string;
  namePlaceholder?: string;
  phonePlaceholder?: string;
  regionPlaceholder?: string;
  areaPlaceholder?: string;
  messagePlaceholder?: string;
  regionHint?: string;
  workTypeHint?: string;
  /** one option each → a select (schedule) / the toggle-box grid (workType); none → a free text field */
  scheduleOptions?: string[];
  workTypeOptions?: string[];
  /** the select's empty option */
  select: string;
  /** shown inside the size field at its right; appended to the value in the message */
  areaUnit?: string;
  requiredError: string;
  phoneError: string;
  consentError: string;
  consent: string;
  submit: string;
}

export interface PolicyCopy {
  label: string;
  title: string;
  paragraphs: string[];
  close: string;
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

type Field = "name" | "phone" | "region" | "schedule" | "area" | "workType" | "message";
const FIELDS: readonly Field[] = ["name", "phone", "region", "schedule", "area", "workType", "message"];
/** the optional fields folded into the message as labelled lines, in form order */
const DETAIL_FIELDS: readonly Field[] = ["region", "schedule", "area", "workType"];
type ErrorKey = Field | "consent";
/** the order in which the first invalid control receives focus */
const ERROR_ORDER: readonly ErrorKey[] = ["name", "phone", "message", "consent"];
const MESSAGE_MAX_LENGTH = 500;
const FIELD_MAX_LENGTH = 100;
const PHONE_MAX_LENGTH = 20;
/** the longest mailto: URL handed to the mail app (non-ASCII text grows ~9× when encoded; some mail handlers fail around 2,000) */
const MAILTO_MAX_LENGTH = 2000;
/** the longest message sent online (a last line of defence; the caps keep the folded message far below it) */
const ONLINE_MESSAGE_MAX_LENGTH = 2000;
/** the endpoint's honeypot: nothing a browser autofills, nothing a person sees */
const TRAP_FIELD = "topic";

const id = (f: ErrorKey) => `i2-inq-${f}`;
const errorId = (f: ErrorKey) => `i2-inq-${f}-error`;

type MailOutcome = { kind: "handoff" } | { kind: "tooLong"; text: string };
type OnlineState = { phase: "idle" | "submitting" | "failed" | "paused" | "done"; failures: number; reason?: InquiryFailure; minutes?: number };
/** the one failure after which the other contact channels are NOT offered: another press cures it */
const WITHOUT_FALLBACK: InquiryFailure = "conflict";

type TextControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const isTextControl = (c: unknown): c is TextControl => c instanceof HTMLInputElement || c instanceof HTMLTextAreaElement || c instanceof HTMLSelectElement;

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

/**
 * The /contact inquiry form in this template's look: labels with a required dot, 52 px inputs in
 * half / full widths, a select with its own chevron, the size field with its unit inside, the
 * toggle-box grid for the type of work, the textarea, the round consent check with the policy
 * button, the centred submit. Its BEHAVIOUR is the platform's inquiry door, in the mode the
 * SITE's data selects (never the visitor):
 *
 * Mail hand-off (a site with a business e-mail and no endpoint): no backend. The button composes
 * an e-mail — the subject slot with "{name}" filled in, one labelled line per filled field, the
 * message — and hands it to the visitor's mail app through a mailto: link. Nothing is sent, stored
 * or confirmed by the site; the status says so afterwards. A link longer than MAILTO_MAX_LENGTH is
 * never opened: the status says so and the address + the composed text are shown to copy.
 *
 * Online (a site that declares an inquiry endpoint): the button POSTs through the door
 * (inquirySender — this file never touches the network). The endpoint takes a name, a phone and
 * one message, so the optional fields are folded into the message as labelled lines under the
 * site's prefix line. Success is claimed only after the endpoint confirmed it (the fields are then
 * replaced by the confirmation, which receives focus); every failure is an alert above the button
 * saying what kind it was, the fields keep their values, and after every failure but a conflict the
 * site's other contact channels are offered as links. The button is disabled until this island is
 * mounted (a press before that would be a native GET with the details in the address bar).
 *
 * Both modes: on a press every text value is normalised in place (the door's normalizeInquiryText),
 * then validated here — name, phone (the door's phone rule) and message are required, and so is the
 * consent — with an inline message under each invalid field (aria-describedby) and focus on the
 * first one. The browser's own bubbles are not used (noValidate). The trap field is the honeypot.
 */
export function InquiryForm(props: InquiryFormProps) {
  const { fields, policy } = props;
  const [errors, setErrors] = useState<Partial<Record<ErrorKey, string>>>({});
  const [mounted, setMounted] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const policyButton = useRef<HTMLButtonElement>(null);
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

  // online: after a failure the alert (right above the button) is brought into view, focus stays
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

  const closePolicy = () => {
    setPolicyOpen(false);
    policyButton.current?.focus();
  };

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
      const raw = f === "workType" ? data.getAll(f).map(String).filter(Boolean).join(", ") : String(data.get(f) ?? "");
      const text = normalizeInquiryText(raw, f === "message");
      values[f] = text;
      const c = control(f);
      if (c && !(c instanceof HTMLSelectElement) && c.type !== "checkbox" && c.value !== text) c.value = text;
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

  const detailLines = (values: Record<Field, string>) =>
    DETAIL_FIELDS.filter((f) => values[f] !== "").map((f) => `${fields[f]}: ${values[f]}${f === "area" && fields.areaUnit ? ` ${fields.areaUnit}` : ""}`);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (props.mode === "mail") {
      const values = collect(form);
      if (!values) return;
      const message = values.message.replace(/\n/g, "\r\n");
      const body = [...detailLines(values), "", `${fields.message}:`, message].join("\r\n");
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

  /** the label row: the label (a required dot after a required field's) and an optional hint */
  const label = (f: Field, required: boolean, hint?: string) => (
    <span className="i2-field__head">
      <label className="i2-field__label" htmlFor={id(f)}>
        {fields[f]}
        {required ? <span className="i2-field__req" aria-hidden="true" /> : null}
      </label>
      {hint ? <span className="i2-field__hint">{hint}</span> : null}
    </span>
  );
  const errorLine = (f: ErrorKey) =>
    errors[f] ? (
      <p id={errorId(f)} className="i2-field__error" data-inquiry-field-error={f}>
        {errors[f]}
      </p>
    ) : null;
  const describedBy = (f: ErrorKey, ...more: (string | undefined)[]) => [errors[f] ? errorId(f) : undefined, ...more].filter(Boolean).join(" ") || undefined;
  const textField = (f: Field, extra: { type?: string; autoComplete?: string; inputMode?: "tel" | "text" | "decimal"; maxLength?: number; pattern?: string; placeholder?: string; required?: boolean }, suffix?: ReactNode) => (
    <div className={`i2-field${f === "region" ? " i2-field--full" : ""}`} data-inquiry-field={f}>
      {label(f, Boolean(extra.required), f === "region" ? fields.regionHint : undefined)}
      <span className={suffix ? "i2-field__control i2-field__control--unit" : "i2-field__control"}>
        <input
          id={id(f)}
          name={f}
          className="i2-input"
          type={extra.type ?? "text"}
          autoComplete={extra.autoComplete}
          inputMode={extra.inputMode}
          required={extra.required}
          maxLength={extra.maxLength ?? FIELD_MAX_LENGTH}
          pattern={extra.pattern}
          placeholder={extra.placeholder}
          aria-invalid={errors[f] ? true : undefined}
          aria-describedby={describedBy(f, suffix ? `${id(f)}-unit` : undefined)}
          onInput={clearError(f)}
        />
        {suffix}
      </span>
      {errorLine(f)}
    </div>
  );

  const isMail = props.mode === "mail";
  const done = !isMail && online.phase === "done";
  const submitting = !isMail && online.phase === "submitting";
  const paused = !isMail && online.phase === "paused";
  const alerting = !isMail && (online.phase === "failed" || paused);
  const contacts = !isMail && alerting && online.reason && online.reason !== WITHOUT_FALLBACK ? props.online.fallback : [];
  const mailFallback = isMail && mailStatus?.outcome.kind === "tooLong" ? mailStatus.outcome.text : undefined;

  return (
    <form className="i2-form" data-inquiry-form="" data-inquiry-mode={props.mode} noValidate onSubmit={onSubmit} aria-busy={submitting ? true : undefined}>
      {done ? null : (
        <>
          <div className="i2-form__group">
            <div className="i2-form__row">
              {textField("name", { autoComplete: "name", placeholder: fields.namePlaceholder, required: true })}
              {textField("phone", { type: "tel", autoComplete: "tel", inputMode: "tel", maxLength: PHONE_MAX_LENGTH, pattern: INQUIRY_PHONE_PATTERN, placeholder: fields.phonePlaceholder, required: true })}
            </div>
            <div className="i2-form__row">{textField("region", { autoComplete: "address-level2", placeholder: fields.regionPlaceholder })}</div>
          </div>
          <div className="i2-form__group i2-form__group--next">
            <div className="i2-form__row">
              <div className="i2-field" data-inquiry-field="schedule">
                {label("schedule", false)}
                {fields.scheduleOptions && fields.scheduleOptions.length > 0 ? (
                  <span className="i2-field__control i2-select">
                    <select id={id("schedule")} name="schedule" className="i2-input i2-select__control" defaultValue="">
                      <option value="">{fields.select}</option>
                      {fields.scheduleOptions.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                    <Icon name="chevron-down" size={20} className="i2-select__chev" />
                  </span>
                ) : (
                  <span className="i2-field__control">
                    <input id={id("schedule")} name="schedule" className="i2-input" type="text" maxLength={FIELD_MAX_LENGTH} autoComplete="off" />
                  </span>
                )}
              </div>
              {textField(
                "area",
                { inputMode: "decimal", autoComplete: "off", maxLength: 20, placeholder: fields.areaPlaceholder },
                fields.areaUnit ? (
                  <span id={`${id("area")}-unit`} className="i2-field__unit">
                    {fields.areaUnit}
                  </span>
                ) : undefined,
              )}
            </div>
            <div className="i2-form__row">
              {fields.workTypeOptions && fields.workTypeOptions.length > 0 ? (
                <fieldset className="i2-field i2-field--full i2-toggles" data-inquiry-field="workType">
                  <legend className="i2-field__head i2-toggles__legend">
                    <span className="i2-field__label">{fields.workType}</span>
                    {fields.workTypeHint ? <span className="i2-field__hint">{fields.workTypeHint}</span> : null}
                  </legend>
                  <div className="i2-toggles__grid">
                    {fields.workTypeOptions.map((o, i) => (
                      <label key={o} className="i2-toggle">
                        <input type="checkbox" name="workType" value={o} className="i2-toggle__input" data-inquiry-toggle={i} />
                        <span className="i2-toggle__box">{o}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : (
                <div className="i2-field i2-field--full" data-inquiry-field="workType">
                  {label("workType", false, fields.workTypeHint)}
                  <span className="i2-field__control">
                    <input id={id("workType")} name="workType" className="i2-input" type="text" maxLength={FIELD_MAX_LENGTH} autoComplete="off" />
                  </span>
                </div>
              )}
            </div>
            <div className="i2-form__row">
              <div className="i2-field i2-field--full" data-inquiry-field="message">
                {label("message", true)}
                <span className="i2-field__control">
                  <textarea
                    id={id("message")}
                    name="message"
                    className="i2-input i2-textarea"
                    rows={4}
                    required
                    maxLength={MESSAGE_MAX_LENGTH}
                    placeholder={fields.messagePlaceholder}
                    aria-invalid={errors.message ? true : undefined}
                    aria-describedby={describedBy("message")}
                    onInput={clearError("message")}
                  />
                </span>
                {errorLine("message")}
              </div>
            </div>
          </div>
          {isMail ? null : (
            <div className="i2-sr" aria-hidden="true">
              <input type="text" name={TRAP_FIELD} tabIndex={-1} autoComplete="off" aria-hidden="true" data-inquiry-trap="" />
            </div>
          )}
          <div className="i2-consent" data-inquiry-consent="">
            <div className="i2-consent__row">
              <input
                id={id("consent")}
                name="consent"
                className="i2-consent__check"
                type="checkbox"
                required
                aria-invalid={errors.consent ? true : undefined}
                aria-describedby={describedBy("consent")}
                onChange={clearError("consent")}
              />
              <label className="i2-consent__label" htmlFor={id("consent")}>
                {fields.consent}
              </label>
              {policy ? (
                <button ref={policyButton} type="button" className="i2-consent__policy" onClick={() => setPolicyOpen(true)} data-policy-open="">
                  {policy.label}
                </button>
              ) : null}
            </div>
            {errorLine("consent")}
          </div>
          {isMail && props.mail.notice ? <p className="i2-form__notice">{props.mail.notice}</p> : null}
          {isMail ? null : (
            <p className="i2-form__alert" role="alert" data-inquiry-error="" ref={alertNode}>
              {alerting ? (
                <span key={online.failures}>
                  {failureText(props.online, online.reason, online.minutes)}
                  {contacts.length > 0 ? (
                    <span className="i2-form__contacts" data-inquiry-contacts="">
                      {props.online.fallbackLead ? <span className="i2-form__contacts-lead">{props.online.fallbackLead}</span> : null}
                      {contacts.map((c) => (
                        <span key={c.href} className="i2-form__contact">
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
          <div className="i2-form__actions">
            <button type="submit" className="i2-btn i2-btn--black i2-form__submit" data-inquiry-submit="" disabled={isMail ? undefined : !mounted || submitting || paused}>
              {submitting ? props.online.submitting : fields.submit}
            </button>
          </div>
          {!isMail && props.online.noScript ? (
            <noscript>
              <p className="i2-form__noscript">{props.online.noScript}</p>
            </noscript>
          ) : null}
        </>
      )}
      {isMail ? (
        <>
          {/* the hand-off to the mail app (href set on submit); never a visible or focusable link */}
          <a ref={mailLink} hidden aria-hidden="true" tabIndex={-1} data-inquiry-mailto="" />
          <p className="i2-form__status" role="status" data-inquiry-status="">
            {mailStatus ? <span key={mailStatus.n}>{mailStatus.outcome.kind === "tooLong" ? props.mail.tooLong : props.mail.afterSubmit}</span> : null}
          </p>
          {mailFallback !== undefined ? (
            <div className="i2-form__fallback" data-inquiry-fallback="">
              <p className="i2-form__fallback-to">
                {props.mail.email}: <a href={`mailto:${props.email}`}>{props.email}</a>
              </p>
              <label className="i2-field__label" htmlFor="i2-inq-copy">
                {props.mail.tooLongText}
              </label>
              <textarea ref={copyText} id="i2-inq-copy" className="i2-input i2-textarea i2-textarea--copy" readOnly rows={8} value={mailFallback} data-inquiry-copy="" />
              <button
                type="button"
                className="i2-form__select-text"
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
        <p className={done ? "i2-form__status i2-form__status--done" : "i2-form__status"} role="status" data-inquiry-status="" tabIndex={done ? -1 : undefined} ref={statusNode}>
          {done ? (
            <>
              <strong className="i2-form__done-title">{props.online.successTitle}</strong>
              <span className="i2-form__done-body">{props.online.successBody}</span>
            </>
          ) : null}
        </p>
      )}
      {policy ? <PolicyDialog open={policyOpen} onClose={closePolicy} title={policy.title} paragraphs={policy.paragraphs} closeLabel={policy.close} /> : null}
    </form>
  );
}
