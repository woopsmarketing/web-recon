/**
 * Step 6 (Demo Customer Content Proof) — human review pack (static HTML, no network, no JS needed).
 *
 *   tsx scripts/template-platform-step6-review-pack.ts
 *
 * Writes docs/result/recon-template-platform-step6-demo/human-review/
 *   index.html  AI image review: a full 51-shot status table (approved file vs. registered site
 *               asset vs. visual status), then flagship shots grouped Living / Kitchen / Entrance /
 *               Bedroom / Bathroom, each beside its STYLE references (not a copy comparison), with
 *               a real same-home checklist; then the other projects and the site-level seats.
 *   site.html   the built demo site's build identity + "핵심 6장" + every reviewed viewport
 *               (from screens/report.json), with a real Korean review checklist.
 * Images are linked by relative path (references stay private files in the repo; nothing is copied).
 * A shot shows the approved generated image when one exists, otherwise its illustrated stand-in
 * with a WAITING badge — the page never presents a stand-in as a generated photo. Reviewer inputs
 * (radio/checkbox/textarea) persist to localStorage and can be exported as JSON; the page reads
 * fine with JS disabled, it just won't remember or export anything.
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ManifestEntry } from "./template-platform-step6-image-pack.js";

const repoRoot = process.cwd();
const RESULT = path.join(repoRoot, "docs/result/recon-template-platform-step6-demo");
const OUT = path.join(RESULT, "human-review");
const SITE_ASSETS = path.join(repoRoot, "data/sites/boost-interior-demo/assets");
const APPROVED_DIR = path.join(repoRoot, "references/boost-interior/generated-approved");
const APPROVED_DIR_REL = "references/boost-interior/generated-approved";
const exists = (f: string) => access(f).then(() => true, () => false);
const rel = (abs: string) => path.relative(OUT, abs).split(path.sep).join("/");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const manifest = JSON.parse(await readFile(path.join(RESULT, "image-generation/03-generation-manifest.json"), "utf8")) as { acceptedExtensions: string[]; shots: ManifestEntry[] };
const status = JSON.parse(await readFile(path.join(RESULT, "image-generation/04-asset-status.json"), "utf8")) as { shots: number; approvedGenerated: number; illustratedStandIns: number; AI_PORTFOLIO_ASSETS: string; unmatchedApprovedFiles?: { file: string; reason: string }[]; inputWarnings?: { shotId: string; file: string; kind: string; detail: string }[] };

// -------------------------------------------------------------- registry --
interface RegistryItem { id: string; file: string; mediaType: string; width: number; height: number }
const registry = JSON.parse(await readFile(path.join(SITE_ASSETS, "registry.json"), "utf8")) as { schema: string; origin: string; items: RegistryItem[] };
const registryById = new Map(registry.items.map((it) => [it.id, it]));

// ------------------------------------------------------------ shot state --
type Badge = "WAITING" | "INGESTED" | "NOT_INGESTED" | "ORPHAN_RASTER";
interface ShotState {
  shot: ManifestEntry;
  approved: { ext: string; absPath: string } | null;
  regItem: RegistryItem | undefined;
  regFileExists: boolean;
  assetType: "raster" | "stand-in" | "unknown";
  badge: Badge;
}

async function computeShotState(shot: ManifestEntry): Promise<ShotState> {
  let approved: { ext: string; absPath: string } | null = null;
  for (const ext of manifest.acceptedExtensions) {
    const f = path.join(APPROVED_DIR, `${shot.shotId}.${ext}`);
    if (await exists(f)) { approved = { ext, absPath: f }; break; }
  }
  const regItem = registryById.get(shot.shotId);
  const isRaster = regItem?.mediaType === "image/jpeg";
  const regFileExists = regItem ? await exists(path.join(SITE_ASSETS, regItem.file)) : false;
  const assetType: ShotState["assetType"] = !regItem ? "unknown" : isRaster ? "raster" : "stand-in";
  const badge: Badge = !approved && !isRaster ? "WAITING" : approved && isRaster ? "INGESTED" : approved && !isRaster ? "NOT_INGESTED" : "ORPHAN_RASTER";
  return { shot, approved, regItem, regFileExists, assetType, badge };
}

const shotStates: ShotState[] = await Promise.all(manifest.shots.map(computeShotState));
const byId = new Map(shotStates.map((s) => [s.shot.shotId, s]));

interface Counts { total: number; approvedCount: number; rasterCount: number; flagshipApproved: number; flagshipTotal: number; otherApproved: number; otherTotal: number; mismatch: number }
function computeCounts(states: ShotState[]): Counts {
  const flagship = states.filter((s) => s.shot.projectId === "bi-01");
  const other = states.filter((s) => s.shot.projectId !== "bi-01");
  return {
    total: states.length,
    approvedCount: states.filter((s) => s.approved).length,
    rasterCount: states.filter((s) => s.assetType === "raster").length,
    flagshipApproved: flagship.filter((s) => s.approved).length,
    flagshipTotal: flagship.length,
    otherApproved: other.filter((s) => s.approved).length,
    otherTotal: other.length,
    mismatch: states.filter((s) => s.badge === "NOT_INGESTED" || s.badge === "ORPHAN_RASTER").length,
  };
}
const counts = computeCounts(shotStates);

function approvedStateLine(c: Counts): string {
  if (c.approvedCount === 0) return `<code>${APPROVED_DIR_REL}/</code>에서 승인된 파일을 찾지 못했습니다 — 아래 ${c.total}개 shot 모두 사진이 아닌 <b>일러스트 stand-in</b>입니다.`;
  if (c.approvedCount === c.total) return `<code>${APPROVED_DIR_REL}/</code>에서 ${c.approvedCount} / ${c.total}개 승인 파일을 찾았습니다 — 모든 shot이 승인된 이미지로 대체되었습니다.`;
  return `<code>${APPROVED_DIR_REL}/</code>에서 ${c.approvedCount} / ${c.total}개 승인 파일을 찾았습니다 — 나머지 ${c.total - c.approvedCount}개는 아직 일러스트 stand-in입니다.`;
}

// ------------------------------------------------------------------- css --
const CSS = `
:root{color-scheme:light;--ink:#232220;--muted:#6f6a63;--line:#e4ded4;--bg:#faf8f4;--card:#fff;--accent:#b85416;--wait:#8a5a00;--ok:#1d6b3a;--warn:#a3341f}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 Pretendard,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;word-break:keep-all}
header,main{max-width:1500px;margin:0 auto;padding:24px}header{padding-bottom:0}
h1{font-size:26px;margin:0 0 6px}h2{font-size:20px;margin:40px 0 4px;padding-top:20px;border-top:1px solid var(--line)}h3{font-size:15px;margin:0 0 8px}
p{margin:6px 0;color:var(--muted)}a{color:var(--accent)}code{font:12px ui-monospace,Menlo,monospace;background:#f0ece4;padding:1px 5px;border-radius:4px;word-break:break-all}
.banner{border:1px solid var(--line);background:var(--card);border-radius:10px;padding:14px 18px;margin:16px 0}
.banner b{color:var(--wait)}.banner.ok b{color:var(--ok)}.banner.build-identity{font-size:13px}.banner.build-identity code{margin-right:2px}
.checks{display:flex;flex-wrap:wrap;gap:6px 14px;margin:10px 0 0;padding:0;list-style:none;font-size:13px}.checks li::before{content:"☐ "}
.checks-real{list-style:none;padding:0;margin:10px 0;display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px}
.group{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,2fr);gap:20px;margin:16px 0 28px}
.col{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px}
.col.samehome{margin:14px 0 28px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.refs .grid{grid-template-columns:repeat(auto-fill,minmax(180px,1fr))}
figure{margin:0}figure img{display:block;width:100%;height:auto;border-radius:6px;border:1px solid var(--line);background:#eee}
figcaption{font-size:12px;color:var(--muted);margin-top:4px;overflow-wrap:anywhere}
.badge{display:inline-block;font-size:11px;font-weight:700;border-radius:999px;padding:1px 8px;margin-right:6px;border:1px solid currentColor}
.badge.wait{color:var(--wait)}.badge.ok{color:var(--ok)}.badge.warn{color:var(--warn)}
.shots .grid{grid-template-columns:repeat(auto-fill,minmax(420px,1fr))}.shots figure{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px}
.shots img{max-height:900px;object-fit:contain;object-position:top;background:#ddd}
nav a{margin-right:14px}
.shotpair{display:flex;flex-wrap:wrap;gap:10px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px}
.shotpair figure{flex:1 1 160px;min-width:160px}
.shotpair .meta{flex-basis:100%;font-size:12px;color:var(--muted);margin:6px 0 0}
.seats{flex-basis:100%;display:flex;flex-wrap:wrap;gap:8px 10px;align-items:flex-end;margin:8px 0 0;padding-top:8px;border-top:1px dashed var(--line)}
.seats>b{flex-basis:100%;font-size:11px;color:var(--muted);font-weight:600}
.seat{width:150px;font-size:10.5px;color:var(--muted);line-height:1.35}
.seat>div{width:100%;overflow:hidden;border:1px solid var(--line);border-radius:4px;background:#ddd}
.seat img{display:block;width:100%;height:100%;object-fit:cover;object-position:50% 50%;border:0;border-radius:0}
.shotmeta{font-size:12px;color:var(--muted);margin:6px 0 0;overflow-wrap:anywhere}
.headline{font-size:22px;font-weight:800;letter-spacing:.02em;color:var(--wait);margin:0 0 6px}.banner.ok .headline{color:var(--ok)}
.checklist{display:flex;flex-direction:column;gap:4px;margin:8px 0;font-size:13px}
label.chk{display:inline-flex;align-items:center;gap:6px}
.verdict{margin-top:10px;font-size:13px}
.verdict label{margin-right:12px;display:inline-flex;align-items:center;gap:4px}
textarea{font:inherit;font-size:12px;width:100%;max-width:320px;min-width:140px;resize:vertical}
.counts{margin:10px 0}
.stat-list{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:6px 18px;font-size:13px}
.table-wrap{overflow-x:auto;margin:10px 0 0}
table{width:100%;border-collapse:collapse;font-size:12.5px}
th,td{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
thead th{background:#f2ede2;position:sticky;top:0}
.export-bar{position:sticky;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:10px 18px;text-align:right;margin-top:24px}
.export-bar button{font:inherit;padding:8px 16px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer}
@media(max-width:900px){.group{grid-template-columns:1fr}}
`;

const page = (title: string, body: string) => `<!doctype html>\n<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style></head><body>${body}</body></html>\n`;

// ------------------------------------------------------- persistence/export --
// No network, no external resources. Radios/checkboxes/textareas with a data-key persist to
// localStorage (namespaced) and restore on load; the export button downloads the collected state
// as JSON. The page renders and is fully readable without this script running.
const REVIEW_SCRIPT = `(function () {
  try {
    var PREFIX = "wr-step6-review:";
    var els = document.querySelectorAll("[data-key]");
    els.forEach(function (el) {
      var key = PREFIX + el.getAttribute("data-key");
      try {
        var stored = localStorage.getItem(key);
        if (stored !== null) {
          if (el.type === "checkbox") el.checked = stored === "1";
          else if (el.type === "radio") el.checked = el.value === stored;
          else el.value = stored;
        }
      } catch (e) {}
      var save = function () {
        try {
          if (el.type === "checkbox") localStorage.setItem(key, el.checked ? "1" : "0");
          else if (el.type === "radio") { if (el.checked) localStorage.setItem(key, el.value); }
          else localStorage.setItem(key, el.value);
        } catch (e) {}
      };
      el.addEventListener("change", save);
      if (el.tagName === "TEXTAREA") el.addEventListener("input", save);
    });
    var btn = document.getElementById("export-json");
    if (btn) {
      btn.addEventListener("click", function () {
        var out = {};
        document.querySelectorAll("[data-key]").forEach(function (el) {
          var k = el.getAttribute("data-key");
          if (el.type === "checkbox") out[k] = el.checked;
          else if (el.type === "radio") { if (el.checked) out[k] = el.value; }
          else out[k] = el.value;
        });
        try {
          var blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url;
          a.download = "step6-review-result.json";
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        } catch (e) {}
      });
    }
  } catch (e) {}
})();`;
const EXPORT_BAR = `<div class="export-bar"><button type="button" id="export-json">검수 결과 JSON 내보내기</button></div>`;

function radioGroup(name: string, key: string, options: string[]): string {
  return options.map((o) => `<label><input type="radio" name="${esc(name)}" value="${esc(o)}" data-key="${esc(key)}"> ${esc(o)}</label>`).join(" ");
}
function checkbox(key: string, label: string): string {
  return `<label class="chk"><input type="checkbox" data-key="${esc(key)}"> ${esc(label)}</label>`;
}

// ---------------------------------------------------------- shot status table --
function badgeFor(b: Badge): string {
  if (b === "WAITING") return `<span class="badge wait">WAITING</span>`;
  if (b === "INGESTED") return `<span class="badge ok">INGESTED · 검수 필요</span>`;
  if (b === "NOT_INGESTED") return `<span class="badge warn">NOT INGESTED</span>`;
  return `<span class="badge warn">ORPHAN RASTER</span>`;
}
function assetTypeText(st: ShotState): string {
  if (!st.regItem) return "registry에 항목 없음";
  const kind = st.regItem.mediaType === "image/jpeg" ? "raster (image/jpeg)" : "stand-in (image/svg+xml)";
  return `${kind}<br><code>${esc(st.regItem.file)}</code> ${st.regItem.width}×${st.regItem.height}`;
}

function statusTableSection(states: ShotState[], c: Counts): string {
  const rows = states
    .map((st) => {
      const shot = st.shot;
      const expectedPath = `${APPROVED_DIR_REL}/${shot.expectedFilename}`;
      const foundCell = st.approved ? `<a href="${esc(rel(st.approved.absPath))}">${esc(rel(st.approved.absPath))}</a>` : "없음";
      return `<tr>
        <td>${esc(shot.projectId)}</td>
        <td><code>${esc(shot.shotId)}</code></td>
        <td>${esc(shot.room)}</td>
        <td>${esc(shot.expectedAspectRatio)}</td>
        <td><code>${esc(expectedPath)}</code></td>
        <td>${foundCell}</td>
        <td>${assetTypeText(st)}</td>
        <td>${badgeFor(st.badge)}</td>
        <td>${radioGroup(`verdict-${shot.shotId}`, `shot:${shot.shotId}:verdict`, ["PASS", "REVIEW", "FAIL"])}</td>
        <td><textarea data-key="${esc(`shot:${shot.shotId}:note`)}" rows="2" placeholder="메모"></textarea></td>
      </tr>`;
    })
    .join("");
  return `<section class="status-table">
    <h2>Shot 상태 표 (${c.total})</h2>
    <div class="counts"><ul class="stat-list">
      <li>승인 파일 발견: <b>${c.approvedCount} / ${c.total}</b></li>
      <li>registry raster 자산: <b>${c.rasterCount} / ${c.total}</b></li>
      <li>Flagship(bi-01) 승인: <b>${c.flagshipApproved} / ${c.flagshipTotal}</b></li>
      <li>기타 프로젝트 승인: <b>${c.otherApproved} / ${c.otherTotal}</b></li>
      <li>불일치(mismatch): <b>${c.mismatch}</b></li>
    </ul></div>
    <div class="table-wrap"><table>
      <thead><tr><th>projectId</th><th>shotId</th><th>room</th><th>aspect</th><th>예상 approved 경로</th><th>발견된 approved 파일</th><th>현재 site 자산</th><th>상태</th><th>검수 판정</th><th>메모</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
  </section>`;
}

// ---------------------------------------------------------------- figures --
/**
 * Template seats, MEASURED on the built package (getBoundingClientRect at 390 / 1440, 2026-09-20): every seat is
 * object-fit: cover, object-position 50% 50% (intro: fill at the asset's own 17:20). The preview below applies the
 * same crop in CSS to the CURRENT site asset — a simulation of the seat, not a screenshot.
 */
