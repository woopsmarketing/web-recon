import type {
  MatchStatus,
  MeasureArgs,
  NodeReading,
  PageReading,
  SourceRef,
  StylesheetScan,
  VariantId,
} from "./types.js";

/**
 * Browser-side functions. Every function here is passed to `page.evaluate`, so
 * each body is SELF-CONTAINED: no imports, no module-level helpers, no
 * closures over Node values. The tsx `__name` shim is installed by the session
 * (addInitScript) before any of these run. Source and clone are measured by
 * the SAME function; `mode` only changes how an element is found.
 */

/** Readable @media / @container conditions of every stylesheet, recursively. */
export function scanStylesheetsInPage(): StylesheetScan {
  const seen = new Set<string>();
  const conditions: Array<{ kind: "media" | "container"; text: string }> = [];
  let sheets = 0;
  let unreadableSheets = 0;
  const push = (kind: "media" | "container", text: string | undefined | null): void => {
    if (!text) return;
    const trimmed = String(text).trim();
    if (!trimmed || trimmed === "all") return;
    const key = kind + "|" + trimmed;
    if (seen.has(key)) return;
    seen.add(key);
    conditions.push({ kind, text: trimmed });
  };
  const visitRules = (rules: CSSRuleList, depth: number): void => {
    if (depth > 32) return;
    for (const rule of Array.from(rules)) {
      const anyRule = rule as unknown as {
        conditionText?: string;
        media?: MediaList;
        cssRules?: CSSRuleList;
        styleSheet?: CSSStyleSheet | null;
      };
      if (typeof CSSImportRule !== "undefined" && rule instanceof CSSImportRule) {
        if (anyRule.media && anyRule.media.mediaText) push("media", anyRule.media.mediaText);
        try {
          if (anyRule.styleSheet) visitSheet(anyRule.styleSheet, depth + 1);
        } catch {
          unreadableSheets++;
        }
        continue;
      }
      if (typeof CSSMediaRule !== "undefined" && rule instanceof CSSMediaRule) {
        push("media", anyRule.conditionText || (anyRule.media ? anyRule.media.mediaText : ""));
      } else if (
        typeof (globalThis as unknown as { CSSContainerRule?: unknown }).CSSContainerRule !== "undefined" &&
        rule instanceof (globalThis as unknown as { CSSContainerRule: typeof CSSRule }).CSSContainerRule
      ) {
        push("container", anyRule.conditionText);
      }
      if (anyRule.cssRules) {
        try {
          visitRules(anyRule.cssRules, depth + 1);
        } catch {
          // a grouping rule that will not enumerate is skipped, not fatal
        }
      }
    }
  };
  const visitSheet = (sheet: CSSStyleSheet, depth: number): void => {
    sheets++;
    if (sheet.media && sheet.media.mediaText) push("media", sheet.media.mediaText);
    let rules: CSSRuleList | null = null;
    try {
      rules = sheet.cssRules;
    } catch {
      unreadableSheets++;
      return;
    }
    if (rules) visitRules(rules, depth);
  };
  for (const sheet of Array.from(document.styleSheets)) visitSheet(sheet as CSSStyleSheet, 0);
  const adopted = (document as unknown as { adoptedStyleSheets?: CSSStyleSheet[] }).adoptedStyleSheets;
  if (Array.isArray(adopted)) for (const sheet of adopted) visitSheet(sheet, 0);
  conditions.sort((a, b) => (a.kind + a.text < b.kind + b.text ? -1 : a.kind + a.text > b.kind + b.text ? 1 : 0));
  return { sheets, unreadableSheets, conditions };
}

/** Pause and rewind every <video>; returns how many were touched. */
export function pauseVideosInPage(): number {
  let count = 0;
  for (const video of Array.from(document.querySelectorAll("video"))) {
    try {
      video.pause();
      video.currentTime = 0;
      count++;
    } catch {
      // ignore
    }
  }
  return count;
}

