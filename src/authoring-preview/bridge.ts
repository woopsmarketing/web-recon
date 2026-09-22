/**
 * The editor bridge — an EDITOR-ONLY script spliced into HTML responses at the
 * preview serve boundary (Task 28 Phase 3, requirement 5).
 *
 * It is never written to any file inside the app, never bundled, and never
 * reachable by the production compiler: the production bake copies the
 * immutable template run, and this string only ever exists inside the preview
 * proxy process and the bytes it streams. `scripts/smoke-authoring-preview.ts`
 * proves the absence by greping a REAL production package for
 * `BRIDGE_MARKER` after a preview session has run.
 *
 * WHAT IT EXPOSES (what Phase 4's Visual Editor needs and nothing more):
 *   - hover/click reporting of the rendered element's DOM identity —
 *     `data-wr-node` / `data-wr-dyn-node` — plus the addressing context the
 *     Slot V2 bindings are keyed on: pageId, viewport, route.
 *     There is NO `data-wr-slot`; slot resolution is the editor's job, done by
 *     inverting slot-bindings.json on (pageId, viewport, nodeId).
 *   - refresh commands so a theme or image edit becomes visible with NO
 *     navigation (a stylesheet <link> swap / an img src cache-bust).
 *
 * SECURITY. Outbound messages are posted to each configured editor origin
 * explicitly — never `"*"`. Inbound messages are accepted only when ALL of:
 * `event.origin` is in the allowlist, `event.source` is the embedder
 * (window.parent / window.opener), and the payload carries the bridge's own
 * protocol tag. Anything else is ignored silently.
 */

/** Present in every injected bridge — the string the bake proof greps for. */
export const BRIDGE_MARKER = "wr-authoring-bridge";
/**
 * Task 28 Phase 4. The ONE element the highlight lives in: a `<style>` in
 * `<head>` whose textContent is rewritten per hover. It targets the EXISTING
 * `data-wr-node` / `data-wr-dyn-node`, so no attribute is ever set on a
 * customer element and no node is ever inserted into the customer subtree —
 * and `outline` is drawn outside the border box, so it cannot participate in
 * layout or extend the scrollable overflow area. Measured max geometry delta
 * over every element in the document: exactly 0 (scripts/smoke-visual-editor.ts).
 */
export const EDITOR_STYLE_ATTR = "data-wr-editor-style";
export const BRIDGE_PROTOCOL_VERSION = 1;
/** Tag on messages the bridge SENDS. */
export const BRIDGE_MESSAGE_TAG = "wr-authoring-bridge";
/** Tag on messages the bridge ACCEPTS. */
export const EDITOR_MESSAGE_TAG = "wr-authoring-editor";

export interface EditorBridgeConfig {
  /** Origins allowed to command the bridge and receive its reports. */
  editorOrigins: string[];
  /** Inferred responsive breakpoint, for reporting the active viewport. */
  breakpoint: number;
  /** Path of the app's generated stylesheet (the theme overlay target). */
  generatedStylesPath: string;
}

