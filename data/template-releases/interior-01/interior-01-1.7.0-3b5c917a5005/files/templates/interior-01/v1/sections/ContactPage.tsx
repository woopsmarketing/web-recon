import { InquiryForm, type InquiryContact, type InquiryFormProps } from "../components/InquiryForm";
import { contactEmail, inquiryEndpoint, liveLink } from "./links";
import type { Ctx } from "./types";

export interface ContactPageData {
  title: string;
  lead?: string[];
  /** the business address (the direct address, and what the mail hand-off writes to) */
  email?: string;
  emailLabel: string;
  unavailable?: string;
  form?: InquiryFormProps;
}

/** 1.6.3: the operator-chosen link slots of contact.page that name another way to reach the business */
const FALLBACK_LINK_SLOTS = ["fallbackLinkA", "fallbackLinkB"] as const;
/** /contact renders no section a fallback link's #anchor could point at */
const NO_ANCHORS: ReadonlySet<string> = new Set();

/**
 * 1.6.3: the site's other contact channels, from site data only — the links the site authored
 * (tel:, mailto:, a page of this site), then the business email. A site with none gets none: no
 * channel is invented.
 */
function onlineFallback(ctx: Ctx, email: string | undefined, emailLabel: string): InquiryContact[] {
  const contacts: InquiryContact[] = [];
  /** a destination is listed once (the first that names it) */
  const add = (contact: InquiryContact) => {
    if (!contacts.some((c) => c.href === contact.href)) contacts.push(contact);
  };
  for (const key of FALLBACK_LINK_SLOTS) {
    const link = liveLink(ctx, ctx.slots.link("contact.page", key), NO_ANCHORS);
    if (link) add({ text: link.label, href: link.href });
  }
  if (email) add({ name: emailLabel, text: email, href: `mailto:${email}` });
  return contacts;
}

/**
 * contact.page — the inquiry form, in the mode the SITE's data selects:
 *
 * 1.6.2, a site that declares an inquiry endpoint (ctx.inquiry): the form submits online to that
 * endpoint and confirms only what the endpoint confirmed. Its props carry the endpoint and the
 * online copy, and none of the mail hand-off's labels. `submitLabel` and `notice` are used only
 * when the site authored them — their neutral defaults describe the mail hand-off ("Write e-mail",
 * "Online submission is not available"), which would be false here: the button then falls back to
 * onlineSubmitLabel and the notice is left out.
 *
 * 1.6.3: the online form's props also carry what the alert says for each kind of failure and the
 * site's other contact channels (onlineFallback) — offered, as links, only when the form could not
 * deliver; nothing is ever opened for the visitor.
 *
 * 1.5.0, a site with a business email and no endpoint: the form composes an e-mail to that address
 * in the visitor's own mail app (mailto:). No backend: nothing is sent, stored or confirmed by the
 * site, and the page says so before and after the button.
 *
 * Neither → no form (no channel is invented). The direct address block needs only the email and is
 * the same in both modes.
 */
export function contactPage(ctx: Ctx): ContactPageData {
  const t = (key: string) => ctx.slots.text("contact.page", key) ?? "";
  /** the value only when the site's own slots document sets it (not a binding, not a neutral default) */
  const authored = (key: string) => (ctx.slotSources["contact.page"]?.[key]?.source === "site" ? t(key) : undefined);
  const email = contactEmail(ctx);
  const endpoint = inquiryEndpoint(ctx);
  const workTypes = ctx.slots.richText("contact.page", "workTypeOptions")?.paragraphs;
  const online: InquiryFormProps | undefined = endpoint
    ? {
        workTypes,
        labels: {
          name: t("nameLabel"),
          phone: t("phoneLabel"),
          region: t("regionLabel"),
          area: t("areaLabel"),
          workType: t("workTypeLabel"),
          select: t("selectPlaceholder"),
          schedule: t("scheduleLabel"),
          message: t("messageLabel"),
          required: t("requiredNote"),
          submit: authored("submitLabel") ?? t("onlineSubmitLabel"),
          notice: authored("notice") ?? "",
        },
        online: {
          endpoint,
          labels: {
            consent: t("consentLabel"),
            phoneHint: t("phoneHint"),
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
          },
          fallback: onlineFallback(ctx, email, t("emailLabel")),
        },
      }
    : undefined;
  return {
    title: t("title"),
    lead: ctx.slots.richText("contact.page", "lead")?.paragraphs,
    email,
    emailLabel: t("emailLabel"),
    unavailable: email || endpoint ? undefined : t("unavailable"),
    form:
      online ??
      (email
        ? {
            email,
            workTypes,
            labels: {
              name: t("nameLabel"),
              phone: t("phoneLabel"),
              region: t("regionLabel"),
              area: t("areaLabel"),
              workType: t("workTypeLabel"),
              select: t("selectPlaceholder"),
              schedule: t("scheduleLabel"),
              message: t("messageLabel"),
              required: t("requiredNote"),
              submit: t("submitLabel"),
              notice: t("notice"),
              afterSubmit: t("afterSubmit").replaceAll("{email}", email),
              subject: t("mailSubject"),
              tooLong: t("tooLong").replaceAll("{email}", email),
              tooLongText: t("tooLongTextLabel"),
              selectText: t("selectTextLabel"),
              email: t("emailLabel"),
            },
          }
        : undefined),
  };
}

export function ContactPage({ data }: { data: ContactPageData }) {
  return (
    <div className="i1-page i1-contact" data-section="contact.page">
      <div className="i1-container i1-contact__inner">
        <div className="i1-contact__intro">
          <header className="i1-page__head">
            <h1 className="i1-page__title">{data.title}</h1>
            {data.lead ? (
              <div className="i1-page__lead">
                {data.lead.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            ) : null}
          </header>
          {data.email ? (
            <dl className="i1-contact__direct">
              <div>
                <dt>{data.emailLabel}</dt>
                <dd>
                  <a href={`mailto:${data.email}`}>{data.email}</a>
                </dd>
              </div>
            </dl>
          ) : null}
        </div>
        {data.form ? <InquiryForm {...data.form} /> : <p className="i1-contact__unavailable">{data.unavailable}</p>}
      </div>
    </div>
  );
}
