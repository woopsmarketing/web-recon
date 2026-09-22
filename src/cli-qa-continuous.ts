import { ContinuousQaInputError, runContinuousQa } from "./responsive-qa/continuous/index.js";

/**
 * Continuous Responsive QA (Responsive Core P0, contract §C3).
 *
 *   pnpm qa:continuous <reconstruction-run-dir> --site-spec <site-spec.json> --routes /a,/b
 *     [--out <dir>] [--min 390 --max 1920] [--extrapolate 1921,2560]
 *     [--css-override <file>] [--source-origin <origin>] [--label BEFORE]
 *
 * Exit codes: 0 every route PASS, 1 at least one route FAIL, 2 bad input,
 * 3 infrastructure failure.
 */

const USAGE =
  "usage: qa:continuous <reconstruction-run-dir> --site-spec <site-spec.json> --routes /a,/b " +
  "[--out <dir>] [--min 390] [--max 1920] [--extrapolate 1921,2560] [--css-override <file>] " +
  "[--source-origin <origin>] [--label <label>]";

function parseArgs(argv: string[]): Parameters<typeof runContinuousQa>[0] {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      if (eq > 0) flags.set(arg.slice(2, eq), arg.slice(eq + 1));
      else {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--")) throw new ContinuousQaInputError(`${arg} needs a value`);
        flags.set(arg.slice(2), value);
        i++;
      }
    } else positional.push(arg);
  }
  const known = new Set(["site-spec", "routes", "out", "min", "max", "extrapolate", "css-override", "source-origin", "label"]);
  for (const key of flags.keys()) if (!known.has(key)) throw new ContinuousQaInputError(`unknown flag --${key}`);
  const runDir = positional[0];
  const siteSpecFile = flags.get("site-spec");
  const routes = (flags.get("routes") ?? "").split(",").map((r) => r.trim()).filter(Boolean);
  if (!runDir || !siteSpecFile || routes.length === 0) throw new ContinuousQaInputError(USAGE);
  const int = (name: string): number | undefined => {
    const raw = flags.get(name);
    if (raw === undefined) return undefined;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) throw new ContinuousQaInputError(`--${name} must be a positive integer`);
    return value;
  };
  const extrapolateRaw = flags.get("extrapolate");
  const extrapolate =
    extrapolateRaw === undefined
      ? undefined
      : extrapolateRaw === "none" || extrapolateRaw === ""
        ? []
        : extrapolateRaw.split(",").map((v) => {
            const n = Number(v);
            if (!Number.isInteger(n) || n <= 0) throw new ContinuousQaInputError(`bad --extrapolate value ${v}`);
            return n;
          });
  return {
    runDir,
    siteSpecFile,
    routes,
    outDir: flags.get("out"),
    min: int("min"),
    max: int("max"),
    extrapolate,
    cssOverrideFile: flags.get("css-override"),
    sourceOrigin: flags.get("source-origin"),
    label: flags.get("label"),
  };
}

async function main(): Promise<number> {
  let options: Parameters<typeof runContinuousQa>[0];
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
  try {
    const summary = await runContinuousQa(options);
    for (const route of summary.routes) {
      console.log(
        `${route.verdict} ${route.path} intervals ${route.intervalsPass}/${route.intervalsTotal} (${route.totalMs} ms)`,
      );
    }
    console.log(`written: ${summary.outDir}`);
    return summary.routes.every((r) => r.verdict === "PASS") ? 0 : 1;
  } catch (err) {
    if (err instanceof ContinuousQaInputError) {
      console.error(err.message);
      return 2;
    }
    console.error(err instanceof Error ? err.stack ?? err.message : String(err));
    return 3;
  }
}

main().then((code) => process.exit(code));
