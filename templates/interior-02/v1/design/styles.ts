/**
 * Every stylesheet of the design system, in cascade order — imported once, by the root layout,
 * AFTER the seven classic sheets (so the classic rules are untouched and a variant rule of equal
 * specificity wins over a classic one).
 *
 *   tokens.css                 the `--ds-*` vocabulary with its classic defaults (design/tokens.ts
 *                              writes the site's own values inline, after it)
 *   inner.css                  theming of the classic inner pages for a site WITH a design document
 *   <family>-<variant>.css     one sheet per registered variant, namespaced .ds-<family>-<variant>
 *
 * The list is the registry's (platform/test/design.test.ts holds the two together). A variant's
 * rules belong in its own sheet; this file changes only when the registry does.
 */
import "../styles/design/tokens.css";
import "../styles/design/inner.css";
import "../styles/design/header-centered.css";
import "../styles/design/header-conversion.css";
import "../styles/design/footer-minimal.css";
import "../styles/design/action-bar.css";
import "../styles/design/hero-photo.css";
import "../styles/design/hero-statement.css";
import "../styles/design/hero-split.css";
import "../styles/design/showcase-panels.css";
import "../styles/design/showcase-index.css";
import "../styles/design/showcase-cards.css";
import "../styles/design/about-split-panel.css";
import "../styles/design/about-manifesto.css";
import "../styles/design/about-statement-photo.css";
import "../styles/design/services-rows.css";
import "../styles/design/services-numbered.css";
import "../styles/design/cta-quiet.css";
import "../styles/design/cta-band.css";
import "../styles/design/detail-typographic.css";
import "../styles/design/detail-gallery.css";