function bridgeBody(config: EditorBridgeConfig): string {
  // The script body is a plain IIFE — no bundler, no modules, no imports. It
  // runs before hydration and touches nothing React owns except a stylesheet
  // <link> swap it performs only on an explicit editor command.
  return `(function () {
  var CFG = ${JSON.stringify(config)};
  var SEND_TAG = ${JSON.stringify(BRIDGE_MESSAGE_TAG)};
  var RECV_TAG = ${JSON.stringify(EDITOR_MESSAGE_TAG)};
  var V = ${BRIDGE_PROTOCOL_VERSION};
  var origins = CFG.editorOrigins || [];

  function viewportOf(el) {
    var variant = el && el.closest ? el.closest("[data-wr-viewport]") : null;
    if (variant) return variant.getAttribute("data-wr-viewport");
    return window.innerWidth < CFG.breakpoint ? "mobile" : "desktop";
  }

  function post(type, payload) {
    var message = { tag: SEND_TAG, v: V, type: type, payload: payload };
    for (var i = 0; i < origins.length; i++) {
      try { window.parent.postMessage(message, origins[i]); } catch (e) { /* closed */ }
      if (window.opener) {
        try { window.opener.postMessage(message, origins[i]); } catch (e) { /* closed */ }
      }
    }
  }

  // A mounted dynamic-template element carries data-wr-dyn-node and NO
  // data-wr-node, so its slot bindings — which are keyed on the TRIGGER's
  // nodeId — cannot be addressed from the element alone. The trigger is
  // recovered from the runtime attributes the reconstruction already emits:
  // the declared data-wr-dyn-id of the mounted region (or of its host), and
  // failing that the [data-wr-obs] trigger whose parsed entries name it.
  // Recovery is REPORTED, never guessed: dynTrigger is null when neither
  // path resolves, and the editor then shows the candidate list honestly.
  function recoverTrigger(host) {
    if (!host || !host.getAttribute || host.getAttribute("data-wr-dyn-node") === null) return null;
    var top = host;
    while (top.parentElement && top.parentElement.getAttribute &&
           top.parentElement.getAttribute("data-wr-dyn-node") !== null) {
      top = top.parentElement;
    }
    var ids = [];
    var push = function (value) { if (value && ids.indexOf(value) === -1) ids.push(value); };
    push(top.id);
    if (top.parentElement) push(top.parentElement.id);
    var scoped = top.querySelectorAll ? top.querySelectorAll("[id]") : [];
    for (var i = 0; i < scoped.length; i++) push(scoped[i].id);
    for (var j = 0; j < ids.length; j++) {
      // No escaping games: an id that is not a plain token is simply skipped,
      // so nothing unvalidated ever reaches a selector string.
      if (!safeId(ids[j])) continue;
      var declared = document.querySelector('[data-wr-dyn-id="' + ids[j] + '"]');
      if (declared && declared.getAttribute("data-wr-node")) return declared.getAttribute("data-wr-node");
    }
    var observed = document.querySelectorAll("[data-wr-obs]");
    for (var k = 0; k < observed.length; k++) {
      var raw = observed[k].getAttribute("data-wr-obs") || "";
      var entries = [];
      try { entries = JSON.parse(raw); } catch (e) { entries = []; }
      if (!entries || !entries.length) continue;
      for (var m = 0; m < entries.length; m++) {
        var entry = entries[m] || {};
        var names = [entry.hn, entry.h];
        for (var n = 0; n < names.length; n++) {
          if (!names[n]) continue;
          if (names[n] === top.getAttribute("data-wr-node") || ids.indexOf(names[n]) !== -1) {
            var trigger = observed[k].getAttribute("data-wr-node");
            if (trigger) return trigger;
          }
        }
      }
    }
    return null;
  }

  function describe(target) {
    var el = target && target.nodeType === 3 ? target.parentElement : target;
    if (!el || !el.closest) return null;
    var host = el.closest("[data-wr-node],[data-wr-dyn-node]");
    if (!host) return null;
    var variant = host.closest("[data-wr-viewport]");
    var rect = host.getBoundingClientRect();
    return {
      node: host.getAttribute("data-wr-node"),
      dynNode: host.getAttribute("data-wr-dyn-node"),
      dynTrigger: recoverTrigger(host),
      tag: host.tagName.toLowerCase(),
      text: (host.textContent || "").slice(0, 200),
      route: window.location.pathname,
      viewport: viewportOf(host),
      pageId: variant ? variant.getAttribute("data-wr-page") : null,
      routeId: variant ? variant.getAttribute("data-wr-route") : null,
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    };
  }

  // ---- highlight ---------------------------------------------------------
  var STYLE_ATTR = ${JSON.stringify(EDITOR_STYLE_ATTR)};
  var styleEl = null;
  var current = null;
  function safeId(value) {
    return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,64}$/.test(value) ? value : null;
  }
  function ensureStyle() {
    if (styleEl && styleEl.parentNode) return styleEl;
    styleEl = document.createElement("style");
    styleEl.setAttribute(STYLE_ATTR, "1");
    (document.head || document.documentElement).appendChild(styleEl);
    return styleEl;
  }
  function selectorFor(spec) {
    var dyn = safeId(spec.dynNode);
    var node = safeId(spec.node);
    if (dyn) return '[data-wr-dyn-node="' + dyn + '"]';
    if (!node) return null;
    var viewport = safeId(spec.viewport);
    return (viewport ? '[data-wr-viewport="' + viewport + '"] ' : "") + '[data-wr-node="' + node + '"]';
  }
  function highlight(spec) {
    var style = ensureStyle();
    if (!spec) { current = null; style.textContent = ""; return 0; }
    var rules = [];
    var targets = [
      { spec: spec.hover, color: "#0a84ff" },
      { spec: spec.selected, color: "#f0a000" }
    ];
    for (var i = 0; i < targets.length; i++) {
      if (!targets[i].spec) continue;
      var selector = selectorFor(targets[i].spec);
      if (!selector) continue;
      rules.push(selector + "{outline:2px solid " + targets[i].color + " !important;outline-offset:-1px !important;}");
    }
    current = spec;
    style.textContent = rules.join(" ");
    return rules.length;
  }
  /** The rect of a highlighted host, so PARENT-document chrome can follow it. */
  function geometryOf(spec) {
    if (!spec) return null;
    var selector = selectorFor(spec);
    if (!selector) return null;
    var el = null;
    try { el = document.querySelector(selector); } catch (e) { el = null; }
    if (!el) return null;
    var rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }
  var geometryPending = false;
  function postGeometry() {
    if (!current) return;
    post("geometry", {
      hover: current.hover ? geometryOf(current.hover) : null,
      selected: current.selected ? geometryOf(current.selected) : null,
      scrollY: window.scrollY,
      innerWidth: window.innerWidth
    });
  }
  function scheduleGeometry() {
    if (geometryPending || !current) return;
    geometryPending = true;
    window.requestAnimationFrame(function () { geometryPending = false; postGeometry(); });
  }
  window.addEventListener("scroll", scheduleGeometry, true);
  window.addEventListener("resize", scheduleGeometry, false);

  var lastHoverKey = "";
  document.addEventListener("mouseover", function (event) {
    var described = describe(event.target);
    if (!described) return;
    var key = described.viewport + "/" + described.node + "/" + described.dynNode;
    if (key === lastHoverKey) return;
    lastHoverKey = key;
    post("hover", described);
  }, true);

  // SELECT MODE. The default is OFF and the click listener stays passive —
  // exactly the Phase 3 behaviour. When the editor turns select mode on, a
  // click that would NAVIGATE (an anchor with an href) is preventDefault'ed so
  // the preview does not leave the route being edited. Propagation is NEVER
  // stopped: a dynamic-template menu has to open before its slots can be
  // selected at all.
  var selectMode = false;
  document.addEventListener("click", function (event) {
    var described = describe(event.target);
    if (selectMode) {
      var el = event.target && event.target.nodeType === 3 ? event.target.parentElement : event.target;
      var anchor = el && el.closest ? el.closest("a[href]") : null;
      if (anchor) event.preventDefault();
    }
    if (!described) return;
    post("click", described);
  }, true);

  function bustUrl(url, token) {
    if (!url) return url;
    var base = url.split("#")[0];
    var hash = url.length > base.length ? url.slice(base.length) : "";
    var head = base.split("?")[0];
    var query = base.indexOf("?") === -1 ? "" : base.slice(head.length + 1);
    var kept = [];
    var parts = query ? query.split("&") : [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].indexOf("wrpreview=") !== 0) kept.push(parts[i]);
    }
    kept.push("wrpreview=" + token);
    return head + "?" + kept.join("&") + hash;
  }

  function refreshStyles(token) {
    // A NEW <link> is added and the old one removed only after it loads, so
    // the page is never unstyled for a frame. React keeps its own element.
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    var swapped = 0;
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var href = link.getAttribute("href") || "";
      if (href.split("?")[0].indexOf(CFG.generatedStylesPath) === -1) continue;
      swapped++;
      (function (old) {
        var fresh = document.createElement("link");
        fresh.rel = "stylesheet";
        fresh.setAttribute("data-wr-authoring-style", "1");
        fresh.href = bustUrl(old.getAttribute("href") || "", token);
        fresh.addEventListener("load", function () {
          if (old.parentNode && old.getAttribute("data-wr-authoring-style") === "1") {
            old.parentNode.removeChild(old);
          }
          post("styles-refreshed", { token: token });
        });
        (document.head || document.documentElement).appendChild(fresh);
      })(link);
    }
    if (swapped === 0) post("styles-refreshed", { token: token, swapped: 0 });
    return swapped;
  }

  function refreshMedia(token) {
    var busted = 0;
    var images = document.querySelectorAll("img,source");
    for (var i = 0; i < images.length; i++) {
      var node = images[i];
      var attr = node.tagName.toLowerCase() === "source" ? "srcset" : "src";
      var value = node.getAttribute(attr);
      if (!value || value.indexOf("/media/") === -1) continue;
      node.setAttribute(attr, bustUrl(value, token));
      var srcset = node.getAttribute("srcset");
      if (attr === "src" && srcset && srcset.indexOf("/media/") !== -1) {
        node.setAttribute("srcset", srcset.split(",").map(function (candidate) {
          var trimmed = candidate.trim();
          var space = trimmed.indexOf(" ");
          var url = space === -1 ? trimmed : trimmed.slice(0, space);
          var rest = space === -1 ? "" : trimmed.slice(space);
          return bustUrl(url, token) + rest;
        }).join(", "));
      }
      busted++;
    }
    post("media-refreshed", { token: token, busted: busted });
    return busted;
  }

  window.addEventListener("message", function (event) {
    if (origins.indexOf(event.origin) === -1) return;
    if (event.source !== window.parent && event.source !== window.opener) return;
    var data = event.data;
    if (!data || typeof data !== "object" || data.tag !== RECV_TAG) return;
    if (data.v !== V) return;
    var token = String(data.token || Date.now());
    if (data.type === "ping") { post("pong", { echo: data.echo === undefined ? null : data.echo }); return; }
    if (data.type === "describe-selection") { post("selection", describe(document.activeElement)); return; }
    if (data.type === "refresh-styles") { refreshStyles(token); return; }
    if (data.type === "refresh-media") { refreshMedia(token); return; }
    if (data.type === "highlight") { post("highlighted", { rules: highlight(data.spec || null) }); postGeometry(); return; }
    if (data.type === "select-mode") { selectMode = data.enabled === true; post("select-mode", { enabled: selectMode }); return; }
    if (data.type === "geometry") { postGeometry(); return; }
    if (data.type === "reload") { window.location.reload(); return; }
  }, false);

  window.__wrAuthoringBridge = {
    v: V,
    describe: describe,
    highlight: highlight,
    recoverTrigger: recoverTrigger,
    refreshStyles: refreshStyles,
    refreshMedia: refreshMedia
  };
  post("ready", { route: window.location.pathname, v: V });
})();`;
}

/** The exact bytes spliced before `</head>` of every preview HTML response. */
export function renderEditorBridgeScript(config: EditorBridgeConfig): string {
  return `<script data-${BRIDGE_MARKER}="1">${bridgeBody(config)}</script>`;
}
