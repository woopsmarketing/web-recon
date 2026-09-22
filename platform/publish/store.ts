/**
 * Object store abstraction for site:publish. Backends are interchangeable:
 *  - WranglerStore (wrangler-store.ts): `wrangler r2 object put/get` against local (miniflare)
 *    persistence or, for a future live run only, the remote bucket
 *  - MemoryStore (here): pure in-memory backend for unit tests, with fault injection
 *
 * Reads return the stored bytes (null = no such key); verification is done by the publisher
 * by comparing sha256/size of what it reads back.
 */

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