const SEAT_PREVIEWS: Record<string, { label: string; w: number; h: number }[]> = {
  gallery: [
    { label: "Detail gallery 타일 1:1 (390×390 · 678×678)", w: 1, h: 1 },
    { label: "Portfolio 목록 카드 4:3 (432×324)", w: 4, h: 3 },
    { label: "Home 프로젝트 카드 ≈1.53:1 (420×275, cover shot만)", w: 420, h: 275 },
  ],
  hero: [
    { label: "Home hero @1440 (1440×818)", w: 1440, h: 818 },
    { label: "Home hero @390 — 세로 2:3 (390×585)", w: 390, h: 585 },
  ],
  band: [{ label: "@1440 (1440×570)", w: 1440, h: 570 }, { label: "@390 (390×280)", w: 390, h: 280 }],
  reviews: [{ label: "@1440 (1156×288)", w: 1156, h: 288 }, { label: "@390 (350×200)", w: 350, h: 200 }],
  plist: [{ label: "Portfolio banner @1440 (1440×320)", w: 1440, h: 320 }, { label: "@390 (390×280)", w: 390, h: 280 }],
  intro: [{ label: "Intro 17:20 — crop 없음 (510×600)", w: 510, h: 600 }],
};
function seatPreview(st: ShotState, src: string | null): string {
  const seats = SEAT_PREVIEWS[st.shot.seat];
  if (!src || !seats) return "";
  return `<div class="seats"><b>Template seat crop 미리보기 (중앙 기준 cover · 현재 site 자산)</b>${seats.map((x) => `<div class="seat"><div style="aspect-ratio:${x.w}/${x.h}"><img loading="lazy" src="${esc(src)}" alt=""></div>${esc(x.label)}</div>`).join("")}</div>`;
}
function shotMeta(shot: ManifestEntry): string {
  const refs = shot.referenceFiles.map((f) => path.basename(f)).join(", ") || "—";
  return `<code>${esc(shot.shotId)}</code> · ${esc(shot.projectId)} · ${esc(shot.room)} · ${esc(shot.expectedAspectRatio)} · 기대 파일 <code>${esc(shot.expectedFilename)}</code><br>${esc(shot.purpose)}<br>continuity: ${esc(shot.continuityRules.join(" ") || "home bible")} · style reference: ${esc(refs)}`;
}

