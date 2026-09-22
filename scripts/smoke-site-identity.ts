import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LAYOUT_TSX, generatedConfigTs } from "../src/reconstruction/app-template.js";
import type { BreakpointSpec } from "../src/reconstruction/index.js";
import {
  SiteIdentitySchema,
  auditSourceLeakage,
  loadAuditContext,
  renderTemplate,
  type RenderReport,
} from "../src/slotized-template/index.js";

/**
 * Task 29.1 smoke — SiteIdentity foundation, on a tiny deterministic fixture.
 *
 *   source provenance  https://source.example
 *   site identity      Example New Brand · https://customer.example · example-new-brand
 *
 * Proves: provenance survives internally; public site-identity surfaces use the
 * customer identity; Content Pack values stay authoritative for page copy (and
 * an un-overridden source string is still the CONTENT pack's leak, not
 * identity's); omitting --identity leaves the Task 29 output unchanged.
 */

let failures = 0;
let checks = 0;
function check(name: string, condition: boolean, detail = ""): void {
  checks++;
  if (condition) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const SOURCE_ROOT = "https://source.example/";
const TEMPLATE_ID = "source.example:fixture";
const TEMPLATE_VERSION = "f".repeat(64);

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

function pageTree(variant: "desktop" | "mobile"): unknown {
  return {
    id: variant,
    width: variant === "desktop" ? 1440 : 390,
    doc: {
      k: "e",
      n: "n000001",
      t: "div",
      p: { "data-wr-node": "n000001", "data-wr-doc-tag": "html", lang: "en" },
      c: [
        {
          k: "e",
          n: "n000002",
          t: "h1",
          p: { "data-wr-node": "n000002" },
          c: [{ k: "t", v: "Welcome to Source Co" }],
        },
        {
          k: "e",
          n: "n000003",
          t: "a",
          p: { "data-wr-node": "n000003", href: "https://source.example/about" },
          c: [{ k: "t", v: "About" }],
        },
        {
          k: "e",
          n: "n000004",
          t: "p",
          p: { "data-wr-node": "n000004" },
          c: [{ k: "t", v: "© Source Co" }],
        },
      ],
    },
  };
}

async function buildFixture(root: string): Promise<{ manifest: string; contentPack: string }> {
  // --- the "accepted reconstruction" app shell (real generator output) -------
  const app = path.join(root, "reconstruction", "app");
  await mkdir(path.join(app, "src/generated"), { recursive: true });
  await mkdir(path.join(app, "app"), { recursive: true });
  await mkdir(path.join(app, "public/wr"), { recursive: true });
  await mkdir(path.join(app, "reconstruction-data/pages"), { recursive: true });
  await writeFile(path.join(app, "package.json"), json({ name: "wr-clone-source.example", version: "0.0.0", private: true }));
  await writeFile(
    path.join(app, "src/generated/generated-config.ts"),
    generatedConfigTs({
      rootUrl: SOURCE_ROOT,
      breakpoint: { value: 801, provenance: "product-policy" } as unknown as BreakpointSpec,
      routeCount: 2,
      pageCount: 1,
    }),
  );
  await writeFile(path.join(app, "app/layout.tsx"), LAYOUT_TSX);
  await writeFile(path.join(app, "public/wr/generated-styles.css"), ".x{color:red}\n");
  const page = { pageId: "p000001", desktop: pageTree("desktop"), mobile: pageTree("mobile") };
  const routeMap = {
    schemaVersion: 1,
    rootUrl: SOURCE_ROOT,
    breakpoint: 801,
    routes: [
      { routeId: "r000001", key: "/", url: SOURCE_ROOT, path: "/", pageFile: "pages/p000001.json", pageSourceId: "p000001", title: "Source Co", renderCoverage: "exact-observed", behaviorCoverage: "exact-verified", observedOnThisExactUrl: true, verifiedOnThisRoute: true },
      { routeId: "r000002", key: "/about?x=1", url: "https://source.example/about?x=1", path: "/about", pageFile: "pages/p000001.json", pageSourceId: "p000001", title: "About · Source Co", renderCoverage: "exact-observed", behaviorCoverage: "exact-verified", observedOnThisExactUrl: true, verifiedOnThisRoute: true },
    ],
  };
  await writeFile(path.join(app, "reconstruction-data/pages/p000001.json"), `${JSON.stringify(page)}\n`);
  await writeFile(path.join(app, "reconstruction-data/route-map.json"), `${JSON.stringify(routeMap)}\n`);

  // --- the slotized template --------------------------------------------------
  const tpl = path.join(root, "template-run");
  await mkdir(path.join(tpl, "template/pages"), { recursive: true });
  await mkdir(path.join(tpl, "content-packs"), { recursive: true });
  const slot = (id: string, key: string, type: string, role: string, defaultValue: string) => ({
    id, key, type, role, label: key, scope: "page", pageId: "p000001", defaultValue, bindingIds: [] as string[],
  });
  const slots = [
    slot("slot_000000000001", "home.hero.title", "text", "heading", "Welcome to Source Co"),
    slot("slot_000000000002", "home.nav.about.href", "url", "link.href", "https://source.example/about"),
    slot("slot_000000000003", "home.footer.copyright", "text", "text", "© Source Co"),
    slot("slot_000000000004", "home.meta.title", "text", "meta.title", "Source Co"),
    slot("slot_000000000005", "about.meta.title", "text", "meta.title", "About · Source Co"),
  ];
  const bindings: unknown[] = [];
  let n = 0;
  const bind = (slotId: string, extra: Record<string, unknown>): void => {
    const id = `bind_${String(++n).padStart(12, "0")}`;
    slots.find((s) => s.id === slotId)!.bindingIds.push(id);
    bindings.push({ id, slotId, pageId: "p000001", ...extra });
  };
  for (const variant of ["desktop", "mobile"]) {
    bind("slot_000000000001", { nodeId: "n000002", variant, target: "textContent", address: { surface: "static", childIndex: 0, textSegment: 0 }, expectedValue: "Welcome to Source Co" });
    bind("slot_000000000002", { nodeId: "n000003", variant, target: "attribute", property: "href", address: { surface: "static" }, expectedValue: "https://source.example/about" });
    bind("slot_000000000003", { nodeId: "n000004", variant, target: "textContent", address: { surface: "static", childIndex: 0, textSegment: 0 }, expectedValue: "© Source Co" });
  }
  bind("slot_000000000004", { target: "metadata", property: "title", address: { surface: "route-map", metadataKey: "title", routeId: "r000001" }, expectedValue: "Source Co" });
  bind("slot_000000000005", { target: "metadata", property: "title", address: { surface: "route-map", metadataKey: "title", routeId: "r000002" }, expectedValue: "About · Source Co" });

  const manifest = {
    schemaVersion: 1,
    schemaName: "slotized-template-v1",
    engine: "deterministic-slot-v2-to-slotized-template",
    templateId: TEMPLATE_ID,
    templateVersion: TEMPLATE_VERSION,
    runId: "fixture",
    createdAt: "2026-09-13T00:00:00.000Z",
    source: {
      host: "source.example",
      rootUrl: SOURCE_ROOT,
      reconTemplateDir: "(fixture)",
      reconTemplateRunId: "fixture",
      reconstructionAppDir: app,
      reconstructionRunId: "fixture",
      siteSpecDir: "(fixture)",
      generatedStylesRelPath: "public/wr/generated-styles.css",
      breakpoint: 801,
    },
  };
  await writeFile(path.join(tpl, "manifest.json"), json(manifest));
  await writeFile(path.join(tpl, "slots.json"), json(slots));
  await writeFile(path.join(tpl, "bindings.json"), json(bindings));
  await writeFile(path.join(tpl, "groups.json"), json([]));
  await writeFile(path.join(tpl, "repeaters.json"), json([]));
  await writeFile(path.join(tpl, "coverage.json"), json({ schemaVersion: 1, schemaName: "slotized-coverage-v1", templateId: TEMPLATE_ID, classes: [], unslotted: [], likelyGlobal: [] }));
  await writeFile(path.join(tpl, "template/route-map.json"), json(routeMap));
  await writeFile(path.join(tpl, "template/pages/p000001.json"), json(page));
  await writeFile(
    path.join(tpl, "template/source.json"),
    json({
      reconstructionAppDir: app,
      generatedStylesRelPath: "public/wr/generated-styles.css",
      siteSpecDir: "(fixture)",
      reconTemplateDir: "(fixture)",
      pageFiles: { p000001: "pages/p000001.json" },
    }),
  );
  // Content pack: hero, link and titles are customer copy; the footer is left
  // at its default ON PURPOSE (identity must not touch it).
  const contentPack = path.join(tpl, "content-packs/customer.json");
  await writeFile(
    contentPack,
    json({
      schemaVersion: 1,
      schemaName: "content-pack-v1",
      templateId: TEMPLATE_ID,
      templateVersion: TEMPLATE_VERSION,
      label: "customer",
      slots: {
        slot_000000000001: "Hello from the content pack",
        slot_000000000002: "/about",
        slot_000000000004: "Home",
        slot_000000000005: "About us",
      },
      repeaters: {},
    }),
  );
  return { manifest: path.join(tpl, "manifest.json"), contentPack };
}

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(path.relative(base, full));
  }
  return out.sort();
}

