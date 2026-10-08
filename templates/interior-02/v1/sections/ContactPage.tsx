import { InquiryForm, type InquiryContact, type InquiryFieldCopy, type InquiryFormProps, type PolicyCopy } from "../components/support/InquiryForm";
import { slotImage, type SlotImage } from "../components/support/media";
import { contactEmail, liveLink } from "../lib/links";
import type { Ctx } from "./types";

export interface ContactPageData {
  title: string;
  lead?: string[];
  /** the phone line: a short prefix and the number as a tel: link */
  call?: { prefix?: string; label: string; href: string };
  /** the accent line; `mark` = the part of it that is underlined */
  note?: { text: string; mark?: string };
  description?: string[];
  photo?: SlotImage;
  form?: InquiryFormProps;
  /** shown instead of the form when the site has no contact channel */
  unavailable?: string;
}

const FALLBACK_LINK_SLOTS = ["fallbackLinkA", "fallbackLinkB"] as const;
/** /contact renders no section a fallback link's #anchor could point at */
const NO_ANCHORS: ReadonlySet<string> = new Set();

/** The site's other contact channels, from site data only: the links it authored, then the business e-mail. */
function onlineFallback(ctx: Ctx, email: string | undefined, emailLabel: string): InquiryContact[] {
  const contacts: InquiryContact[] = [];
  const add = (c: InquiryContact) => {
    if (!contacts.some((x) => x.href === c.href)) contacts.push(c);
  };
  for (const key of FALLBACK_LINK_SLOTS) {
    const link = liveLink(ctx, ctx.slots.link("contact.page", key), NO_ANCHORS);
    if (link) add({ text: link.label, href: link.href });
  }
  if (email) add({ name: emailLabel, text: email, href: `mailto:${email}` });
  return contacts;
}

/**
 * contact.page — the aside (title, lead, phone line, accent line, description, photo) and the
 * inquiry form in the mode the SITE's data selects: online submission for a site with an inquiry
 * endpoint (ctx.inquiry), otherwise the mail hand-off to the business e-mail; neither → no form,
 * the "unavailable" line instead (no channel is invented). The policy dialog exists only when the
 * site provides the policy text.
 */
export function contactPage(ctx: Ctx): ContactPageData {
  const t = (key: string) => ctx.slots.text("contact.page", key) ?? "";
  const opt = (key: string) => ctx.slots.text("contact.page", key) || undefined;
  const paragraphs = (key: string) => {
    const ps = ctx.slots.richText("contact.page", key)?.paragraphs.filter((p) => p.trim() !== "");
    return ps && ps.length > 0 ? ps : undefined;
  };
  const email = contactEmail(ctx);
  const endpoint = ctx.inquiry?.endpoint;
  const call = liveLink(ctx, ctx.slots.link("contact.page", "callLink"), NO_ANCHORS);
  const noteText = opt("note");
  const policyParagraphs = paragraphs("policyText");
  const policy: PolicyCopy | undefined = policyParagraphs ? { label: t("policyLabel"), title: t("policyTitle") || t("policyLabel"), paragraphs: policyParagraphs, close: t("closeLabel") } : undefined;
  const fields = (submit: string): InquiryFieldCopy => ({
    name: t("nameLabel"),
    phone: t("phoneLabel"),
    region: t("regionLabel"),
    schedule: t("scheduleLabel"),
    area: t("areaLabel"),
    workType: t("workTypeLabel"),
    message: t("messageLabel"),
    namePlaceholder: opt("namePlaceholder"),
    phonePlaceholder: opt("phonePlaceholder"),
    regionPlaceholder: opt("regionPlaceholder"),
    areaPlaceholder: opt("areaPlaceholder"),
    messagePlaceholder: opt("messagePlaceholder"),
    regionHint: opt("regionHint"),
    workTypeHint: opt("workTypeHint"),
    scheduleOptions: paragraphs("scheduleOptions"),
    workTypeOptions: paragraphs("workTypeOptions"),
    select: t("selectPlaceholder"),
    areaUnit: opt("areaUnit"),
    requiredError: t("requiredError"),
    phoneError: t("phoneError"),
    consentError: t("consentError"),
    consent: t("consentLabel"),
    submit,
  });
  const form: InquiryFormProps | undefined = endpoint
    ? {
        mode: "online",
        endpoint,
        fields: fields(t("onlineSubmitLabel")),
        policy,
        online: {
          noScript: t("noScriptText"),
          submitting: t("submittingLabel"),
          successTitle: t("successTitle"),
          successBody: t("successBody"),
          failure: t("failureText"),
          messagePrefix: t("messagePrefix"),
          invalid: t("invalidText"),
          conflict: t("conflictText"),
          rateLimited: t("rateLimitedText"),
          capacity: t("capacityText"),
          fallbackLead: t("fallbackLead"),
          fallback: onlineFallback(ctx, email, t("emailLabel")),
        },
      }
    : email
      ? {
          mode: "mail",
          email,
          fields: fields(t("submitLabel")),
          policy,
          mail: {
            notice: opt("notice"),
            afterSubmit: t("afterSubmit").replaceAll("{email}", email),
            subject: t("mailSubject"),
            tooLong: t("tooLong").replaceAll("{email}", email),
            tooLongText: t("tooLongTextLabel"),
            selectText: t("selectTextLabel"),
            email: t("emailLabel"),
          },
        }
      : undefined;
  return {
    title: t("title"),
    lead: paragraphs("lead"),
    call: call ? { prefix: opt("callLabel"), label: call.label, href: call.href } : undefined,
    note: noteText ? { text: noteText, mark: opt("noteMark") } : undefined,
    description: paragraphs("description"),
    photo: slotImage(ctx, "contact.page", "photo"),
    form,
    unavailable: form ? undefined : t("unavailable"),
  };
}

