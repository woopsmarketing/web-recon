import { FaqBoard, type FaqItem, type FaqTab } from "../components/support/FaqBoard";
import { SubVisual } from "../components/ui/SubVisual";
import { slotMedia, type Media } from "../lib/media";
import { FAQ_ITEM_NUMBERS } from "../manifest/support";
import type { Ctx } from "./types";

export interface FaqPageData {
  title: string;
  lead?: string;
  visual: { text?: string; media?: Media };
  items: FaqItem[];
  /** "all" + the distinct topics in order of first appearance; fewer than two = no strip */
  tabs: FaqTab[];
  labels: { tabs: string; number: string; question: string; topic: string; empty: string };
}

/** a topic's tab key; never collides with the "all" tab */
const topicKey = (topic: string) => `t:${topic}`;

/**
 * faq.page — up to twelve numbered items; an item exists when it has a question and an answer,
 * and keeps its own number. Topics come from the items' topic slot. No item = an empty list
 * (the page renders the table's empty row).
 */
export function faqPage(ctx: Ctx): FaqPageData {
  const t = (key: string) => ctx.slots.text("faq.page", key) ?? "";
  const items: FaqItem[] = [];
  for (const n of FAQ_ITEM_NUMBERS) {
    const question = ctx.slots.text("faq.page", `item${n}Question`);
    const answer = ctx.slots.richText("faq.page", `item${n}Answer`)?.paragraphs.filter((p) => p.trim() !== "");
    if (!question || !answer || answer.length === 0) continue;
    const topic = ctx.slots.text("faq.page", `item${n}Topic`)?.trim() || undefined;
    items.push({ key: `item${n}`, number: n, question, answer, topic });
  }
  const tabs: FaqTab[] = [{ key: "all", label: t("allLabel") }];
  for (const item of items) {
    if (item.topic && !tabs.some((tab) => tab.key === topicKey(item.topic!))) tabs.push({ key: topicKey(item.topic), label: item.topic, topic: item.topic });
  }
  return {
    title: t("title"),
    lead: t("lead") || undefined,
    visual: { text: t("visualText") || undefined, media: slotMedia(ctx, "faq.page", "visualMedia") },
    items,
    tabs: tabs.length > 1 ? tabs : [],
    labels: { tabs: t("tabsLabel"), number: t("numberHeading"), question: t("questionHeading"), topic: t("topicHeading"), empty: t("emptyText") },
  };
}

/**
 * The sub-page frame with the board: banner · tab strip (the topics) · page title · the list table.
 * The strip and the table are one client island (FaqBoard) because a tab filters the rows in place;
 * the page title sits between them inside that island.
 */
export function FaqPage({ data }: { data: FaqPageData }) {
  return (
    <section className="i3-faq" data-section="faq.page" aria-labelledby="i3-faq-title">
      <SubVisual title={data.title} text={data.visual.text} media={data.visual.media} />
      <FaqBoard title={data.title} lead={data.lead} items={data.items} tabs={data.tabs} labels={data.labels} />
    </section>
  );
}
