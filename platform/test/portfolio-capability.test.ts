/**
 * The portfolio runtime CAPABILITY and its release gate — `pnpm test:portfolio-capability`.
 *
 *   [capability] the declaration a manifest file carries is read from its text (a literal member,
 *                nothing else); the resolver answers for every release in the store — declared by
 *                the release, inferred for exactly ONE release cut before the capability existed,
 *                unsupported otherwise — and every stored release still verifies byte for byte
 *   [consumers]  the kit builder, the site builder and the publisher ask the resolver: the kit of
 *                the legacy release is still the vendored one (sha256), a release without the
 *                capability has no kit, cannot be built as a shell, and a shell package whose
 *                release this checkout cannot judge is not planned
 *   [gate]       createRelease in throwaway roots: the working tree cuts the release the store
 *                holds (gate passed, emptyState recorded); a Template without the capability cuts
 *                the very release it always did; every way to get it wrong is refused and NOTHING
 *                is recorded — a runtime that is not declared, a declaration without a runtime, a
 *                kit that cannot be bundled, a placeholder left in a page, a dangling empty state;
 *                a clean refusal of "nothing published" is recorded as emptyState: refused
 *
 * Reads the repository; writes only under the OS temp directory. No build, no browser, no network.
 */
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SiteBuildError, prepareSiteInput } from "../build/site-build";
import { PORTFOLIO_RUNTIME_GATE, PortfolioRuntimeCapabilitySchema, recordedEmptyState, resolvePortfolioRuntime, runtimeModulesOf } from "../portfolio-runtime/capability";
import { PortfolioRuntimeGateError, readDeclaredPortfolioRuntime } from "../portfolio-runtime/gate";
import { RENDERER_FILE, RuntimeKitError, buildRuntimeKit } from "../portfolio-runtime/kit";
import { PublishError, planPublish } from "../publish/publish";
import { ReleaseError, RELEASES_DIR, createRelease, loadRelease, verifyRelease, type ReleaseRecord } from "../release/release";
import { sha256 } from "../util/hash";
import template from "../../templates/interior-02/v1/template";

const repoRoot = process.cwd();
const TEMPLATE = "interior-02";
/**
 * A release of a Template that declared no portfolio runtime when it was cut (interior-03 declares one
 * since 1.1.0). It is re-cut below from its OWN frozen files, so the check does not depend on any
 * working tree staying without a runtime.
 */
const PLAIN_TEMPLATE = "interior-03";
const PLAIN_RELEASE = "interior-03-1.0.0-2a949e9f0247";
/** the releases of OTHER Templates that declare the capability — each one cut through the gate, each proven by portfolio-runtime.test.ts */
const OTHER_DECLARED_RELEASES = ["interior-01-1.7.0-3b5c917a5005", "interior-03-1.1.0-0e434d80b8e4"] as const;
const SHELL_SITE = "boost-interior-demo-02";
/** THE release cut before the capability existed that ships a portfolio runtime — a live site pins it */
const LEGACY_RELEASE = "interior-02-1.1.0-be2c1e2d3850";
/** renderer.mjs of that release's kit, as BoostChat vendors it (vendor/portfolio-runtime-kits/<release>/kit.json) */
const LEGACY_KIT_SHA256 = "ae21a3e03d404d39736dfd77386bd46c6c76424454fed1939c2bf7139d1b703f";
const CONTRACT = "portfolio-runtime@1";

