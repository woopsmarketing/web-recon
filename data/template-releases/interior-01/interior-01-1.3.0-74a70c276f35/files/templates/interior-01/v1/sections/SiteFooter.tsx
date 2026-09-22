import Link from "next/link";
import type { ReactNode } from "react";
import type { Ctx } from "./types";

/**
 * site.footer — identity + business basics only; no legal pages yet, no dead links.
 * `children`: page-level site furniture that belongs to the contentinfo landmark (the
 * homepage's floating contact button); pages without it render the footer unchanged.
 */
export function SiteFooter({ ctx, children }: { ctx: Ctx; children?: ReactNode }) {
  const settings = ctx.settings["site.footer"];
  const { brandName, legalName } = ctx.identity;
  const email = ctx.content.getSingleton("business").contact?.email;
  // slot fallback: site value → business.summary binding → hidden
  const summary = settings.showSummary ? ctx.slots.text("site.footer", "summary") : undefined;
  const companyLabel = ctx.slots.text("site.footer", "companyLabel");
  const emailLabel = ctx.slots.text("site.footer", "emailLabel");
  return (
    <footer className="i1-footer" data-section="site.footer">
      <div className="i1-container i1-footer__inner">
        <div className="i1-footer__brand">
          <Link href="/" className="i1-footer__name">
            {brandName}
          </Link>
          {summary ? <p className="i1-footer__summary">{summary}</p> : null}
        </div>
        {legalName || email ? (
          <dl className="i1-footer__facts">
            {legalName ? (
              <div>
                <dt>{companyLabel}</dt>
                <dd>{legalName}</dd>
              </div>
            ) : null}
            {email ? (
              <div>
                <dt>{emailLabel}</dt>
                <dd>
                  <a href={`mailto:${email}`}>{email}</a>
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
      {children}
    </footer>
  );
}
