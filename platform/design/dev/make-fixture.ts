import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { applyBrand } from "../../provision/brand";
import { planScaffold } from "../../provision/scaffold";
import { SOURCE_MARKER_FILE, SOURCE_MARKER_V2_TEXT } from "../../portfolio-sync/managed";
import { applyPreset, type BrandAppearance } from "../apply";
import { loadPreset } from "../preset";
import type { ReleasePin } from "./fixture-root";

/**
 * A fixture site for design work, written into a design root (fixture-root.ts) — never into the
 * checkout's data/sites.
 *
 *   starter (rendered for the fixture's name and phone, exactly as provisioning renders it)
 *     → the fixture brand block (platform/provision applyBrand — sample text, no image)
 *     → optional preset (applyPreset, CONTRACTS E4 precedence)
 *     → content profile
 *
 * Content profiles (CONTRACTS E3 rule 3):
 *   thin0      no project · no hero photo · no about photo · no phone
 *   thin1      1 project        thin3   3 projects        regular8   8 projects
 *   longname   8 projects, a 20-character company name, a hero heading near the brand block's limit
 *              (38 of 40 characters) and the first two project titles made long (41 / 42 characters)
 *
 * Every word of a fixture is sample text and says so; projects, their categories and their
 * photographs are the synthetic records of an existing fixture site of the repository
 * (PROJECT_SOURCE, read only). Nothing is fetched.
 *
 * `incremental: true` writes the site as a provisioned site is (managed marker, empty portfolio):
 * it builds as a SHELL package, and the same records are returned as the publisher's export for
 * the runtime kit — the pair the kit-parity check compares with the ordinary build.
 */
export const FIXTURE_PROFILES = ["thin0", "thin1", "thin3", "regular8", "longname"] as const;
export type FixtureProfile = (typeof FIXTURE_PROFILES)[number];

const PROJECT_SOURCE = "data/sites/ongyeol-interior-demo";
const SPEC_BASE = "platform/provision/fixtures/smoke-spec.json";
const PROJECT_COUNT: Record<FixtureProfile, number> = { thin0: 0, thin1: 1, thin3: 3, regular8: 8, longname: 8 };
export const FIXTURE_NAME = "샘플 인테리어";
/** exactly 20 characters */
export const FIXTURE_LONG_NAME = "샘플 인테리어 디자인 건축 스튜디오즈";
/** longname: the hero heading, 38 characters (the brand block allows 40) */
export const FIXTURE_LONG_HEADING = "샘플 대표 문구가 길게 들어갈 때의 줄바꿈을 확인하기 위한 자리입니다";
/** longname: appended to the titles of the first two projects (the source titles are 7–8 characters) */
export const FIXTURE_LONG_TITLE_TAILS = [" 34평 전체 리모델링 — 긴 제목의 줄바꿈을 확인하는 샘플", " 25평 부분 리모델링 — 두 줄을 넘는 제목을 확인하는 샘플"] as const;

/** The fixture brand block: sample sentences only — no figure, no claim, nothing a real business would have to stand behind. */
export const FIXTURE_BRAND = {
  identity: {
    tagline: "머무는 시간을 기준으로 공간을 다시 그립니다",
    introduction: {
      title: "샘플 소개 제목이 들어갈 자리입니다",
      body: [
        "이 문단은 디자인을 확인하기 위한 샘플 문장입니다. 실제 사이트에서는 업체가 직접 쓴 소개 글이 이 자리에 들어갑니다.",
        "두 번째 샘플 문단입니다. 문단이 둘일 때의 간격과 줄 길이를 확인하기 위해 넣었습니다.",
      ],
    },
  },
  hero: { heading: "샘플 대표 문구가 들어갈 자리입니다" },
  contact: { address: "샘플 주소 (예시)", hours: "샘플 운영 시간 (예시)", serviceArea: "샘플 지역" },
} as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;
const json = (value: unknown): Buffer => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const parse = (bytes: Buffer | undefined, what: string): Doc => {
  if (!bytes) throw new Error(`fixture: the planned site has no ${what}`);
  return JSON.parse(bytes.toString("utf8")) as Doc;
};
const sha256 = (data: Buffer): string => createHash("sha256").update(data).digest("hex");

export interface FixturePortfolio {
  categories: Doc[];
  projects: Doc[];
  /** registry entries with the real bytes' hash and size, as the publisher exports them */
  assets: Doc[];
  /** asset id → file holding its bytes */
  files: Map<string, string>;
}

export interface Fixture {
  siteId: string;
  siteDir: string;
  profile: FixtureProfile;
  presetId: string | null;
  release: ReleasePin;
  /** slug of the first project (the detail page a harness opens); undefined for thin0 */
  firstSlug: string | undefined;
  portfolio: FixturePortfolio;
}

export interface FixtureOptions {
  /** the checkout (read only: the project source and the spec base) */
  repoRoot: string;
  /** the design root the site is written into */
  root: string;
  siteId: string;
  release: ReleasePin;
  profile: FixtureProfile;
  presetId?: string | null;
  /** brand colours / surface / typography on top of the fixture brand block */
  appearance?: BrandAppearance;
  incremental?: boolean;
}

