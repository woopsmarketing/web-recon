/**
 * 1.4.2 (Pre-Demo polish 2) changed a project detail's <main> in exactly two declared ways.
 * The "byte-identical to the previous package" regressions (step41 A, step5 AD) stay byte-exact
 * by reversing exactly those two on whichever side has them, and nothing else:
 *   - every photo seat ends with the viewer's button (`i1-gallery__zoom`);
 *   - a gallery with more than one room opens on a new first tab / panel "all"; the first room
 *     is therefore no longer the selected tab nor the shown panel.
 * predemo2.test.ts asserts the exact shape and content of what is removed here (G1, G2), so the
 * new markup is asserted, not ignored. A no-op on two packages of the same side of 1.4.2.
 */
const ZOOM = /<button type="button" class="i1-gallery__zoom" aria-haspopup="dialog" aria-label="[^"<>]*" data-gallery-zoom=""><\/button>/g;
const ALL_TAB = /<button type="button" role="tab" id="i1-gallery-tab-all" aria-selected="true" aria-controls="i1-gallery-panel-all" tabindex="0" class="i1-gallery__tab" data-gallery-tab="all">[^<>]*<!-- --> <span class="i1-gallery__count">\(<!-- -->\d+<!-- -->\)<\/span><\/button>/;
const ALL_PANEL = /<div id="i1-gallery-panel-all" role="tabpanel" aria-labelledby="i1-gallery-tab-all" class="i1-gallery__panel(?: is-collapsed)?" data-gallery-panel="all">[\s\S]*?(?=<div id="i1-gallery-panel-0" )/;
const ROOM0_TAB = '<button type="button" role="tab" id="i1-gallery-tab-0" aria-selected="false" aria-controls="i1-gallery-panel-0" tabindex="-1" ';
const ROOM0_PANEL = '<div id="i1-gallery-panel-0" role="tabpanel" aria-labelledby="i1-gallery-tab-0" hidden="" ';

export function canonical142(mainHtml: string): string {
  const out = mainHtml.replace(ZOOM, "");
  if (!ALL_TAB.test(out)) return out;
  if (!ALL_PANEL.test(out) || !out.includes(ROOM0_TAB) || !out.includes(ROOM0_PANEL)) throw new Error('canonical142: an "all" tab without the declared "all" panel / unselected first room');
  return out
    .replace(ALL_TAB, "")
    .replace(ALL_PANEL, "")
    .replace(ROOM0_TAB, '<button type="button" role="tab" id="i1-gallery-tab-0" aria-selected="true" aria-controls="i1-gallery-panel-0" tabindex="0" ')
    .replace(ROOM0_PANEL, '<div id="i1-gallery-panel-0" role="tabpanel" aria-labelledby="i1-gallery-tab-0" ');
}