function figureHtml(st: ShotState): string {
  const shot = st.shot;
  const siteAssetSrc = st.regItem && st.regFileExists ? rel(path.join(SITE_ASSETS, st.regItem.file)) : null;

  if (st.badge === "INGESTED" && st.approved && siteAssetSrc && st.regItem) {
    const approvedSrc = rel(st.approved.absPath);
    return `<div class="shotpair">
      <figure><img loading="lazy" src="${esc(approvedSrc)}" alt="${esc(shot.shotId)} approved original"><figcaption><span class="badge ok">APPROVED</span>원본 approved</figcaption></figure>
      <figure><img loading="lazy" src="${esc(siteAssetSrc)}" alt="${esc(shot.shotId)} ingested"><figcaption><span class="badge ok">INGESTED</span>ingested (crop·resize 결과) · ${st.regItem.width}×${st.regItem.height}</figcaption></figure>
      <p class="meta">${shotMeta(shot)}</p>
      ${seatPreview(st, siteAssetSrc)}
    </div>`;
  }
  if (st.approved) {
    // approved file exists but the current build hasn't ingested it yet (or the ingested file went missing)
    const approvedSrc = rel(st.approved.absPath);
    return `<figure><img loading="lazy" src="${esc(approvedSrc)}" alt="${esc(shot.shotId)} approved"><figcaption><span class="badge warn">NOT INGESTED · site 빌드 대기</span><code>${esc(shot.shotId)}</code> · ${esc(shot.room)} · ${esc(shot.expectedAspectRatio)}<br>asset script(<code>template-platform-step6-assets.ts</code>) + site build 재실행 필요</figcaption></figure>`;
  }
  if (siteAssetSrc) {
    const badge = st.badge === "ORPHAN_RASTER" ? `<span class="badge warn">ORPHAN RASTER · approved 원본 없음</span>` : `<span class="badge wait">WAITING · illustrated stand-in (not a photo)</span>`;
    return `<figure><img loading="lazy" src="${esc(siteAssetSrc)}" alt="${esc(shot.shotId)}"><figcaption>${badge}</figcaption><p class="shotmeta">${shotMeta(shot)}</p>${seatPreview(st, siteAssetSrc)}</figure>`;
  }
  return `<figure><figcaption><span class="badge warn">자산 파일 없음</span><code>${esc(shot.shotId)}</code></figcaption></figure>`;
}

