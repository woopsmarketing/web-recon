/**
 * Visual Editor V1 (Task 28 Phase 4) — the OPERATOR's browser UI.
 *
 * Not customer SaaS, not a page builder: a visual SLOT / REGION editor over an
 * immutable Recon Template. It adds no DOM attribute (there is no
 * `data-wr-slot`), it never writes into a generated customer application, and
 * it cannot reach a production package — the bake copies the immutable
 * template run, while the editor bridge exists only in the preview proxy's
 * response bytes.
 */
export * from "./inversion.js";
export * from "./catalog.js";
export * from "./assets.js";
export * from "./inspect.js";
export * from "./panels.js";
export * from "./region-enablement.js";
export * from "./commit.js";
export * from "./ai-rewrite.js";
export * from "./runtime.js";
export * from "./server.js";
export * from "./session.js";
export { EDITOR_CLIENT_CSS, EDITOR_CLIENT_JS, editorClientHtml } from "./client.js";
