import { chromium } from '/Users/woops/projects/web-recon/node_modules/playwright/index.mjs';
const [,, width, path, maxDepth='12', limit='40'] = process.argv;
const b = await chromium.launch();
const grab = async (url) => { const p = await b.newPage({ viewport: { width: +width, height: 1000 } });
  await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(()=>{}); await p.waitForTimeout(800);
  const r = await p.evaluate(([path, maxDepth]) => {
    const vis = e => e.getBoundingClientRect().width > 0;
    const root = [...document.querySelectorAll('[data-wr-node="n000005"], .css-8atqhb')].find(vis);
    let e = root; for (const i of path.split('.').slice(1).map(Number)) e = e && e.children[i];
    const out = {}; const walk = (e, pth, d) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e);
      out[pth] = { id: e.getAttribute('data-wr-node') || (e.className+'').replace(/MuiBox-root |MuiTypography-root /g,'').slice(0,24), tag: e.tagName.toLowerCase(), x: r.x, w: r.width, h: r.height, y: r.y, t: e.children.length ? '' : (e.textContent||'').trim().slice(0,14), fs: cs.fontSize, lh: cs.lineHeight, h_: cs.height, mh: cs.minHeight };
      if (d < maxDepth) [...e.children].forEach((c, i) => walk(c, pth + '.' + i, d + 1)); };
    walk(e, path, 0); return out; }, [path, +maxDepth]);
  await p.close(); return r; };
const [s, c] = await Promise.all([grab('https://apartmentary.com/'), grab('http://localhost:3212/')]);
let n = 0;
for (const k of Object.keys(s)) { const a = s[k], z = c[k]; if (!z) { console.log('missing in clone', k, a.id); continue; }
  const dx = z.x - a.x, dw = z.w - a.w, dh = z.h - a.h;
  if (Math.abs(dx) > 3 || Math.abs(dw) > 3 || Math.abs(dh) > 3) { if (n++ < +limit) console.log(`${k} ${a.tag}[${a.id}|${z.id}] dx=${dx.toFixed(0)} dw=${dw.toFixed(0)} dh=${dh.toFixed(0)} src(${a.w.toFixed(0)}x${a.h.toFixed(0)} fs${a.fs}/${a.lh}) clone(${z.w.toFixed(0)}x${z.h.toFixed(0)} fs${z.fs}/${z.lh} h=${z.h_} mh=${z.mh}) "${a.t}"`); } }
console.log('diverging nodes:', n);
await b.close();