/** One measurement of every target at the current viewport width. */
export function measureInPage(args: MeasureArgs): PageReading {
  const skip = new Set(args.skipTags);
  const r2 = (n: number): number => Math.round(n * 100) / 100;
  window.scrollTo(0, 0);
  const de = document.documentElement;
  const body = document.body;
  const scroller = (document.scrollingElement || de) as Element;
  const vw = de.clientWidth;
  const vh = window.innerHeight;

  const kidsCache = new Map<Element, Element[]>();
  const kids = (el: Element): Element[] => {
    let cached = kidsCache.get(el);
    if (!cached) {
      cached = Array.from(el.children).filter((c) => !skip.has(c.tagName.toUpperCase()));
      kidsCache.set(el, cached);
    }
    return cached;
  };

  let rendered = 0;
  const countRendered = (el: Element, depth: number): void => {
    if (depth > 256) return;
    for (const child of Array.from(el.children)) {
      if (skip.has(child.tagName.toUpperCase())) continue;
      if (child.getClientRects().length > 0) rendered++;
      if (child.tagName.toLowerCase() !== "svg") countRendered(child, depth + 1);
    }
  };
  if (body) countRendered(body, 0);

  const textOf = (el: Element, limit: number): string => {
    let out = "";
    const walk = (node: Node, depth: number): void => {
      if (out.length >= limit || depth > 128) return;
      for (const child of Array.from(node.childNodes)) {
        if (out.length >= limit) return;
        if (child.nodeType === 3) {
          out += (child.nodeValue || "").replace(/\s+/g, "");
        } else if (child.nodeType === 1) {
          const tag = (child as Element).tagName;
          if (skip.has(tag.toUpperCase()) || tag.toLowerCase() === "svg") continue;
          walk(child, depth + 1);
        }
      }
    };
    walk(el, 0);
    return out.slice(0, limit);
  };

  const corroborates = (el: Element, ref: SourceRef): string | null => {
    if (el.tagName.toLowerCase() !== ref.tag) return "tag-mismatch";
    const liveClasses = Array.from(new Set(Array.from(el.classList)));
    if (ref.classes.length > 0 || liveClasses.length > 0) {
      const refSet = new Set(ref.classes);
      let inter = 0;
      for (const token of liveClasses) if (refSet.has(token)) inter++;
      const union = refSet.size + liveClasses.length - inter;
      if (union > 0 && inter / union >= args.cfg.jaccard) return null;
    }
    const liveText = textOf(el, args.cfg.textChars);
    if (ref.text.length > 0 && liveText === ref.text) return null;
    if (ref.text.length === 0 && liveText.length === 0 && ref.childTags !== null) {
      const liveTags = kids(el).map((c) => c.tagName.toLowerCase());
      if (liveTags.length === ref.childTags.length && liveTags.every((t, i) => t === ref.childTags![i])) {
        return null;
      }
    }
    return "signature-mismatch";
  };

  /** Strong ancestor corroboration: same tag and (id equal or class-token Jaccard ≥ threshold). */
  const strong = (el: Element, sig: { tag: string; classes: string[]; id?: string }): boolean => {
    if (el.tagName.toLowerCase() !== sig.tag) return false;
    if (sig.id && el.id === sig.id) return true;
    if (sig.classes.length === 0) return false;
    const live = Array.from(new Set(Array.from(el.classList)));
    const refSet = new Set(sig.classes);
    let inter = 0;
    for (const token of live) if (refSet.has(token)) inter++;
    // A recorded token list at the cap may be truncated: use containment then.
    if (refSet.size >= args.cfg.ancClassCap) return inter / refSet.size >= args.cfg.jaccard;
    const union = refSet.size + live.length - inter;
    return union > 0 && inter / union >= args.cfg.jaccard;
  };

  /**
   * LOOK-ALIKE SIBLING GUARD (review M4). Among the exact-index element and its
   * ±1 siblings, which ones match the signature? One → that one. More than one
   * → the signature alone cannot tell them apart: take the single candidate
   * that also agrees on id / full text prefix; else, when the live sibling
   * count equals the recorded one (nothing inserted or removed around it) and
   * the exact element matches, trust the recorded index; else AMBIGUOUS.
   */
  type Pick = { kind: "exact" | "neighbour"; el: Element } | { kind: "none" | "ambiguous" };
  const pick = (
    list: Element[],
    index: number,
    match: (el: Element) => boolean,
    tie: (el: Element) => boolean,
    recordedCount: number | undefined,
  ): Pick => {
    const cands: Array<{ j: number; el: Element }> = [];
    for (const j of [index, index - 1, index + 1]) {
      if (j < 0 || j >= list.length) continue;
      if (match(list[j]!)) cands.push({ j, el: list[j]! });
    }
    if (cands.length === 0) return { kind: "none" };
    const as = (c: { j: number; el: Element }): Pick => ({ kind: c.j === index ? "exact" : "neighbour", el: c.el });
    if (cands.length === 1) return as(cands[0]!);
    const tied = cands.filter((c) => tie(c.el));
    if (tied.length === 1) return as(tied[0]!);
    const exact = cands.find((c) => c.j === index);
    if (exact && recordedCount !== undefined && recordedCount === list.length) return as(exact);
    return { kind: "ambiguous" };
  };
  const tieFor = (id: string | undefined, text: string) => (el: Element): boolean =>
    (!!id && el.id === id) || (text.length > 0 && textOf(el, args.cfg.textChars) === text);

  /**
   * STRICT resolution: the recorded index path, target signature corroborated,
   * and no look-alike ±1 sibling at any depth that the signature cannot tell
   * apart. `neighbour` = a sibling is the uniquely better match (the caller
   * then tries anchored re-resolution).
   */
  const resolveStrict = (
    ref: SourceRef,
  ): { el: Element } | { fail: "path-unresolved" | "tag-mismatch" | "signature-mismatch" | "ambiguous-signature" | "neighbour" } => {
    if (!body) return { fail: "path-unresolved" };
    const parents: Element[] = [];
    let cur: Element = body;
    for (const index of ref.path) {
      const next = kids(cur)[index];
      if (!next) return { fail: "path-unresolved" };
      parents.push(cur);
      cur = next;
    }
    const failure = corroborates(cur, ref);
    if (failure !== null) return { fail: failure as "tag-mismatch" | "signature-mismatch" };
    const last = ref.path.length - 1;
    const anc = ref.anc && ref.anc.length === ref.path.length ? ref.anc : null;
    for (let i = 0; i <= last; i++) {
      const list = kids(parents[i]!);
      const index = ref.path[i]!;
      let result: Pick;
      if (i === last) {
        result = pick(
          list,
          index,
          (el) => corroborates(el, ref) === null,
          tieFor(anc ? anc[i]!.id : undefined, ref.text),
          ref.sib !== undefined ? ref.sib : anc ? anc[i]!.n : undefined,
        );
      } else {
        if (!anc) continue;
        const sig = anc[i]!;
        result = pick(list, index, (el) => strong(el, sig), tieFor(sig.id, ""), sig.n);
      }
      if (result.kind === "ambiguous") return { fail: "ambiguous-signature" };
      if (result.kind === "neighbour" && (i === last || strong(list[index]!, anc![i]!))) return { fail: "neighbour" };
    }
    return { el: cur };
  };

  /**
   * ANCHORED RE-RESOLUTION. The strict path failed; walk it again comparing each
   * prefix element against its recorded ancestor signature. At every depth the
   * exact index / ±1 siblings are judged by `pick` (a single strong match wins,
   * look-alikes need id / text / unchanged sibling count, otherwise refused as
   * ambiguous). A neighbour counts as one drift (budget MAX_SIBLING_DRIFT_STEPS).
   * No strong candidate → the recorded index is kept when the tag matches
   * (hashed-class churn, class-less wrappers), else fail. The caller still
   * requires the full target signature to corroborate.
   */
  const resolveAnchored = (ref: SourceRef): { el: Element; drift: number } | "ambiguous" | null => {
    const anc = ref.anc;
    if (!anc || anc.length !== ref.path.length || !body) return null;
    let cur: Element = body;
    let drift = 0;
    const last = ref.path.length - 1;
    for (let i = 0; i <= last; i++) {
      const list = kids(cur);
      const index = ref.path[i]!;
      const sig = anc[i]!;
      const result =
        i === last
          ? pick(
              list,
              index,
              (el) => strong(el, sig) || corroborates(el, ref) === null,
              tieFor(sig.id, ref.text),
              ref.sib !== undefined ? ref.sib : sig.n,
            )
          : pick(list, index, (el) => strong(el, sig), tieFor(sig.id, ""), sig.n);
      if (result.kind === "ambiguous") return "ambiguous";
      if (result.kind === "exact") {
        cur = result.el;
        continue;
      }
      if (result.kind === "neighbour" && drift < args.cfg.maxDrift) {
        cur = result.el;
        drift++;
        continue;
      }
      const exact = index >= 0 && index < list.length ? list[index]! : null;
      if (exact && exact.tagName.toLowerCase() === sig.tag) {
        cur = exact;
        continue;
      }
      return null;
    }
    return { el: cur, drift };
  };

  // Clone lookup: generator markup only.
  const served: VariantId[] = [];
  const cloneIndex = new Map<string, Element>();
  if (args.mode === "clone") {
    for (const wrapper of Array.from(document.querySelectorAll(".wr-variant[data-wr-viewport]"))) {
      const page = wrapper.getAttribute("data-wr-page");
      if (args.pageId && page !== args.pageId) continue;
      const vp = wrapper.getAttribute("data-wr-viewport") as VariantId;
      if (getComputedStyle(wrapper).display !== "none" && served.indexOf(vp) < 0) served.push(vp);
      for (const el of Array.from(wrapper.querySelectorAll("[data-wr-node]"))) {
        const key = vp + ":" + el.getAttribute("data-wr-node");
        if (!cloneIndex.has(key)) cloneIndex.set(key, el);
      }
    }
    served.sort();
  }

  const livePath = (el: Element): number[] => {
    const out: number[] = [];
    let cur: Element | null = el;
    let guard = 0;
    while (cur && cur !== body && guard++ < 512) {
      const parent: Element | null = cur.parentElement;
      if (!parent) break;
      out.push(kids(parent).indexOf(cur));
      cur = parent;
    }
    return out.reverse();
  };

  const nodes: NodeReading[] = [];
  const claimed = new Map<Element, number[]>();
  const elements: Array<Element | null> = [];

  for (const target of args.targets) {
    let el: Element | null = null;
    let st: MatchStatus = "unmatched";
    let why: string | undefined;
    if (args.mode === "clone") {
      el = cloneIndex.get(target.k) || null;
      if (el) st = "matched";
      else why = "clone-node-absent";
    } else {
      if (target.p) {
        const strict = resolveStrict(target.p);
        if ("el" in strict) {
          el = strict.el;
          st = "matched";
        } else {
          why = strict.fail === "neighbour" ? "look-alike-neighbour" : strict.fail;
          if (strict.fail === "ambiguous-signature") st = "ambiguous";
          else {
            const anchored = resolveAnchored(target.p);
            if (anchored === "ambiguous") {
              st = "ambiguous";
              why = "ambiguous-signature";
            } else if (anchored && anchored.drift > 0 && corroborates(anchored.el, target.p) === null) {
              el = anchored.el;
              st = "matched";
              why = "anchored-drift";
            }
          }
        }
      } else why = "no-source-ref";
      if (st !== "matched" && target.a) {
        const strictAlt = resolveStrict(target.a);
        let candidate: Element | null = "el" in strictAlt ? strictAlt.el : null;
        if (!candidate) {
          const anchored = resolveAnchored(target.a);
          candidate = anchored && anchored !== "ambiguous" && anchored.drift > 0 ? anchored.el : null;
        }
        if (candidate && corroborates(candidate, target.a) === null) {
          el = candidate;
          st = "tree-mismatch";
          why = "other-variant-path-resolved";
        }
      }
    }
    elements.push(el);
    const reading: NodeReading = { k: target.k, st, v: 0, x: 0, y: 0, w: 0, h: 0 };
    if (why) reading.why = why;
    if (el && st === "matched" && args.mode === "source") {
      const list = claimed.get(el) || [];
      list.push(nodes.length);
      claimed.set(el, list);
    }
    nodes.push(reading);
  }

  // Two targets of the SAME variant resolving to one live element: refuse both.
  for (const indexes of Array.from(claimed.values())) {
    if (indexes.length < 2) continue;
    const byVariant = new Map<string, number[]>();
    for (const index of indexes) {
      const vp = args.targets[index]!.vp;
      const list = byVariant.get(vp) || [];
      list.push(index);
      byVariant.set(vp, list);
    }
    for (const list of Array.from(byVariant.values())) {
      if (list.length < 2) continue;
      for (const index of list) {
        nodes[index]!.st = "ambiguous";
        nodes[index]!.why = "multiple-targets-same-element";
        elements[index] = null;
      }
    }
  }

  const clipValues = ["hidden", "clip"];
  for (let i = 0; i < args.targets.length; i++) {
    const el = elements[i];
    const reading = nodes[i]!;
    const target = args.targets[i]!;
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    reading.x = r2(rect.left);
    reading.y = r2(rect.top + window.scrollY);
    reading.w = r2(rect.width);
    reading.h = r2(rect.height);
    let visible = rect.width > 0 && rect.height > 0;
    const cs = getComputedStyle(el);
    if (visible) {
      const check = (el as Element & { checkVisibility?: (o: object) => boolean }).checkVisibility;
      if (typeof check === "function") {
        visible = check.call(el, { checkOpacity: true, checkVisibilityCSS: true });
      } else {
        visible = cs.visibility !== "hidden" && cs.opacity !== "0";
      }
    }
    reading.v = visible ? 1 : 0;
    if (!args.heavy) continue;

    reading.pos = cs.position;
    const inFlow =
      (cs.position === "static" || cs.position === "relative" || cs.position === "sticky") &&
      cs.float === "none";
    reading.flow = inFlow ? 1 : 0;
    const tag = el.tagName.toLowerCase();
    const hasText = textOf(el, 1).length > 0;
    reading.tx = hasText ? 1 : 0;
    const isMedia = ["img", "picture", "video", "svg", "canvas", "iframe", "object", "embed"].indexOf(tag) >= 0;
    reading.md = isMedia ? 1 : 0;
    reading.dp = livePath(el);
    const maxWidth = cs.maxWidth;
    reading.mxw = /px$/.test(maxWidth) ? r2(parseFloat(maxWidth)) : null;

    // Collect text-node client rects once (lines + H2).
    const textRects: DOMRect[] = [];
    if (hasText && (target.wl || inFlow)) {
      const range = document.createRange();
      const walk = (node: Node, depth: number): void => {
        if (depth > 128 || textRects.length > 2000) return;
        for (const child of Array.from(node.childNodes)) {
          if (child.nodeType === 3) {
            if (!(child.nodeValue || "").trim()) continue;
            range.selectNodeContents(child);
            for (const rr of Array.from(range.getClientRects())) {
              if (rr.width > 0 && rr.height > 0) textRects.push(rr);
            }
          } else if (child.nodeType === 1) {
            const t = (child as Element).tagName;
            if (skip.has(t.toUpperCase()) || t.toLowerCase() === "svg") continue;
            walk(child, depth + 1);
          }
        }
      };
      walk(el, 0);
      range.detach();
    }

    if (target.wl && visible) {
      const sorted = textRects
        .map((rr) => ({ t: rr.top, b: rr.bottom, c: (rr.top + rr.bottom) / 2 }))
        .sort((a, b) => a.c - b.c);
      let lines = 0;
      let lineBottom = -Infinity;
      for (const rr of sorted) {
        if (rr.c > lineBottom) {
          lines++;
          lineBottom = rr.b;
        }
      }
      reading.lines = lines;
    }

    if (target.wc && visible) {
      const xs: number[] = [];
      const expand = (parent: Element, depth: number): void => {
        if (depth > 8) return;
        for (const child of Array.from(parent.children)) {
          if (skip.has(child.tagName.toUpperCase())) continue;
          const ccs = getComputedStyle(child);
          if (ccs.display === "contents") {
            expand(child, depth + 1);
            continue;
          }
          if (ccs.display === "none") continue;
          const cr = child.getBoundingClientRect();
          if (cr.width > 0 && cr.height > 0 && cr.right > 0 && cr.left < vw) xs.push(cr.left);
        }
      };
      expand(el, 0);
      xs.sort((a, b) => a - b);
      let cols = 0;
      let start = -Infinity;
      for (const x of xs) {
        if (x - start > args.cfg.columnBucket) {
          cols++;
          start = x;
        }
      }
      reading.cols = cols;
    }

    if (target.wm && visible) {
      reading.ar = rect.height > 0 ? Math.round((rect.width / rect.height) * 10000) / 10000 : 0;
      reading.fit = cs.objectFit;
    }

    if (hasText && visible) {
      const clipsSelf = clipValues.indexOf(cs.overflowX) >= 0 || clipValues.indexOf(cs.overflowY) >= 0;
      const overflowing = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
      reading.clip = clipsSelf && overflowing ? 1 : 0;
    }

    if (hasText && visible && inFlow && textRects.length > 0) {
      let minL = Infinity;
      let maxR = -Infinity;
      for (const rr of textRects) {
        if (rr.left < minL) minL = rr.left;
        if (rr.right > maxR) maxR = rr.right;
      }
      let excess = Math.max(0, -minL, maxR - vw);
      let ancestor: Element | null = el.parentElement;
      let guard = 0;
      while (ancestor && ancestor !== de && guard++ < 128) {
        const acs = getComputedStyle(ancestor);
        if (acs.overflowX !== "visible" && acs.display !== "contents") {
          const ar = ancestor.getBoundingClientRect();
          const clipL = ar.left + ancestor.clientLeft;
          const clipR = clipL + ancestor.clientWidth;
          excess = Math.max(excess, clipL - minL, maxR - clipR);
          break;
        }
        ancestor = ancestor.parentElement;
      }
      reading.h2 = r2(Math.max(0, excess));
    }

    if (inFlow && visible) {
      let parent: Element | null = el.parentElement;
      let guard = 0;
      while (parent && guard++ < 64 && getComputedStyle(parent).display === "contents") {
        parent = parent.parentElement;
      }
      if (parent && parent !== de) {
        const pcs = getComputedStyle(parent);
        if (pcs.overflowX === "visible") {
          const pr = parent.getBoundingClientRect();
          const padL = pr.left + (parseFloat(pcs.borderLeftWidth) || 0);
          const padR = pr.right - (parseFloat(pcs.borderRightWidth) || 0);
          reading.h5 = r2(Math.max(0, padL - rect.left, rect.right - padR));
        } else {
          reading.h5 = null;
        }
      } else {
        reading.h5 = null;
      }
    }

    if (target.wt) reading.txt = textOf(el, args.cfg.h8Chars);
  }

  let found: boolean[] | undefined;
  if (args.mode === "source" && args.findTexts.length > 0) {
    const pageText = ((body && (body as HTMLElement).innerText) || "").replace(/\s+/g, "");
    found = args.findTexts.map((t) => t.length > 0 && pageText.indexOf(t) >= 0);
  }

  const result: PageReading = {
    vw,
    vh,
    sw: scroller.scrollWidth,
    sh: scroller.scrollHeight,
    rendered,
    served,
    nodes,
  };
  if (found) result.found = found;
  return result;
}
