import { z } from "zod";
import { AssetRefSchema, CategorySchema, RecordIdSchema, SlugSchema } from "../content/schema";
import { SiteIdSchema } from "../site/instance";

/**
 * Portfolio Publisher Contract V1 — the wire shapes between BoostChat (the owner of the canonical,
 * editable portfolio) and this repository's publisher (`site:portfolio-sync`).
 *
 * The authoritative text is BoostChat's docs/reports/portfolio-cms/02-publisher-contract.md; this
 * module is its consumer-side transcription. Direction: the publisher always asks first
 * (GET export, GET asset, POST result). Nothing here names a site.
 *
 * `projects[]` is deliberately `unknown[]` at this level: each item is validated with the platform's
 * own ProjectSchema by the generator (contract P1 — this repository's content model is the
 * definition), so a rejected record is reported by its id instead of as a wire-shape error.
 */

export const EXPORT_SCHEMA = "boostchat-portfolio-export@1";
export const RESULT_SCHEMA = "boostchat-portfolio-result@1";

/** contract §2: the media types an exported portfolio image may have (no SVG — those are site-level assets) */
export const EXPORT_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type ExportMediaType = (typeof EXPORT_MEDIA_TYPES)[number];

const Sha256 = z.string().regex(/^[0-9a-f]{64}$/);
/**
 * Size limits the publisher enforces before it reads anything into memory (fail closed at `generate`).
 * One image is at most 8 MiB at the source; the margin covers a different counting of the last block.
 */
export const EXPORT_MAX_PROJECTS = 2000;
export const EXPORT_MAX_ASSETS = 20_000;
export const EXPORT_MAX_ASSET_BYTES = 8 * 1024 * 1024 + 64 * 1024;
export const EXPORT_MAX_TOTAL_ASSET_BYTES = 1024 * 1024 * 1024;
export const EXPORT_MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
/** the generator's own temp-file suffix: never a name an export may claim */
export const RESERVED_FILE_SUFFIX = ".portfolio-sync.tmp";
const Revision = z.number().int().nonnegative();

export const ExportAssetSchema = z
  .object({
    id: AssetRefSchema,
    /** file name inside the site's assets/ directory (contract §2: lowercase, no path separators) */
    file: z.string().regex(/^[a-z0-9][a-z0-9._-]*$/).max(128),
    mediaType: z.enum(EXPORT_MEDIA_TYPES),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    sha256: Sha256,
    size: z.number().int().positive().max(EXPORT_MAX_ASSET_BYTES),
    /** root-relative path on the BoostChat origin; never followed anywhere else */
    href: z.string().min(1).max(512),
  })
  .strict();
export type ExportAsset = z.infer<typeof ExportAssetSchema>;

export const PortfolioExportSchema = z
  .object({
    schema: z.literal(EXPORT_SCHEMA),
    site: z
      .object({
        siteId: SiteIdSchema,
        publicOrigin: z.string().min(1),
        /** → the generated documents' `origin`; reference fixtures are never site content */
        contentOrigin: z.enum(["customer", "synthetic-fixture"]),
      })
      .strict(),
    /** the desired revision this export describes */
    revision: Revision,
    /** the last revision reported as live; revision == liveRevision → nothing to do */
    liveRevision: Revision,
    /** written to categories.json in this order (deterministic); the DISPLAY order is decided by the site (the loader and the reader sort by id today) */
    categories: z.array(CategorySchema),
    projects: z.array(z.unknown()).max(EXPORT_MAX_PROJECTS),
    assets: z.array(ExportAssetSchema).max(EXPORT_MAX_ASSETS),
    changes: z
      .object({
        publishing: z.array(RecordIdSchema),
        /** records being taken down, each with the slug it was public under (contract §2, §5 step 4): its old detail URL must answer 404 */
        removing: z.array(z.object({ id: RecordIdSchema, slug: SlugSchema }).strict()),
      })
      .strict(),
  })
  .strict();
export type PortfolioExport = z.infer<typeof PortfolioExportSchema>;

export const RESULT_STAGES = ["generate", "build", "publish", "verify"] as const;
export type ResultStage = (typeof RESULT_STAGES)[number];
/** contract §4: error.message is at most 500 characters */
export const RESULT_MESSAGE_MAX = 500;

export const PortfolioResultSchema = z.discriminatedUnion("outcome", [
  z
    .object({
      schema: z.literal(RESULT_SCHEMA),
      revision: Revision,
      outcome: z.literal("succeeded"),
      packageHash: Sha256,
      /** version of the published /_integration/ portfolio document; omitted when the site's integration is off */
      portfolioVersion: z.string().regex(/^[0-9a-f]{32}$/).optional(),
      verified: z.object({ present: z.array(RecordIdSchema), absent: z.array(RecordIdSchema) }).strict(),
    })
    .strict(),
  z
    .object({
      schema: z.literal(RESULT_SCHEMA),
      revision: Revision,
      outcome: z.literal("failed"),
      error: z.object({ stage: z.enum(RESULT_STAGES), message: z.string().min(1).max(RESULT_MESSAGE_MAX) }).strict(),
    })
    .strict(),
]);
export type PortfolioResult = z.infer<typeof PortfolioResultSchema>;

/** contract §4 response to an accepted result */
export const ResultAckSchema = z
  .object({
    ok: z.literal(true),
    revision: Revision,
    liveRevision: Revision,
    applied: z
      .object({ published: z.array(z.string()), removed: z.array(z.string()), failed: z.array(z.string()) })
      .partial()
      .optional(),
  })
  .passthrough();
export type ResultAck = z.infer<typeof ResultAckSchema>;

/** Contract paths, all under the BoostChat base URL. */
export const exportPath = (siteId: string) => `/api/publisher/sites/${siteId}/portfolio`;
export const assetPathPrefix = (siteId: string) => `/api/publisher/sites/${siteId}/assets/`;
export const resultPath = (siteId: string) => `/api/publisher/sites/${siteId}/portfolio/result`;

/**
 * What a `failed` result tells BoostChat (and, through its admin, the customer): one fixed sentence per
 * stage. Build output, wrangler output, file paths and commands stay in the publisher's local log.
 */
export const STAGE_FAILURE_MESSAGE: Record<ResultStage, string> = {
  generate: "게시할 시공사례 데이터를 사이트에 적용하지 못했습니다. 잠시 후 다시 게시해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.",
  build: "사이트를 만드는 중 문제가 발생해 게시하지 못했습니다. 잠시 후 다시 게시해 주세요.",
  publish: "사이트를 배포하는 중 문제가 발생해 게시하지 못했습니다. 잠시 후 다시 게시해 주세요.",
  verify: "배포한 뒤 공개 사이트에서 변경 내용을 확인하지 못했습니다. 잠시 후 다시 게시해 주세요.",
};

/** One short line for a (local) message: single-spaced, clipped to the contract's limit. */
export function resultMessage(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim() || "unknown error";
  return flat.length <= RESULT_MESSAGE_MAX ? flat : `${flat.slice(0, RESULT_MESSAGE_MAX - 1)}…`;
}