async function main(): Promise<void> {
  const root = await mkdtemp(path.join(tmpdir(), "wr-site-identity-"));
  try {
    const { manifest, contentPack } = await buildFixture(root);
    const identityFile = path.join(root, "identity.json");
    await writeFile(
      identityFile,
      json({
        schemaVersion: "1",
        brandName: "Example New Brand",
        publicOrigin: "https://customer.example",
        slug: "example-new-brand",
        locale: "ko-KR",
      }),
    );

    // 1. schema validation -----------------------------------------------------
    console.log("[1] SiteIdentity validation");
    const valid = { schemaVersion: "1", brandName: "Example New Brand", slug: "example-new-brand", locale: "ko-KR" };
    check("minimal identity (no publicOrigin) is valid", SiteIdentitySchema.safeParse(valid).success);
    check("publicOrigin trailing slash normalizes to origin", SiteIdentitySchema.safeParse({ ...valid, publicOrigin: "https://customer.example/" }).data?.publicOrigin === "https://customer.example");
    for (const [label, patch] of [
      ["publicOrigin with a path", { publicOrigin: "https://customer.example/shop" }],
      ["publicOrigin ftp scheme", { publicOrigin: "ftp://customer.example" }],
      ["publicOrigin not a URL", { publicOrigin: "customer.example" }],
      ["slug with uppercase/space", { slug: "Example Brand" }],
      ["slug with path separator", { slug: "../evil" }],
      ["empty brandName", { brandName: "  " }],
      ["empty locale", { locale: "" }],
      ["unknown field", { productionBaseUrl: "https://x.example" }],
    ] as const) {
      check(`rejects ${label}`, !SiteIdentitySchema.safeParse({ ...valid, ...patch }).success);
    }

    // 2. render WITHOUT identity (Task 29 behavior) ------------------------------
    console.log("[2] render without --identity");
    const plainDir = path.join(root, "render-plain");
    const plain = await renderTemplate({ templateManifestFile: manifest, contentPackFile: contentPack, outDir: plainDir, runId: "2026-09-13T00-00-00-000Z" });
    const appDir = path.join(root, "reconstruction", "app");
    for (const rel of ["package.json", "src/generated/generated-config.ts", "app/layout.tsx"]) {
      check(`no-identity ${rel} byte-identical to the reconstruction`, (await readFile(path.join(plainDir, rel), "utf8")) === (await readFile(path.join(appDir, rel), "utf8")));
    }
    const plainRouteMap = JSON.parse(await readFile(path.join(plainDir, "reconstruction-data/route-map.json"), "utf8"));
    check("no-identity route map keeps source URLs", plainRouteMap.rootUrl === SOURCE_ROOT && plainRouteMap.routes[1].url === "https://source.example/about?x=1");
    check("no-identity report has no siteIdentity", plain.siteIdentity === undefined && plain.identitySurfaces === undefined);
    check("no-identity provenance recorded", plain.provenance.sourceOrigin === "https://source.example");
    const neutral = await renderTemplate({
      templateManifestFile: manifest,
      contentPackFile: await (async () => {
        const file = path.join(root, "default.json");
        await writeFile(file, json({ schemaVersion: 1, schemaName: "content-pack-v1", templateId: TEMPLATE_ID, templateVersion: TEMPLATE_VERSION, slots: {}, repeaters: {} }));
        return file;
      })(),
      outDir: path.join(root, "render-neutral"),
      runId: "2026-09-13T00-00-00-001Z",
      assertNeutral: true,
    });
    check("default pack without identity is still NEUTRAL", neutral.neutral === true, (neutral.neutralityDiffs ?? []).join("; "));
    const appFiles = await listFiles(appDir);
    const neutralFiles = (await listFiles(path.join(root, "render-neutral"))).filter((f) => !["manifest.json", "render-report.json"].includes(f));
    let identical = appFiles.join("|") === neutralFiles.join("|");
    for (const rel of appFiles) {
      if (!identical) break;
      identical = (await readFile(path.join(appDir, rel), "utf8")) === (await readFile(path.join(root, "render-neutral", rel), "utf8"));
    }
    check("default pack without identity: app tree byte-identical (diff -r clean)", identical);

    // 3. render WITH identity ----------------------------------------------------
    console.log("[3] render with --identity");
    const idDir = path.join(root, "render-identity");
    const report: RenderReport = await renderTemplate({
      templateManifestFile: manifest,
      contentPackFile: contentPack,
      siteIdentityFile: identityFile,
      outDir: idDir,
      runId: "2026-09-13T00-00-00-002Z",
    });
    check("render applied with 0 failures", report.failed.length === 0, JSON.stringify(report.failed));

    const renderManifest = JSON.parse(await readFile(path.join(idDir, "manifest.json"), "utf8"));
    check("PROVENANCE: render manifest provenance.sourceOrigin = https://source.example", renderManifest.provenance?.sourceOrigin === "https://source.example");
    check("PROVENANCE: render report provenance.sourceHost = source.example", report.provenance.sourceHost === "source.example");
    check("IDENTITY: render manifest siteIdentity.publicOrigin = https://customer.example", renderManifest.siteIdentity?.publicOrigin === "https://customer.example");
    check("provenance and identity origins differ", renderManifest.provenance.sourceOrigin !== renderManifest.siteIdentity.publicOrigin);
    const templateManifest = JSON.parse(await readFile(manifest, "utf8"));
    check("template manifest source.rootUrl untouched", templateManifest.source.rootUrl === SOURCE_ROOT);

    const routeMap = JSON.parse(await readFile(path.join(idDir, "reconstruction-data/route-map.json"), "utf8"));
    check("route-map rootUrl → https://customer.example/", routeMap.rootUrl === "https://customer.example/", routeMap.rootUrl);
    check("route-map url keeps path+query on customer origin", routeMap.routes[1].url === "https://customer.example/about?x=1", routeMap.routes[1].url);
    check("route-map titles come from the Content Pack (not brandName)", routeMap.routes[0].title === "Home" && routeMap.routes[1].title === "About us");

    const pkg = JSON.parse(await readFile(path.join(idDir, "package.json"), "utf8"));
    check("package name = slug", pkg.name === "example-new-brand", pkg.name);
    const config = await readFile(path.join(idDir, "src/generated/generated-config.ts"), "utf8");
    check("generated config SITE_PUBLIC_ORIGIN", config.includes('SITE_PUBLIC_ORIGIN: string | null = "https://customer.example";'));
    check("generated config SITE_BRAND_NAME / SITE_SLUG / SITE_LOCALE", config.includes('SITE_BRAND_NAME = "Example New Brand"') && config.includes('SITE_SLUG = "example-new-brand"') && config.includes('SITE_LOCALE = "ko-KR"'));
    check("generated config keeps non-identity constants", config.includes("export const BREAKPOINT = 801;") && config.includes("GENERATED_STYLES_HREF"));
    check("generated config no longer names source.example", !config.includes("source.example"));
    const layout = await readFile(path.join(idDir, "app/layout.tsx"), "utf8");
    check("layout <html lang={SITE_LOCALE}>", layout.includes("<html lang={SITE_LOCALE}>"));
    check("layout metadata fallback + metadataBase", layout.includes("export const metadata: Metadata") && layout.includes("metadataBase: new URL(SITE_PUBLIC_ORIGIN)"));

    const renderedPage = JSON.parse(await readFile(path.join(idDir, "reconstruction-data/pages/p000001.json"), "utf8"));
    const kids = (variant: "desktop" | "mobile") => renderedPage[variant].doc.c;
    check("document locale node lang → ko-KR (both variants)", renderedPage.desktop.doc.p.lang === "ko-KR" && renderedPage.mobile.doc.p.lang === "ko-KR");
    check("CONTENT: hero copy = Content Pack value (not brandName)", kids("desktop")[0].c[0].v === "Hello from the content pack" && kids("mobile")[0].c[0].v === "Hello from the content pack");
    check("CONTENT: link href = Content Pack value", kids("desktop")[1].p.href === "/about");
    check("CONTENT: un-packed footer copy is left alone by identity", kids("desktop")[2].c[0].v === "© Source Co");
    check("identity surfaces reported", (report.identitySurfaces ?? []).filter((s) => s.status === "rewritten").length === 5, JSON.stringify(report.identitySurfaces));
    check("no SITE_IDENTITY_SURFACE_UNPATCHED warning", !report.warnings.some((w) => w.code === "SITE_IDENTITY_SURFACE_UNPATCHED"));

    // 4. leakage audit split -----------------------------------------------------
    console.log("[4] source leakage audit: internal provenance vs public identity");
    const ctx = await loadAuditContext(manifest);
    const idAudit = await auditSourceLeakage(ctx, idDir, "identity", true);
    const idCounts = idAudit["counts"] as Record<string, number>;
    const idPublic = idAudit["publicIdentity"] as { siteIdentityApplied: boolean; gated: boolean; leaks: unknown[] };
    check("identity render: public identity leaks = 0", idCounts["publicIdentityLeaks"] === 0, JSON.stringify(idPublic.leaks));
    check("identity render: identity bucket is gated", idPublic.siteIdentityApplied && idPublic.gated);
    check("identity render: internal provenance refs > 0 and ALLOWED", (idCounts["internalProvenanceRefs"] ?? 0) > 0 && (idAudit["internalProvenance"] as { allowed: boolean }).allowed);
    const contentLeaks = idAudit["leaks"] as Array<{ surface: string; nodeId?: string }>;
    check("footer default is a CONTENT leak (slot-bound), not identity", contentLeaks.length > 0 && contentLeaks.every((l) => l.surface.startsWith("text") && l.nodeId === "n000004"), JSON.stringify(contentLeaks));

    const plainAudit = await auditSourceLeakage(ctx, plainDir, "plain", true);
    const plainCounts = plainAudit["counts"] as Record<string, number>;
    const plainPublic = plainAudit["publicIdentity"] as { siteIdentityApplied: boolean; gated: boolean; leaks: Array<{ surface: string }> };
    check("no-identity render: source identity surfaces reported as public identity leaks", plainCounts["publicIdentityLeaks"]! >= 3, JSON.stringify(plainPublic.leaks.map((l) => l.surface)));
    check("no-identity render: identity bucket NOT gated (Task 29 gate unchanged)", !plainPublic.gated && plainCounts["unslottableLeaks"] === 0);
    check("no-identity render: gated verdict depends only on content leaks", plainAudit.verdict === idAudit.verdict);

    // 5. identity without publicOrigin -------------------------------------------
    console.log("[5] identity without publicOrigin");
    const noOriginFile = path.join(root, "identity-no-origin.json");
    await writeFile(noOriginFile, json(valid));
    const noOrigin = await renderTemplate({ templateManifestFile: manifest, contentPackFile: contentPack, siteIdentityFile: noOriginFile, outDir: path.join(root, "render-no-origin"), runId: "2026-09-13T00-00-00-003Z" });
    const noOriginMap = JSON.parse(await readFile(path.join(root, "render-no-origin/reconstruction-data/route-map.json"), "utf8"));
    check("route map root-relative, no origin invented", noOriginMap.rootUrl === "/" && noOriginMap.routes[1].url === "/about?x=1");
    check("SITE_IDENTITY_ORIGIN_MISSING warning", noOrigin.warnings.some((w) => w.code === "SITE_IDENTITY_ORIGIN_MISSING"));
    const invalidFile = path.join(root, "identity-invalid.json");
    await writeFile(invalidFile, json({ ...valid, publicOrigin: "https://customer.example/path" }));
    let refused = false;
    try {
      await renderTemplate({ templateManifestFile: manifest, contentPackFile: contentPack, siteIdentityFile: invalidFile, outDir: path.join(root, "render-invalid") });
    } catch (error) {
      refused = /site identity failed validation/.test((error as Error).message);
    }
    check("invalid identity refused before rendering", refused);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
  console.log(`\nsmoke:site-identity ${failures === 0 ? "PASS" : "FAIL"} — ${checks - failures}/${checks} checks`);
  if (failures > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
