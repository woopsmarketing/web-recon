/**
 * The title block of a home section (HOME): the short accent rule over the heading, in the
 * shared base.css classes (.i3-tit__line + .i3-tit). The heading is the section's <h2>; `id`
 * lets the section point at it with aria-labelledby. No hooks: a server component.
 *   <SectionTitle title="…" id="i3-pf-title" />
 */
export function SectionTitle({ title, id }: { title: string; id: string }) {
  return (
    <>
      <span className="i3-tit__line" aria-hidden="true" />
      <h2 className="i3-tit" id={id}>
        {title}
      </h2>
    </>
  );
}