let passed = 0;
const failed: string[] = [];
async function check(name: string, fn: () => unknown | Promise<unknown>) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failed.push(name);
    console.log(`  FAIL ${name}\n       ${(error as Error).message.split("\n").join("\n       ")}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
const eq = (a: unknown, b: unknown, msg: string) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
/** the error a promise / call rejects with, which must be of `type` */
async function refusal<E extends Error>(type: new (...args: never[]) => E, run: () => unknown | Promise<unknown>, label: string): Promise<string> {
  try {
    await run();
  } catch (error) {
    assert(error instanceof type, `${label}: expected ${type.name}, got ${(error as Error).name}: ${(error as Error).message}`);
    return error.message;
  }
  throw new Error(`${label}: expected a refusal`);
}
const exists = (p: string) => stat(p).then(() => true, () => false);

const siteIds = await readdir(path.join(repoRoot, "data/sites"));
const store = path.join(repoRoot, RELEASES_DIR);
const allReleases: ReleaseRecord[] = [];
for (const templateId of (await readdir(store)).filter((d) => !d.startsWith(".")).sort()) {
  for (const releaseId of (await readdir(path.join(store, templateId))).filter((d) => !d.startsWith(".")).sort()) allReleases.push(await loadRelease(repoRoot, templateId, releaseId));
}
const headId = (() => {
  const ids = allReleases.filter((r) => r.templateId === TEMPLATE && r.templateVersion === template.version).map((r) => r.releaseId);
  if (ids.length !== 1) throw new Error(`releases of the working-tree version ${template.version}: ${ids.join(", ") || "none"}`);
  return ids[0]!;
})();
const tmp = await mkdtemp(path.join(os.tmpdir(), "recon-portfolio-capability-"));

try {
  // ------------------------------------------------------------ capability --
  console.log("\n[capability] declaration and resolver");

  await check("C1 a manifest file's declaration is read from its text: one literal member (as const / satisfies allowed) — absent = undefined, supported: false = no capability", () => {
    const read = (text: string) => readDeclaredPortfolioRuntime("template.ts", text);
    eq(read(`export default defineTemplate({ id: "x" });`), undefined, "not declared");
    eq(read(`export default { ...m, portfolioRuntime: { supported: true, contract: "${CONTRACT}" } };`), { supported: true, contract: CONTRACT }, "declared");
    eq(read(`export default { ...m, portfolioRuntime: { supported: true, contract: "${CONTRACT}" } as const };`), { supported: true, contract: CONTRACT }, "as const");
    eq(read(`export default { ...m, "portfolioRuntime": ({ supported: true, contract: \`${CONTRACT}\` } satisfies Cap) };`), { supported: true, contract: CONTRACT }, "satisfies, quoted key");
    eq(read(`export default { ...m, portfolioRuntime: { supported: false } };`), { supported: false }, "supported: false");
    eq(read(`// portfolioRuntime: { supported: true, contract: "${CONTRACT}" }\nexport default m;`), undefined, "a comment declares nothing");
    eq(PortfolioRuntimeCapabilitySchema.safeParse({ supported: true, contract: CONTRACT }).success, true, "schema accepts the declaration");
  });

  await check("C2 anything that is not that literal is refused, never guessed: another contract, a missing contract, an extra key, a computed value, a shorthand, a variable, two declarations", async () => {
    const BAD: [label: string, text: string, message: RegExp][] = [
      ["another contract", `export default { portfolioRuntime: { supported: true, contract: "portfolio-runtime@2" } };`, /expected \{ supported: true, contract: "portfolio-runtime@1" \}/],
      ["no contract", `export default { portfolioRuntime: { supported: true } };`, /expected \{ supported: true/],
      ["an extra key", `export default { portfolioRuntime: { supported: true, contract: "${CONTRACT}", sites: ["a"] } };`, /not a boolean or string literal/],
      ["supported: false with a contract", `export default { portfolioRuntime: { supported: false, contract: "${CONTRACT}" } };`, /expected \{ supported: true/],
      ["a computed contract", `export default { portfolioRuntime: { supported: true, contract: CONTRACT } };`, /not a boolean or string literal/],
      ["a computed flag", `export default { portfolioRuntime: { supported: hasRuntime(), contract: "${CONTRACT}" } };`, /not a boolean or string literal/],
      ["not an object literal", `export default { portfolioRuntime: capability };`, /not an object literal/],
      ["a spread inside", `export default { portfolioRuntime: { ...base, supported: true } };`, /not a plain "key: literal"/],
      ["a shorthand member", `const portfolioRuntime = cap();\nexport default { ...m, portfolioRuntime };`, /names portfolioRuntime but not as a literal member/],
      ["assigned afterwards", `const t = { ...m };\nt.portfolioRuntime = cap;\nexport default t;`, /names portfolioRuntime but not as a literal member/],
      ["two declarations", `const a = { portfolioRuntime: { supported: false } };\nexport default { portfolioRuntime: { supported: true, contract: "${CONTRACT}" } };`, /declares portfolioRuntime 2 times/],
    ];
    for (const [label, text, message] of BAD) {
      const said = await refusal(PortfolioRuntimeGateError, () => readDeclaredPortfolioRuntime("template.ts", text), label);
      assert(message.test(said), `${label}: ${said}`);
    }
    for (const bad of [{ supported: true }, { supported: true, contract: "portfolio-runtime@2" }, { supported: "yes", contract: CONTRACT }, { supported: false, contract: CONTRACT }, { supported: true, contract: CONTRACT, extra: 1 }, {}, null]) {
      eq(PortfolioRuntimeCapabilitySchema.safeParse(bad).success, false, `schema refuses ${JSON.stringify(bad)}`);
    }
  });

  await check(`C3 the resolver over the whole store (${allReleases.length} releases): declared by the release = the working tree's and ${OTHER_DECLARED_RELEASES.length} named release(s) of other Templates; legacy = exactly ${LEGACY_RELEASE}; every other release is unsupported and says why`, () => {
    const by = { release: [] as string[], legacy: [] as string[], unsupported: [] as string[] };
    for (const r of allReleases) {
      const support = resolvePortfolioRuntime(r);
      if (support.supported) {
        eq(support.contract, CONTRACT, `${r.releaseId} contract`);
        by[support.declared].push(r.releaseId);
      } else {
        assert(/does not declare the portfolio runtime/.test(support.reason), `${r.releaseId}: ${support.reason}`);
        by.unsupported.push(r.releaseId);
      }
    }
    const declared = [headId, ...OTHER_DECLARED_RELEASES].sort();
    eq([...by.release].sort(), declared, "releases that declare the capability");
    eq(by.legacy, [LEGACY_RELEASE], "releases the legacy inference applies to — a closed set: nothing may join it");
    eq(by.unsupported.length, allReleases.length - declared.length - 1, "everything else");
    // a declared release carries the member AND its passed gate with a recorded empty state
    for (const r of allReleases.filter((x) => declared.includes(x.releaseId))) {
      eq([r.portfolioRuntime, r.gates[PORTFOLIO_RUNTIME_GATE]?.pass], [{ supported: true, contract: CONTRACT }, true], `${r.releaseId} record`);
      assert(recordedEmptyState(r) !== undefined, `${r.releaseId}: the gate recorded no empty state`);
    }
    // a release without the capability carries neither the member nor the gate (its hash is what it was)
    for (const r of allReleases.filter((x) => !declared.includes(x.releaseId))) eq([r.portfolioRuntime, r.gates[PORTFOLIO_RUNTIME_GATE]], [undefined, undefined], `${r.releaseId} record`);
  });

  await check("C4 the resolver's rules, on records: a declaration needs its passed gate and a contract this platform speaks; the legacy inference needs BOTH runtime modules and a record with neither the member nor the gate", () => {
    const legacy = allReleases.find((r) => r.releaseId === LEGACY_RELEASE)!;
    const head = allReleases.find((r) => r.releaseId === headId)!;
    const [shellModule, runtimeModule] = runtimeModulesOf(legacy);
    eq([shellModule, runtimeModule], [`templates/${TEMPLATE}/v1/runtime/shell.ts`, `templates/${TEMPLATE}/v1/runtime/portfolio.ts`], "the two runtime modules");
    const without = (r: ReleaseRecord, file: string) => ({ ...r, files: r.files.filter((f) => f.path !== file) });
    eq(resolvePortfolioRuntime(without(legacy, shellModule!)).supported, false, "legacy without runtime/shell.ts");
    eq(resolvePortfolioRuntime(without(legacy, runtimeModule!)).supported, false, "legacy without runtime/portfolio.ts");
    eq(resolvePortfolioRuntime({ ...legacy, gates: { ...legacy.gates, [PORTFOLIO_RUNTIME_GATE]: { pass: false, detail: "x" } } }).supported, false, "a record that carries the gate is not a legacy record");
    // a declared release is judged by its declaration alone — never by its files
    eq(resolvePortfolioRuntime({ ...head, files: [] }), { supported: true, contract: CONTRACT, declared: "release" }, "declared: the file list is not consulted");
    const other = resolvePortfolioRuntime({ ...head, portfolioRuntime: { supported: true, contract: "portfolio-runtime@2" } });
    assert(!other.supported && /"portfolio-runtime@2".*speaks "portfolio-runtime@1"/.test(other.reason), `another contract: ${JSON.stringify(other)}`);
    const { [PORTFOLIO_RUNTIME_GATE]: _gate, ...noGate } = head.gates;
    const unproven = resolvePortfolioRuntime({ ...head, gates: noGate });
    assert(!unproven.supported && /no passed "portfolio-runtime-kit" gate/.test(unproven.reason), `declared without the gate: ${JSON.stringify(unproven)}`);
    eq(resolvePortfolioRuntime({ ...head, gates: { ...noGate, [PORTFOLIO_RUNTIME_GATE]: { pass: false, detail: "x" } } }).supported, false, "declared with a failed gate");
  });

  await check(`C5 every stored release still verifies byte for byte (${allReleases.length}); a record whose capability was edited does not`, async () => {
    for (const r of allReleases) await verifyRelease(repoRoot, r);
    const head = allReleases.find((r) => r.releaseId === headId)!;
    const { portfolioRuntime: _member, ...stripped } = head;
    assert(/releaseHash does not match/.test(await refusal(ReleaseError, () => verifyRelease(repoRoot, stripped as ReleaseRecord), "member removed")), "removing the member is detected");
    assert(/releaseHash does not match/.test(await refusal(ReleaseError, () => verifyRelease(repoRoot, { ...head, portfolioRuntime: { supported: true, contract: "portfolio-runtime@2" } }), "contract edited")), "editing the contract is detected");
    const legacy = allReleases.find((r) => r.releaseId === LEGACY_RELEASE)!;
    assert(/releaseHash does not match/.test(await refusal(ReleaseError, () => verifyRelease(repoRoot, { ...legacy, portfolioRuntime: { supported: true, contract: CONTRACT } }), "member added")), "adding the member to an old record is detected");
  });

  // ------------------------------------------------------------- consumers --
  console.log("\n[consumers] kit builder, site builder, publisher");

  await check(`K1 the legacy release's kit is still the vendored one: renderer.mjs sha256 ${LEGACY_KIT_SHA256.slice(0, 12)}…; the working tree's release has a kit of its own`, async () => {
    const legacy = await buildRuntimeKit({ repoRoot, templateId: TEMPLATE, releaseId: LEGACY_RELEASE, sourceCommit: "test" });
    eq(sha256(legacy.files[RENDERER_FILE]), LEGACY_KIT_SHA256, "renderer.mjs of the legacy release");
    const head = await buildRuntimeKit({ repoRoot, templateId: TEMPLATE, releaseId: headId, sourceCommit: "test" });
    eq([head.info.releaseId, head.info.templateVersion], [headId, template.version], "the kit of the working tree's release");
    assert(sha256(head.files[RENDERER_FILE]) !== LEGACY_KIT_SHA256, "another release, another kit");
  });

  await check("K2 a release without the capability has no kit — the kit builder says what the resolver says", async () => {
    const plain = allReleases.filter((x) => (x.templateId === TEMPLATE && x.templateVersion.startsWith("1.0.")) || x.releaseId === PLAIN_RELEASE);
    assert(plain.some((x) => x.releaseId === PLAIN_RELEASE) && plain.length > 1, `releases without the capability: ${plain.map((x) => x.releaseId).join(", ")}`);
    for (const r of plain) {
      const said = await refusal(RuntimeKitError, () => buildRuntimeKit({ repoRoot, templateId: r.templateId, releaseId: r.releaseId, sourceCommit: "test" }), r.releaseId);
      assert(said.includes("cannot be composed at publish time") && said.includes("does not declare the portfolio runtime"), `${r.releaseId}: ${said}`);
    }
  });

  await check("B1 the site builder: the incremental site builds on its pin; re-pinned to a release without the capability it is refused before anything is materialized", async () => {
    const live = await prepareSiteInput({ repoRoot, siteId: SHELL_SITE, mode: "public", at: "2026-10-10T00:00:00.000Z" });
    eq(live.incremental, true, "Demo 02 is planned as a shell build on its pinned release");
    const plain = allReleases.find((r) => r.templateId === TEMPLATE && r.templateVersion === "1.0.1")!;
    const root = path.join(tmp, "repin");
    await mkdir(path.join(root, "data/sites"), { recursive: true });
    await symlink(store, path.join(root, RELEASES_DIR));
    await cp(path.join(repoRoot, "data/sites", SHELL_SITE), path.join(root, "data/sites", SHELL_SITE), { recursive: true });
    const siteFile = path.join(root, "data/sites", SHELL_SITE, "site.json");
    const doc = JSON.parse(await readFile(siteFile, "utf8"));
    doc.template = { templateId: plain.templateId, templateVersion: plain.templateVersion, releaseId: plain.releaseId, releaseHash: plain.releaseHash };
    await writeFile(siteFile, JSON.stringify(doc, null, 2));
    const said = await refusal(SiteBuildError, () => prepareSiteInput({ repoRoot: root, siteId: SHELL_SITE, mode: "public", at: "2026-10-10T00:00:00.000Z" }), "re-pinned");
    assert(said.includes(`release ${plain.releaseId} cannot be`) && said.includes("does not declare the portfolio runtime"), said);
  });

  await check("P1 the publisher: the shell package of Demo 02 is planned (its release resolves); the same package in a checkout whose release store cannot judge its release is not", async () => {
    const plan = await planPublish({ repoRoot, siteId: SHELL_SITE, hostname: "capability.test.example" });
    assert(plan.shell !== undefined, "Demo 02's current package is a shell package");
    const current = JSON.parse(await readFile(path.join(repoRoot, "data/site-builds", SHELL_SITE, "current.json"), "utf8")) as { buildInputId: string; packageDir: string };
    const root = path.join(tmp, "no-release-store");
    const dest = path.join(root, "data/site-builds", SHELL_SITE, "packages", current.buildInputId);
    await cp(path.join(repoRoot, current.packageDir), dest, { recursive: true });
    await writeFile(path.join(root, "data/site-builds", SHELL_SITE, "current.json"), JSON.stringify({ ...current, packageDir: path.relative(root, dest) }));
    const said = await refusal(PublishError, () => planPublish({ repoRoot: root, siteId: SHELL_SITE, hostname: "capability.test.example" }), "no release store");
    assert(said.includes("is a portfolio shell package built with") && said.includes("cannot say whether that release has a portfolio runtime"), said);
  });

  // ------------------------------------------------------------------ gate --
  console.log("\n[gate] portfolio-runtime-kit, in throwaway roots");

  const PLATFORM_FILES = ["content", "settings", "theme", "assets", "slots", "site", "tsconfig.json", "runtime/package.json", "runtime/pnpm-lock.yaml"];
  /** A repository-root-shaped directory that holds what a release is cut from: one Template + the platform runtime. */
  async function cutRoot(name: string, templateId: string, edits: Record<string, (text: string) => string> = {}, remove: string[] = []): Promise<string> {
    const root = path.join(tmp, name);
    await cp(path.join(repoRoot, "templates", templateId), path.join(root, "templates", templateId), { recursive: true, filter: (src) => !/(^|\/)(node_modules|\.next|out)(\/|$)/.test(src.slice(repoRoot.length)) });
    for (const f of PLATFORM_FILES) await cp(path.join(repoRoot, "platform", f), path.join(root, "platform", f), { recursive: true });
    const dir = path.join(root, "templates", templateId, "v1");
    for (const [rel, edit] of Object.entries(edits)) {
      const before = await readFile(path.join(dir, rel), "utf8");
      const after = edit(before);
      assert(after !== before, `${name}: the edit of ${rel} changed nothing`);
      await writeFile(path.join(dir, rel), after);
    }
    for (const rel of remove) await rm(path.join(dir, rel));
    return root;
  }
  const cut = (root: string, templateId: string, templateVersion: string) => createRelease({ repoRoot: root, templateId, major: 1, templateVersion, siteIds, now: "2026-10-10T00:00:00.000Z" });
  /** nothing of a release — not even a temporary directory — is in the root's store */
  const recordedNothing = async (root: string) => !(await exists(path.join(root, RELEASES_DIR))) || (await readdir(path.join(root, RELEASES_DIR, TEMPLATE)).catch(() => [] as string[])).length === 0;
  const replace = (from: string, to: string) => (text: string) => {
    assert(text.includes(from), `expected to find ${JSON.stringify(from)}`);
    return text.replace(from, to);
  };
  const DECLARATION = `portfolioRuntime: { supported: true, contract: "${CONTRACT}" } as const,`;
  /** every refused cut: [label, the root, what the gate must say] */
  async function refusedCut(label: string, root: string, message: RegExp) {
    const said = await refusal(ReleaseError, () => cut(root, TEMPLATE, template.version), label);
    assert(said.startsWith("release gates failed:") && said.includes(`${PORTFOLIO_RUNTIME_GATE}: `) && message.test(said), `${label}: ${said}`);
    assert(await recordedNothing(root), `${label}: something was recorded in ${root}`);
  }

  await check("G1 the working tree cuts the release the store holds: the gate passed, the record carries the declared capability and emptyState: supported; cutting again changes nothing", async () => {
    const root = await cutRoot("head", TEMPLATE);
    const first = await cut(root, TEMPLATE, template.version);
    eq([first.created, first.record.releaseId], [true, headId], "the same bytes cut the same release");
    eq(first.record.portfolioRuntime, { supported: true, contract: CONTRACT }, "record.portfolioRuntime");
    eq(first.record.portfolioRuntime, template.portfolioRuntime, "…is what the manifest declares");
    const gate = first.record.gates[PORTFOLIO_RUNTIME_GATE];
    assert(gate?.pass === true && gate.detail.includes(`contract ${CONTRACT}`) && gate.detail.includes("emptyState: supported"), `gate: ${JSON.stringify(gate)}`);
    eq(first.portfolioRuntimeGate, { applicable: true, pass: true, detail: gate.detail, emptyState: "supported" }, "the cut reports its gate");
    eq([recordedEmptyState(first.record), resolvePortfolioRuntime(first.record)], ["supported", { supported: true, contract: CONTRACT, declared: "release" }], "resolver");
    await verifyRelease(root, first.record);
    eq(JSON.stringify(first.record.gates), JSON.stringify(allReleases.find((r) => r.releaseId === headId)!.gates), "gates = the stored release's");
    const again = await cut(root, TEMPLATE, template.version);
    eq([again.created, again.record.releaseId, again.portfolioRuntimeGate.emptyState], [false, headId, "supported"], "cut again: verified, not rewritten");
  });

  await check("G2 a Template that declares no portfolio runtime cuts the very release it always did: same id, no member, no gate — the gate is passed as not applicable", async () => {
    const stored = allReleases.filter((r) => r.releaseId === PLAIN_RELEASE);
    eq(stored.map((r) => r.templateId), [PLAIN_TEMPLATE], `${PLAIN_RELEASE} in the store`);
    // what that release was cut from: its own frozen files, laid out as the repository was (the terms it froze stand in for provenance.json)
    const root = path.join(tmp, "plain");
    const frozen = path.join(store, PLAIN_TEMPLATE, PLAIN_RELEASE, "files");
    await cp(path.join(frozen, "templates"), path.join(root, "templates"), { recursive: true });
    await cp(path.join(frozen, "platform"), path.join(root, "platform"), { recursive: true });
    await mkdir(path.join(root, "platform/runtime"), { recursive: true });
    await cp(path.join(frozen, "package.json"), path.join(root, "platform/runtime/package.json"));
    await cp(path.join(frozen, "pnpm-lock.yaml"), path.join(root, "platform/runtime/pnpm-lock.yaml"));
    await writeFile(path.join(root, "templates", PLAIN_TEMPLATE, "v1/provenance.json"), JSON.stringify({ forbiddenTerms: stored[0]!.forbiddenTerms }));
    const res = await cut(root, PLAIN_TEMPLATE, stored[0]!.templateVersion);
    eq([res.record.releaseId, res.record.releaseHash], [stored[0]!.releaseId, stored[0]!.releaseHash], "release identity is untouched by the new gate");
    eq([res.record.portfolioRuntime, Object.keys(res.record.gates)], [undefined, ["source-isolation", "template-code-rules"]], "nothing is added to the record");
    eq([res.portfolioRuntimeGate.applicable, res.portfolioRuntimeGate.pass], [false, true], "passed: not applicable");
    assert(res.portfolioRuntimeGate.detail.startsWith("not applicable:"), res.portfolioRuntimeGate.detail);
    eq(resolvePortfolioRuntime(res.record).supported, false, "resolver");
  });

  await check("G3 a runtime is declared, never implied: shipping runtime/shell.ts / runtime/portfolio.ts without the declaration (absent, or supported: false) is refused; nothing is recorded", async () => {
    await refusedCut("declaration removed", await cutRoot("undeclared", TEMPLATE, { "template.ts": replace(DECLARATION, "") }), /ships templates\/interior-02\/v1\/runtime\/shell\.ts and templates\/interior-02\/v1\/runtime\/portfolio\.ts but its manifest does not declare the capability/);
    await refusedCut("supported: false", await cutRoot("declared-false", TEMPLATE, { "template.ts": replace(DECLARATION, "portfolioRuntime: { supported: false },") }), /but its manifest says supported: false/);
    await refusedCut("not a literal", await cutRoot("computed", TEMPLATE, { "template.ts": replace(DECLARATION, "portfolioRuntime: capability(),") }), /portfolioRuntime is not an object literal/);
  });

  await check("G4 a declaration needs its runtime: a missing module, or a declaration that is not a member of the exported manifest, is refused; nothing is recorded", async () => {
    await refusedCut("no runtime/shell.ts", await cutRoot("no-shell", TEMPLATE, {}, ["runtime/shell.ts"]), /declares the portfolio runtime but the release has no templates\/interior-02\/v1\/runtime\/shell\.ts/);
    await refusedCut(
      "declared beside the manifest",
      await cutRoot("beside", TEMPLATE, { "template.ts": (t) => replace(DECLARATION, "")(t).replace("export default template;", `export const capability = { ${DECLARATION} };\n\nexport default template;`) }),
      /but the manifest it exports carries none: the declaration must be a member of the exported manifest/,
    );
  });

  await check("G5 no valid kit, no release: a runtime module the kit bundler refuses (an import that cannot be part of an import-free renderer) fails the gate; nothing is recorded", async () => {
    const root = await cutRoot("unbundlable", TEMPLATE, { "runtime/portfolio.ts": (t) => `import { notFound } from "next/navigation";\n${t}\nexport const never = notFound;\n` });
    await refusedCut("unbundlable", root, /no runtime kit can be produced from the release files — bundling .* failed:[\s\S]*"next\/navigation" .* cannot be part of a portfolio runtime kit/);
  });

  await check("G6 the smoke render is judged: a placeholder left in a composed page fails the gate; nothing is recorded", async () => {
    const root = await cutRoot("placeholder", TEMPLATE, {
      "runtime/portfolio.ts": replace("return createElement(SlotElement, { slot, data });", 'return slot === "portfolio.index" ? createElement(SlotPlaceholder, { slot }) : createElement(SlotElement, { slot, data });'),
    });
    await refusedCut("placeholder", root, /one published project: \/portfolio still holds the placeholder of slot "portfolio\.index"/);
  });

  await check("G7 nothing published, answered ok but not safely: the list page every other page links to is not rendered → refused (render a real empty state, or refuse); nothing is recorded", async () => {
    const root = await cutRoot("dangling", TEMPLATE, { "runtime/portfolio.ts": replace("portfolioListPage(ctx, n, { emptyFirstPage: true })", "portfolioListPage(ctx, n, { emptyFirstPage: false })") });
    await refusedCut("dangling empty state", root, /nothing published: the kit answers ok but the result is not a safe empty state — \/portfolio is a shell page of the package \(its other pages link to it\) and was not rendered/);
  });

  await check("G8 nothing published, REFUSED cleanly: ok: false with a problem that says why is a valid answer — the release is cut and records emptyState: refused", async () => {
    const WHY = "this Template needs at least one published project";
    const root = await cutRoot("refuses-empty", TEMPLATE, {
      "runtime/portfolio.ts": replace("const pages: RuntimePage[] = [homePage(ctx)];", `if (ctx.routes.params("portfolio.detail").length === 0) throw new Error("${WHY}");\n    const pages: RuntimePage[] = [homePage(ctx)];`),
    });
    const res = await cut(root, TEMPLATE, template.version);
    eq([res.created, res.portfolioRuntimeGate.emptyState, recordedEmptyState(res.record)], [true, "refused", "refused"], "cut, with the refusal recorded");
    assert(res.record.gates[PORTFOLIO_RUNTIME_GATE]!.detail.includes(`emptyState: refused ("(render): ${WHY}")`), res.record.gates[PORTFOLIO_RUNTIME_GATE]!.detail);
    assert(res.record.releaseId !== headId, "another runtime, another release");
    eq(resolvePortfolioRuntime(res.record).supported, true, "the release still supports the runtime");
  });
} finally {
  await rm(tmp, { recursive: true, force: true });
}

console.log(`\nportfolio-capability: ${passed} passed, ${failed.length} failed`);
if (failed.length > 0) {
  for (const f of failed) console.log(`  FAILED: ${f}`);
  process.exit(1);
}
