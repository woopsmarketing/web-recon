import { z } from "zod";
import type { SectionDeclarations } from "@platform/settings/settings";

/**
 * Support sections (SUPPORT area): the FAQ page and the CONTACT page.
 *   faq.page      side menu (routes of this site) · page title · topic chips · the accordion
 *   contact.page  aside (title, lead, phone line, note, description, photo) · the inquiry form
 * Every user-visible string is a slot: control labels and statuses carry a neutral English
 * default; the site's own words (questions, answers, topics, phone number, policy text, placeholders,
 * options) have none and hide what they describe when unset. A FAQ with no item renders nothing.
 *
 * Numbered slots stand in for lists (the platform has no list slots):
 *   faq.page   item{1..12}Question / Answer / Topic — an item exists when question AND answer are set;
 *              chips = "all" + the distinct topics in order of first appearance.
 */

const text = (maxLength: number, neutralDefault?: string) =>
  neutralDefault === undefined ? ({ type: "text", maxLength } as const) : ({ type: "text", maxLength, neutralDefault } as const);
const richText = (maxParagraphs: number, maxParagraphLength: number) => ({ type: "richText", maxParagraphs, maxParagraphLength }) as const;
const link = { type: "link" } as const;
const media = { type: "media" } as const;

export const FAQ_ITEM_COUNT = 12;
export const FAQ_ITEM_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** item1Question … item12Topic */
function faqItemSlots() {
  const out: Record<string, ReturnType<typeof text> | ReturnType<typeof richText>> = {};
  for (const n of FAQ_ITEM_NUMBERS) {
    out[`item${n}Question`] = text(120);
    out[`item${n}Answer`] = richText(8, 600);
    out[`item${n}Topic`] = text(24);
  }
  return out;
}

export const supportSections = {
  /** Two columns (> 1280): the pinned side menu and the main column; ≤ 1280 the menu is the tab strip under the header. */
  "faq.page": {
    schema: z
      .object({
        /** show the number of items after each topic chip's label */
        chipCounts: z.boolean(),
      })
      .strict(),
    defaults: { chipCounts: true },
    slots: {
      title: text(40, "FAQ"),
      /** The side column's title (> 1280) and the name of the tab strip (≤ 1280). */
      menuTitle: text(40, "Support"),
      chipsLabel: text(32, "Topics"),
      /** The first chip: every item. */
      allLabel: text(24, "All"),
      /** The big letters in front of a question / an answer (decorative). */
      questionLetter: text(2, "Q"),
      answerLetter: text(2, "A"),
      ...faqItemSlots(),
    },
  },
  /**
   * The inquiry form is the platform's inquiry door, in the mode the SITE's data selects:
   * online submission for a site that declares an inquiry endpoint (inquiry.json), otherwise
   * an e-mail composed in the visitor's mail app (mailto:) to the business address. Neither →
   * no form (no channel is invented). Mail-only slots: notice · afterSubmit · mailSubject ·
   * tooLong · tooLongTextLabel · selectTextLabel · submitLabel. Online-only slots: onlineSubmitLabel ·
   * noScriptText · submittingLabel · successTitle · successBody · failureText · messagePrefix ·
   * invalidText · conflictText · rateLimitedText · capacityText · fallbackLead · fallbackLinkA/B.
   */
  "contact.page": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      title: text(40, "Contact"),
      /** The aside: lead paragraphs, the phone line (prefix + tel: link), one accent line (with an underlined part), a small text block, a tall photo. */
      lead: richText(3, 200),
      callLabel: text(24),
      /** `{ label: the number as shown, href: "tel:…" }` */
      callLink: link,
      note: text(120),
      /** A part of `note` that is underlined (must occur in it). */
      noteMark: text(60),
      description: richText(3, 300),
      photo: media,
      /** The form's labels (the door's seven fields), placeholders and hints. */
      nameLabel: text(24, "Name"),
      namePlaceholder: text(80),
      phoneLabel: text(24, "Phone"),
      phonePlaceholder: text(80),
      regionLabel: text(24, "Area / city"),
      regionHint: text(80),
      regionPlaceholder: text(80),
      /** Preferred timing: one option per paragraph → a select; absent → a free text field. */
      scheduleLabel: text(24, "Preferred timing"),
      scheduleOptions: richText(8, 32),
      selectPlaceholder: text(24, "Select"),
      areaLabel: text(24, "Home size"),
      areaPlaceholder: text(80),
      /** Shown inside the size field at its right ("평", "m²"); appended to the value in the message. */
      areaUnit: text(8),
      /** Type of work: one option per paragraph → the toggle-box grid (several may be chosen); absent → a free text field. */
      workTypeLabel: text(24, "Type of work"),
      workTypeHint: text(80),
      workTypeOptions: richText(8, 32),
      messageLabel: text(24, "Message"),
      messagePlaceholder: text(120),
      /** Inline validation (shown under the field, tied to it). */
      requiredError: text(80, "Please fill in this field."),
      phoneError: text(80, "Enter at least 8 digits; spaces, +, - and parentheses are allowed."),
      consentError: text(80, "Please agree before sending."),
      /** The required consent row and the button opening the policy dialog (rendered only with policyText). */
      consentLabel: text(200, "I agree to the collection and use of the details entered above to answer this inquiry."),
      policyLabel: text(32, "View policy"),
      policyTitle: text(60),
      policyText: richText(40, 800),
      closeLabel: text(24, "Close"),
      /** Mail hand-off (a site with a business e-mail and no endpoint). "{email}" = the business address, "{name}" = the name field. */
      submitLabel: text(32, "Write e-mail"),
      notice: text(200, "Online submission is not available. The button opens your mail app with these details filled in."),
      afterSubmit: text(240, "Check the e-mail in your mail app and send it from there — nothing has been sent yet. If no mail app opened, write to {email}."),
      mailSubject: text(40, "Inquiry from {name}"),
      tooLong: text(240, "This inquiry is too long to open in your mail app. Nothing has been sent: copy the text below and send it to {email}."),
      tooLongTextLabel: text(40, "Inquiry text"),
      selectTextLabel: text(24, "Select text"),
      emailLabel: text(24, "Email"),
      unavailable: text(160, "Contact details are not available yet."),
      /** Online submission (a site with an inquiry endpoint). */
      onlineSubmitLabel: text(32, "Send inquiry"),
      noScriptText: text(200, "Sending this form needs JavaScript."),
      submittingLabel: text(32, "Sending…"),
      successTitle: text(80, "Your inquiry has been received."),
      successBody: text(200, "The details you entered were delivered."),
      failureText: text(200, "Your inquiry could not be sent. Please try again in a moment."),
      /** First line of the message the endpoint receives: says where the inquiry came from. */
      messagePrefix: text(40, "[Website inquiry]"),
      invalidText: text(200, "Some details could not be accepted. Please check them and try again."),
      conflictText: text(200, "Your inquiry has changed. Please send it again."),
      /** "{minutes}" = the pause the endpoint asked for, in whole minutes. */
      rateLimitedText: text(200, "Too many attempts. Please try again in about {minutes} min."),
      capacityText: text(200, "Online inquiries cannot be accepted right now. Please try again later."),
      fallbackLead: text(80, "You can also reach us here:"),
      /** Another way to reach the business (tel:, mailto: or a page of this site); the business e-mail is listed by itself. */
      fallbackLinkA: link,
      fallbackLinkB: link,
    },
  },
} satisfies SectionDeclarations;
