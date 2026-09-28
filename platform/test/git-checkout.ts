/**
 * What a plain Git checkout can and cannot carry. Git stores bytes (and the executable bit), not
 * mtimes or the read-only mode `template:release` gives every stored release file. So on a fresh
 * clone every file is writable and stamped with the checkout time; tests that look at mtime or
 * mode ask these helpers first. The bytes themselves stay held by content hashes (verifyRelease,
 * baseline tree hashes), which a checkout reproduces exactly.
 */
import { execFileSync } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";

const git = (repoRoot: string, args: string[]) => execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/** Repo-relative paths under `roots` that differ from HEAD or are untracked; undefined = not a Git checkout. */
export function gitDirtyPaths(repoRoot: string, roots: string[]): Set<string> | undefined {
  try {
    const entries = git(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all", "--", ...roots]).split("\0").filter(Boolean);
    const paths = new Set<string>();
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]!;
      paths.add(e.slice(3));
      if (e[0] === "R" || e[0] === "C") i++; // a rename / copy is followed by its source path
    }
    return paths;
  } catch {
    return undefined;
  }
}

/** Is this repo-relative file tracked by Git and byte-identical to HEAD? (false outside a Git checkout) */
export function gitCleanTracked(repoRoot: string, rel: string): boolean {
  try {
    git(repoRoot, ["ls-files", "--error-unmatch", "--", rel]);
  } catch {
    return false;
  }
  const dirty = gitDirtyPaths(repoRoot, [rel]);
  return dirty !== undefined && !dirty.has(rel);
}

/**
 * A stored release file is sealed: read-only as the cut left it, or — where a checkout wrote it
 * writable — tracked and identical to the commit (its bytes are then Git's, and verifyRelease
 * re-hashes them against the release record).
 */
export async function releaseFileSealed(repoRoot: string, rel: string): Promise<boolean> {
  if (((await stat(path.join(repoRoot, rel))).mode & 0o222) === 0) return true;
  return gitCleanTracked(repoRoot, rel);
}

/**
 * Write the tree at `<commit>:<rel>` under `dest` (as `dest/<rel>`), bytes exactly as Git stores
 * them. For an artefact a later build retired from the working tree but that a commit still
 * carries; callers re-hash what they read (packageIntact), so Git is the transport, not the proof.
 */
export function gitMaterialize(repoRoot: string, commit: string, rel: string, dest: string): string {
  try {
    const tar = execFileSync("git", ["archive", "--format=tar", commit, "--", rel], { cwd: repoRoot, maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "pipe"] });
    execFileSync("tar", ["-x", "-f", "-", "-C", dest], { input: tar, stdio: ["pipe", "ignore", "pipe"] });
  } catch (e) {
    const stderr = String((e as { stderr?: Buffer }).stderr ?? "").trim();
    throw new Error(`cannot materialize ${rel} from commit ${commit} (a shallow or rewritten history lacks it): ${stderr || (e as Error).message}`);
  }
  return path.join(dest, rel);
}
