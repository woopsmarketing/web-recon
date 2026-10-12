import Link from "../components/ui/Link";
import { contactEmail, liveLink, navItems, type LiveLink } from "../lib/links";
import { FooterBand, footerBand } from "./FooterBand";
import type { Ctx } from "./types";

/**
 * site.footer (SHELL) — rendered once by the root layout after every page:
 *   (a) the two-half CTA band (sections/FooterBand): left half on the accent with label / title /
 *       line / button → contact route (+ an optional mark), right half over `showcaseMedia` with the
 *       same structure → portfolio route; a half without a title is omitted, the band without halves too;
 *   (b) the dark block: logo mark + up to four columns (site pages · support links · locations ·
 *       company rows + e-mail); every row and every empty column is omitted;
 *   (c) up to three legal lines + a copyright line.
 * `band={false}` leaves (a) out — for a footer variant of a site whose home recipe carries its own
 * call to action (design/variants/footer). The classic site renders all three.
 */
export function SiteFooter({ ctx, band = true }: { ctx: Ctx; band?: boolean }) {
  const t = (key: string) => ctx.slots.text("site.footer", key);
  const media = (key: string) => {
    const m = ctx.slots.media("site.footer", key);
    return m ? { ...ctx.assets.resolve(m.asset), alt: m.alt } : undefined;
  };

  // (a) CTA band
  const bandData = band ? footerBand(ctx) : undefined;

  // (b) dark block
  const pages = navItems(ctx, {
    home: ctx.slots.text("site.header", "homeLabel"),
    portfolio: ctx.slots.text("site.header", "portfolioLabel"),
    service: ctx.slots.text("site.header", "serviceLabel"),
    about: ctx.slots.text("site.header", "aboutLabel"),
    faq: ctx.slots.text("site.header", "faqLabel"),
    contact: ctx.slots.text("site.header", "contactLabel"),
  });
  const support = (["group2Link1", "group2Link2", "group2Link3", "group2Link4"] as const).map((k) => liveLink(ctx, ctx.slots.link("site.footer", k))).filter((l): l is LiveLink => !!l);
  const locations = [1, 2, 3, 4].map((n) => ({ name: t(`location${n}Name`), address: t(`location${n}Address`) })).filter((l) => l.name || l.address);
  const hours = [1, 2, 3].map((n) => ({ label: t(`hours${n}Label`), value: t(`hours${n}Value`) })).filter((h) => h.label || h.value);
  const locationsNote = t("locationsNote");
  const email = contactEmail(ctx);
  const company = [1, 2, 3, 4, 5, 6].map((n) => ({ label: t(`company${n}Label`), value: t(`company${n}Value`) })).filter((r) => r.label && r.value);
  const logoMark = media("logoMark");
  const { brandName } = ctx.identity;
  const hasLocations = locations.length > 0 || hours.length > 0 || !!locationsNote;
  const hasCompany = company.length > 0 || !!email;
  const legal = [t("legal1"), t("legal2"), t("legal3")].filter((l): l is string => !!l);
  const copyright = t("copyright");

  const linkEl = (l: LiveLink, className: string) =>
    l.internal ? (
      <Link href={l.href} className={className}>
        {l.label}
      </Link>
    ) : (
      <a href={l.href} className={className}>
        {l.label}
      </a>
    );

  return (
    <footer className="i2-footer" data-section="site.footer">
      {bandData ? <FooterBand data={bandData} /> : null}
      <div className="i2-finfo">
        <div className="i2-finfo__inner">
          <div className="i2-finfo__brand">
            <Link href="/" className="i2-finfo__mark" aria-label={brandName}>
              {logoMark ? <img src={logoMark.src} width={logoMark.width} height={logoMark.height} alt={logoMark.alt || brandName} loading="lazy" decoding="async" /> : <span className="i2-finfo__wordmark">{brandName}</span>}
            </Link>
          </div>
          <div className="i2-finfo__cols">
            {pages.length > 0 ? (
              <nav className="i2-finfo__col i2-finfo__col--pages" aria-label={t("group1Label")}>
                <p className="i2-finfo__heading">{t("group1Label")}</p>
                <ul className="i2-finfo__links">
                  {pages.map((p) => (
                    <li key={p.key}>
                      <Link href={p.href} className="i2-finfo__link">
                        {p.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
            {support.length > 0 ? (
              <nav className="i2-finfo__col i2-finfo__col--support" aria-label={t("group2Label")}>
                <p className="i2-finfo__heading">{t("group2Label")}</p>
                <ul className="i2-finfo__links">
                  {support.map((l, i) => (
                    <li key={i}>{linkEl(l, "i2-finfo__link")}</li>
                  ))}
                </ul>
              </nav>
            ) : null}
            {hasLocations ? (
              <div className="i2-finfo__col i2-finfo__col--places">
                <p className="i2-finfo__heading">{t("locationsLabel")}</p>
                {locations.length > 0 ? (
                  <ul className="i2-finfo__places">
                    {locations.map((l, i) => (
                      <li key={i} className="i2-finfo__place">
                        {l.name ? <span className="i2-finfo__place-name">{l.name}</span> : null}
                        {l.address ? <span className="i2-finfo__place-addr">{l.address}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {hours.length > 0 ? (
                  <ul className="i2-finfo__hours">
                    {hours.map((h, i) => (
                      <li key={i} className="i2-finfo__hour">
                        {h.label ? <span className="i2-finfo__hour-label">{h.label}</span> : null}
                        {h.value ? <span className="i2-finfo__hour-value">{h.value}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {locationsNote ? <p className="i2-finfo__note">{locationsNote}</p> : null}
              </div>
            ) : null}
            {hasCompany ? (
              <div className="i2-finfo__col i2-finfo__col--company">
                <p className="i2-finfo__heading">{t("companyLabel")}</p>
                <dl className="i2-finfo__facts">
                  {company.map((r, i) => (
                    <div key={i} className="i2-finfo__fact">
                      <dt>{r.label}</dt>
                      <dd>{r.value}</dd>
                    </div>
                  ))}
                  {email ? (
                    <div className="i2-finfo__fact">
                      <dt>{t("emailLabel")}</dt>
                      <dd>
                        <a href={`mailto:${email}`} className="i2-finfo__link">
                          {email}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ) : null}
          </div>
        </div>
        {legal.length > 0 || copyright ? (
          <div className="i2-finfo__inner i2-flegal">
            {legal.map((l, i) => (
              <p key={i} className="i2-flegal__line">
                {l}
              </p>
            ))}
            {copyright ? <p className="i2-flegal__copy">{copyright}</p> : null}
          </div>
        ) : null}
      </div>
    </footer>
  );
}