const ROOM_GROUPS: [string, (s: ManifestEntry) => boolean, string[]][] = [
  ["Living · 거실", (s) => /living/.test(s.shotId), ["living-01.png", "living-02.png", "living-03.png", "living-04.png"]],
  ["Kitchen · 주방", (s) => /kitchen/.test(s.shotId), ["kitchen-01.png", "kitchen-02.png", "kitchen-03.png", "kitchen-04.png"]],
  ["Entrance · 현관 / 복도 수납", (s) => /entrance|hallway/.test(s.shotId), ["entrance-01.png", "entrance-02.png", "entrance-03.png"]],
  ["Bedroom · 침실", (s) => /bedroom/.test(s.shotId), ["bedroom-01.png", "bedroom-02.png"]],
  ["Bathroom · 욕실", (s) => /bathroom/.test(s.shotId), ["bathroom-01.png"]],
];

// same-home checklist (flagship) — real checkboxes + one overall verdict
const SAME_HOME_ITEMS: [string, string][] = [
  ["floor", "바닥 재질/색감 일관성"],
  ["ceiling", "천장 라인/간접조명 형태"],
  ["middoor", "중문 구조"],
  ["niche", "오크 니치/수납장 포인트"],
  ["kitchen", "주방 구조와 마감"],
  ["bathroom", "욕실 톤"],
  ["samehome", "거실/현관/주방/침실이 같은 집처럼 보이는가"],
  ["artifacts", "AI artifacts(뒤틀림, 비정상 광원, 부자연스러운 선, 가구 비례) 없음"],
  ["confusion", "before/after나 다른 프로젝트와 혼동되지 않는가"],
];
function sameHomeBlock(): string {
  const items = SAME_HOME_ITEMS.map(([id, label]) => `<li>${checkbox(`flagship:checklist:${id}`, label)}</li>`).join("");
  return `<div class="col samehome"><h3>Flagship same-home 체크리스트</h3><ul class="checklist" style="list-style:none;padding:0">${items}</ul>
    <div class="verdict"><b>Flagship same-home 판정:</b><br>${radioGroup("flagship-verdict", "flagship:verdict", ["PASS", "PARTIAL", "FAIL"])}<br><textarea data-key="flagship:note" rows="2" placeholder="메모"></textarea></div></div>`;
}

