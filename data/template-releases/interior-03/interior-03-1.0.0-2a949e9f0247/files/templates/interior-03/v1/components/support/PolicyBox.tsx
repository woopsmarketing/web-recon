/**
 * The policy block of the inquiry form: a heading over a bordered, scrollable box holding the
 * site's policy text (137px high; 130px ≤ 768), placed above the consent row. The box is a
 * keyboard-scrollable region (tabIndex 0) named by its heading, so every line is reachable
 * without a pointer. Rendered only when the site provides the text (ContactPage decides).
 */
export function PolicyBox({ title, paragraphs }: { title: string; paragraphs: string[] }) {
  return (
    <div className="i3-policy" data-policy-box="">
      <h2 id="i3-policy-title" className="i3-policy__title">
        {title}
      </h2>
      <div id="i3-policy-box" className="i3-policy__box" role="region" aria-labelledby="i3-policy-title" tabIndex={0}>
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    </div>
  );
}
