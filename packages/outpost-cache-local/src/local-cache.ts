import {
  resolveTtl,
  type Cache,
  type CacheCompartment,
  type CacheCompartmentOptions
} from '@metorial-outpost/cache';

type Entry = { value: unknown; expiresAt: number };

class LocalCacheCompartment implements CacheCompartment {
  private entries = new Map<string, Entry>();

  constructor(private defaultTtlMs: number | undefined) {}

  async get<T>(key: string): Promise<T | undefined> {
    let entry = this.entries.get(key);
    if (!entry) return undefined;

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    let resolved = resolveTtl(ttlMs, this.defaultTtlMs);
    this.sweep();
    this.entries.set(key, { value, expiresAt: Date.now() + resolved });
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }

  private sweep(): void {
    let now = Date.now();
    for (let [key, entry] of this.entries) {
      if (entry.expiresAt <= now) this.entries.delete(key);
    }
  }
}

export class LocalCache implements Cache {
  private compartments = new Map<string, LocalCacheCompartment>();

  compartment(id: string, options?: CacheCompartmentOptions): CacheCompartment {
    let existing = this.compartments.get(id);
    if (existing) return existing;

    let created = new LocalCacheCompartment(options?.defaultTtlMs);
    this.compartments.set(id, created);
    return created;
  }
}
