/**
 * The browser half of the Visual Editor: one HTML document, one stylesheet,
 * one plain-JS asset. No framework, no bundler, no dependency.
 *
 * WHY IT IS THIS THIN. `tsc --noEmit` covers `src/**\/*.ts`, and a browser
 * asset is either a `.js` file or a string emitted from TypeScript — either
 * way it is outside the type system. So EVERY DECISION lives behind the typed
 * JSON API in `server.ts`: slot inversion, inspector assembly, group
 * composition, theme validation, enablement, revisions and the AI-rewrite
 * contract are all server-side and typechecked. What is written here is
 * wiring: iframe plumbing, postMessage, one <style> rewrite inside the
 * preview, and form rendering from server-provided data.
 *
 * The 2.9 MB slot-bindings file is NEVER sent to the browser.
 */

export const EDITOR_CLIENT_CSS = `
:root{--bg:#12141a;--panel:#191c24;--line:#2b303c;--text:#e6e8ee;--muted:#98a0b3;--accent:#0a84ff;--warn:#f0a000;--bad:#ff6b6b;--ok:#3ddc97}
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:var(--bg);color:var(--text);font:13px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
button,select,input,textarea{font:inherit;color:inherit;background:#20242e;border:1px solid var(--line);border-radius:4px;padding:4px 8px}
button{cursor:pointer}
button:hover{border-color:var(--accent)}
button.on{background:var(--accent);border-color:var(--accent);color:#fff}
button.danger{border-color:var(--bad)}
#wr-app{display:flex;flex-direction:column;height:100%}
#wr-top{display:flex;gap:10px;align-items:center;padding:6px 10px;border-bottom:1px solid var(--line);background:var(--panel);flex-wrap:wrap}
#wr-top .grow{flex:1}
#wr-body{display:flex;flex:1;min-height:0}
#wr-left{width:250px;border-right:1px solid var(--line);overflow:auto;background:var(--panel)}
#wr-center{flex:1;min-width:0;overflow:auto;position:relative;background:#0b0d11}
#wr-right{width:400px;border-left:1px solid var(--line);overflow:auto;background:var(--panel)}
.sec{padding:8px 10px;border-bottom:1px solid var(--line)}
.sec h3{margin:0 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.row{display:block;width:100%;text-align:left;padding:4px 6px;border:1px solid transparent;border-radius:4px;background:none;color:var(--text)}
.row:hover{background:#232833}
.row.on{background:#243348;border-color:var(--accent)}
.row small{display:block;color:var(--muted)}
#wr-frame-wrap{transform-origin:top left}
iframe#wr-frame{border:0;background:#fff;display:block}
#wr-badge{position:fixed;z-index:50;pointer-events:none;background:var(--accent);color:#fff;font-size:11px;padding:1px 5px;border-radius:3px;white-space:nowrap;display:none}
.tabs{display:flex;gap:4px;padding:6px 8px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--panel);z-index:2}
.kv{display:grid;grid-template-columns:118px 1fr;gap:2px 8px;margin:6px 0}
.kv div:nth-child(odd){color:var(--muted)}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;word-break:break-all}
textarea{width:100%;min-height:66px;resize:vertical}
input[type=text]{width:100%}
.tag{display:inline-block;padding:0 5px;border:1px solid var(--line);border-radius:3px;color:var(--muted);font-size:11px;margin:0 4px 4px 0}
.tag.warn{color:var(--warn);border-color:var(--warn)}
.tag.ok{color:var(--ok);border-color:var(--ok)}
.tag.bad{color:var(--bad);border-color:var(--bad)}
.note{color:var(--muted);font-size:11px;margin:6px 0}
table{width:100%;border-collapse:collapse;font-size:11px}
td,th{border-top:1px solid var(--line);padding:3px 4px;text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:500}
#wr-status{font-size:11px;color:var(--muted)}
#wr-qa{padding:12px;display:none}
.actions{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
#wr-refusals{padding:0 10px}
#wr-refusals .sec{border:1px solid var(--line);border-radius:6px;padding:8px 10px;margin:8px 0;background:#1c1f28}
.wr-refusal{border-color:var(--bad) !important}
.wr-refusal h3{color:var(--bad);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.wr-refusal-message{margin:4px 0;white-space:normal}
.wr-refusal-routes{color:var(--warn)}
.wr-warning{color:var(--warn)}
.row-wrap{display:flex;gap:4px;align-items:stretch;margin-bottom:2px}
.row-wrap .row{flex:1}
.row-wrap button[data-wr-route-toggle]{font-size:11px;padding:2px 6px}
.row-off .row span{text-decoration:line-through;color:var(--muted)}
#wr-library{position:fixed;inset:0;background:rgba(6,7,10,.72);z-index:100;display:none;overflow:auto;padding:24px}
#wr-library.on{display:block}
#wr-library-inner{max-width:1040px;margin:0 auto;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:16px 20px}
#wr-library h2{margin:0 0 4px;font-size:15px}
#wr-library h3{margin:18px 0 6px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}
#wr-library-close{float:right}
#wr-library table{margin-top:6px}
#wr-library td.mono{max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wr-lib-warnings{margin:6px 0 2px;font-size:11px}
.wr-lib-warnings .wr-lib-warn-title{color:var(--bad);margin-bottom:3px}
.wr-lib-warnings .wr-lib-warn{color:var(--bad);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}
.wr-lib-adapted{color:var(--warn);font-size:10px;display:block}
.wr-create-form{display:none;background:#1c1f28;border:1px solid var(--line);border-radius:6px;padding:8px;margin:4px 0 10px}
.wr-create-form.on{display:block}
.wr-create-form textarea{min-height:44px}
.wr-create-result{font-size:11px;margin-top:6px;white-space:pre-wrap}
.wr-create-form input,.wr-create-form textarea{width:100%;margin-bottom:4px}
.wr-create-optional{margin:6px 0 2px;font-size:11px;color:var(--muted)}
.wr-draft-table{width:100%;font-size:11px;margin-top:8px}
.wr-draft-table th{text-align:left;color:var(--muted);font-weight:500}
.wr-draft-table td.num{text-align:right;font-variant-numeric:tabular-nums}
.wr-draft-table td.warn{color:#ffb454}
`;

export function editorClientHtml(title: string): string {
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    "<title>" + title + "</title>",
    '<link rel="stylesheet" href="/editor.css">',
    "</head><body>",
    '<div id="wr-app">',
    '<div id="wr-top">',
    '<label>Site <select id="wr-site"></select></label>',
    '<label>Page <select id="wr-route"></select></label>',
    '<span><button id="wr-vp-desktop" class="on">Desktop</button><button id="wr-vp-mobile">Mobile</button></span>',
    '<span><button id="wr-mode-preview" class="on">Preview</button><button id="wr-mode-qa">QA</button></span>',
    '<button id="wr-select-mode">Select mode: off</button>',
    '<button id="wr-library-open">Library</button>',
    '<span class="grow"></span>',
    '<span id="wr-status">starting…</span>',
    '<button id="wr-undo">Undo</button>',
    "</div>",
    '<div id="wr-body">',
    '<div id="wr-left"><div class="sec" id="wr-pages"></div><div class="sec" id="wr-regions"></div></div>',
    '<div id="wr-center"><div id="wr-frame-wrap"><iframe id="wr-frame" title="site preview"></iframe></div><div id="wr-qa"></div></div>',
    '<div id="wr-right"><div class="tabs">',
    '<button id="wr-tab-slot" class="on">Slot</button>',
    '<button id="wr-tab-region">Region</button>',
    '<button id="wr-tab-theme">Theme</button>',
    '<button id="wr-tab-logo">Logo</button>',
    '</div><div id="wr-refusals"></div><div id="wr-panel"></div></div>',
    "</div></div>",
    '<div id="wr-badge"></div>',
    '<div id="wr-library"><div id="wr-library-inner">',
    '<button id="wr-library-close">Close</button>',
    "<h2>Site Library</h2>",
    '<div class="note">Every release project on disk. Edit opens it in this editor.</div>',
    '<table id="wr-lib-sites"><thead><tr><th>Name</th><th>Site ID</th><th>Source template</th><th>Status</th><th>Updated</th><th>Revision</th><th></th></tr></thead><tbody></tbody></table>',
    '<div id="wr-lib-sites-warnings" class="wr-lib-warnings"></div>',
    "<h2>Template Library</h2>",
    '<div class="note">Every compiled Recon Template on disk. Create Site starts a new, independent site from one brief.</div>',
    '<table id="wr-lib-templates"><thead><tr><th>Template ID</th><th>Source host</th><th>Routes</th><th>Core-reconstruct</th><th>Structure-only</th><th>Collections</th><th>Created</th><th></th></tr></thead><tbody></tbody></table>',
    '<div id="wr-lib-templates-warnings" class="wr-lib-warnings"></div>',
    "</div></div>",
    '<script src="/editor.js"></script>',
    "</body></html>",
  ].join("\n");
}

