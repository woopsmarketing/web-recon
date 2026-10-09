/**
 * The page title block of a sub-page (SHELL shared block): a short accent rule, the title and an
 * optional one-line lead (hidden ≤ 980). `as` picks the element of the title: "h1" (default) on a
 * page whose title this is, "p" on a page that has its own <h1> further down (a project detail).
 */
export function PageTitle({ title, lead, as = "h1", id }: { title: string; lead?: string; as?: "h1" | "p"; id?: string }) {
  const Title = as;
  return (
    <div className="i3-ptitle">
      <span className="i3-ptitle__line" aria-hidden="true" />
      <Title className="i3-ptitle__title" id={id}>
        {title}
      </Title>
      {lead ? <p className="i3-ptitle__lead">{lead}</p> : null}
    </div>
  );
}
