/**
 * Step 6 (Demo Customer Content Proof) — fal candidate generation for MANY shots, shot-first prompts.
 *
 *   tsx scripts/template-platform-step6-fal-batch.ts <shotId...> | --missing  [--concurrency 4] [--seed-offset 0]
 *
 * Prompts come from image-generation/06-short-prompts.json (shot sentence + one-line home palette +
 * one-line style) because the long shared bible in 02-prompts.md drowned the shot on FLUX.2 [klein].
 * Shots listed under "edits" are image-to-image (…/9b/edit, image_urls = data URI of the approved
 * source shot), so a before/after pair shares its geometry. The image size follows the seat aspect
 * in 03-generation-manifest.json. Transport, key handling and the run log are the same as
 * template-platform-step6-fal-generate.ts. Candidates are stored as
 * generated-candidates/<shotId>__v<N>.jpg (N continues after the existing files); nothing is
 * approved or ingested here. `--missing` = every manifest shot without an approved file.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const DOCS = path.join(repoRoot, "docs/result/recon-template-platform-step6-demo/image-generation");
const CANDIDATES = path.join(repoRoot, "references/boost-interior/generated-candidates");
const APPROVED = path.join(repoRoot, "references/boost-interior/generated-approved");
const FAL_QUEUE_ORIGIN = "https://queue.fal.run";
const MODEL = { key: "flux-2-klein-9b", endpoint: "fal-ai/flux-2/klein/9b", editEndpoint: "fal-ai/flux-2/klein/9b/edit", usdPerMegapixel: 0.006 };

type Shot = { projectId: string; shotId: string; siteAsset: { width: number; height: number } };
type Prompts = { style: string; homes: Record<string, string>; shots: Record<string, string>; edits: Record<string, { from: string; prompt: string }> };

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

async function falJson(url: string, key: string, init: RequestInit = {}): Promise<Record<string, unknown>> {
  if (new URL(url).origin !== FAL_QUEUE_ORIGIN) throw new Error(`refusing to send the key to ${url}`);
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), Authorization: `Key ${key}` }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`fal ${init.method ?? "GET"} ${url} → ${res.status}: ${(await res.text().catch(() => "")).slice(0, 400)}`);
  return (await res.json()) as Record<string, unknown>;
}

/** seat aspect → fal size: 4:3 stays 1600x1200, everything else gets a 2048 (landscape) / 1600 (portrait) long edge, multiples of 16 */
function sizeFor(seat: { width: number; height: number }): { width: number; height: number } {
  const r = seat.width / seat.height;
  if (Math.abs(r - 4 / 3) < 0.01) return { width: 1600, height: 1200 };
  const round16 = (n: number) => Math.round(n / 16) * 16;
  return r >= 1 ? { width: 2048, height: round16(2048 / r) } : { width: round16(1600 * r), height: 1600 };
}

