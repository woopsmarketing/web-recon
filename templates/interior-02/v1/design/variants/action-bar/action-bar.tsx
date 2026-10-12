import Link from "../../../components/ui/Link";
import { Icon, type IconName } from "../../../components/ui/Icon";
import type { Ctx } from "../../../sections/types";
import { designOf } from "../../resolve";
import { channelsOf } from "./channels";

/**
 * mobileBar.action-bar (CT-B) — the fixed bottom bar at phone / tablet width (hidden from 1024 px):
 * up to three real actions — the phone (tel:), a chat channel (none can exist yet, see channels.ts)
 * and the consultation page — each only when the site has it. No action → nothing is rendered.
 * Rendered once by the root layout after the footer. CSS keeps it clear of the corner widget and
 * makes room for it below the page (styles/design/action-bar.css).
 *
 * The consultation action is the bar's emphasis and follows the theme's accent use: `fills` paints it in
 * the accent pair; `minimal` and `blocks` (`--quiet`) paint it in the theme's block pair — the surface on
 * a site that keeps its brand colour off surfaces, the accent on a site that uses it as its one block.
 */
const NS = "ds-action-bar";

interface Action {
  key: string;
  href: string;
  label: string;
  icon: IconName;
  primary: boolean;
  internal: boolean;
}

export function Section({ ctx }: { ctx: Ctx }) {
  const { phone, consult } = channelsOf(ctx);
  const actions: Action[] = [];
  if (phone) {
    const word = ctx.slots.text("contact.page", "callLabel");
    actions.push({ key: "phone", href: phone.href, label: word || phone.label, icon: "phone", primary: false, internal: false });
  }
  if (consult) actions.push({ key: "consult", href: consult.href, label: consult.label, icon: "chat", primary: true, internal: true });
  if (actions.length === 0) return null;
  const quiet = designOf(ctx).theme.accentUse !== "fills";
  return (
    <nav className={`${NS} ${NS}--${actions.length}${quiet ? ` ${NS}--quiet` : ""}`} aria-label={ctx.slots.text("site.header", "navLabel") ?? undefined} data-section="site.action-bar">
      <ul className={`${NS}__list`}>
        {actions.map((a) => {
          const cls = `${NS}__action${a.primary ? ` ${NS}__action--primary` : ""}`;
          const inner = (
            <>
              <Icon name={a.icon} size={22} />
              <span className={`${NS}__label`}>{a.label}</span>
            </>
          );
          return (
            <li key={a.key} className={`${NS}__item`}>
              {a.internal ? (
                <Link href={a.href} className={cls} data-action={a.key}>
                  {inner}
                </Link>
              ) : (
                <a href={a.href} className={cls} data-action={a.key}>
                  {inner}
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