const flagship = manifest.shots.filter((s) => s.projectId === "bi-01");
const refDir = path.join(repoRoot, "references/boost-interior/project-01-white-34p");
let body = `<header><h1>부스트 인테리어 Demo — AI 이미지 Human Review</h1><nav><a href="site.html">→ Site review (viewports)</a><a href="../image-generation/00-visual-bible.md">Visual Bible</a><a href="../image-generation/01-shot-list.md">Shot list</a><a href="../image-generation/02-prompts.md">Prompts</a></nav>
<div class="banner${status.AI_PORTFOLIO_ASSETS === "PASS" ? " ok" : ""}"><p class="headline">${counts.approvedCount === 0 ? "WAITING FOR AI GENERATION" : counts.approvedCount === counts.total ? "ALL APPROVED — 검수 필요" : "PARTIAL — 일부만 승인됨"} · ${counts.approvedCount} / ${counts.total} approved</p><b>AI_PORTFOLIO_ASSETS = ${esc(status.AI_PORTFOLIO_ASSETS)}</b> — 승인 파일 ${counts.approvedCount} / ${counts.total}, registry raster 자산 ${counts.rasterCount} / ${counts.total}.
<p>${approvedStateLine(counts)} 승인된 생성 이미지를 <code>references/boost-interior/generated-approved/&lt;shotId&gt;.jpg|png|webp</code>에 넣고 <code>tsx scripts/template-platform-step6-assets.ts</code> → <code>pnpm site:build boost-interior-demo</code> → 이 스크립트를 다시 실행하면 같은 자리에 실제 이미지가 나타납니다.</p>
<p>왼쪽 reference는 <b>style reference</b>입니다 (타 업체 포트폴리오 스크린샷 — 공개 금지, 1:1 복제 비교 용도가 아님). 같은 "언어"인지 확인하세요.</p></div></header><main>`;

