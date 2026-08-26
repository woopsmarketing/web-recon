/**
 * Release project storage (Task 25).
 *
 *   data/<host>/release-projects/<projectId>/
 *     release-project.json      release-project-v1
 *     requirements.json         release-requirements-v1
 *     operator-checklist.md     generated operator checklist
 *     technical-debt.json       preserved GED register (from Task 24 artifacts)
 *     runs/<run-id>/run.json    release-run-v1 audit records
 *              .../resolution.json  copy of an applied resolution pack
 *              .../failure.json     failure record (spec §27)
 *
 * The release project namespace is the ONLY place this layer writes project
 * state. Lineage run directories are read-only inputs; stage reruns land in
 * their own subsystem namespaces under NEW run ids.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  ReleaseProjectSchema,
  ReleaseRunSchema,
  RequirementsFileSchema,
  type ReleaseProject,
  type ReleaseRun,
  type RequirementsFile,
} from "./types.js";

export const RELEASE_PROJECT_FILE = "release-project.json";
export const REQUIREMENTS_FILE = "requirements.json";
export const CHECKLIST_FILE = "operator-checklist.md";
export const TECHNICAL_DEBT_FILE = "technical-debt.json";

export function releaseProjectDir(host: string, projectId: string): string {
  return path.join("data", host, "release-projects", projectId);
}

/** Same run-id convention as every other subsystem store. */
export function newReleaseRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function createdAtFromRunId(runId: string): string {
  const m = runId.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);
  if (!m) return new Date().toISOString();
  return `${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`;
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function saveReleaseProject(projectDir: string, project: ReleaseProject): Promise<void> {
  ReleaseProjectSchema.parse(project);
  await writeJson(path.join(projectDir, RELEASE_PROJECT_FILE), project);
}

export async function loadReleaseProject(projectDirOrFile: string): Promise<{
  project: ReleaseProject;
  projectDir: string;
}> {
  const projectDir = projectDirOrFile.endsWith(".json")
    ? path.dirname(projectDirOrFile)
    : projectDirOrFile;
  const file = path.join(projectDir, RELEASE_PROJECT_FILE);
  const project = ReleaseProjectSchema.parse(JSON.parse(await readFile(file, "utf8")));
  return { project, projectDir };
}

export async function saveRequirementsFile(
  projectDir: string,
  requirements: RequirementsFile,
): Promise<void> {
  RequirementsFileSchema.parse(requirements);
  await writeJson(path.join(projectDir, REQUIREMENTS_FILE), requirements);
}

export async function loadRequirementsFile(projectDir: string): Promise<RequirementsFile> {
  return RequirementsFileSchema.parse(
    JSON.parse(await readFile(path.join(projectDir, REQUIREMENTS_FILE), "utf8")),
  );
}

export async function saveReleaseRun(projectDir: string, run: ReleaseRun): Promise<string> {
  ReleaseRunSchema.parse(run);
  const runDir = path.join(projectDir, "runs", run.runId);
  await writeJson(path.join(runDir, "run.json"), run);
  return runDir;
}

export async function saveChecklist(projectDir: string, markdown: string): Promise<void> {
  await mkdir(projectDir, { recursive: true });
  await writeFile(path.join(projectDir, CHECKLIST_FILE), markdown, "utf8");
}