async function main() {
  process.loadEnvFile(path.join(repoRoot, ".env"));
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is missing from .env");

  const manifest = JSON.parse(await readFile(path.join(DOCS, "03-generation-manifest.json"), "utf8")) as { acceptedExtensions: string[]; shots: Shot[] };
  const prompts = JSON.parse(await readFile(path.join(DOCS, "06-short-prompts.json"), "utf8")) as Prompts;
  await mkdir(CANDIDATES, { recursive: true });
  const approved = new Set((await readdir(APPROVED)).map((f) => f.replace(/\.[^.]+$/, "")));
  const existing = await readdir(CANDIDATES);

  const flags = new Set(["--concurrency", "--seed-offset"]);
  const named = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !flags.has(all[i - 1] ?? ""));
  const wanted = process.argv.includes("--missing") ? manifest.shots.filter((s) => !approved.has(s.shotId)).map((s) => s.shotId) : named;
  if (wanted.length === 0) throw new Error("usage: step6-fal-batch <shotId...> | --missing [--concurrency N] [--seed-offset N]");
  const concurrency = Math.max(1, Math.min(8, Number(arg("concurrency", "4"))));
  const seedOffset = Number(arg("seed-offset", "0"));

  const records: Record<string, unknown>[] = [];
  const failures: { shotId: string; error: string }[] = [];
  const queue = [...wanted];
  async function worker() {
    for (let shotId = queue.shift(); shotId; shotId = queue.shift()) {
      try {
        const shot = manifest.shots.find((s) => s.shotId === shotId);
        if (!shot) throw new Error("not in 03-generation-manifest.json");
        const edit = prompts.edits[shotId];
        const sentence = edit?.prompt ?? prompts.shots[shotId];
        if (!sentence) throw new Error("no short prompt in 06-short-prompts.json");
        const prompt = edit ? `${sentence} ${prompts.style}` : `${sentence} ${prompts.homes[shot.projectId] ?? ""} ${prompts.style}`;
        const size = sizeFor(shot.siteAsset);
        const version = Math.max(0, ...existing.map((f) => new RegExp(`^${shotId}__v(\\d+)\\.`).exec(f)?.[1]).map((n) => Number(n ?? 0))) + 1;
        const seed = 7000 + version + seedOffset;
        const body: Record<string, unknown> = { prompt, image_size: size, seed, num_images: 1, output_format: "jpeg" };
        if (edit) {
          const source = await readFile(path.join(APPROVED, `${edit.from}.jpg`)).catch(() => null);
          if (!source) throw new Error(`edit source ${edit.from}.jpg is not approved yet`);
          body.image_urls = [`data:image/jpeg;base64,${source.toString("base64")}`];
        }
        const started = Date.now();
        const submitted = await falJson(`${FAL_QUEUE_ORIGIN}/${edit ? MODEL.editEndpoint : MODEL.endpoint}`, key!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        for (;;) {
          const status = await falJson(String(submitted.status_url), key!);
          if (status.status === "COMPLETED") break;
          if (Date.now() - started > 5 * 60_000) throw new Error(`fal request ${String(submitted.request_id)} timed out`);
          await new Promise((r) => setTimeout(r, 700));
        }
        const output = await falJson(String(submitted.response_url), key!);
        const image = (output.images as { url: string; width?: number; height?: number; content_type?: string }[] | undefined)?.[0];
        if (!image?.url) throw new Error(`fal returned no image (request ${String(submitted.request_id)})`);
        const download = await fetch(image.url, { signal: AbortSignal.timeout(120_000) }); // CDN url, no credentials
        if (!download.ok) throw new Error(`image download failed: ${download.status}`);
        const bytes = Buffer.from(await download.arrayBuffer());
        const file = `${shotId}__v${version}.jpg`;
        await writeFile(path.join(CANDIDATES, file), bytes);
        const usd = Math.max(1, Math.ceil((size.width * size.height) / 1_000_000)) * MODEL.usdPerMegapixel * (edit ? 2 : 1);
        records.push({ shotId, generatedAt: new Date().toISOString(), provider: "fal", transport: "queue REST (queue.fal.run), no SDK", model: MODEL.key, endpoint: edit ? MODEL.editEndpoint : MODEL.endpoint, promptSource: "06-short-prompts.json", editFrom: edit?.from ?? null, imageSize: size, outputFormat: "jpeg", negativeConstraintsSent: false, estimatedUsd: Math.round(usd * 1e6) / 1e6, candidates: [{ file: `references/boost-interior/generated-candidates/${file}`, seed, requestId: submitted.request_id, width: image.width ?? null, height: image.height ?? null, contentType: image.content_type ?? null, bytes: bytes.length, wallMs: Date.now() - started, hasNsfwConcepts: output.has_nsfw_concepts ?? null }] });
        console.log(`${file}  ${image.width}x${image.height}  ${bytes.length} bytes  ${Date.now() - started} ms`);
      } catch (error) {
        failures.push({ shotId, error: error instanceof Error ? error.message : String(error) });
        console.error(`FAILED ${shotId}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));

  const runsFile = path.join(DOCS, "05-fal-runs.json");
  const runs = JSON.parse(await readFile(runsFile, "utf8").catch(() => '{"schema":"step6-fal-runs@1","runs":[]}')) as { schema: string; runs: unknown[] };
  records.sort((a, b) => wanted.indexOf(String(a.shotId)) - wanted.indexOf(String(b.shotId)));
  runs.runs.push(...records);
  await writeFile(runsFile, `${JSON.stringify(runs, null, 2)}\n`);
  const usd = records.reduce((sum, r) => sum + Number(r.estimatedUsd), 0);
  console.log(`generated ${records.length}/${wanted.length}, failed ${failures.length}, estimated cost ≈ $${usd.toFixed(3)} → ${path.relative(repoRoot, runsFile)}`);
  if (failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