// ingestion warnings recorded by step6-assets.ts (files it ignored, images it had to upscale or crop heavily)
const ingestWarnings = [
  ...(status.unmatchedApprovedFiles ?? []).map((u) => `<li><b>NOT INGESTED</b> <code>${esc(u.file)}</code> — ${esc(u.reason)}</li>`),
  ...(status.inputWarnings ?? []).map((w) => `<li><b>${esc(w.kind)}</b> <code>${esc(w.file)}</code> (${esc(w.shotId)}) — ${esc(w.detail)}</li>`),
];
if (ingestWarnings.length) body += `<div class="banner"><b>Ingestion warnings (${ingestWarnings.length})</b> — build 전에 해결하세요.<ul>${ingestWarnings.join("")}</ul></div>`;
body += statusTableSection(shotStates, counts);

body += `<h2>Flagship — bi-01 수성 화이트 34평 아파트 (${flagship.length} shots)</h2>`;
body += sameHomeBlock();
for (const [title, match, refs] of ROOM_GROUPS) {
  const shots = flagship.filter(match);
  body += `<div class="group"><div class="col refs"><h3>${esc(title)} — style reference (private)</h3><div class="grid">${refs.map((f) => `<figure><img loading="lazy" src="${esc(rel(path.join(refDir, f)))}" alt="${esc(f)}"><figcaption><code>${esc(f)}</code></figcaption></figure>`).join("")}</div></div>`;
  body += `<div class="col"><h3>${esc(title)} — generated (${shots.length})</h3><div class="grid">${shots.map((s) => figureHtml(byId.get(s.shotId)!)).join("")}</div></div></div>`;
}
const others = new Map<string, ManifestEntry[]>();
for (const s of manifest.shots.filter((x) => x.projectId !== "bi-01")) others.set(s.projectId, [...(others.get(s.projectId) ?? []), s]);
for (const [pid, shots] of others) {
  body += `<h2>${esc(pid === "site" ? "Site-level seats — hero / intro / reviews / band / portfolio banner (Flagship 집)" : pid)} (${shots.length} shots)</h2><p>프로젝트 안에서는 같은 집이어야 하고, 프로젝트끼리는 서로 달라 보여야 합니다.</p><div class="col"><div class="grid">${shots.map((s) => figureHtml(byId.get(s.shotId)!)).join("")}</div></div>`;
}
body += `</main>${EXPORT_BAR}<script>${REVIEW_SCRIPT}</script>`;
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, "index.html"), page("부스트 인테리어 Demo — AI image review", body));

