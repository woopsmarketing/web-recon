/**
 * pnpm design:fonts <templateId> [--check | --write]
 *
 * Builds every font set of the Template's design system from the pinned OFL packages of this
 * checkout (platform/design/fonts.ts) and prints, per set: the stylesheet (file, sha256, bytes),
 * the licence texts (file, sha256, bytes), the number of font files, the total bytes and — per
 * family — package@version, licence, faces.
 *
 *   (no flag)   print the measurement as JSON
 *   --check     exit 1 unless the measurement equals the pins in <template>/design/fonts.json
 *   --write     write the measured pins into <template>/design/fonts.json (after a package bump)
 *
 * Nothing is downloaded and nothing is placed in a package: that is the site builder's font step.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildFontSet, measuredPin, pinOf } from "../design/fonts";
import { templateDesign, type FontPins } from "../design/templates";

const [templateId, flag] = process.argv.slice(2);
if (!templateId || (flag !== undefined && flag !== "--check" && flag !== "--write")) {
  console.error("usage: pnpm design:fonts <templateId> [--check | --write]");
  process.exit(2);
}
const repoRoot = process.cwd();
const design = templateDesign(templateId);
const file = path.join(repoRoot, design.dir, "design", "fonts.json");
const pins = JSON.parse(await readFile(file, "utf8")) as FontPins;

const measured: Record<string, unknown> = {};
const next: FontPins = { ...pins, sets: {} };
let drift = false;
for (const [id, pin] of Object.entries(pins.sets)) {
  const built = await buildFontSet(repoRoot, id, pin);
  const now = pinOf(built);
  next.sets[id] = { ...now, families: pin.families };
  measured[id] = { stylesheet: built.stylesheet, licences: built.licences, fontFiles: built.fontFiles, bytes: built.bytes, path: `/${pins.dir}/${id}/`, families: built.families };
  if (JSON.stringify(now) !== JSON.stringify(measuredPin(pin))) drift = true;
}

if (flag === "--write") {
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
  console.log(JSON.stringify({ status: drift ? "written" : "unchanged", file: path.relative(repoRoot, file), sets: measured }, null, 2));
} else {
  console.log(JSON.stringify({ status: drift ? "drift" : "pinned", file: path.relative(repoRoot, file), sets: measured }, null, 2));
  if (flag === "--check" && drift) process.exit(1);
}
