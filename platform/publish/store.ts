/**
 * Object store abstraction for site:publish. Backends are interchangeable:
 *  - WranglerStore (wrangler-store.ts): `wrangler r2 object put/get` against local (miniflare)
 *    persistence or, for a future live run only, the remote bucket
 *  - MemoryStore (here): pure in-memory backend for unit tests, with fault injection
 *  - DirectoryStore (here): a directory that stands in for the bucket — object key = file path
 *    relative to it, the layout `pnpm runtime:local --bucket-dir` serves (cli/runtime-local.ts)
 *
 * Reads return the stored bytes (null = no such key); verification is done by the publisher
 * by comparing sha256/size of what it reads back.
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ObjectMeta {
  contentType: string;
  cacheControl: string;
}

export interface ObjectStore {
  /** human-readable target, e.g. "wrangler --local boost-sites-artifacts (persist tmp/…)" */
  readonly description: string;
  /** upper bound on parallel operations this backend tolerates (default: unbounded) */
  readonly maxConcurrency?: number;
  put(key: string, body: Uint8Array, meta: ObjectMeta): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
}

export interface StoredObject {
  body: Uint8Array;
  meta: ObjectMeta;
}

export interface MemoryFaults {
  /** throw on put of a key matching this predicate */
  failPut?: (key: string) => boolean;
  /** store different bytes than sent (read-back verification must catch it) */
  corruptPut?: (key: string) => boolean;
}

export class MemoryStore implements ObjectStore {
  readonly description = "memory";
  readonly objects = new Map<string, StoredObject>();
  /** every write, in order (for ordering assertions) */
  readonly writes: string[] = [];
  constructor(public faults: MemoryFaults = {}) {}

  async put(key: string, body: Uint8Array, meta: ObjectMeta): Promise<void> {
    if (this.faults.failPut?.(key)) throw new Error(`injected put failure: ${key}`);
    const stored = new Uint8Array(body);
    if (this.faults.corruptPut?.(key) && stored.length > 0) stored[0] = stored[0]! ^ 0xff;
    this.objects.set(key, { body: stored, meta: { ...meta } });
    this.writes.push(key);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const o = this.objects.get(key);
    return o ? new Uint8Array(o.body) : null;
  }
}

/**
 * A directory as the bucket: `<dir>/<key>` is the object. The same layout cli/runtime-local.ts reads,
 * so what is published into it can be served by the real Worker handler with no wrangler and no
 * network. Object metadata is NOT stored — runtime-local derives a package file's content type and
 * cache policy from platform/publish/media.ts, exactly what site:publish would have stored with it.
 * A put is a write to a temporary name + rename, so a reader never sees half an object.
 * A key with an empty, "." or ".." segment, a backslash or a NUL is refused (put) / absent (get).
 */
export class DirectoryStore implements ObjectStore {
  readonly description: string;
  /** every write, in order (for ordering assertions) */
  readonly writes: string[] = [];
  private seq = 0;
  constructor(private readonly dir: string) {
    this.description = `directory ${dir}`;
  }

  private fileOf(key: string): string | undefined {
    if (key.includes("\\") || key.includes("\0")) return undefined;
    const segments = key.split("/");
    if (segments.some((s) => s === "" || s === "." || s === "..")) return undefined;
    return path.join(this.dir, ...segments);
  }

  async put(key: string, body: Uint8Array, _meta: ObjectMeta): Promise<void> {
    const file = this.fileOf(key);
    if (!file) throw new Error(`DirectoryStore: invalid key ${JSON.stringify(key)}`);
    await mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.put-${process.pid}-${this.seq++}`;
    await writeFile(tmp, body);
    await rename(tmp, file);
    this.writes.push(key);
  }

  async get(key: string): Promise<Uint8Array | null> {
    const file = this.fileOf(key);
    if (!file) return null;
    try {
      return new Uint8Array(await readFile(file));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ENOTDIR" || code === "EISDIR") return null;
      throw error;
    }
  }
}