// ------------------------------------------------------------------ site --
interface ReportRow { route: string; viewport: string; name: string; screenshots: string[]; checks: { name: string; pass: boolean }[] }
interface Report { checks: number; passed: number; failed: number; packageDir: string; rows: ReportRow[] }
const report = JSON.parse(await readFile(path.join(RESULT, "screens/report.json"), "utf8")) as Report;

interface BuildPointer { buildInputId: string; packageDir: string; finishedAt: string }
interface BuildRecord { buildInputId: string; packageHash: string; finishedAt: string; template: { releaseId: string; templateSourceHash: string } }
const buildPointer = JSON.parse(await readFile(path.join(repoRoot, "data/site-builds/boost-interior-demo/current.json"), "utf8")) as BuildPointer;
const buildRecord = JSON.parse(await readFile(path.join(repoRoot, buildPointer.packageDir, "build-record.json"), "utf8")) as BuildRecord;

function buildIdentityBlock(record: BuildRecord): string {
  return `<div class="banner build-identity"><b>Build</b><br>buildInputId <code>${esc(record.buildInputId)}</code><br>packageHash <code>${esc(record.packageHash)}</code><br>releaseId <code>${esc(record.template.releaseId)}</code><br>templateSourceHash <code>${esc(record.template.templateSourceHash)}</code><br>finishedAt <code>${esc(record.finishedAt)}</code></div>`;
}

const SITE_CHECK_ITEMS: [string, string][] = [
  ["brand", "브랜드/문구가 Harbor & Pine 원본 fixture와 다른가?"],
  ["theme", "테마가 부스트 인테리어답게 느껴지는가 (따뜻한 오프화이트, 절제된 오렌지)?"],
  ["korean", "한글 줄바꿈이 자연스러운가?"],
  ["cta", "플로팅 CTA가 콘텐츠를 가리지 않는가?"],
  ["filters", "필터가 한국어로 자연스럽게 읽히는가?"],
  ["harborpine", "여전히 Harbor & Pine처럼 보이는 부분이 남아있는가?"],
];
function siteChecklistBlock(): string {
  return `<ul class="checks-real">${SITE_CHECK_ITEMS.map(([id, label]) => `<li>${checkbox(`site:checklist:${id}`, label)}</li>`).join("")}</ul>`;
}

