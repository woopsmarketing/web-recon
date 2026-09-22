import json, sys
d = sys.argv[1]; tol = 3
S = json.load(open(f'{d}/source.json')); C = json.load(open(f'{d}/clone.json'))
md = sys.argv[2] if len(sys.argv) > 2 else None
lines = []; fails = []
for w in S:
    s, c = S[w], C.get(w)
    if not c: continue
    lines.append(f"\n### {w}px  (scrollW src={s['scrollW']} clone={c['scrollW']}; pageH src={s['pageH']} clone={c['pageH']})\n")
    if c['scrollW'] > c['vw']: fails.append(f"{w} overflow clone scrollW={c['scrollW']}")
    lines.append("| region | src x / w / right / cx / h | clone x / w / right / cx / h | Δx | Δw | Δh | lm:rm src | lm:rm clone | ok |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for k, sv in s['regions'].items():
        cv = c['regions'].get(k)
        if not sv and not cv: continue
        if not sv or not cv:
            lines.append(f"| {k} | {sv and (sv['x'],sv['w'])} | {cv and (cv['x'],cv['w'])} | - | - | | | {'n/a' if w=='390' else 'MISSING'} |"); continue
        if sv['w'] == 0 and cv['w'] == 0: continue
        dx = cv['x'] - sv['x']; dw = cv['w'] - sv['w']
        dh = cv['h'] - sv['h']
        if k == 'floating_cta' and abs(cv.get('y',0)-sv.get('y',0)) > 3: fails.append(f"{w} floating_cta y src={sv.get('y')} clone={cv.get('y')}")
        ok = abs(dx) <= tol and abs(dw) <= tol
        if abs(dh) > 8 and w != '390': fails.append(f"{w} {k} HEIGHT dh={dh:.1f}")
        if not ok and w != '390': fails.append(f"{w} {k} dx={dx:.1f} dw={dw:.1f}")
        lines.append(f"| {k} | {sv['x']} / {sv['w']} / {sv['r']} / {sv['cx']} / {sv['h']} | {cv['x']} / {cv['w']} / {cv['r']} / {cv['cx']} / {cv['h']} | {dx:.1f} | {dw:.1f} | {dh:.1f} | {sv['lm']:.0f}:{sv['rm']:.0f} | {cv['lm']:.0f}:{cv['rm']:.0f} | {'✅' if ok else '❌'} |")
    lines.append("\n| track | src visible / card w / gap / firstX / lastVisRight | clone visible / card w / gap / firstX / lastVisRight | ok |")
    lines.append("|---|---|---|---|")
    for k in ['pf1','pf2','ts']:
        sv, cv = s['tracks'].get(k), c['tracks'].get(k)
        if not sv or not cv: lines.append(f"| {k} | {sv} | {cv} | n/a |"); continue
        ok = sv['visible']==cv['visible'] and abs((sv['cardW'] or 0)-(cv['cardW'] or 0))<=tol and abs((sv['gap'] or 0)-(cv['gap'] or 0))<=tol and abs(sv['firstX']-cv['firstX'])<=tol
        if not ok and w != '390': fails.append(f"{w} track {k} src={sv} clone={cv}")
        f = lambda v: f"{v['visible']} / {v['cardW']} / {v['gap']} / {v['firstX']} / {v['lastVisibleRight']}"
        lines.append(f"| {k} | {f(sv)} | {f(cv)} | {'✅' if ok else '❌'} |")
    lines.append("\n| text anchor | src x / w | clone x / w | ok |\n|---|---|---|---|")
    for k, sv in s['text'].items():
        cv = c['text'].get(k)
        if not sv or not cv: lines.append(f"| {k} | {sv and (sv['x'], sv['w'])} | {cv and (cv['x'], cv['w'])} | ? |"); continue
        ok = abs(cv['x']-sv['x'])<=tol+2
        if not ok: fails.append(f"{w} text {k} src.x={sv['x']} clone.x={cv['x']}")
        lines.append(f"| {k} | {sv['x']} / {sv['w']} | {cv['x']} / {cv['w']} | {'✅' if ok else '❌'} |")
out = "\n".join(lines)
if md: open(md,'w').write(out)
print(f"FAILS ({len(fails)}):"); print("\n".join(fails))
