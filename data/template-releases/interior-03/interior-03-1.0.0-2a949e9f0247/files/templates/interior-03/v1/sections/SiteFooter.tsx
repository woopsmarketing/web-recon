import { ShellIcon } from "../components/shell/ShellIcons";
import { contactEmail, liveLink, type LiveLink } from "../lib/links";
import type { Ctx } from "./types";

/**
 * site.footer (SHELL) — rendered once by the root layout after every page. Wide: the info block
 * (label / value rows flowing on one paragraph, the business e-mail, up to two notes, the copyright
 * line) on the left and the phone block on the right behind a hairline. Narrow (≤ 768): centred,
 * the phone block above the info block with its label. Every unset row / block is omitted; a
 * footer with nothing at all renders nothing.
 */
export function SiteFooter({ ctx }: { ctx: Ctx }) {
  const t = (key: string) => ctx.slots.text("site.footer", key);
  const calls = [liveLink(ctx, ctx.slots.link("site.footer", "callA")), liveLink(ctx, ctx.slots.link("site.footer", "callB"))].filter((l): l is LiveLink => !!l);
  const callLabel = t("callLabel");
  const rows = [1, 2, 3, 4, 5, 6].map((n) => ({ label: t(`info${n}Label`), value: t(`info${n}Value`) })).filter((r): r is { label: string; value: string } => !!r.label && !!r.value);
  const email = contactEmail(ctx);
  const emailLabel = t("emailLabel");
  const notes = [t("note1"), t("note2")].filter((n): n is string => !!n);
  const copyright = t("copyright");
  if (calls.length === 0 && rows.length === 0 && !email && notes.length === 0 && !copyright) return null;
  const callLinks = calls.map((c, i) => (
    <a key={i} href={c.href} className="i3-footer__tel">
      {c.label}
    </a>
  ));
  return (
    <footer className="i3-footer" data-section="site.footer">
      <div className="i3-wrap i3-footer__in">
        {calls.length > 0 ? (
          <div className="i3-footer__cs">
            <ShellIcon name="phone" size={17} strokeWidth={1.6} />
            <div className="i3-footer__cs-list">{callLinks}</div>
          </div>
        ) : null}
        <div className="i3-footer__con">
          {calls.length > 0 ? (
            <div className="i3-footer__call">
              {callLabel ? (
                <p className="i3-footer__call-label">
                  <ShellIcon name="phone" size={15} strokeWidth={1.8} />
                  {callLabel}
                </p>
              ) : null}
              {callLinks}
            </div>
          ) : null}
          {rows.length > 0 || email ? (
            <p className="i3-footer__info">
              {rows.map((r, i) => (
                <span key={i} className="i3-footer__row">
                  <strong>{r.label}</strong> {r.value}
                </span>
              ))}
              {email ? (
                <span className="i3-footer__row">
                  {emailLabel ? <strong>{emailLabel}</strong> : null} <a href={`mailto:${email}`}>{email}</a>
                </span>
              ) : null}
            </p>
          ) : null}
          {notes.map((n, i) => (
            <p key={i} className="i3-footer__note">
              {n}
            </p>
          ))}
          {copyright ? <p className="i3-footer__copy">{copyright}</p> : null}
        </div>
      </div>
    </footer>
  );
}