function coreSixSection(r: Report, c: Counts): string {
  const CORE_SIX: [string, string, string][] = [
    ["home", "m390", "Home · 390"],
    ["home", "d1440", "Home · 1440"],
    ["portfolio", "m390", "Portfolio · 390"],
    ["portfolio", "d1440", "Portfolio · 1440"],
    ["detail-flagship", "m390", "Flagship detail · 390"],
    ["detail-flagship", "d1440", "Flagship detail · 1440"],
  ];
  const figures = CORE_SIX.map(([name, viewport, label]) => {
    const row = r.rows.find((row2) => row2.name === name && row2.viewport === viewport && row2.screenshots.length);
    if (!row) return "";
    const fold = row.screenshots.find((s) => s.endsWith("-fold.png"));
    const full = row.screenshots.find((s) => !s.endsWith("-fold.png"));
    if (!fold || !full) return "";
    const ok = row.checks.every((ch) => ch.pass);
    return `<figure><a href="../screens/${esc(full)}"><img loading="lazy" src="../screens/${esc(fold)}" alt="${esc(label)}"></a><figcaption><span class="badge ${ok ? "ok" : "wait"}">${ok ? "checks pass" : "check failed"}</span>${esc(label)} · <code>${esc(row.route)}</code></figcaption></figure>`;
  }).join("");
  return `<h2>핵심 6장</h2><p>${approvedStateLine(c)}</p><div class="grid">${figures}</div>`;
}

const SECTIONS: [string, string][] = [["home", "Home — 390 / 800 / 1000 / 1440 / 1920 (+320 stress)"], ["home-stress", ""], ["portfolio", "Portfolio — 390 / 1440"], ["portfolio-filtered", "Portfolio · filter active (전체 리모델링 + 화이트)"], ["detail-flagship", "Flagship detail — 수성 화이트 34평"], ["detail-before-after", "Another detail — 32평 주방·욕실 (공사 전/후)"], ["not-found", "404"]];
let site = `<header><h1>부스트 인테리어 Demo — Site Human Review</h1><nav><a href="index.html">→ AI image review</a></nav>
${buildIdentityBlock(buildRecord)}
<div class="banner ok"><b>Visual smoke ${report.passed} / ${report.checks}</b> · package <code>${esc(report.packageDir)}</code>
<p>같은 Template Release <code>${esc(buildRecord.template.releaseId)}</code>로 빌드한 다른 Site Instance입니다. ${approvedStateLine(counts)}</p></div>
${siteChecklistBlock()}</header><main class="shots">`;
site += coreSixSection(report, counts);
for (const [name, title] of SECTIONS) {
  const rows = report.rows.filter((r) => r.name === name && r.screenshots.length);
  if (!rows.length) continue;
  if (title) site += `<h2>${esc(title)}</h2>`;
  site += `<div class="grid">${rows.map((r) => { const full = r.screenshots.find((s) => !s.endsWith("-fold.png"))!; const ok = r.checks.every((c) => c.pass); return `<figure><a href="../screens/${esc(full)}"><img loading="lazy" src="../screens/${esc(full)}" alt="${esc(r.route)} @${esc(r.viewport)}"></a><figcaption><span class="badge ${ok ? "ok" : "wait"}">${ok ? "checks pass" : "check failed"}</span><code>${esc(r.route)}</code> @ ${esc(r.viewport.slice(1))}px · ${r.checks.filter((c) => c.pass).length}/${r.checks.length}</figcaption></figure>`; }).join("")}</div>`;
}
site += `</main>${EXPORT_BAR}<script>${REVIEW_SCRIPT}</script>`;
await writeFile(path.join(OUT, "site.html"), page("부스트 인테리어 Demo — site review", site));
console.log(JSON.stringify({ written: ["human-review/index.html", "human-review/site.html"], AI_PORTFOLIO_ASSETS: status.AI_PORTFOLIO_ASSETS, approved: counts.approvedCount, total: counts.total, mismatch: counts.mismatch }, null, 2));
