import { z } from "zod";
import type { SectionDeclarations } from "@platform/settings/settings";

/**
 * Support sections (SUPPORT area): the FAQ page and the CONTACT page, both in the sub-page frame
 * (banner · tab strip · page title · content).
 *   faq.page      a notice-board-styled FAQ: the topic tabs, then a list table (No. · Question ·
 *                 Topic) whose rows open their answer in a full-width row underneath
 *   contact.page  the inquiry form as a form table (label cell · field cell), the policy box, the
 *                 consent row and the two centred buttons (dark submit, grey reset)
 * Every user-visible string is a slot: control labels, headings and statuses carry a neutral
 * English default; the site's own words (lead lines, questions, answers, topics, placeholders,
 * hints, the policy text) have none and hide what they describe when unset.
 *
 * Numbered slots stand in for lists (the platform has no list slots):
 *   faq.page   item{1..12}Question / Answer / Topic — an item exists when question AND answer are
 *              set; the tabs are "all" + the distinct topics in order of first appearance (fewer
 *              than two tabs = no strip). No item = the table's empty row (the page still renders).
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

/** The inquiry form's seven fields: a label (neutral default) and an optional placeholder and hint each. */
const CONTACT_FIELDS = [
  ["name", "Name"],
  ["phone", "Phone"],
  ["address", "Address"],
  ["area", "Floor area"],
  ["buildingType", "Building type"],
  ["budget", "Budget"],
  ["message", "Message"],
] as const;

/** nameLabel / namePlaceholder / nameHint … messageLabel / messagePlaceholder / messageHint */
function contactFieldSlots() {
  const out: Record<string, ReturnType<typeof text>> = {};
  for (const [field, label] of CONTACT_FIELDS) {
    out[`${field}Label`] = text(24, label);
    out[`${field}Placeholder`] = text(80);
    out[`${field}Hint`] = text(80);
  }
  return out;
}

export const supportSections = {
  /**
   * Banner · tab strip (the topics; a button each, filtering the rows in place) · page title · the
   * list table. A row's question is a button that opens the answer in a full-width row right under
   * it (several may be open); ≤ 768 the topic column is hidden, the number column widens.
   */
  "faq.page": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      title: text(40, "FAQ"),
      /** One line under the page title (hidden ≤ 980). */
      lead: text(120),
      /** The banner photo and its one line (the line is hidden ≤ 768). */
      visualMedia: media,
      visualText: text(80),
      /** The name of the tab strip (assistive tech) and the first tab (every item). */
      tabsLabel: text(32, "Topics"),
      allLabel: text(24, "All"),
      /** Column headings of the list table. */
      numberHeading: text(16, "No."),
      questionHeading: text(24, "Question"),
      topicHeading: text(24, "Topic"),
      /** The table's only row when the site has no item. */
      emptyText: text(120, "No posts yet."),
      ...faqItemSlots(),
    },
  },
  /**
   * The inquiry form is the platform's inquiry door, in the mode the SITE's data selects: online
   * submission for a site that declares an inquiry endpoint (inquiry.json), otherwise an e-mail
   * composed in the visitor's mail app (mailto:) to the business address. Neither → no form, the
   * `unavailable` line instead (no channel is invented). Mail-only slots: notice · afterSubmit ·
   * mailSubject · tooLong · tooLongTextLabel · selectTextLabel · submitLabel. Online-only slots:
   * onlineSubmitLabel · noScriptText · submittingLabel · successTitle · successBody · failureText ·
   * messagePrefix · invalidText · conflictText · rateLimitedText · capacityText · fallbackLead ·
   * fallbackLinkA/B. The optional fields (address, area, buildingType, budget) travel inside the
   * message as "label: value" lines; the request body stays the door's fixed one.
   */
  "contact.page": {
    schema: z.object({}).strict(),
    defaults: {},
    slots: {
      title: text(40, "Contact"),
      /** One line under the page title (hidden ≤ 980). */
      lead: text(120),
      /** The banner photo and its one line (the line is hidden ≤ 768). */
      visualMedia: media,
      visualText: text(80),
      ...contactFieldSlots(),
      /** Inline validation (shown under the field, tied to it). */
      requiredError: text(80, "Please fill in this field."),
      phoneError: text(80, "Enter at least 8 digits; spaces, +, - and parentheses are allowed."),
      consentError: text(80, "Please agree before sending."),
      /**
       * The policy box (a bordered, scrollable block above the consent row; rendered only with
       * policyText): its heading is policyTitle, or policyLabel when the site sets no title.
       */
      consentLabel: text(200, "I agree to the collection and use of the details entered above to answer this inquiry."),
      policyLabel: text(32, "Privacy policy"),
      policyTitle: text(60),
      policyText: richText(40, 800),
      /** The two buttons: the dark submit (mail mode) and the grey reset that clears the form. */
      submitLabel: text(32, "Write e-mail"),
      resetLabel: text(24, "Reset"),
      /** Mail hand-off (a site with a business e-mail and no endpoint). "{email}" = the business address, "{name}" = the name field. */
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
