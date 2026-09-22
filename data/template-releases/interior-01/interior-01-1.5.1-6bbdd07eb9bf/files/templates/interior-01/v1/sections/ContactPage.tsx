import { InquiryForm, type InquiryFormProps } from "../components/InquiryForm";
import { contactEmail } from "./links";
import type { Ctx } from "./types";

export interface ContactPageData {
  title: string;
  lead?: string[];
  /** the business address the form writes to; none → no form (no channel is invented) */
  email?: string;
  emailLabel: string;
  unavailable?: string;
  form?: InquiryFormProps;
}

/**
 * contact.page (1.5.0) — an inquiry form that composes an e-mail to the business address in the
 * visitor's own mail app (mailto:). No backend: nothing is sent, stored or confirmed by the site,
 * and the page says so before and after the button.
 */
export function contactPage(ctx: Ctx): ContactPageData {
  const t = (key: string) => ctx.slots.text("contact.page", key) ?? "";
  const email = contactEmail(ctx);
  const workTypes = ctx.slots.richText("contact.page", "workTypeOptions")?.paragraphs;
  return {
    title: t("title"),
    lead: ctx.slots.richText("contact.page", "lead")?.paragraphs,
    email,
    emailLabel: t("emailLabel"),
    unavailable: email ? undefined : t("unavailable"),
    form: email
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
      : undefined,
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
