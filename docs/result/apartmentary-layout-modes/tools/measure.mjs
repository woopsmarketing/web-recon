import { chromium } from '/Users/woops/projects/web-recon/node_modules/playwright/index.mjs';
import fs from 'fs';
const [,, which, widthsArg, outDir, shots] = process.argv;
const url = which === 'source' ? 'https://apartmentary.com/' : (process.env.CLONE_URL || 'http://localhost:3212/');
const widths = widthsArg.split(',').map(Number);
const b = await chromium.launch();
const results = {};
for (const width of widths) {
  const p = await b.newPage({ viewport: { width, height: 1000 } });
  await p.goto(url, { waitUntil: 'networkidle', timeout: 90000 }).catch(e=>console.error(e.message));
  const h0 = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h0; y += 700) { await p.evaluate(y => scrollTo(0, y), y); await p.waitForTimeout(120); }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(1200);
  if (shots) await p.screenshot({ path: `${outDir}/${which}-home-${width}.png`, fullPage: true });
  results[width] = await p.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const root = [...document.querySelectorAll('[data-wr-node="n000005"], .css-8atqhb')].find(vis);
    const at = (path) => { if (!root) return null; let e = root; for (const i of path.split('.').slice(1).map(Number)) { e = e && e.children[i]; } return e || null; };
    const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { y: +r.y.toFixed(1), x: +r.x.toFixed(1), w: +r.width.toFixed(1), r: +r.right.toFixed(1), cx: +(r.x + r.width/2).toFixed(1), h: +r.height.toFixed(1), lm: +r.x.toFixed(1), rm: +(vw - r.right).toFixed(1), kids: e.children.length }; };
    const track = (wrapPath, clipPath) => {
      const w = at(wrapPath), c = at(clipPath); if (!w || !c) return null;
      const cr = c.getBoundingClientRect();
      const cl = Math.max(cr.left, 0), crr = Math.min(cr.right, vw);
      const slides = [...w.children].map(s => s.getBoundingClientRect());
      const visible = slides.filter(r => { const ov = Math.min(r.right, crr) - Math.max(r.left, cl); return ov > r.width * 0.5; });
      const gaps = []; for (let i = 1; i < slides.length; i++) gaps.push(+(slides[i].left - slides[i-1].right).toFixed(1));
      return { count: slides.length, visible: visible.length, cardW: slides[0] ? +slides[0].width.toFixed(1) : null, gap: gaps[0] ?? null, firstX: slides[0] ? +slides[0].left.toFixed(1) : null, lastVisibleRight: visible.length ? +visible[visible.length-1].right.toFixed(1) : null };
    };
    const P = 'R.2.1';
    const regions = {
      header_row: 'R.0.0.0',
      header_nav: 'R.0.0.0.3',
      floating_cta: 'R.1',
      hero_outer: 'R.2.0',
      hero_media: 'R.2.0.0',
      hero_prev: 'R.2.0.0.1',
      hero_next: 'R.2.0.0.2',
      hero_pager: 'R.2.0.0.3',
      exp_outer: P+'.1.0',
      exp_group: P+'.1.0.0',
      exp_image: P+'.1.0.0.0',
      exp_text: P+'.1.0.0.2',
      exp_button: P+'.1.0.0.2.4',
      pf1_container: P+'.3.0.0.0',
      pf1_heading: P+'.3.0.0.0.0',
      pf1_cta: P+'.3.0.0.0.2',
      pf1_cardrow: P+'.3.0.2.0.0',
      pf1_prev: P+'.3.0.2.1',
      pf1_next: P+'.3.0.2.2',
      pf1_progress: P+'.3.0.2.0.2.0',
      pf2_container: P+'.4.0.0.0',
      pf2_heading: P+'.4.0.0.0.0',
      pf2_cta: P+'.4.0.0.0.2',
      pf2_cardrow: P+'.4.0.2.0.0',
      pf2_next: P+'.4.0.2.2',
      pf2_progress: P+'.4.0.2.0.2.0',
      ts_outer: P+'.5',
      ts_container: P+'.5.0',
      ts_banner: P+'.5.0.0.0',
      ts_heading: P+'.5.0.0.2.0',
      ts_arrows: P+'.5.0.0.2.1',
      ts_track: P+'.5.0.2.0',
      ts_progress: P+'.5.0.2.2',
      bottom_media: 'R.4.0.0',
      footer_container: 'R.4.1.0',
      footer_logo_col: 'R.4.1.0.0',
      footer_cols: 'R.4.1.0.1',
    };
    const out = { vw, scrollW: document.documentElement.scrollWidth, pageH: document.documentElement.scrollHeight, rootFound: !!root, regions: {}, tracks: {} };
    for (const [k, path] of Object.entries(regions)) out.regions[k] = box(at(path));
    out.tracks.pf1 = track(P+'.3.0.2.0.0.0', P+'.3.0.2.0.0');
    out.tracks.pf2 = track(P+'.4.0.2.0.0.0', P+'.4.0.2.0.0');
    out.tracks.ts = track(P+'.5.0.2.0.0', P+'.5.0.2.0');
    // text anchors (work across DOM variants)
    const findText = t => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (n.textContent.includes(t) && vis(n.parentElement)) return n.parentElement; } return null; };
    out.text = {};
    for (const [k, t] of Object.entries({ exp_h: '기대와 설렘이', pf1_h: '공간 활용도를 높인', pf2_h: '오래도록 아름다운', ts_h: '함께한 분들의 후기', pf1_cta: '30평대 아파트 더 보기', pf2_cta: '구축 아파트 더 보기' })) out.text[k] = box(findText(t));
    return out;
  });
  await p.close();
  console.error(which, width, 'done');
}
fs.writeFileSync(`${outDir}/${which}.json`, JSON.stringify(results, null, 1));
await b.close();
