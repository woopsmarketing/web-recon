/**
 * The boost-interior-demo QA corpus — TEST-ONLY.
 *
 * On 2026-09-29 the 11 VERIFIED_SYNTHETIC records bi-09 … bi-19 left the customer-facing demo
 * (docs/work/portfolio-experience-v1/04-record-truth-audit.md): data/sites/boost-interior-demo now
 * holds bi-01 … bi-08 only. The 11 records were moved VERBATIM into a test-only fixture
 * (platform/test/fixtures/boost-interior-synthetic/, TEST_ONLY / SYNTHETIC / NOT_CUSTOMER_FACING)
 * because the edge cases they were authored for (04-demo-data-spec §2) — exact / range totals, D-1
 * derivation and rounding, an exclusive m² basis, an absent area / projectType / style, partial
 * scopes, and a borrowed (foreign) cover (§5) — must keep being exercised.
 *
 * This module is the ONE place that composes them back: the QA corpus = the production items + the
 * synthetic items, in the original (pre-split) order. It is imported by tests only; no build,
 * publish or producer path may import it or read the fixture (portfolio-production-truth.test.ts
 * checks that). Composition never writes into data/sites: `writeQaProjects` refuses any target
 * inside the repository's data/sites.
 */
import { readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { ProjectSchema, ProjectsDocSchema, projectAssetRefs, type Project } from "../content/schema";
import { SiteSnapshotSchema, type SiteSnapshot } from "../site/instance";

export const DEMO_SITE_ID = "boost-interior-demo";
export const SYNTHETIC_FIXTURE_DIR = "platform/test/fixtures/boost-interior-synthetic";
export const SYNTHETIC_PROJECTS_FILE = `${SYNTHETIC_FIXTURE_DIR}/projects.synthetic.json`;
/** the fixture's own marker — the file says what it is, and a file without it is not this fixture */
export const SYNTHETIC_STATUS = "TEST_ONLY / SYNTHETIC / NOT_CUSTOMER_FACING";

/**
 * The pre-split 19-record Portfolio document (producer 4, document "1.1") — kept as a QA golden next
 * to the fixture (qa-golden/), NOT production. boost-chat keeps a byte-identical copy as its matcher
 * QA fixture. Literals: they name frozen bytes (formerly platform/test/golden/portfolio-v1.1-media).
 */
export const QA_GOLDEN_DIR = `${SYNTHETIC_FIXTURE_DIR}/qa-golden`;
export const QA_GOLDEN_VERSION = "856361f52e3f1b5022cce13a31afc171";
export const QA_GOLDEN_DOC_BYTES = 18520;
export const QA_GOLDEN_DOC_SHA256 = "0ae164dc03b374665d52000f997391d4b4f77325b92c60f6a3da5ec586aaac22";
export const QA_GOLDEN_MANIFEST_SHA256 = "9061827a746f986eb51127923af839930c01be7c9857ee2159a2dfae71e71e61";
/**
 * data/sites/boost-interior-demo/content/projects.json BEFORE the split (19 records, commit ee953b1),
 * and the hashJson of its public snapshot — which is the siteSnapshotHash recorded by the producer-4
 * package 71f7e5f3… built from it. The composition must reproduce both exactly (the snapshot once
 * the later deltas below — the 1.6.3 inquiry delivery + its re-pin, the 1.6.2 online inquiry + its
 * re-pin, the product rename, then the footer notice — are reverted, newest first).
 */
export const PRE_SPLIT_PROJECTS_BYTES = 54134;
export const PRE_SPLIT_PROJECTS_SHA256 = "7c8c6a9ecfb67e4b4a8cb250196e8aabd9662fbc7e0c52b5b7759644e2a8b8cb";
export const PRE_SPLIT_SNAPSHOT_HASH = "5edadd724cfbf3efb86398f22fb1d12000b819e6094c2b6b117e4fcbd939741b";
/**
 * Footer notice (2026-09-29, after the split): slots.json values["site.footer"].notice now names the
 * brand as fictional — a sixth deliberate data delta, [before, now]. The pre-split snapshot and the
 * record truth split's build (71a906c1…) carry `before`; `revertFooterNotice` puts back exactly it.
 * Since the product rename below, `now` is the notice as this delta left it (the footer-notice build
 * ddbc72ad… carries it), no longer the site's current one.
 */
export const DEMO_FOOTER_NOTICE: readonly [before: string, now: string] = [
  "본 사이트는 서비스 시연을 위한 데모이며, 프로젝트 이미지·후기 등 일부 콘텐츠는 AI로 생성된 예시입니다.",
  "부스트 인테리어는 BoostChat 기능 시연을 위한 가상 인테리어 브랜드입니다. 포트폴리오·후기는 데모용 예시이고, 사진은 AI로 생성한 예시 이미지입니다.",
];
/**
 * Footer product name (2026-10-01): the same field now names the product BoostInterior instead of
 * BoostChat — a seventh deliberate data delta, [before, now]. `before` IS the sixth delta's `now`
 * (the footer-notice build ddbc72ad… carries it), so the two reverts chain: `revertFooterProductName`
 * puts back exactly it, and `revertFooterNotice` then applies to what it returns.
 * Since the online-inquiry delta below (2026-10-02), `now` is the notice as THIS delta left it (the
 * product-rename build 01f7ac78… carries it), no longer the site's current one: it is what
 * `revertOnlineInquiry` puts back, so `revertFooterProductName` applies to what that returns.
 */
export const DEMO_FOOTER_PRODUCT_NAME: readonly [before: string, now: string] = [
  DEMO_FOOTER_NOTICE[1],
  "부스트 인테리어는 BoostInterior 기능 시연을 위한 가상 인테리어 브랜드입니다. 포트폴리오·후기는 데모용 예시이고, 사진은 AI로 생성한 예시 이미지입니다.",
];

/**
 * The pin the demo carried from the 1.6.1 re-pin (38-) until the 1.6.2 one (2026-10-02): every
 * package from the first 1.6.1 build up to the product-rename build 01f7ac78… was built from it. The
 * pin lives INSIDE the snapshot (snapshot.site.template), so those builds' recorded siteSnapshotHash
 * is taken at this pin — `atPin(snapshot, DEMO_PIN_161)`. Literal: it names a frozen release.
 */
export const DEMO_PIN_161 = {
  templateId: "interior-01",
  templateVersion: "1.6.1",
  releaseId: "interior-01-1.6.1-8da56de8d28f",
  releaseHash: "8da56de8d28f372f645c5490436cd9da1b2ce70951e212a6b031ad991771855d",
} as const;
/**
 * The pin the demo carried from the 1.6.2 re-pin (2026-10-02) until the 1.6.3 one (2026-10-03):
 * exactly one package was built from it, the online-inquiry build 38400831…. Its recorded
 * siteSnapshotHash is taken at this pin — `atPin(snapshot, DEMO_PIN_162)`. Literal: it names a
 * frozen release.
 */
export const DEMO_PIN_162 = {
  templateId: "interior-01",
  templateVersion: "1.6.2",
  releaseId: "interior-01-1.6.2-d5d4b4557a20",
  releaseHash: "d5d4b4557a20b1bce2c071cb73bf18c26bf9ef2b5914d8c4fb31ebe5b8207a18",
} as const;
/** The snapshot with site.template replaced by `pin` — the pin is the only thing the substitution touches. */
export function atPin(snapshot: SiteSnapshot, pin: SiteSnapshot["site"]["template"]): SiteSnapshot {
  return { ...snapshot, site: { ...snapshot.site, template: { ...pin } } };
}

/**
 * Online inquiry + terminology (2026-10-02, the 1.6.2 re-pin) — an eighth deliberate data delta:
 *   - a NEW site document, inquiry.json (snapshot.inquiry): the endpoint the /contact form posts to;
 *   - slots.json copy, every changed leaf listed as [section, path, before, now] (undefined = the key
 *     is absent): "포트폴리오" / "시공 사례" → the one official term "시공사례" (nav, list title, links,
 *     the 3D placeholder, the footer notice), and contact.page — the mail hand-off copy
 *     (afterSubmit, mailSubject, tooLong, tooLongTextLabel, selectTextLabel and the "not connected
 *     yet" notice) replaced by the online form's copy.
 * `before` of site.footer.notice IS the seventh delta's `now` (DEMO_FOOTER_PRODUCT_NAME[1]: the
 * product-rename build 01f7ac78… carries it), so the reverts chain: `revertOnlineInquiry` first,
 * then `revertFooterProductName`, then `revertFooterNotice`. The 1.6.2 re-pin itself is not data:
 * roll it back with `atPin(…, DEMO_PIN_161)`.
 * Since the inquiry-delivery delta below (2026-10-03), each `now` here is the value as THIS delta
 * left it (the online-inquiry build 38400831… carries them) — still the site's current value, as
 * that delta only ADDED contact.page leaves — and contact.page is no longer exactly these leaves:
 * `revertOnlineInquiry` applies to what `revertInquiryDelivery` returns.
 */
export const DEMO_ONLINE_INQUIRY_ENDPOINT = "https://boostchat.co.kr/api/widget/wgt_99kYYFOm7ABvdQbVh_8SdrnOlLrPqDI3/lead";
export const DEMO_ONLINE_INQUIRY_SLOTS: readonly (readonly [section: string, path: readonly string[], before: unknown, now: unknown])[] = [
  ["site.header", ["projectsNavLabel"], "포트폴리오", "시공사례"],
  ["site.header", ["portfolio3dNavLabel"], "3D 포트폴리오", "3D 시공사례"],
  ["home.intro", ["link", "label"], "포트폴리오 둘러보기", "시공사례 둘러보기"],
  ["home.projects-b", ["title"], "다른 시공 사례", "다른 시공사례"],
  ["portfolio.index", ["title"], "포트폴리오", "시공사례"],
  ["portfolio.detail", ["backLabel"], "포트폴리오 목록으로", "시공사례 목록으로"],
  ["site.footer", ["notice"], DEMO_FOOTER_PRODUCT_NAME[1], "부스트 인테리어는 BoostInterior 기능 시연을 위한 가상 인테리어 브랜드입니다. 시공사례·후기는 데모용 예시이고, 사진은 AI로 생성한 예시 이미지입니다."],
  ["about.page", ["portfolioLabel"], "포트폴리오 보기", "시공사례 보기"],
  ["portfolio3d.page", ["title"], "3D 포트폴리오", "3D 시공사례"],
  ["portfolio3d.page", ["body"], "공간을 더 입체적으로 확인할 수 있는 3D 포트폴리오를 준비하고 있습니다.", "공간을 더 입체적으로 확인할 수 있는 3D 시공사례를 준비하고 있습니다."],
  ["portfolio3d.page", ["portfolioLabel"], "포트폴리오 보기", "시공사례 보기"],
  ["contact.page", ["lead", "paragraphs"], ["평형과 공사 범위, 원하시는 일정을 알려 주시면 내용을 확인한 뒤 연락드립니다."], ["평형과 공사 범위, 원하시는 일정을 알려 주시면 내용을 확인한 뒤 상담을 이어갈 수 있습니다."]],
  ["contact.page", ["submitLabel"], "메일로 문의 보내기", "견적 문의 보내기"],
  ["contact.page", ["notice"], "온라인 접수는 아직 연결되어 있지 않습니다. 버튼을 누르면 입력하신 내용이 담긴 메일 작성 창이 메일 앱에서 열립니다.", "이 페이지는 BoostInterior 기능 시연용입니다."],
  ["contact.page", ["afterSubmit"], "메일 앱에서 내용을 확인한 뒤 보내 주세요. 아직 전송된 것은 아닙니다. 메일 앱이 열리지 않으면 {email} 주소로 보내 주세요.", undefined],
  ["contact.page", ["mailSubject"], "[견적 문의] {name}님", undefined],
  ["contact.page", ["tooLong"], "문의 내용이 길어 메일 앱으로 열 수 없습니다. 아직 전송된 것은 아닙니다. 아래 내용을 복사해 {email} 주소로 보내 주세요.", undefined],
  ["contact.page", ["tooLongTextLabel"], "문의 내용 (복사용)", undefined],
  ["contact.page", ["selectTextLabel"], "내용 전체 선택", undefined],
  ["contact.page", ["consentLabel"], undefined, "개인정보 수집·이용에 동의합니다. (수집: 이름·연락처·입력한 문의 내용 / 이용: BoostInterior 시연 문의 확인 / 보관: 접수 후 90일 / 동의하지 않으면 접수되지 않습니다.)"],
  ["contact.page", ["phoneHint"], undefined, "숫자 8자리 이상으로 입력해 주세요. (예: 010-1234-5678)"],
  ["contact.page", ["noScriptText"], undefined, "문의 접수에는 JavaScript가 필요합니다. 이메일로 문의해 주세요."],
  ["contact.page", ["submittingLabel"], undefined, "접수 중…"],
  ["contact.page", ["successTitle"], undefined, "견적 문의가 접수되었습니다."],
  ["contact.page", ["successBody"], undefined, "입력해주신 내용을 확인한 뒤 상담을 이어갈 수 있습니다."],
  ["contact.page", ["failureText"], undefined, "문의 접수 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요."],
  ["contact.page", ["messagePrefix"], undefined, "[홈페이지 견적 문의]"],
];

/**
 * Inquiry delivery (2026-10-03, the 1.6.3 re-pin) — a ninth deliberate data delta: slots.json
 * contact.page gained the five texts the online form shows for the failures the endpoint tells
 * apart (refused values, a changed inquiry, too many attempts, no inquiries for now) and the line
 * before the site's other contact channels. Every changed leaf is listed as [section, path, before,
 * now]; each `before` is undefined — the key was absent, so the delta is five ADDITIONS and edits
 * no value the online-inquiry delta wrote. inquiry.json (the endpoint) and every other site document
 * are untouched, and the demo sets neither optional link slot (fallbackLinkA / fallbackLinkB).
 * The reverts chain: `revertInquiryDelivery` first, then `revertOnlineInquiry`, then
 * `revertFooterProductName`, then `revertFooterNotice`. The 1.6.3 re-pin itself is not data: roll it
 * back with `atPin(…, DEMO_PIN_162)`.
 */
export const DEMO_INQUIRY_DELIVERY_SLOTS: readonly (readonly [section: string, path: readonly string[], before: unknown, now: unknown])[] = [
  ["contact.page", ["invalidText"], undefined, "입력하신 내용을 다시 확인해 주세요."],
  ["contact.page", ["conflictText"], undefined, "문의 내용이 변경되었습니다. 다시 보내 주세요."],
  ["contact.page", ["rateLimitedText"], undefined, "요청이 많아 잠시 접수가 어렵습니다. 약 {minutes}분 후 다시 시도해 주세요."],
  ["contact.page", ["capacityText"], undefined, "지금은 온라인 문의 접수가 일시적으로 어렵습니다. 나중에 다시 시도해 주세요."],
  ["contact.page", ["fallbackLead"], undefined, "다른 방법으로 문의하실 수 있습니다."],
];

/**
 * A copy of the slot values with every listed leaf put back to its `before` (absent where `before`
 * is undefined). Throws unless the values carry each leaf's `now` — `delta` names the delta in the
 * message.
 */
function revertSlotLeaves(
  source: NonNullable<SiteSnapshot["slots"]>["values"],
  leaves: readonly (readonly [section: string, path: readonly string[], before: unknown, now: unknown])[],
  delta: string,
): Record<string, Record<string, unknown>> {
  const values = structuredClone(source) as Record<string, Record<string, unknown>>;
  for (const [section, leafPath, before, now] of leaves) {
    let holder: Record<string, unknown> | undefined = values[section];
    for (const k of leafPath.slice(0, -1)) holder = holder?.[k] as Record<string, unknown> | undefined;
    const leaf = leafPath[leafPath.length - 1]!;
    const where = `${section}.${leafPath.join(".")}`;
    if (holder === undefined || holder === null || typeof holder !== "object") throw new Error(`${where}: no such slot value`);
    if (JSON.stringify(holder[leaf]) !== JSON.stringify(now)) throw new Error(`${where} is ${JSON.stringify(holder[leaf])}, not the ${delta} delta's value`);
    if (before === undefined) delete holder[leaf];
    else holder[leaf] = structuredClone(before);
  }
  return values;
}

/**
 * The snapshot with exactly the inquiry-delivery delta reverted: every listed slots leaf put back to
 * its `before` (here: removed). Throws unless the snapshot carries each leaf's `now` — i.e. unless
 * it is a snapshot of the site as that delta left it. Nothing else is touched: the inquiry document
 * stays (the endpoint is the eighth delta's), and so does the pin (see `atPin`).
 */
export function revertInquiryDelivery(snapshot: SiteSnapshot): SiteSnapshot {
  if (!snapshot.slots) throw new Error("the snapshot has no slots document");
  return { ...snapshot, slots: { ...snapshot.slots, values: revertSlotLeaves(snapshot.slots.values, DEMO_INQUIRY_DELIVERY_SLOTS, "inquiry-delivery") } };
}

/**
 * The snapshot with exactly the online-inquiry delta reverted: every listed slots leaf put back to
 * its `before` (absent where `before` is undefined) and the inquiry document dropped. Throws unless
 * the snapshot carries each leaf's `now` and exactly the declared endpoint, or while it still carries
 * a leaf of the later inquiry-delivery delta — i.e. unless it is a snapshot of the site as that
 * delta left it: since the inquiry-delivery delta, a snapshot `revertInquiryDelivery` returned. The
 * pin is NOT touched (see `atPin`).
 */
export function revertOnlineInquiry(snapshot: SiteSnapshot): SiteSnapshot {
  if (!snapshot.slots) throw new Error("the snapshot has no slots document");
  for (const [section, leafPath] of DEMO_INQUIRY_DELIVERY_SLOTS) {
    let later: unknown = snapshot.slots.values[section];
    for (const k of leafPath) later = later !== null && typeof later === "object" ? (later as Record<string, unknown>)[k] : undefined;
    if (later !== undefined) throw new Error(`${section}.${leafPath.join(".")} is still set: the snapshot carries the later inquiry-delivery delta — revert that first (revertInquiryDelivery)`);
  }
  if (JSON.stringify(snapshot.inquiry) !== JSON.stringify({ schemaVersion: 1, endpoint: DEMO_ONLINE_INQUIRY_ENDPOINT })) {
    throw new Error(`snapshot.inquiry is ${JSON.stringify(snapshot.inquiry)}, not the online-inquiry delta's endpoint document`);
  }
  const values = revertSlotLeaves(snapshot.slots.values, DEMO_ONLINE_INQUIRY_SLOTS, "online-inquiry");
  const { inquiry: _dropped, ...rest } = snapshot;
  return { ...rest, slots: { ...snapshot.slots, values } };
}

/**
 * The snapshot with exactly the footer-notice delta reverted; throws unless it carries that delta's
 * `now` — since the product rename, a snapshot `revertFooterProductName` returned.
 */
export function revertFooterNotice(snapshot: SiteSnapshot): SiteSnapshot {
  const [before, now] = DEMO_FOOTER_NOTICE;
  const footer = snapshot.slots?.values["site.footer"];
  if (!snapshot.slots || footer?.notice !== now) throw new Error(`site.footer notice is ${JSON.stringify(footer?.notice)}, not the footer-notice delta's notice`);
  return { ...snapshot, slots: { ...snapshot.slots, values: { ...snapshot.slots.values, "site.footer": { ...footer, notice: before } } } };
}

/**
 * The snapshot with exactly the product-rename delta reverted; throws unless it carries that delta's
 * `now` — since the online-inquiry delta, a snapshot `revertOnlineInquiry` returned.
 */
export function revertFooterProductName(snapshot: SiteSnapshot): SiteSnapshot {
  const [before, now] = DEMO_FOOTER_PRODUCT_NAME;
  const footer = snapshot.slots?.values["site.footer"];
  if (!snapshot.slots || footer?.notice !== now) throw new Error(`site.footer notice is ${JSON.stringify(footer?.notice)}, not the product-rename delta's notice`);
  return { ...snapshot, slots: { ...snapshot.slots, values: { ...snapshot.slots.values, "site.footer": { ...footer, notice: before } } } };
}

export interface SyntheticFixture {
  /** the fixture items exactly as stored (verbatim records, unparsed) */
  rawItems: Record<string, unknown>[];
  /** the same items, each parsed by the content model (a fixture record must itself be valid content) */
  items: Project[];
  ids: string[];
  slugs: string[];
  titles: string[];
}

const readJson = async (f: string) => JSON.parse(await readFile(f, "utf8"));

/** The TEST_ONLY synthetic fixture: its 11 records, verbatim and parsed. */
export async function readSyntheticFixture(repoRoot: string): Promise<SyntheticFixture> {
  const doc = await readJson(path.join(repoRoot, SYNTHETIC_PROJECTS_FILE));
  if (doc?.status !== SYNTHETIC_STATUS || !Array.isArray(doc.items)) throw new Error(`${SYNTHETIC_PROJECTS_FILE}: not the TEST_ONLY synthetic fixture`);
  const rawItems = doc.items as Record<string, unknown>[];
  const items = rawItems.map((x, i) => {
    const r = ProjectSchema.safeParse(x);
    if (!r.success) throw new Error(`${SYNTHETIC_PROJECTS_FILE} items[${i}] is not valid content: ${JSON.stringify(r.error.issues)}`);
    return r.data;
  });
  return { rawItems, items, ids: items.map((p) => p.id), slugs: items.map((p) => p.slug), titles: items.map((p) => p.title) };
}

/**
 * The QA projects.json text: the production document (its schema / origin header and its items, in
 * order) with the fixture items appended — i.e. the pre-split file, byte for byte (the production file
 * and the fixture keep the same `JSON.stringify(doc, null, 2)` + "\n" convention). Validated as a
 * projects document (unique ids / slugs) before it is returned.
 */
export async function composeQaProjectsText(repoRoot: string, productionProjectsFile = path.join(repoRoot, "data/sites", DEMO_SITE_ID, "content/projects.json")): Promise<string> {
  const production = await readJson(productionProjectsFile);
  const fixture = await readSyntheticFixture(repoRoot);
  const clash = (production.items as { id: string }[]).filter((p) => fixture.ids.includes(p.id)).map((p) => p.id);
  if (clash.length > 0) throw new Error(`the production corpus already holds fixture ids ${clash.join(", ")}`);
  const doc = { ...production, items: [...production.items, ...fixture.rawItems] };
  ProjectsDocSchema.parse(doc);
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/**
 * The QA snapshot, in memory: the production snapshot with the fixture records added exactly as the
 * site loader (platform/site/load.ts) would have served them from one projects.json — the same
 * visibility rule (public: published and publishedAt ≤ at; preview: all), the same id order, parsed
 * by the same SiteSnapshotSchema. Every asset a fixture record references must already be in the
 * production snapshot's asset table (the fixture owns no asset: its covers are borrowed).
 */
export function composeQaSnapshot(production: SiteSnapshot, fixture: SyntheticFixture, at: string): SiteSnapshot {
  const atMs = Date.parse(at);
  if (Number.isNaN(atMs)) throw new Error(`invalid at "${at}"`);
  const clash = production.content.projects.filter((p) => fixture.ids.includes(p.id)).map((p) => p.id);
  if (clash.length > 0) throw new Error(`the production snapshot already holds fixture ids ${clash.join(", ")}`);
  const visible = fixture.items.filter((p) => production.mode === "preview" || (p.status === "published" && Date.parse(p.publishedAt) <= atMs));
  const assets = new Set(production.assets.map((a) => a.id));
  for (const p of visible) for (const ref of projectAssetRefs(p)) if (!assets.has(ref)) throw new Error(`fixture record ${p.id} references asset ${ref}, which the production snapshot does not carry`);
  const projects = [...production.content.projects, ...structuredClone(visible)].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return SiteSnapshotSchema.parse({ ...structuredClone(production), content: { ...structuredClone(production.content), projects } });
}

/**
 * Writes the QA projects.json into a THROWAWAY copy of the demo's site directory (a test's own temp
 * root). Refuses any directory inside the repository's data/sites — the production corpus is never
 * the target. `productionProjectsFile` names the production document to compose from when it is not
 * the live one (the frozen dataset, demo-frozen-dataset.ts).
 */
export async function writeQaProjects(repoRoot: string, throwawaySiteDir: string, productionProjectsFile?: string): Promise<void> {
  const target = await realpath(throwawaySiteDir);
  const sites = await realpath(path.join(repoRoot, "data/sites"));
  if (target === sites || target.startsWith(`${sites}${path.sep}`)) throw new Error(`refusing to write the QA corpus into ${target}: it is the repository's data/sites`);
  await writeFile(path.join(target, "content/projects.json"), await composeQaProjectsText(repoRoot, productionProjectsFile));
}
