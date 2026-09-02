import {
  resolveTtl,
  type Cache,
  type CacheCompartment,
  type CacheCompartmentOptions
} from '@metorial-outpost/cache';

export interface RedisCacheClient {
  set(key: string, value: string, ttlMs: number): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

export type RedisCacheOptions = {
  client: RedisCacheClient;
  keyPrefix?: string;
};

class RedisCacheCompartment implements CacheCompartment {
  constructor(
    private client: RedisCacheClient,
    private keyPrefix: string,
    private defaultTtlMs: number | undefined
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    let raw = await this.client.get(this.key(key));
    if (raw == null) return undefined;
    return JSON.parse(raw) as T;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    let resolved = resolveTtl(ttlMs, this.defaultTtlMs);
    await this.client.set(this.key(key), JSON.stringify(value), resolved);
  }

  async delete(key: string): Promise<void> {
    await this.client.delete(this.key(key));
  }

  private key(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
}

export class RedisCache implements Cache {
  private client: RedisCacheClient;
  private keyPrefix: string;

  constructor(options: RedisCacheOptions) {
    this.client = options.client;
    this.keyPrefix = options.keyPrefix ?? 'outpost:cache:';
  }

  compartment(id: string, options?: CacheCompartmentOptions): CacheCompartment {
    return new RedisCacheCompartment(
      this.client,
      `${this.keyPrefix}${id}:`,
      options?.defaultTtlMs
    );
  }
}
