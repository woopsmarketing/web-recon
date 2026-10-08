import Link from "next/link";
import { FaqBrowser, type FaqChip, type FaqItem } from "../components/support/FaqBrowser";
import { Icon } from "../components/ui/Icon";
import { navItems, type NavItem } from "../lib/links";
import { FAQ_ITEM_NUMBERS } from "../manifest/support";
import type { Ctx, NavKey } from "./types";

export interface FaqPageData {
  title: string;
  menuTitle: string;
  /** the support pages that exist for this site (FAQ, CONTACT), in nav order */
  menu: NavItem[];
  current: NavKey;
  items: FaqItem[];
  /** "all" + the distinct topics in order of first appearance */
  chips: FaqChip[];
  chipCounts: boolean;
  labels: { chips: string; q: string; a: string };
}

const SUPPORT_KEYS: readonly NavKey[] = ["faq", "contact"];

/** The side menu / tab strip: only the support routes that generate a page for this site, named like the header's nav. */
export function supportMenu(ctx: Ctx): NavItem[] {
  const t = (key: string) => ctx.slots.text("site.header", key);
  return navItems(ctx, { faq: t("faqLabel"), contact: t("contactLabel") }, SUPPORT_KEYS);
}

/**
 * faq.page — up to twelve numbered items; an item exists when it has a question and an answer.
 * Topics come from the items' own topic slot; the chips are "all" plus every distinct topic.
 * No item → undefined (the section is not rendered).
 */
export function faqPage(ctx: Ctx): FaqPageData | undefined {
  const t = (key: string) => ctx.slots.text("faq.page", key) ?? "";
  const items: FaqItem[] = [];
  for (const n of FAQ_ITEM_NUMBERS) {
    const question = ctx.slots.text("faq.page", `item${n}Question`);
    const answer = ctx.slots.richText("faq.page", `item${n}Answer`)?.paragraphs.filter((p) => p.trim() !== "");
    if (!question || !answer || answer.length === 0) continue;
    const topic = ctx.slots.text("faq.page", `item${n}Topic`)?.trim() || undefined;
    items.push({ key: `item${n}`, question, answer, topic });
  }
  if (items.length === 0) return undefined;
  const chips: FaqChip[] = [{ key: "all", label: t("allLabel"), count: items.length }];
  for (const item of items) {
    if (!item.topic) continue;
    const chip = chips.find((c) => c.key === item.topic);
    if (chip) chip.count += 1;
    else chips.push({ key: item.topic, label: item.topic, count: 1 });
  }
  return {
    title: t("title"),
    menuTitle: t("menuTitle"),
    menu: supportMenu(ctx),
    current: "faq",
    items,
    chips,
    chipCounts: ctx.settings["faq.page"].chipCounts,
    labels: { chips: t("chipsLabel"), q: t("questionLetter"), a: t("answerLetter") },
  };
}

/**
 * The ≤ 1280 tab strip: a white 47 px bar stuck directly under the header, its links scrolling
 * sideways; the current page is bold with a 2 px underline. Hidden above 1280 (the side menu).
 */
export function SupportStrip({ menu, current, label }: { menu: NavItem[]; current: NavKey; label: string }) {
  if (menu.length === 0) return null;
  return (
    <nav className="i2-strip" aria-label={label} data-support-strip="">
      <ul className="i2-strip__list">
        {menu.map((m) => (
          <li key={m.key} className="i2-strip__item">
            <Link href={m.href} className="i2-strip__link" aria-current={m.key === current ? "page" : undefined}>
              {m.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Two columns (> 1280): the 320 px side column — title over a 2 px rule, a vertical menu whose
 * current item is bold with an arrow — pinned 80 px under the header while the main column
 * scrolls; the main column = page title, topic chips, the accordion. ≤ 1280 the side column
 * becomes the tab strip (SupportStrip) and the title is hidden ≤ 640 (the header bar shows it).
 */
export function FaqPage({ data }: { data: FaqPageData }) {
  return (
    <section className="i2-faq" data-section="faq.page" aria-labelledby="i2-faq-title">
      <SupportStrip menu={data.menu} current={data.current} label={data.menuTitle} />
      <div className="i2-wrap i2-faq__layout">
        {data.menu.length > 0 ? (
          <aside className="i2-faq__side" data-support-side="">
            <div className="i2-faq__side-inner">
              <h2 className="i2-faq__side-title">{data.menuTitle}</h2>
              <ul className="i2-faq__menu">
                {data.menu.map((m) => (
                  <li key={m.key} className="i2-faq__menu-item">
                    <Link href={m.href} className="i2-faq__menu-link" aria-current={m.key === data.current ? "page" : undefined}>
                      <span>{m.label}</span>
                      {m.key === data.current ? <Icon name="arrow-right" size={21} /> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        ) : null}
        <div className="i2-faq__main">
          <h1 id="i2-faq-title" className="i2-faq__title">
            {data.title}
          </h1>
          <FaqBrowser items={data.items} chips={data.chips} chipCounts={data.chipCounts} labels={data.labels} />
        </div>
      </div>
    </section>
  );
}
