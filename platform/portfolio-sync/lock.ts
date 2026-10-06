import { randomBytes } from "node:crypto";
import { mkdir, open, readFile, rm, stat, utimes } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * One portfolio sync per site at a time, across processes (the build has its own lock; this one covers
 * the whole cycle). The lock file names its holder — pid, host, start time and a nonce — and the holder
 * touches it while it works, so a lock is judged by more than "is that pid alive":
 *
 *   same host, pid gone                      → stale, taken over
 *   same host, pid is OURS, nonce is not     → stale (a dead process that had the pid this one got)
 *   same host, pid alive                     → held — unless it has not been touched for `staleMs`
 *                                              (the pid was reused by an unrelated process)
 *   another host / unreadable                → held until it has not been touched for `staleMs`
 *
 * Nothing but that takes a lock over: no flag steals a live one. Released only by its own nonce.
 */
export interface SyncLock {
  release(): Promise<void>;
}
export class LockHeldError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockHeldError";
  }
}
interface Holder {
  pid: number;
  host: string;
  startedAt: string;
  nonce: string;
}
const mine = new Set<string>();

export async function acquireSyncLock(file: string, opts: { staleMs?: number; heartbeatMs?: number } = {}): Promise<SyncLock> {
  const staleMs = opts.staleMs ?? 5 * 60 * 1000;
  const holder: Holder = { pid: process.pid, host: os.hostname(), startedAt: new Date().toISOString(), nonce: randomBytes(12).toString("hex") };
  await mkdir(path.dirname(file), { recursive: true });
  const take = async () => {
    const handle = await open(file, "wx");
    await handle.writeFile(`${JSON.stringify(holder)}\n`);
    await handle.close();
  };
  try {
    await take();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const text = await readFile(file, "utf8").catch(() => "");
    const age = Date.now() - ((await stat(file).catch(() => undefined))?.mtimeMs ?? 0);
    let other: Partial<Holder> = {};
    try {
      other = JSON.parse(text) as Partial<Holder>;
    } catch {
      other = {};
    }
    let stale = age > staleMs;
    if (!stale && typeof other.pid === "number" && other.host === holder.host && !(typeof other.nonce === "string" && mine.has(other.nonce))) {
      if (other.pid === process.pid) stale = true;
      else {
        try {
          process.kill(other.pid, 0);
        } catch (e) {
          stale = (e as NodeJS.ErrnoException).code !== "EPERM";
        }
      }
    }
    if (!stale) throw new LockHeldError(`already being synced (pid ${other.pid ?? "?"} on ${other.host ?? "?"} since ${other.startedAt ?? "?"}, lock ${file})`);
    await rm(file, { force: true });
    try {
      await take();
    } catch {
      throw new LockHeldError(`already being synced (another process took the stale lock ${file} first)`);
    }
  }
  mine.add(holder.nonce);
  const beat = setInterval(() => void utimes(file, new Date(), new Date()).catch(() => {}), opts.heartbeatMs ?? 30_000);
  beat.unref();
  return {
    async release() {
      clearInterval(beat);
      mine.delete(holder.nonce);
      const text = await readFile(file, "utf8").catch(() => "");
      if (text.includes(`"nonce":"${holder.nonce}"`)) await rm(file, { force: true });
    },
  };
}