/** the accent line with its underlined part (the first occurrence of `mark` in `text`) */
function Note({ text, mark }: { text: string; mark?: string }) {
  const at = mark ? text.indexOf(mark) : -1;
  if (!mark || at < 0) return <p className="i2-contact__note">{text}</p>;
  return (
    <p className="i2-contact__note">
      {text.slice(0, at)}
      <u>{mark}</u>
      {text.slice(at + mark.length)}
    </p>
  );
}

/**
 * Two columns (> 1280): the 400 px aside (title 40/600, lead 20/28, the text block with the phone
 * line and the note, the tall photo settling from scale 1.05) + the form; ≤ 1280 the aside is
 * stacked above the form without the photo; ≤ 640 the title is hidden (the header bar shows it).
 */
export function ContactPage({ data }: { data: ContactPageData }) {
  return (
    <section className="i2-wrap i2-contact" data-section="contact.page" aria-labelledby="i2-contact-title">
      <aside className="i2-contact__aside">
        <h1 id="i2-contact-title" className="i2-contact__title">
          {data.title}
        </h1>
        {data.lead ? (
          <div className="i2-contact__lead">
            {data.lead.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : null}
        {data.call || data.note || data.description ? (
          <div className="i2-contact__info">
            {data.call ? (
              <p className="i2-contact__call">
                {data.call.prefix ? <span className="i2-contact__call-prefix">{data.call.prefix}</span> : null}
                <a href={data.call.href} className="i2-contact__call-number" data-contact-call="">
                  {data.call.label}
                </a>
              </p>
            ) : null}
            {data.note ? <Note text={data.note.text} mark={data.note.mark} /> : null}
            {data.description ? (
              <div className="i2-contact__desc">
                {data.description.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {data.photo ? (
          <figure className="i2-contact__photo">
            <img src={data.photo.src} width={data.photo.width} height={data.photo.height} alt={data.photo.alt} loading="lazy" decoding="async" />
          </figure>
        ) : null}
      </aside>
      <div className="i2-contact__body">{data.form ? <InquiryForm {...data.form} /> : <p className="i2-contact__unavailable">{data.unavailable}</p>}</div>
    </section>
  );
}
