import { FIELDS, type Field } from "../components/support/fields";
import { InquiryForm, type InquiryContact, type InquiryFieldCopy, type InquiryFormProps, type PolicyCopy } from "../components/support/InquiryForm";
import { PageTitle } from "../components/ui/PageTitle";
import { SubVisual } from "../components/ui/SubVisual";
import { contactEmail, liveLink } from "../lib/links";
import { slotMedia, type Media } from "../lib/media";
import type { Ctx } from "./types";

export interface ContactPageData {
  title: string;
  lead?: string;
  visual: { text?: string; media?: Media };
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
 * contact.page — the banner, the page title and the inquiry form in the mode the SITE's data
 * selects: online submission for a site with an inquiry endpoint (ctx.inquiry), otherwise the mail
 * hand-off to the business e-mail; neither → no form, the "unavailable" line instead (no channel
 * is invented). The policy box exists only when the site provides the policy text.
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
  const policyParagraphs = paragraphs("policyText");
  const policy: PolicyCopy | undefined = policyParagraphs ? { title: t("policyTitle") || t("policyLabel"), paragraphs: policyParagraphs } : undefined;
  const fields = (submit: string): InquiryFieldCopy => {
    const labels = {} as Record<Field, string>;
    const placeholders: Partial<Record<Field, string>> = {};
    const hints: Partial<Record<Field, string>> = {};
    for (const f of FIELDS) {
      labels[f] = t(`${f}Label`);
      const placeholder = opt(`${f}Placeholder`);
      if (placeholder) placeholders[f] = placeholder;
      const hint = opt(`${f}Hint`);
      if (hint) hints[f] = hint;
    }
    return {
      labels,
      placeholders,
      hints,
      requiredError: t("requiredError"),
      phoneError: t("phoneError"),
      consentError: t("consentError"),
      consent: t("consentLabel"),
      submit,
      reset: t("resetLabel"),
    };
  };
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
    lead: opt("lead"),
    visual: { text: opt("visualText"), media: slotMedia(ctx, "contact.page", "visualMedia") },
    form,
    unavailable: form ? undefined : t("unavailable"),
  };
}

/** The sub-page frame: banner · page title · the form table (or the "unavailable" line). */
export function ContactPage({ data }: { data: ContactPageData }) {
  return (
    <section className="i3-contact" data-section="contact.page" aria-labelledby="i3-contact-title">
      <SubVisual title={data.title} text={data.visual.text} media={data.visual.media} />
      <div className="i3-content">
        <div className="i3-wrap">
          <PageTitle title={data.title} lead={data.lead} id="i3-contact-title" />
          <div className="i3-page">
            {data.form ? (
              <InquiryForm {...data.form} />
            ) : (
              <p className="i3-contact__unavailable" data-inquiry-unavailable="">
                {data.unavailable}
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
