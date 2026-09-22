/**
 * Step 6 (Demo Customer Content Proof) — fal candidate image generation for ONE shot.
 *
 *   tsx scripts/template-platform-step6-fal-generate.ts <shotId> [--count 2] [--model flux-2-klein-9b]
 *
 * Reads the shot's prompt from image-generation/02-prompts.md, calls the fal queue REST API
 * (POST https://queue.fal.run/<endpoint>, poll status_url, GET response_url — the same transport
 * as youtube-harness src/images/fal-client.ts, Node built-in fetch, no SDK) and stores the results as
 * references/boost-interior/generated-candidates/<shotId>__v<N>.jpg. Nothing is approved or
 * ingested here. The run record (endpoint, seeds, request ids, sizes, estimated cost — never the
 * key) goes to image-generation/05-fal-runs.json.
 *
 * FLUX.2 has no negative prompt, so negativeConstraints are not sent (recorded as such).
 * FAL_KEY comes from .env and is only ever sent to https://queue.fal.run.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const repoRoot = process.cwd();
const DOCS = path.join(repoRoot, "docs/result/recon-template-platform-step6-demo/image-generation");
const CANDIDATES = path.join(repoRoot, "references/boost-interior/generated-candidates");
const FAL_QUEUE_ORIGIN = "https://queue.fal.run";

// endpoint ids + unit prices: youtube-harness src/domain/fal-image-models.ts (verified 2026-09-19)
const MODELS: Record<string, { endpoint: string; usdPerMegapixel: number }> = {
  "flux-1-schnell": { endpoint: "fal-ai/flux/schnell", usdPerMegapixel: 0.003 },
  "z-image-turbo": { endpoint: "fal-ai/z-image/turbo", usdPerMegapixel: 0.005 },
  "flux-2-klein-4b": { endpoint: "fal-ai/flux-2/klein/4b", usdPerMegapixel: 0.005 },
  "flux-2-klein-9b": { endpoint: "fal-ai/flux-2/klein/9b", usdPerMegapixel: 0.006 },
};
const SIZES: Record<string, { width: number; height: number }> = { "4:3": { width: 1600, height: 1200 } };

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

async function main() {
  const shotId = process.argv[2];
  if (!shotId || shotId.startsWith("--")) throw new Error("usage: step6-fal-generate <shotId> [--count N] [--model key]");
  const count = Math.max(1, Math.min(2, Number(arg("count", "2"))));
  const modelKey = arg("model", "flux-2-klein-9b");
  const model = MODELS[modelKey];
  if (!model) throw new Error(`unknown model ${modelKey} (known: ${Object.keys(MODELS).join(", ")})`);

  process.loadEnvFile(path.join(repoRoot, ".env"));
  const key = process.env.FAL_KEY;
  if (!key) throw new Error("FAL_KEY is missing from .env");

  const md = await readFile(path.join(DOCS, "02-prompts.md"), "utf8");
  const start = md.indexOf(`### ${shotId}\n`);
  if (start < 0) throw new Error(`shot ${shotId} not found in 02-prompts.md`);
  const next = md.indexOf("\n### ", start + 4);
  const section = md.slice(start, next < 0 ? undefined : next);
  const prompt = /prompt:\s*```text\n([\s\S]*?)\n```/.exec(section)?.[1]?.trim();
  const aspect = /expectedAspectRatio:\s*([\d:]+)/.exec(section)?.[1] ?? "";
  const size = SIZES[aspect];
  if (!prompt) throw new Error(`no prompt block for ${shotId}`);
  if (!size) throw new Error(`no fal size mapped for aspect "${aspect}"`);

  await mkdir(CANDIDATES, { recursive: true });
  const usdEach = Math.max(1, Math.ceil((size.width * size.height) / 1_000_000)) * model.usdPerMegapixel;
  const candidates: Record<string, unknown>[] = [];
  for (let v = 1; v <= count; v++) {
    const seed = 6000 + v;
    const started = Date.now();
    const submitted = await falJson(`${FAL_QUEUE_ORIGIN}/${model.endpoint}`, key, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, image_size: size, seed, num_images: 1, output_format: "jpeg" }),
    });
    for (;;) {
      const status = await falJson(String(submitted.status_url), key);
      if (status.status === "COMPLETED") break;
      if (Date.now() - started > 5 * 60_000) throw new Error(`fal request ${String(submitted.request_id)} timed out`);
      await new Promise((r) => setTimeout(r, 500));
    }
    const output = await falJson(String(submitted.response_url), key);
    const image = (output.images as { url: string; width?: number; height?: number; content_type?: string }[] | undefined)?.[0];
    if (!image?.url) throw new Error(`fal returned no image (request ${String(submitted.request_id)})`);
    const download = await fetch(image.url, { signal: AbortSignal.timeout(120_000) }); // CDN url, no credentials
    if (!download.ok) throw new Error(`image download failed: ${download.status}`);
    const bytes = Buffer.from(await download.arrayBuffer());
    const file = `${shotId}__v${v}.jpg`;
    await writeFile(path.join(CANDIDATES, file), bytes);
    candidates.push({ file: `references/boost-interior/generated-candidates/${file}`, seed, requestId: submitted.request_id, width: image.width ?? null, height: image.height ?? null, contentType: image.content_type ?? null, bytes: bytes.length, wallMs: Date.now() - started, hasNsfwConcepts: output.has_nsfw_concepts ?? null });
    console.log(`${file}  ${image.width}x${image.height}  ${bytes.length} bytes  ${Date.now() - started} ms`);
  }

  const runsFile = path.join(DOCS, "05-fal-runs.json");
  const runs = JSON.parse(await readFile(runsFile, "utf8").catch(() => '{"schema":"step6-fal-runs@1","runs":[]}')) as { schema: string; runs: unknown[] };
  runs.runs.push({ shotId, generatedAt: new Date().toISOString(), provider: "fal", transport: "queue REST (queue.fal.run), no SDK", model: modelKey, endpoint: model.endpoint, imageSize: size, outputFormat: "jpeg", negativeConstraintsSent: false, estimatedUsd: Math.round(usdEach * count * 1e6) / 1e6, candidates });
  await writeFile(runsFile, `${JSON.stringify(runs, null, 2)}\n`);
  console.log(`estimated cost ≈ $${(usdEach * count).toFixed(3)} → ${path.relative(repoRoot, runsFile)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
