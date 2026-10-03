import Link from "next/link";
import { FloatingCta, floatingCta } from "./FloatingCta";
import type { Ctx } from "./types";

/**
 * site.footer — identity + business basics only; no legal pages yet, no dead links.
 * Rendered once by the root layout (app/layout.tsx) after every page (1.4.0), so it also owns
 * the site-wide floating seat (site.floating-cta): its last child on EVERY page, in the
 * contentinfo landmark; absent only when disabled or when the site has no contact destination.
 */
export function SiteFooter({ ctx }: { ctx: Ctx }) {
  const settings = ctx.settings["site.footer"];
  const { brandName, legalName } = ctx.identity;
  const email = ctx.content.getSingleton("business").contact?.email;
  // slot fallback: site value → business.summary binding → hidden
  const summary = settings.showSummary ? ctx.slots.text("site.footer", "summary") : undefined;
  const companyLabel = ctx.slots.text("site.footer", "companyLabel");
  const emailLabel = ctx.slots.text("site.footer", "emailLabel");
  const notice = ctx.slots.text("site.footer", "notice");
  const cta = floatingCta(ctx);
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
      {notice ? (
        <div className="i1-container">
          <p className="i1-footer__notice" data-footer-notice="">
            {notice}
          </p>
        </div>
      ) : null}
      {cta ? <FloatingCta data={cta} /> : null}
    </footer>
  );
}
