import {
  loadSiteSpec,
  SiteSpecLoadError,
  type LoadedSiteSpec,
} from "../sitespec/index.js";
import {
  ReconstructionInputError,
  SUPPORTED_SITESPEC_SCHEMA_VERSIONS,
  SUPPORTED_SITESPEC_VERSIONS,
} from "./types.js";

/**
 * The ONE door into Task 14 (items 2, 3, 14).
 *
 * `loadSiteSpec()` is the SiteSpec's public consumer API and it is structurally
 * incapable of leaving the SiteSpec root: every internal reference is proven
 * relative, `..`-free and inside the root before it is opened. That is the whole
 * input boundary of this Task — there is no second reader, no fallback path, and
 * no code in `src/reconstruction/` that opens a Task 09 `dom.json`, a Task 11
 * action file or a Task 12 pattern file. The SiteSpec's `source.*` strings are
 * audit provenance and are read by nobody here.
 *
 * Version compatibility is checked BEFORE anything is compiled, and both numbers
 * are checked (item 14): `siteSpecVersion` says what the fields mean and
 * `schemaVersion` says where they are. A generator that trusted only the first
 * would happily read a v1 contract out of a shape that had moved underneath it.
 */

export interface ReconstructionInput extends LoadedSiteSpec {}

export interface LoadReconstructionInputOptions {
  /** Re-run the SiteSpec's own invariants on load (default `true`). */
  validate?: boolean;
}

function list(values: readonly number[]): string {
  return values.join(", ");
}

/** Load and version-check a SiteSpec. Anything unsupported fails fast. */
export async function loadReconstructionInput(
  siteSpecFile: string,
  options: LoadReconstructionInputOptions = {},
): Promise<ReconstructionInput> {
  let loaded: LoadedSiteSpec;
  try {
    loaded = await loadSiteSpec(siteSpecFile, {
      validate: options.validate !== false,
    });
  } catch (err) {
    if (err instanceof SiteSpecLoadError) {
      throw new ReconstructionInputError(err.message);
    }
    throw err;
  }

  const { siteSpec } = loaded;
  const problems: string[] = [];
  if (!SUPPORTED_SITESPEC_VERSIONS.includes(siteSpec.siteSpecVersion)) {
    problems.push(
      `siteSpecVersion ${siteSpec.siteSpecVersion} is not supported (this generator implements ${list(SUPPORTED_SITESPEC_VERSIONS)})`,
    );
  }
  if (!SUPPORTED_SITESPEC_SCHEMA_VERSIONS.includes(siteSpec.schemaVersion)) {
    problems.push(
      `schemaVersion ${siteSpec.schemaVersion} is not supported (this generator reads ${list(SUPPORTED_SITESPEC_SCHEMA_VERSIONS)})`,
    );
  }
  if (problems.length > 0) {
    throw new ReconstructionInputError(
      `${siteSpecFile}: ${problems.join("; ")}. Recompile the SiteSpec with the current Task 13 compiler, or extend this generator deliberately — reading an unknown shape "because the contract version matched" is how a renderer silently produces a wrong page.`,
    );
  }

  return loaded;
}