export async function makeFixture(opts: FixtureOptions): Promise<Fixture> {
  const { repoRoot, root, siteId, profile } = opts;
  if (Array.from(FIXTURE_LONG_NAME).length !== 20) throw new Error("fixture: the long name is not 20 characters");
  const brandName = profile === "longname" ? FIXTURE_LONG_NAME : FIXTURE_NAME;

  // ---- starter, as provisioning renders it ----
  const base = JSON.parse(await readFile(path.join(repoRoot, SPEC_BASE), "utf8")) as Doc;
  const spec = {
    ...base,
    siteId,
    hostname: `${siteId}.boostweb.co.kr`,
    publicOrigin: `https://${siteId}.boostweb.co.kr`,
    template: { templateId: opts.release.templateId, releaseId: opts.release.releaseId, releaseHash: opts.release.releaseHash },
    identity: { ...base.identity, brandName },
    contact: { phone: profile === "thin0" ? null : base.contact.phone, email: null },
  };
  let files = (await planScaffold({ repoRoot: root, spec })).files;

  // ---- brand block, then the preset ----
  const brand = { ...FIXTURE_BRAND, ...(profile === "longname" ? { hero: { heading: FIXTURE_LONG_HEADING } } : {}), ...(opts.appearance ? { appearance: opts.appearance } : {}) };
  // with a preset the palette is judged ONCE, by applyPreset, on what ends up together (as the rebuild path does: brandThenDesign)
  const presetId = opts.presetId ?? null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  files = applyBrand({ files, brand: brand as any, indexing: "noindex", brandName, assets: new Map(), deferContrast: presetId !== null });
  const preset = presetId === null ? null : await loadPreset({ repoRoot, templateId: opts.release.templateId, presetId });
  files = applyPreset(files, preset, opts.appearance ?? null);

  // a fixture loads no third-party script: nothing it shows may depend on a real host
  files.set("scripts.json", json({ schemaVersion: 1, headScripts: [] }));

  // ---- content profile ----
  const source = path.join(repoRoot, PROJECT_SOURCE);
  const allProjects = (JSON.parse(await readFile(path.join(source, "content/projects.json"), "utf8")) as Doc).items as Doc[];
  const projects = allProjects
    .slice(0, PROJECT_COUNT[profile])
    .map((p, i) => (profile === "longname" && i < FIXTURE_LONG_TITLE_TAILS.length ? { ...p, title: `${p.title as string}${FIXTURE_LONG_TITLE_TAILS[i]}` } : p));
  const categoryIds = new Set(projects.map((p) => p.category as string));
  const categories = ((JSON.parse(await readFile(path.join(source, "content/categories.json"), "utf8")) as Doc).items as Doc[]).filter((c) => categoryIds.has(c.id as string));
  const referenced = new Set<string>();
  JSON.stringify(projects, (key, value: unknown) => (key === "asset" && typeof value === "string" ? (referenced.add(value), value) : value));
  const sourceRegistry = (JSON.parse(await readFile(path.join(source, "assets/registry.json"), "utf8")) as Doc).items as Doc[];
  const portfolio: FixturePortfolio = { categories, projects, assets: [], files: new Map() };
  const projectAssets = sourceRegistry.filter((a) => referenced.has(a.id as string));
  for (const entry of projectAssets) {
    const file = path.join(source, "assets", entry.file as string);
    const bytes = await readFile(file);
    portfolio.assets.push({ ...entry, sha256: sha256(bytes), size: bytes.length });
    portfolio.files.set(entry.id as string, file);
  }

  if (opts.incremental) {
    files.set(SOURCE_MARKER_FILE, Buffer.from(SOURCE_MARKER_V2_TEXT));
  } else {
    const origin = parse(files.get("content/projects.json"), "content/projects.json").origin as string;
    files.set("content/projects.json", json({ schema: "projects@1", origin, items: projects }));
    files.set("content/categories.json", json({ schema: "categories@1", origin, items: categories }));
    const registry = parse(files.get("assets/registry.json"), "assets/registry.json");
    files.set("assets/registry.json", json({ ...registry, items: [...registry.items, ...projectAssets] }));
    for (const entry of projectAssets) files.set(`assets/${entry.file}`, await readFile(portfolio.files.get(entry.id as string)!));
  }

  if (profile === "thin0") {
    // no hero photo: no banner at all · no about photo: the slot is left unset
    const banners = parse(files.get("content/banners.json"), "content/banners.json");
    files.set("content/banners.json", json({ ...banners, items: [] }));
    const slots = parse(files.get("slots.json"), "slots.json");
    const about = { ...(slots.values["about.page"] ?? {}) };
    delete about.photoMedia;
    files.set("slots.json", json({ ...slots, values: { ...slots.values, "about.page": about } }));
  }

  const siteDir = path.join(root, "data/sites", siteId);
  for (const [rel, bytes] of files) {
    await mkdir(path.dirname(path.join(siteDir, rel)), { recursive: true });
    await writeFile(path.join(siteDir, rel), bytes);
  }
  return { siteId, siteDir, profile, presetId, release: opts.release, firstSlug: projects[0]?.slug as string | undefined, portfolio };
}