/** The whole browser-side program. No backticks / template literals inside. */
export const EDITOR_CLIENT_JS = `
(function () {
  "use strict";
  var BRIDGE_TAG = "wr-authoring-bridge";
  var EDITOR_TAG = "wr-authoring-editor";
  var V = 1;

  var S = {
    boot: null, routes: [], route: null, pageId: null, viewport: "desktop",
    mode: "preview", tab: "slot", selectMode: false,
    previewOrigin: null, previewBase: null, breakpoint: 915,
    selection: null, inspector: null, hover: null, scale: 1,
    draft: null, draftTimer: null, regions: [], proposal: null, routeState: {}
  };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }
  function status(text, kind) {
    var n = $("wr-status");
    n.textContent = text;
    n.style.color = kind === "bad" ? "#ff6b6b" : kind === "ok" ? "#3ddc97" : "#98a0b3";
  }
  function api(path, body) {
    var opts = { headers: { "content-type": "application/json" } };
    if (body !== undefined) { opts.method = "POST"; opts.body = JSON.stringify(body); }
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data && data.error ? data.error : "HTTP " + r.status);
        return data;
      });
    });
  }
  function esc(v) { return v === null || v === undefined ? "" : String(v); }

  // ---- refusals ----------------------------------------------------------
  //
  // A REFUSAL IS NOT A TOAST. The engine refused a structural edit and wrote
  // nothing; the operator has to be able to read WHY, see which routes and
  // regions were in scope, and either take the one re-issue the engine says
  // would be safe or cancel. So refusals render into their own container
  // between the tab bar and the panel, which no panel re-render clears, and
  // they stay until the operator acts. #wr-status keeps its one-line summary,
  // but it is never the only place the reason appears.
  function clearRefusals() { $("wr-refusals").innerHTML = ""; }

  function showWarnings(list) {
    var host = $("wr-refusals");
    var box = el("div", "sec");
    box.appendChild(el("h3", null, "Warnings (" + list.length + ")"));
    list.forEach(function (w) { box.appendChild(el("p", "note wr-warning", w)); });
    host.appendChild(box);
  }

  function showRefusals(subject, views, warnings, retry) {
    var host = $("wr-refusals");
    host.innerHTML = "";
    var head = el("div", "sec");
    head.appendChild(el("h3", null, "REFUSED \u2014 " + subject + " (" + views.length + ")"));
    head.appendChild(el("p", "note", "Nothing was written: no authored decision, no revision, and the preview is unchanged."));
    host.appendChild(head);
    views.forEach(function (view) {
      var box = el("div", "sec wr-refusal");
      box.setAttribute("data-wr-refusal-code", view.code);
      box.appendChild(el("h3", null, view.code));
      box.appendChild(el("p", "wr-refusal-message", view.message));
      if (view.affectedRoutes && view.affectedRoutes.length) {
        var routes = el("p", "note wr-refusal-routes", "routes in scope: " + view.affectedRoutes.join(", "));
        routes.setAttribute("data-wr-affected-routes", view.affectedRoutes.join(","));
        box.appendChild(routes);
      }
      if (view.cascadeRegionIds && view.cascadeRegionIds.length) {
        box.appendChild(el("p", "note", "would have to be disabled with it: " + view.cascadeRegionIds.join(", ")));
      }
      var act = el("div", "actions");
      if (view.remedy && view.remedy.kind !== "none" && retry) {
        var b = el("button", null, view.remedy.label);
        b.setAttribute("data-wr-remedy", view.remedy.kind);
        b.onclick = function () { retry(view.remedy); };
        act.appendChild(b);
      } else {
        box.appendChild(el("p", "note", view.remedy ? view.remedy.label : "No re-issue can make this safe \u2014 cancel."));
      }
      var cancel = el("button", null, "Cancel");
      cancel.onclick = function () { clearRefusals(); status("cancelled \u2014 nothing was written"); };
      act.appendChild(cancel);
      box.appendChild(act);
      host.appendChild(box);
    });
    if (warnings && warnings.length) showWarnings(warnings);
  }

  /**
   * Re-fetch the preview document.
   *
   * An enablement change is STRUCTURAL: the server rewrote the preview app's
   * page trees and route table and restarted the worker behind the same proxy
   * url. The bytes in the iframe are therefore stale, and leaving them there
   * would show the operator "nothing happened" after a toggle that did.
   */
  function reloadFrame() {
    send({ type: "reload" });
    var f = $("wr-frame");
    var target = S.previewBase + (S.route || "/");
    setTimeout(function () { f.src = target; }, 50);
  }

  // ---- enablement --------------------------------------------------------
  function regionToggle(regionId, enable, remedy) {
    clearRefusals();
    status(enable ? "enabling region\u2026" : "disabling region\u2026");
    // "Disable region" means ON THE PAGE THE OPERATOR IS LOOKING AT, so the
    // route list is sent EXPLICITLY. Without it the engine is asked to disable
    // the region wherever it renders, and a request that already covers the
    // whole blast radius can never produce the shared-page refusal — the
    // operator would be given the wider edit and never told the other routes
    // were in scope. BOTH are sent and BOTH are now forwarded through the
    // adapter to the engine: the routes ARRAY is the explicit single-element
    // list rule 1 adjudicates, and the route FIELD is the intent it was
    // derived from, which is what the widening guard reads. The explicit
    // one-element list is deliberately kept alongside the field, because a
    // list that says exactly which route is harder to misread than a field
    // that silently means everywhere when it is absent.
    var body = { regionId: regionId, enabled: enable === true, route: S.route, routes: [S.route] };
    if (remedy) {
      if (remedy.scope) body.scope = remedy.scope;
      if (remedy.routes) body.routes = remedy.routes;
      if (remedy.cascadeRegionIds) body.cascadeRegionIds = remedy.cascadeRegionIds;
    }
    return api("/api/region-enablement", body).then(function (r) {
      if (r.refusals && r.refusals.length > 0) {
        showRefusals("region " + regionId, r.refusals, r.warnings, function (next) { regionToggle(regionId, enable, next); });
        status("REFUSED (" + r.refusals.length + ") \u2014 nothing was written", "bad");
        return;
      }
      status(r.reason, r.changed ? "ok" : "bad");
      if (r.warnings && r.warnings.length) showWarnings(r.warnings);
      if (r.changed) reloadFrame();
      renderRegions();
      if (S.tab === "region") renderRegionPanel();
    }).catch(function (err) { status(err.message, "bad"); });
  }

  function routeToggle(routePath, enable) {
    clearRefusals();
    status(enable ? "enabling page\u2026" : "disabling page\u2026");
    return api("/api/route-enablement", { route: routePath, enabled: enable === true }).then(function (r) {
      if (r.refusals && r.refusals.length > 0) {
        showRefusals("page " + routePath, r.refusals, r.warnings, null);
        status("REFUSED (" + r.refusals.length + ") \u2014 nothing was written", "bad");
        return refreshRoutes();
      }
      status(r.reason, r.changed ? "ok" : "bad");
      if (r.warnings && r.warnings.length) showWarnings(r.warnings);
      return refreshRoutes().then(function () {
        if (!r.changed) return;
        var current = S.routeState[S.route];
        if (current && current.enabled === false) {
          for (var i = 0; i < S.routes.length; i++) {
            var candidate = S.routeState[S.routes[i].path];
            if (!candidate || candidate.enabled !== false) { navigate(S.routes[i].path); return; }
          }
        }
        reloadFrame();
      });
    }).catch(function (err) { status(err.message, "bad"); });
  }

  function refreshRoutes() {
    return api("/api/routes").then(function (panel) {
      var next = {};
      (panel.rows || []).forEach(function (row) { next[row.path] = row; });
      S.routeState = next;
      renderPages();
    }).catch(function () { renderPages(); });
  }

  // ---- preview bridge ----------------------------------------------------
  function frameWindow() { return $("wr-frame").contentWindow; }
  function send(message) {
    var w = frameWindow();
    if (!w || !S.previewOrigin) return;
    message.tag = EDITOR_TAG; message.v = V;
    w.postMessage(message, S.previewOrigin);
  }
  function highlight() {
    var spec = null;
    if (S.hover || S.selection) {
      spec = {};
      if (S.hover) spec.hover = { node: S.hover.node, dynNode: S.hover.dynNode, viewport: S.hover.viewport };
      if (S.selection) spec.selected = { node: S.selection.node, dynNode: S.selection.dynNode, viewport: S.selection.viewport };
    }
    send({ type: "highlight", spec: spec });
  }
  function placeBadge(rect, label) {
    var badge = $("wr-badge");
    if (!rect || !label) { badge.style.display = "none"; return; }
    var frame = $("wr-frame").getBoundingClientRect();
    badge.textContent = label;
    badge.style.display = "block";
    badge.style.left = (frame.left + rect.x * S.scale) + "px";
    badge.style.top = Math.max(0, frame.top + rect.y * S.scale - 16) + "px";
  }

  window.addEventListener("message", function (event) {
    if (S.previewOrigin === null || event.origin !== S.previewOrigin) return;
    if (event.source !== frameWindow()) return;
    var data = event.data;
    if (!data || typeof data !== "object" || data.tag !== BRIDGE_TAG || data.v !== V) return;
    if (data.type === "ready") { onReady(data.payload); return; }
    if (data.type === "hover") { onHover(data.payload); return; }
    if (data.type === "click") { onClick(data.payload); return; }
    if (data.type === "geometry") { onGeometry(data.payload); return; }
  });

  function onReady(payload) {
    status("preview ready " + esc(payload && payload.route));
    if (S.selectMode) send({ type: "select-mode", enabled: true });
    highlight();
  }
  function onGeometry(payload) {
    if (!payload) return;
    var rect = payload.hover || payload.selected;
    var label = S.hover ? S.hover.label : S.selection ? S.selection.label : null;
    placeBadge(rect, label);
  }

  var hoverSeq = 0;
  function onHover(payload) {
    var seq = ++hoverSeq;
    S.hover = { node: payload.node, dynNode: payload.dynNode, viewport: payload.viewport, label: payload.tag };
    highlight();
    placeBadge(payload.rect, payload.tag);
    api("/api/resolve", {
      node: payload.node, dynNode: payload.dynNode, dynTrigger: payload.dynTrigger,
      pageId: payload.pageId, viewport: payload.viewport, route: payload.route
    }).then(function (result) {
      if (seq !== hoverSeq) return;
      var first = result.bindings && result.bindings[0];
      var label = first
        ? first.role + " · " + first.type + (result.slotKeys.length > 1 ? " (+" + (result.slotKeys.length - 1) + " more)" : "")
        : payload.tag + " · no slot";
      S.hover.label = label;
      placeBadge(payload.rect, label);
    }).catch(function () {});
  }

  function onClick(payload) {
    S.selection = { node: payload.node, dynNode: payload.dynNode, viewport: payload.viewport, label: payload.tag, pageId: payload.pageId, route: payload.route };
    highlight();
    S.tab = "slot"; syncTabs();
    api("/api/resolve", {
      node: payload.node, dynNode: payload.dynNode, dynTrigger: payload.dynTrigger,
      pageId: payload.pageId, viewport: payload.viewport, route: payload.route
    }).then(function (result) {
      S.resolve = result;
      if (result.slotKeys.length === 1) openSlot(result.slotKeys[0]);
      else renderCandidates(result, payload);
    }).catch(function (err) { status(err.message, "bad"); });
  }

  // ---- layout ------------------------------------------------------------
  function applyViewport() {
    var width = S.viewport === "mobile" ? 390 : 1440;
    var height = S.viewport === "mobile" ? 844 : 900;
    var frame = $("wr-frame");
    frame.style.width = width + "px";
    frame.style.height = Math.max(height, $("wr-center").clientHeight) + "px";
    var available = $("wr-center").clientWidth - 2;
    S.scale = Math.min(1, available / width);
    $("wr-frame-wrap").style.transform = "scale(" + S.scale + ")";
    $("wr-vp-desktop").className = S.viewport === "desktop" ? "on" : "";
    $("wr-vp-mobile").className = S.viewport === "mobile" ? "on" : "";
  }
  window.addEventListener("resize", applyViewport);

  function navigate(routePath) {
    var route = null;
    for (var i = 0; i < S.routes.length; i++) if (S.routes[i].path === routePath) route = S.routes[i];
    if (!route) return;
    S.route = route.path; S.pageId = route.pageId;
    S.selection = null; S.hover = null; S.inspector = null;
    placeBadge(null, null);
    $("wr-frame").src = S.previewBase + route.path;
    $("wr-route").value = route.path;
    renderPages(); renderRegions();
    if (S.tab !== "slot") renderPanel();
    else $("wr-panel").innerHTML = "<div class=\\"sec\\"><p class=\\"note\\">Hover the preview to see what is editable; click to open a Slot.</p></div>";
  }

  // ---- left rail ---------------------------------------------------------
  function renderPages() {
    var host = $("wr-pages");
    host.innerHTML = "";
    var off = 0;
    S.routes.forEach(function (route) {
      var state = S.routeState[route.path];
      if (state && state.enabled === false) off += 1;
    });
    host.appendChild(el("h3", null, "Pages (" + S.routes.length + (off > 0 ? ", " + off + " off" : "") + ")"));
    S.routes.forEach(function (route) {
      var state = S.routeState[route.path];
      var isOff = state ? state.enabled === false : false;
      var wrap = el("div", "row-wrap" + (isOff ? " row-off" : ""));
      wrap.setAttribute("data-wr-route", route.path);
      wrap.setAttribute("data-wr-route-enabled", isOff ? "no" : "yes");
      var b = el("button", "row" + (route.path === S.route ? " on" : ""));
      b.appendChild(el("span", null, route.path + (isOff ? "  \u2014 OFF" : "")));
      b.appendChild(el("small", null, route.pageId + " · " + (state ? String(state.source).slice(0, 46) : route.renderCoverage)));
      b.onclick = function () { navigate(route.path); };
      wrap.appendChild(b);
      var toggle = el("button", null, isOff ? "On" : "Off");
      toggle.title = isOff
        ? "turn this page back on"
        : "turn this page off: it leaves the navigation, the SEO plan, the sitemap and the export";
      toggle.setAttribute("data-wr-route-toggle", route.path);
      toggle.onclick = function () { routeToggle(route.path, isOff); };
      wrap.appendChild(toggle);
      host.appendChild(wrap);
    });
  }

  function renderRegions() {
    var host = $("wr-regions");
    host.innerHTML = "";
    host.appendChild(el("h3", null, "Regions"));
    api("/api/regions?pageId=" + encodeURIComponent(S.pageId || "") + "&viewport=" + S.viewport)
      .then(function (panel) {
        S.regions = panel.rows || [];
        if (!panel.available) { host.appendChild(el("p", "note", panel.note)); return; }
        panel.rows.forEach(function (row) {
          var b = el("button", "row");
          b.appendChild(el("span", null, row.landmarkKind + " · " + row.rootTag));
          b.appendChild(el("small", null, row.slotCount + " slots · " + row.regionId));
          b.onclick = function () { S.tab = "region"; S.regionId = row.regionId; syncTabs(); };
          host.appendChild(b);
        });
      }).catch(function (err) { host.appendChild(el("p", "note", err.message)); });
  }

  // ---- inspector ---------------------------------------------------------
  function renderCandidates(result, payload) {
    var host = $("wr-panel");
    host.innerHTML = "";
    var sec = el("div", "sec");
    sec.appendChild(el("h3", null, "This element renders " + result.slotKeys.length + " slots"));
    if (result.note) sec.appendChild(el("p", "note", result.note));
    if (result.kind === "dynamic-template") {
      sec.appendChild(el("p", "note", "dynamic template · trigger recovered: " + (result.triggerRecovered ? "yes" : "NO — every candidate is listed, none is chosen")));
    }
    result.bindings.forEach(function (binding) {
      var b = el("button", "row");
      b.appendChild(el("span", null, binding.role + " — " + binding.slotKey));
      b.appendChild(el("small", null, binding.target + (binding.attributeName ? " " + binding.attributeName : "") + " · " + binding.surface + " · " + JSON.stringify(binding.expectedValue).slice(0, 60)));
      b.onclick = function () { openSlot(binding.slotKey); };
      sec.appendChild(b);
    });
    if (result.bindings.length === 0) sec.appendChild(el("p", "note", "nothing on this element is slot-bound (" + esc(payload.tag) + ")"));
    host.appendChild(sec);
  }

  function openSlot(key) {
    api("/api/slot?key=" + encodeURIComponent(key) + "&pageId=" + encodeURIComponent(S.pageId || "") + "&viewport=" + S.viewport)
      .then(function (data) { S.inspector = data; S.draft = null; renderPanel(); })
      .catch(function (err) { status(err.message, "bad"); });
  }

  function kv(parent, key, value) {
    parent.appendChild(el("div", null, key));
    parent.appendChild(el("div", "mono", value));
  }

  function previewValue(key, value) {
    if (S.draftTimer) clearTimeout(S.draftTimer);
    S.draftTimer = setTimeout(function () {
      api("/api/preview-value", { slotKey: key, value: value })
        .then(function () {
          status("preview updated (no revision)");
          // The overlay is written; the DOCUMENT has to be re-fetched for the
          // browser to show it. This is the Phase 3 hot path, not a rebuild.
          send({ type: "reload" });
        })
        .catch(function (err) { status(err.message, "bad"); });
    }, 250);
  }

  function saveEdits(edits, summary) {
    if (S.draftTimer) { clearTimeout(S.draftTimer); S.draftTimer = null; }
    return api("/api/save", { edits: edits, summary: summary }).then(function (r) {
      status(r.changed ? "saved — revision " + r.revisionId + " (" + r.revisionCount + " total)" : "no change — nothing written, no revision", r.changed ? "ok" : undefined);
      send({ type: "reload" });
      if (S.inspector) openSlot(S.inspector.key);
      return r;
    }).catch(function (err) { status(err.message, "bad"); throw err; });
  }

  function textField(sec, slotKey, initial, label) {
    sec.appendChild(el("h3", null, label));
    var input = el("textarea");
    input.value = initial === null || initial === undefined ? "" : String(initial);
    input.oninput = function () { previewValue(slotKey, input.value); };
    sec.appendChild(input);
    return input;
  }

  function renderSlotPanel() {
    var host = $("wr-panel");
    host.innerHTML = "";
    var d = S.inspector;
    if (!d) {
      var empty = el("div", "sec");
      empty.appendChild(el("p", "note", "Click an element in the preview to open its Slot."));
      host.appendChild(empty);
      return;
    }
    var head = el("div", "sec");
    head.appendChild(el("h3", null, d.role + " · " + d.type));
    head.appendChild(el("div", "mono", d.key));
    var tags = el("div");
    tags.appendChild(el("span", "tag", "scope " + d.scope));
    tags.appendChild(el("span", "tag" + (d.editability === "review" ? " warn" : ""), d.editability));
    if (d.urlKind) tags.appendChild(el("span", "tag", "url " + d.urlKind));
    tags.appendChild(el("span", "tag" + (d.bindingTotal > 1 ? " ok" : ""), d.bindingTotal + " rendered bindings"));
    tags.appendChild(el("span", "tag", d.bindingsInView + " in this view"));
    head.appendChild(tags);
    if (d.editability === "review") {
      head.appendChild(el("p", "note", "review = the template compiler's own uncertainty about this slot. Opening or editing it records NOTHING about human approval."));
    }
    host.appendChild(head);

    // group (CTA) inspector
    if (d.group && !d.group.degraded) {
      var g = el("div", "sec");
      g.appendChild(el("h3", null, "Button group · " + d.group.groupId));
      var edits = [];
      d.group.labels.forEach(function (label, i) {
        var input = textField(g, label.slotKey, label.currentValue, "Button label" + (d.group.labels.length > 1 ? " " + (i + 1) : ""));
        edits.push(function () { return { op: "set-slot-value", slotKey: label.slotKey, value: input.value }; });
      });
      if (d.group.href) {
        var hrefInput = el("input"); hrefInput.type = "text"; hrefInput.value = String(d.group.href.currentValue);
        g.appendChild(el("h3", null, "Destination (" + esc(d.group.href.urlKind) + ")"));
        hrefInput.oninput = function () { previewValue(d.group.href.slotKey, hrefInput.value); };
        g.appendChild(hrefInput);
        edits.push(function () { return { op: "set-slot-value", slotKey: d.group.href.slotKey, value: hrefInput.value }; });
      }
      d.group.others.forEach(function (other) {
        var input = textField(g, other.slotKey, other.currentValue, other.role);
        edits.push(function () { return { op: "set-slot-value", slotKey: other.slotKey, value: input.value }; });
      });
      var act = el("div", "actions");
      var saveGroup = el("button", "on", "Save group (" + d.group.memberCount + " slots)");
      saveGroup.onclick = function () { saveEdits(edits.map(function (f) { return f(); }), "editor: group " + d.group.groupId); };
      act.appendChild(saveGroup);
      g.appendChild(act);
      g.appendChild(el("p", "note", "Saved as INDEPENDENT slots — the group is a view, not a storage unit."));
      host.appendChild(g);
    } else if (d.type === "image" && d.image) {
      host.appendChild(renderImage(d));
    } else {
      var s = el("div", "sec");
      var input = textField(s, d.key, d.currentValue, d.type === "url" ? "Destination" : "Value");
      var act2 = el("div", "actions");
      var save = el("button", "on", "Save");
      save.onclick = function () { saveEdits([{ op: "set-slot-value", slotKey: d.key, value: input.value }], "editor: " + d.key); };
      act2.appendChild(save);
      var reset = el("button", null, "Reset to default");
      reset.onclick = function () { saveEdits([{ op: "remove-slot-value", slotKey: d.key }], "editor: reset " + d.key); };
      act2.appendChild(reset);
      var ai = el("button", null, "Rewrite with AI");
      ai.onclick = function () { rewrite({ kind: "slot", slotKey: d.key }); };
      act2.appendChild(ai);
      s.appendChild(act2);
      if (d.group && d.group.degraded) s.appendChild(el("p", "note", "groupId " + d.group.groupId + " has a single member — no group form to show."));
      host.appendChild(s);
    }

    var meta = el("div", "sec");
    meta.appendChild(el("h3", null, "Facts"));
    var grid = el("div", "kv");
    kv(grid, "default", JSON.stringify(d.defaultValue).slice(0, 200));
    kv(grid, "route / page", esc(d.route) + " / " + esc(d.pageId));
    kv(grid, "bindings", JSON.stringify(d.bindingsBySurface) + " " + JSON.stringify(d.bindingsByViewport));
    kv(grid, "pages bound", String(Object.keys(d.bindingsByPage).length));
    if (d.constraints) kv(grid, "constraints", JSON.stringify(d.constraints));
    if (d.accounting) {
      kv(grid, "origin", d.accounting.origin);
      kv(grid, "disposition", d.accounting.disposition);
      kv(grid, "customer-facing", d.accounting.customerFacing);
      kv(grid, "detail", d.accounting.detail);
    }
    meta.appendChild(grid);
    if (!d.accountingAvailable) meta.appendChild(el("p", "note", "no slot accounting on this project's content run — origin/disposition are unavailable, not empty."));
    meta.appendChild(el("p", "note", "Not available anywhere in the artifacts: " + d.fieldsNotAvailable.join("; ")));
    host.appendChild(meta);

    var bind = el("div", "sec");
    bind.appendChild(el("h3", null, "Rendered bindings (" + d.bindingTotal + ")"));
    var table = el("table");
    var head2 = el("tr");
    ["page", "vp", "surface", "node", "target"].forEach(function (h) { head2.appendChild(el("th", null, h)); });
    table.appendChild(head2);
    d.bindings.slice(0, 40).forEach(function (b) {
      var tr = el("tr");
      tr.appendChild(el("td", null, b.pageId));
      tr.appendChild(el("td", null, b.viewport));
      tr.appendChild(el("td", null, b.surface));
      tr.appendChild(el("td", "mono", b.nodeId + (b.templateNodeId ? "/" + b.templateNodeId : "")));
      tr.appendChild(el("td", null, b.target + (b.attributeName ? " " + b.attributeName : "") + (b.inCurrentView ? " ●" : "")));
      table.appendChild(tr);
    });
    bind.appendChild(table);
    bind.appendChild(el("p", "note", "One edit writes EVERY row above — desktop, mobile, dynamic portal and paint twin alike."));
    host.appendChild(bind);

    if (S.proposal) host.appendChild(renderProposal());
  }

  function renderImage(d) {
    var s = el("div", "sec");
    s.appendChild(el("h3", null, "Image"));
    var img = document.createElement("img");
    img.style.maxWidth = "100%";
    img.style.border = "1px solid #2b303c";
    img.src = d.image.mediaNames.length ? S.previewBase + "/media/" + d.image.mediaNames[0] : d.image.src;
    s.appendChild(img);
    var grid = el("div", "kv");
    kv(grid, "source url", d.image.src);
    kv(grid, "assetId", d.image.asset ? d.image.asset.assetId : "UNJOINED");
    kv(grid, "asset status", d.image.asset ? d.image.asset.status + " · " + esc(d.image.asset.mime) + " · " + esc(d.image.asset.size) + "B" : "unknown");
    kv(grid, "served at", d.image.mediaNames.join(", ") || "(none)");
    kv(grid, "authored", d.image.authoredAsset ? d.image.authoredAsset.file : "(none)");
    s.appendChild(grid);
    s.appendChild(el("p", "note", d.image.note));
    var file = el("input"); file.type = "text"; file.placeholder = "replacement file path on this machine";
    s.appendChild(el("h3", null, "Replacement file"));
    s.appendChild(file);
    var alt = el("input"); alt.type = "text"; alt.value = esc(d.image.alt);
    s.appendChild(el("h3", null, "Alt text"));
    s.appendChild(alt);
    var act = el("div", "actions");
    var save = el("button", "on", "Replace image");
    save.onclick = function () {
      api("/api/asset", { slotKey: d.key, file: file.value, alt: alt.value })
        .then(function (r) {
          status(r.changed ? "asset saved — revision " + r.revisionId : "no change — nothing written", r.changed ? "ok" : undefined);
          send({ type: "refresh-media", token: String(Date.now()) });
          openSlot(d.key);
        }).catch(function (err) { status(err.message, "bad"); });
    };
    act.appendChild(save);
    s.appendChild(act);
    return s;
  }

  // ---- other panels ------------------------------------------------------
  function renderRegionPanel() {
    var host = $("wr-panel");
    host.innerHTML = "";
    api("/api/regions?pageId=" + encodeURIComponent(S.pageId || "") + "&viewport=" + S.viewport).then(function (panel) {
      var sec = el("div", "sec");
      sec.appendChild(el("h3", null, "PageRegions on " + esc(S.route)));
      if (!panel.available) { sec.appendChild(el("p", "note", panel.note)); host.appendChild(sec); return; }
      sec.appendChild(el("p", "note", panel.note));
      sec.appendChild(el("p", "note", panel.enablementWired ? "enablement port: WIRED" : "enablement toggle NOT wired — " + panel.enablementSeam));
      host.appendChild(sec);
      panel.rows.forEach(function (row) {
        var r = el("div", "sec");
        r.appendChild(el("h3", null, row.landmarkKind + " · " + row.rootTag + (S.regionId === row.regionId ? " (selected)" : "")));
        var grid = el("div", "kv");
        kv(grid, "regionId", row.regionId);
        kv(grid, "scope", row.scope + " (" + row.scopeKey + ")");
        kv(grid, "routes here", row.routesOnThisPage.join(", "));
        kv(grid, "shared pages", row.pages.join(", ") + (row.sharedAcrossPages ? " (SHARED)" : ""));
        kv(grid, "slots", String(row.slotCount));
        kv(grid, "bindings", row.bindingCount + " (" + row.dynamicTemplateBindingCount + " dynamic)");
        kv(grid, "nodes", row.occurrences.map(function (o) { return o.viewport + ":" + o.nodeId; }).join(" "));
        kv(grid, "enabled", row.enablement.enabled === null ? "UNKNOWN" : row.enablement.enabled ? "yes" : "no");
        kv(grid, "source", row.enablement.source);
        (row.enablement.refusals || []).forEach(function (view) {
          var line = el("p", "note wr-warning", "REFUSED " + view.code + ": " + view.message);
          line.setAttribute("data-wr-refusal-code", view.code);
          r.appendChild(line);
        });
        r.appendChild(grid);
        var act = el("div", "actions");
        var isOff = row.enablement.enabled === false;
        var toggle = el("button", null, isOff ? "Enable region" : "Disable region on this page");
        toggle.disabled = !row.enablement.editable;
        toggle.setAttribute("data-wr-region-toggle", row.regionId);
        toggle.title = isOff
          ? "record this region as enabled again"
          : "delete this section from the page you are looking at \u2014 the engine refuses and explains when that is not possible";
        toggle.onclick = function () { regionToggle(row.regionId, isOff, null); };
        act.appendChild(toggle);
        var ai = el("button", null, "Rewrite region with AI");
        ai.onclick = function () { rewrite({ kind: "region", regionId: row.regionId }); };
        act.appendChild(ai);
        r.appendChild(act);
        host.appendChild(r);
      });
    }).catch(function (err) { host.appendChild(el("p", "note", err.message)); });
  }

  function renderThemePanel() {
    var host = $("wr-panel");
    host.innerHTML = "";
    api("/api/theme").then(function (panel) {
      var sec = el("div", "sec");
      sec.appendChild(el("h3", null, "Theme · " + esc(panel.baseThemeName)));
      sec.appendChild(el("p", "note", panel.note));
      if (!panel.available) { host.appendChild(sec); return; }
      var pick = el("select");
      var none = el("option", null, "(keep current base theme)"); none.value = ""; pick.appendChild(none);
      panel.library.forEach(function (entry) {
        var o = el("option", null, entry.name + " (" + entry.mode + ")"); o.value = entry.file; pick.appendChild(o);
      });
      sec.appendChild(pick);
      host.appendChild(sec);

      var pending = {};
      var t = el("div", "sec");
      t.appendChild(el("h3", null, "theme-contract-v1 tokens"));
      panel.tokens.forEach(function (token) {
        var wrap = el("div", "kv");
        wrap.appendChild(el("div", null, token.id));
        var input = el("input"); input.type = "text";
        input.value = token.authoredValue || "";
        input.placeholder = token.baseValue || token.originalValue || "(unset)";
        input.oninput = function () {
          pending[token.id] = input.value;
          if (S.draftTimer) clearTimeout(S.draftTimer);
          S.draftTimer = setTimeout(function () {
            api("/api/theme/preview", { tokens: pending }).then(function (r) {
              if (r.rejected.length) status("rejected: " + r.rejected.map(function (x) { return x.token + " (" + x.reason + ")"; }).join(", "), "bad");
              else { status("theme preview updated (no revision)"); send({ type: "refresh-styles", token: String(Date.now()) }); }
            }).catch(function (err) { status(err.message, "bad"); });
          }, 250);
        };
        wrap.appendChild(input);
        t.appendChild(wrap);
        var meta = el("p", "note", token.kind + " L" + token.level + " · site original " + esc(token.originalValue) + " · " + token.boundGroupCount + " paint groups" + (token.boundGroupCount === 0 ? " (editing this shows nothing on this site)" : ""));
        t.appendChild(meta);
      });
      var act = el("div", "actions");
      var save = el("button", "on", "Save theme");
      save.onclick = function () {
        api("/api/theme/save", { tokens: pending, themeSourceFile: pick.value || undefined }).then(function (r) {
          status(r.changed ? "theme saved — revision " + r.revisionId : "no change — nothing written, no revision", r.changed ? "ok" : undefined);
        }).catch(function (err) { status(err.message, "bad"); });
      };
      act.appendChild(save);
      t.appendChild(act);
      host.appendChild(t);
    }).catch(function (err) { host.appendChild(el("p", "note", err.message)); });
  }

  function renderLogoPanel() {
    var host = $("wr-panel");
    host.innerHTML = "";
    host.appendChild(el("p", "note", "scanning brand surfaces…"));
    api("/api/brand").then(function (panel) {
      host.innerHTML = "";
      var sec = el("div", "sec");
      sec.appendChild(el("h3", null, "Source brand surfaces"));
      sec.appendChild(el("p", "note", panel.note));
      if (!panel.available) { host.appendChild(sec); return; }
      sec.appendChild(el("div", "mono", "tokens: " + panel.brandTokens.join(", ")));
      sec.appendChild(el("div", "mono", "counts: " + JSON.stringify(panel.counts)));
      host.appendChild(sec);
      panel.rows.slice(0, 60).forEach(function (row) {
        var r = el("div", "sec");
        r.appendChild(el("h3", null, row.surface + (row.resolvable ? "" : " (NOT resolvable)")));
        var grid = el("div", "kv");
        kv(grid, "surfaceId", row.surfaceId);
        kv(grid, "route / node", row.route + " / " + esc(row.nodeId));
        kv(grid, "value", row.value.slice(0, 120));
        kv(grid, "decision", row.decision ? row.decision.decision : "(none)");
        r.appendChild(grid);
        if (!row.resolvable) { host.appendChild(r); return; }
        var replacement = el("input"); replacement.type = "text";
        replacement.placeholder = row.surface === "aria-label" || row.surface === "image-alt" ? "replacement TEXT" : "replacement asset FILE path";
        r.appendChild(replacement);
        var reason = el("input"); reason.type = "text"; reason.placeholder = "reason (required for PRESERVE)";
        r.appendChild(reason);
        var act = el("div", "actions");
        ["REPLACE", "REMOVE", "PRESERVE"].forEach(function (kind) {
          var b = el("button", kind === "PRESERVE" ? "danger" : null, kind);
          b.onclick = function () {
            var body = { surfaceId: row.surfaceId, decision: kind };
            if (kind === "REPLACE") {
              body.replacement = (row.surface === "aria-label" || row.surface === "image-alt")
                ? { text: replacement.value } : { file: replacement.value };
            }
            if (kind === "PRESERVE") body.reason = reason.value;
            api("/api/brand", body)
              .then(function (r2) { status(r2.changed ? "brand decision saved — revision " + r2.revisionId : "no change — nothing written", r2.changed ? "ok" : undefined); renderLogoPanel(); })
              .catch(function (err) { status(err.message, "bad"); });
          };
          act.appendChild(b);
        });
        r.appendChild(act);
        host.appendChild(r);
      });
    }).catch(function (err) { host.innerHTML = ""; host.appendChild(el("p", "note", err.message)); });
  }

  // ---- AI rewrite --------------------------------------------------------
  function rewrite(scope) {
    status("building rewrite request…");
    api("/api/ai-rewrite", { scope: scope, route: S.route, provider: "fake" })
      .then(function (proposal) { S.proposal = proposal; S.tab = "slot"; syncTabs(); status("proposal ready — nothing written"); })
      .catch(function (err) { status(err.message, "bad"); });
  }

  function renderProposal() {
    var p = S.proposal;
    var s = el("div", "sec");
    s.appendChild(el("h3", null, "AI rewrite proposal · " + p.provider));
    s.appendChild(el("p", "note", p.note));
    var grid = el("div", "kv");
    kv(grid, "brief source", p.context.brief.source);
    kv(grid, "site plan", p.context.sitePlanSource);
    kv(grid, "route", esc(p.context.route));
    kv(grid, "region", p.context.region ? p.context.region.regionId : "(slot scope)");
    kv(grid, "content units", String(p.context.units.length));
    kv(grid, "slots in scope", String(p.context.slotKeysInScope.length));
    kv(grid, "constraints sent", String(p.context.constraintsIncluded));
    kv(grid, "out of scope keys", String(p.outOfScope.length));
    s.appendChild(grid);
    var table = el("table");
    var head = el("tr"); ["slot", "proposed", "source"].forEach(function (h) { head.appendChild(el("th", null, h)); });
    table.appendChild(head);
    var keys = Object.keys(p.proposed);
    keys.forEach(function (key) {
      var tr = el("tr");
      tr.appendChild(el("td", "mono", key));
      tr.appendChild(el("td", null, String(p.proposed[key]).slice(0, 90)));
      tr.appendChild(el("td", null, esc(p.sources[key])));
      table.appendChild(tr);
    });
    s.appendChild(table);
    if (p.unresolved.length) {
      s.appendChild(el("p", "note", "needs input (NOT filled in): " + p.unresolved.map(function (u) { return u.slotKey + " — " + u.reason; }).join("; ")));
    }
    var act = el("div", "actions");
    var apply = el("button", "on", "Apply " + keys.length + " values");
    apply.onclick = function () {
      var edits = keys.map(function (key) { return { op: "set-slot-value", slotKey: key, value: p.proposed[key] }; });
      saveEdits(edits, "editor: AI rewrite (" + p.provider + ")").then(function () { S.proposal = null; renderPanel(); });
    };
    act.appendChild(apply);
    var drop = el("button", null, "Discard");
    drop.onclick = function () { S.proposal = null; renderPanel(); };
    act.appendChild(drop);
    s.appendChild(act);
    return s;
  }

  // ---- QA ----------------------------------------------------------------
  function renderQa() {
    var host = $("wr-qa");
    host.innerHTML = "";
    api("/api/qa").then(function (qa) {
      host.appendChild(el("h3", null, "Release state: " + qa.releaseState));
      var grid = el("div", "kv");
      if (qa.requirements) {
        kv(grid, "requirements", qa.requirements.total + " total · " + qa.requirements.unresolved + " unresolved · " + qa.requirements.blocking + " release-blocking");
      } else kv(grid, "requirements", "(no requirements file)");
      if (qa.accounting) {
        kv(grid, "slot accounting", qa.accounting.entries + " entries");
        kv(grid, "by origin", JSON.stringify(qa.accounting.byOrigin));
        kv(grid, "by disposition", JSON.stringify(qa.accounting.byDisposition));
      } else kv(grid, "slot accounting", "(no content run accounting)");
      Object.keys(qa.lineage).forEach(function (k) { kv(grid, k, qa.lineage[k]); });
      host.appendChild(grid);
      host.appendChild(el("h3", null, "Limitations (" + qa.limitations.length + ")"));
      qa.limitations.forEach(function (l) { host.appendChild(el("p", "note", l)); });
      host.appendChild(el("h3", null, "Warnings (" + qa.warnings.length + ")"));
      qa.warnings.forEach(function (w) { host.appendChild(el("p", "note", w)); });
    }).catch(function (err) { host.appendChild(el("p", "note", err.message)); });
  }

  // ---- chrome ------------------------------------------------------------
  function syncTabs() {
    ["slot", "region", "theme", "logo"].forEach(function (name) {
      $("wr-tab-" + name).className = S.tab === name ? "on" : "";
    });
    renderPanel();
  }
  function renderPanel() {
    if (S.tab === "slot") renderSlotPanel();
    else if (S.tab === "region") renderRegionPanel();
    else if (S.tab === "theme") renderThemePanel();
    else renderLogoPanel();
  }
  function setMode(mode) {
    S.mode = mode;
    $("wr-mode-preview").className = mode === "preview" ? "on" : "";
    $("wr-mode-qa").className = mode === "qa" ? "on" : "";
    $("wr-frame-wrap").style.display = mode === "preview" ? "block" : "none";
    $("wr-qa").style.display = mode === "qa" ? "block" : "none";
    if (mode === "qa") renderQa();
  }

  function boot(data) {
    S.boot = data;
    S.routes = data.routes;
    S.previewBase = data.previewBaseUrl;
    S.previewOrigin = new URL(data.previewBaseUrl).origin;
    S.breakpoint = data.breakpoint;
    var siteSelect = $("wr-site");
    siteSelect.innerHTML = "";
    data.sites.forEach(function (site) {
      var o = el("option", null, site.name + "  [" + site.siteKey + "]");
      o.value = site.projectDir;
      if (site.siteKey === data.site.siteKey) o.selected = true;
      siteSelect.appendChild(o);
    });
    siteSelect.onchange = function () {
      status("opening site…");
      api("/api/select-site", { projectDir: siteSelect.value }).then(function (next) { boot(next); }).catch(function (err) { status(err.message, "bad"); });
    };
    var routeSelect = $("wr-route");
    routeSelect.innerHTML = "";
    data.routes.forEach(function (route) {
      var o = el("option", null, route.path + "  —  " + route.title);
      o.value = route.path;
      routeSelect.appendChild(o);
    });
    routeSelect.onchange = function () { navigate(routeSelect.value); };
    document.title = data.site.displayName + " — Visual Editor";
    applyViewport();
    navigate(data.routes[0].path);
    status("site " + data.site.siteKey + " · template " + data.site.templateId + " · " + data.site.slotCount + " slots / " + data.site.bindingCount + " bindings");
  }

  $("wr-vp-desktop").onclick = function () { S.viewport = "desktop"; applyViewport(); renderRegions(); if (S.inspector) openSlot(S.inspector.key); };
  $("wr-vp-mobile").onclick = function () { S.viewport = "mobile"; applyViewport(); renderRegions(); if (S.inspector) openSlot(S.inspector.key); };
  $("wr-mode-preview").onclick = function () { setMode("preview"); };
  $("wr-mode-qa").onclick = function () { setMode("qa"); };
  $("wr-tab-slot").onclick = function () { S.tab = "slot"; syncTabs(); };
  $("wr-tab-region").onclick = function () { S.tab = "region"; syncTabs(); };
  $("wr-tab-theme").onclick = function () { S.tab = "theme"; syncTabs(); };
  $("wr-tab-logo").onclick = function () { S.tab = "logo"; syncTabs(); };
  $("wr-select-mode").onclick = function () {
    S.selectMode = !S.selectMode;
    $("wr-select-mode").textContent = "Select mode: " + (S.selectMode ? "on" : "off");
    $("wr-select-mode").className = S.selectMode ? "on" : "";
    send({ type: "select-mode", enabled: S.selectMode });
  };
  $("wr-undo").onclick = function () {
    api("/api/undo", {}).then(function (r) {
      status(r.reason, r.undone ? "ok" : "bad");
      if (!r.undone) return;
      // AN UNDO RESTORES THE WHOLE AUTHORED STATE, ENABLEMENT INCLUDED, so
      // every surface rendered from a cached copy of that state has to be
      // re-read from the server. Reloading only the iframe left the Pages rail
      // still saying OFF for a route the undo had just brought back: the
      // preview told the truth and the rail beside it did not, and the next
      // click on that rail acted on the stale reading. The iframe reload is
      // the structural one (the worker was restarted behind the same proxy
      // url), not a bare postMessage.
      reloadFrame();
      if (S.inspector) openSlot(S.inspector.key);
      refreshRoutes();
      renderRegions();
      if (S.tab === "region") renderRegionPanel();
    }).catch(function (err) { status(err.message, "bad"); });
  };

  // ---- Library: Template Library + Site Library, Create Site (Task 28 Phase 8) --
  function fmtDate(iso) {
    if (!iso) return "—";
    return String(iso).replace("T", " ").replace(/\\.\\d+Z$/, "Z");
  }
  // A scan warning means an artifact on disk could NOT be read and is therefore
  // MISSING from the table above it. The registry's doctrine is "never a silent
  // drop"; the screen has to hold that line too, so every warning both endpoints
  // return is rendered, and a clean scan says so explicitly rather than saying
  // nothing (which is what a swallowed warning also looks like).
  function renderLibraryWarnings(hostId, warnings, subject) {
    var host = $(hostId);
    host.innerHTML = "";
    var list = warnings || [];
    if (list.length === 0) {
      host.appendChild(el("div", "note", subject + ": 0 scan warnings — every artifact found on disk was read and is listed above."));
      return;
    }
    host.appendChild(el("div", "wr-lib-warn-title", subject + ": " + list.length + " artifact(s) on disk could NOT be indexed and are therefore MISSING from the table above."));
    list.forEach(function (w) { host.appendChild(el("div", "wr-lib-warn", w)); });
  }
  function renderSiteLibrary(sites, warnings) {
    var body = $("wr-lib-sites").querySelector("tbody");
    body.innerHTML = "";
    sites.forEach(function (site) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", null, site.name));
      // A pre-Task-27 document carries NO siteId and NO projectRevision: what
      // is shown for those rows is src/release/instance.ts adaptReleaseProject's
      // in-memory upgrade (siteId derived from the host, revision reported as
      // the current one). The payload already says so via adaptedFromRevision,
      // so the screen states it instead of printing an on-disk-looking value.
      var idCell = el("td", "mono", site.siteId);
      if (site.adaptedFromRevision) {
        idCell.appendChild(el("span", "wr-lib-adapted", "adapted — this r" + site.adaptedFromRevision + " document has no siteId on disk; derived from the host"));
      }
      tr.appendChild(idCell);
      tr.appendChild(el("td", "mono", site.templateLineage.templateId));
      tr.appendChild(el("td", null, site.releaseState));
      tr.appendChild(el("td", null, fmtDate(site.updatedAt)));
      // Two different revisions exist and conflating them would misreport a
      // fresh site: projectRevision is the project DOCUMENT revision (a new
      // site is at r1); revision is the authored revision CHAIN, which a site
      // nobody has edited yet legitimately has none of.
      var revCell = el("td", null, "doc r" + site.projectRevision + (site.revision ? (" · chain r" + site.revision.revisionCount + " (" + site.revision.origin + ")") : " · chain none"));
      if (site.adaptedFromRevision) {
        revCell.appendChild(el("span", "wr-lib-adapted", "read as r" + site.projectRevision + " in memory; the file on disk is at r" + site.adaptedFromRevision + " and was not rewritten"));
      }
      tr.appendChild(revCell);
      var editTd = document.createElement("td");
      var editBtn = el("button", null, "Edit");
      editBtn.onclick = function () {
        closeLibrary();
        status("opening site…");
        api("/api/select-site", { projectDir: site.projectDir }).then(function (next) { boot(next); }).catch(function (err) { status(err.message, "bad"); });
      };
      editTd.appendChild(editBtn);
      tr.appendChild(editTd);
      body.appendChild(tr);
    });
    if (sites.length === 0) {
      var empty = document.createElement("tr");
      var td = el("td", "note", "no release projects on disk");
      td.colSpan = 7;
      empty.appendChild(td);
      body.appendChild(empty);
    }
    renderLibraryWarnings("wr-lib-sites-warnings", warnings, "Site Library scan");
  }
  var CREATE_PLACEHOLDER = {
    name: "working name (optional)",
    category: "category (optional)",
    audience: "audience (optional)",
    positioning: "positioning (optional)",
    conversion: "primary conversion — what a visitor should do (optional)",
    tone: "tone, comma separated (optional)"
  };
  function fieldValue(form, field) {
    var node = form.querySelector(".wr-create-" + field);
    return node ? node.value.trim() : "";
  }
  // "kind | value" per line -> ProvidedFact[]. A line without a | is skipped.
  function parseFacts(text) {
    var facts = [];
    String(text || "").split("\\n").forEach(function (line) {
      var at = line.indexOf("|");
      if (at === -1) return;
      var kind = line.slice(0, at).trim();
      var value = line.slice(at + 1).trim();
      if (kind && value) facts.push({ kind: kind, value: value });
    });
    return facts;
  }
  function renderFirstDraft(container, draft) {
    var table = document.createElement("table");
    table.className = "wr-draft-table";
    var head = document.createElement("tr");
    ["route", "in scope", "filled", "changed", "needs input"].forEach(function (label) {
      head.appendChild(el("th", null, label));
    });
    var thead = document.createElement("thead");
    thead.appendChild(head);
    table.appendChild(thead);
    var body = document.createElement("tbody");
    draft.rows.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "mono", row.route));
      tr.appendChild(el("td", "num", row.inScopeSlots));
      tr.appendChild(el("td", "num", row.filledSlots));
      tr.appendChild(el("td", "num", row.changedSlots));
      tr.appendChild(el("td", row.unresolvedSlots > 0 ? "num warn" : "num", row.unresolvedSlots));
      body.appendChild(tr);
    });
    (draft.structureOnlyRoutes || []).forEach(function (route) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "mono", route));
      var td = el("td", "note", "structure-only — reconstructed, never given generated content");
      td.colSpan = 4;
      tr.appendChild(td);
      body.appendChild(tr);
    });
    table.appendChild(body);
    container.appendChild(table);
  }
  function submitCreateSite(template, form) {
    var resultEl = form.querySelector(".wr-create-result");
    var goal = form.querySelector(".wr-create-goal").value.trim();
    if (!goal) { resultEl.textContent = "a goal is required"; resultEl.style.color = "#ff6b6b"; return; }
    var name = fieldValue(form, "name");
    var tone = fieldValue(form, "tone");
    var brief = { goal: goal };
    if (name) brief.workingName = name;
    if (fieldValue(form, "category")) brief.category = fieldValue(form, "category");
    if (fieldValue(form, "audience")) brief.audience = fieldValue(form, "audience");
    if (fieldValue(form, "positioning")) brief.positioning = fieldValue(form, "positioning");
    if (fieldValue(form, "conversion")) brief.primaryConversion = fieldValue(form, "conversion");
    if (tone) brief.tone = tone.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
    var facts = parseFacts(form.querySelector(".wr-create-facts").value);
    if (facts.length > 0) brief.facts = facts;
    resultEl.style.color = "#98a0b3";
    resultEl.textContent = "creating site — one brief is now running full-site content generation and a production compile. This takes a while.";
    var payload = { templateManifestFile: template.templateDir + "/manifest.json", brief: brief };
    if (name) payload.displayName = name;
    api("/api/create-site", payload).then(function (r) {
      // The whole receipt, kept on the editor state object the app already
      // exposes, so what the operator was shown can be read back rather than
      // re-parsed out of the rendered text.
      S.lastCreate = r;
      resultEl.style.color = "#3ddc97";
      resultEl.textContent =
        (r.reprepared ? "re-prepared existing site " : "created ") + r.siteKey + " (" + r.releaseState + ") in " + Math.round(r.elapsedMs / 1000) + "s — writer " + r.contentProvider +
        ". routes: " + r.routeScope.included + " generated / " + r.routeScope.excludedStructureOnly + " structure-only. " +
        "draft: " + r.firstDraft.totals.filledSlots + " of " + r.firstDraft.totals.inScopeSlots + " slots filled, " +
        r.firstDraft.totals.changedSlots + " changed, " + r.firstDraft.totals.unresolvedSlots + " needs input. " +
        "cross-page review: " + (r.consistency.pass ? "pass" : r.consistency.errors + " error(s)") +
        ". template unmutated: " + r.templateUnmutated + ".";
      // Identity, stated. A brief-only create is named from the brief, never
      // from the source host, and a name already in use is reported as
      // stepped past rather than silently re-preparing another site.
      resultEl.appendChild(el("div", "note",
        "site id " + r.siteId + " (from the " + r.siteIdSource + ")" +
        (r.siteIdDisambiguation > 0
          ? " — the name " + r.siteIdBase + " was already in use by " + r.siteIdDisambiguation + " project(s) on disk, so this site was given its own id instead of re-preparing one of them"
          : "")));
      renderFirstDraft(resultEl, r.firstDraft);
      if (r.briefGaps && r.briefGaps.length > 0) {
        resultEl.appendChild(el("div", "note", "brief gaps (reported, never blocking): " + r.briefGaps.map(function (g) { return g.field; }).join(", ")));
      }
      var open = el("button", null, "Edit this site");
      open.className = "wr-create-open";
      open.onclick = function () {
        closeLibrary();
        status("opening the new site…");
        api("/api/select-site", { projectDir: r.projectDir }).then(function (next) { boot(next); }).catch(function (err) { status(err.message, "bad"); });
      };
      resultEl.appendChild(open);
      // ONLY the Site Library is refreshed. Re-rendering the Template Library
      // rebuilds its rows from scratch, which would destroy the very form this
      // result — and the Edit button just added to it — lives inside.
      api("/api/sites").then(function (res) { renderSiteLibrary(res.sites, res.warnings); }).catch(function () {});
    }).catch(function (err) {
      resultEl.style.color = "#ff6b6b";
      resultEl.textContent = err.message;
    });
  }
  function renderTemplateLibrary(templates, warnings) {
    var body = $("wr-lib-templates").querySelector("tbody");
    body.innerHTML = "";
    templates.forEach(function (t) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "mono", t.templateId));
      tr.appendChild(el("td", null, t.host));
      tr.appendChild(el("td", null, t.routeCount));
      tr.appendChild(el("td", null, t.slotizedRouteCount));
      tr.appendChild(el("td", null, t.structureOnlyRouteCount));
      tr.appendChild(el("td", null, t.collections.length));
      tr.appendChild(el("td", null, fmtDate(t.createdAt)));
      var actionTd = document.createElement("td");
      var createBtn = el("button", null, "Create Site");
      var form = el("div", "wr-create-form");
      var goal = document.createElement("textarea");
      goal.className = "wr-create-goal";
      goal.placeholder = "One brief: what is this site for? (the ONLY required field)";
      form.appendChild(goal);
      form.appendChild(el("div", "wr-create-optional", "Everything below is optional. What you leave out is reported as a gap with its consequence — it never blocks the draft."));
      ["name", "category", "audience", "positioning", "conversion", "tone"].forEach(function (field) {
        var input = document.createElement("input");
        input.type = "text";
        input.className = "wr-create-" + field;
        input.placeholder = CREATE_PLACEHOLDER[field];
        form.appendChild(input);
      });
      var facts = document.createElement("textarea");
      facts.className = "wr-create-facts";
      facts.placeholder = "facts, one per line as  kind | value  (module, capability, outcome, segment, integration, proof, external-link, figure, page). Anything you do not supply is never invented \u2014 a 'figure' fact states a price, plan limit, statistic or compliance claim for a slot the source site fills with one of its own.";
      form.appendChild(facts);
      var go = el("button", null, "Create");
      var result = el("div", "wr-create-result");
      form.appendChild(go);
      form.appendChild(result);
      createBtn.onclick = function () { form.className = form.className.indexOf("on") === -1 ? "wr-create-form on" : "wr-create-form"; };
      go.onclick = function () { submitCreateSite(t, form); };
      actionTd.appendChild(createBtn);
      actionTd.appendChild(form);
      tr.appendChild(actionTd);
      body.appendChild(tr);
    });
    if (templates.length === 0) {
      var empty = document.createElement("tr");
      var td = el("td", "note", "no templates on disk");
      td.colSpan = 8;
      empty.appendChild(td);
      body.appendChild(empty);
    }
    renderLibraryWarnings("wr-lib-templates-warnings", warnings, "Template Library scan");
  }
  function loadLibrary() {
    api("/api/sites").then(function (r) { renderSiteLibrary(r.sites, r.warnings); }).catch(function (err) { status(err.message, "bad"); });
    api("/api/templates").then(function (r) { renderTemplateLibrary(r.templates, r.warnings); }).catch(function (err) { status(err.message, "bad"); });
  }
  function closeLibrary() { $("wr-library").className = ""; }
  $("wr-library-open").onclick = function () { $("wr-library").className = "on"; loadLibrary(); };
  $("wr-library-close").onclick = closeLibrary;

  api("/api/bootstrap").then(boot).catch(function (err) { status(err.message, "bad"); });
  window.__wrEditor = S;
})();
`;
