import Link from "../../../components/ui/Link";
import { contactEmail, liveLink, navItems, type LiveLink } from "../../../lib/links";
import type { Ctx } from "../../../sections/types";
import { channelsOf } from "../action-bar/channels";

/**
 * footer.minimal — the footer without the call-to-action band (the recipe has its own `cta`
 * section). Prints every line the classic footer prints, laid out quietly on the page: the brand
 * (logo mark or wordmark) with the site's pages, then the support links · locations and hours ·
 * company rows and e-mail, then the legal lines and the copyright. Whatever the site does not hold
 * is left out, column by column.
 *
 * The phone: a company row that prints the number of the site's own `tel:` link (channels.ts) is that
 * link — one tap calls. A row with another number, or a site without a phone link, stays text: no
 * number is guessed into a link (a registration number is digits and dashes too).
 */
const NS = "ds-footer-minimal";
/** the digits of a number as dialled inside the country: "+82 2-000-0000" and "02-000-0000" are the same number */
const dialled = (value: string) => value.replace(/[^0-9+]/g, "").replace(/^\+82/, "0");

export function Section({ ctx }: { ctx: Ctx }) {
  const t = (key: string) => ctx.slots.text("site.footer", key);
  const logoMark = (() => {
    const m = ctx.slots.media("site.footer", "logoMark");
    return m ? { ...ctx.assets.resolve(m.asset), alt: m.alt } : undefined;
  })();
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
  const summary = ctx.content.getSingleton("business").summary;
  const { brandName } = ctx.identity;
  const hasPlaces = locations.length > 0 || hours.length > 0 || !!locationsNote;
  const hasCompany = company.length > 0 || !!email;
  const legal = [t("legal1"), t("legal2"), t("legal3")].filter((l): l is string => !!l);
  const copyright = t("copyright");
  const { phone } = channelsOf(ctx);
  const phoneDigits = phone ? dialled(phone.href.slice("tel:".length)) : undefined;

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
    <footer className={NS} data-section="site.footer">
      <div className={`${NS}__inner`}>
        <div className={`${NS}__top`}>
          <div className={`${NS}__brand`}>
            <Link href="/" className={`${NS}__mark`} aria-label={brandName}>
              {logoMark ? <img src={logoMark.src} width={logoMark.width} height={logoMark.height} alt={logoMark.alt || brandName} loading="lazy" decoding="async" className={`${NS}__logo`} /> : <span className={`${NS}__wordmark`}>{brandName}</span>}
            </Link>
            {summary ? <p className={`${NS}__summary`}>{summary}</p> : null}
          </div>
          {pages.length > 0 ? (
            <nav className={`${NS}__pages`} aria-label={t("group1Label")}>
              {t("group1Label") ? <p className={`${NS}__heading`}>{t("group1Label")}</p> : null}
              <ul className={`${NS}__links`}>
                {pages.map((p) => (
                  <li key={p.key}>
                    <Link href={p.href} className={`${NS}__link`}>
                      {p.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>

        {support.length > 0 || hasPlaces || hasCompany ? (
          <div className={`${NS}__facts`}>
            {support.length > 0 ? (
              <nav className={`${NS}__col`} aria-label={t("group2Label")}>
                {t("group2Label") ? <p className={`${NS}__heading`}>{t("group2Label")}</p> : null}
                <ul className={`${NS}__links`}>
                  {support.map((l, i) => (
                    <li key={i}>{linkEl(l, `${NS}__link`)}</li>
                  ))}
                </ul>
              </nav>
            ) : null}
            {hasPlaces ? (
              <div className={`${NS}__col`}>
                {t("locationsLabel") ? <p className={`${NS}__heading`}>{t("locationsLabel")}</p> : null}
                {locations.length > 0 ? (
                  <ul className={`${NS}__places`}>
                    {locations.map((l, i) => (
                      <li key={i} className={`${NS}__place`}>
                        {l.name ? <span className={`${NS}__place-name`}>{l.name}</span> : null}
                        {l.address ? <span className={`${NS}__place-addr`}>{l.address}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {hours.length > 0 ? (
                  <ul className={`${NS}__hours`}>
                    {hours.map((h, i) => (
                      <li key={i} className={`${NS}__hour`}>
                        {h.label ? <span className={`${NS}__hour-label`}>{h.label}</span> : null}
                        {h.value ? <span className={`${NS}__hour-value`}>{h.value}</span> : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {locationsNote ? <p className={`${NS}__note`}>{locationsNote}</p> : null}
              </div>
            ) : null}
            {hasCompany ? (
              <div className={`${NS}__col`}>
                {t("companyLabel") ? <p className={`${NS}__heading`}>{t("companyLabel")}</p> : null}
                <dl className={`${NS}__company`}>
                  {company.map((r, i) => (
                    <div key={i} className={`${NS}__row`}>
                      <dt>{r.label}</dt>
                      <dd>
                        {phone && phoneDigits && dialled(r.value ?? "") === phoneDigits ? (
                          <a href={phone.href} className={`${NS}__link`} data-footer-phone="">
                            {r.value}
                          </a>
                        ) : (
                          r.value
                        )}
                      </dd>
                    </div>
                  ))}
                  {email ? (
                    <div className={`${NS}__row`}>
                      <dt>{t("emailLabel")}</dt>
                      <dd>
                        <a href={`mailto:${email}`} className={`${NS}__link`}>
                          {email}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>
            ) : null}
          </div>
        ) : null}

        {legal.length > 0 || copyright ? (
          <div className={`${NS}__legal`}>
            {legal.map((l, i) => (
              <p key={i} className={`${NS}__legal-line`}>
                {l}
              </p>
            ))}
            {copyright ? <p className={`${NS}__copy`}>{copyright}</p> : null}
          </div>
        ) : null}
      </div>
    </footer>
  );
}
