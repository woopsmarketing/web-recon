/**
 * pnpm production:compile — Task 23: ProductionSpec + independent production build.
 *
 *   pnpm production:compile \
 *     --host stripe.com \
 *     --template data/stripe.com/recon-templates/<run> \
 *     --content-run data/stripe.com/content-runs/<run> \
 *     --theme-run data/stripe.com/theme-runs/<run> \
 *     --seo-plan data/stripe.com/production-seo-plans/<run> \
 *     --materialization data/stripe.com/asset-materializations/<run>
 */
import { runProductionCompile } from "./production/index.js";

function argValue(name: string): string {
  const index = process.argv.indexOf(name);
  if (index === -1 || index + 1 >= process.argv.length) {
    console.error(`missing required argument ${name}`);
    process.exit(2);
  }
  return process.argv[index + 1];
}

const result = await runProductionCompile({
  host: argValue("--host"),
  templateRunDir: argValue("--template"),
  contentRunDir: argValue("--content-run"),
  themeRunDir: argValue("--theme-run"),
  seoPlanRunDir: argValue("--seo-plan"),
  materializationRunDir: argValue("--materialization"),
  log: (line) => console.log(line),
});

console.log("\nproduction compile complete");
console.log(`  spec:    ${result.specFile}`);
console.log(`  build:   ${result.buildDir}`);
console.log(`  package: ${result.packageDir}`);
console.log(`  mode:    ${result.spec.indexabilityGate.decision}`);
console.log(`  blockers: ${result.spec.indexabilityGate.blockers.length}`);
