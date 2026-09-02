import { describe, expect, it } from 'vitest';
import type { RedisCacheClient } from './redis-cache';
import { RedisCache } from './redis-cache';

class FakeRedisClient implements RedisCacheClient {
  private store = new Map<string, string>();
  lastTtlMsByKey = new Map<string, number>();

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    this.store.set(key, value);
    this.lastTtlMsByKey.set(key, ttlMs);
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  rawKeys(): string[] {
    return [...this.store.keys()];
  }
}

describe('RedisCache', () => {
  it('stores and retrieves a value within its compartment', async () => {
    let cache = new RedisCache({ client: new FakeRedisClient() });
    let compartment = cache.compartment('public-key');

    await compartment.set('otp_1:otc_1', { publicKey: 'abc' }, 60_000);

    expect(await compartment.get('otp_1:otc_1')).toEqual({ publicKey: 'abc' });
  });

  it('isolates keys between compartments via the key prefix', async () => {
    let client = new FakeRedisClient();
    let cache = new RedisCache({ client });

    await cache.compartment('a').set('key', 'from-a', 60_000);
    await cache.compartment('b').set('key', 'from-b', 60_000);

    expect(await cache.compartment('a').get('key')).toBe('from-a');
    expect(await cache.compartment('b').get('key')).toBe('from-b');
    expect(client.rawKeys()).toEqual(['outpost:cache:a:key', 'outpost:cache:b:key']);
  });

  it('honors a custom keyPrefix', async () => {
    let client = new FakeRedisClient();
    let cache = new RedisCache({ client, keyPrefix: 'custom:' });

    await cache.compartment('a').set('key', 'value', 60_000);

    expect(client.rawKeys()).toEqual(['custom:a:key']);
  });

  it('passes the resolved ttl through to the client', async () => {
    let client = new FakeRedisClient();
    let cache = new RedisCache({ client });

    await cache.compartment('a').set('key', 'value', 30_000);

    expect(client.lastTtlMsByKey.get('outpost:cache:a:key')).toBe(30_000);
  });

  it('falls back to the compartment default ttl when set() omits one', async () => {
    let client = new FakeRedisClient();
    let cache = new RedisCache({ client });

    await cache.compartment('a', { defaultTtlMs: 5_000 }).set('key', 'value');

    expect(client.lastTtlMsByKey.get('outpost:cache:a:key')).toBe(5_000);
  });

  it('throws when set() has no ttlMs and no compartment default', async () => {
    let cache = new RedisCache({ client: new FakeRedisClient() });
    await expect(cache.compartment('a').set('key', 'value')).rejects.toThrow(
      /ttlMs is required/
    );
  });

  it('returns undefined for a missing key', async () => {
    let cache = new RedisCache({ client: new FakeRedisClient() });
    expect(await cache.compartment('a').get('missing')).toBeUndefined();
  });

  it('deletes a key', async () => {
    let client = new FakeRedisClient();
    let cache = new RedisCache({ client });
    let compartment = cache.compartment('a');

    await compartment.set('key', 'value', 60_000);
    await compartment.delete('key');

    expect(await compartment.get('key')).toBeUndefined();
  });
});
