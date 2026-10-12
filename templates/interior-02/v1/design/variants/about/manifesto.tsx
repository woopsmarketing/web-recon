import Link from "../../../components/ui/Link";
import { Icon } from "../../../components/ui/Icon";
import type { Ctx } from "../../../sections/types";
import { aboutBase, statementOf, type AboutBase } from "./shared";

/** about.manifesto (AB-C) — one large statement under a small label; at most the first paragraph, then a link for the rest. No photograph is read. */
export interface ManifestoData {
  label?: string;
  statement: string;
  /** the statement is the intro title (a heading) rather than a cut paragraph */
  isTitle: boolean;
  lead?: string;
  more?: AboutBase["more"];
}

const ID = "ds-about-manifesto-statement";
/** a statement longer than this is set one step smaller */
const LONG = 70;

export function data(ctx: Ctx): ManifestoData | undefined {
  const base = aboutBase(ctx);
  if (!base) return undefined;
  const s = statementOf(base, 120, 220);
  if (!s) return undefined;
  return { label: base.label, statement: s.statement, isTitle: s.isTitle, lead: s.lead, more: base.more };
}

export function Section({ data: d }: { data: ManifestoData }) {
  const cls = `ds-about-manifesto${d.statement.length > LONG ? " ds-about-manifesto--long" : ""}`;
  return (
    <section className={cls} data-section="home.about" aria-labelledby={d.isTitle ? ID : undefined} aria-label={d.isTitle ? undefined : d.label}>
      <div className="ds-about-manifesto__inner">
        {d.label ? <p className="ds-about-manifesto__label">{d.label}</p> : null}
        {d.isTitle ? (
          <h2 id={ID} className="ds-about-manifesto__statement">
            {d.statement}
          </h2>
        ) : (
          <p className="ds-about-manifesto__statement">{d.statement}</p>
        )}
        {d.lead || d.more ? (
          <div className="ds-about-manifesto__aside">
            {d.lead ? <p className="ds-about-manifesto__lead">{d.lead}</p> : null}
            {d.more ? (
              <Link href={d.more.href} className="ds-about-manifesto__more">
                <span>{d.more.label}</span>
                <Icon name="arrow-right" size={18} />
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
