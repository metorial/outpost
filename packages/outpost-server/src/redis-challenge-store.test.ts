import { describe, expect, it } from 'vitest';
import type { RedisChallengeStoreClient } from './redis-challenge-store';
import { RedisChallengeStore } from './redis-challenge-store';
import type { StoredChallenge } from './challenge-store';

class FakeRedisClient implements RedisChallengeStoreClient {
  private store = new Map<string, string>();
  lastTtlMsByKey = new Map<string, number>();

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    this.store.set(key, value);
    this.lastTtlMsByKey.set(key, ttlMs);
  }

  async setIfNotExists(key: string, value: string, ttlMs: number): Promise<boolean> {
    if (this.store.has(key)) return false;
    this.store.set(key, value);
    this.lastTtlMsByKey.set(key, ttlMs);
    return true;
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }
}

let makeChallenge = (overrides: Partial<StoredChallenge> = {}): StoredChallenge => ({
  challengeId: 'och_123',
  challenge: new Uint8Array([1, 2, 3]),
  outpostId: 'otp_123',
  credentialId: 'otc_456',
  instanceId: 'oti_789',
  instancePublicKey: new Uint8Array(32),
  requestedServices: [],
  expiresAt: new Date(Date.now() + 60_000),
  ...overrides
});

describe('RedisChallengeStore', () => {
  it('consumes a saved challenge exactly once', async () => {
    let store = new RedisChallengeStore({ client: new FakeRedisClient() });
    let challenge = makeChallenge();
    await store.save(challenge);

    let first = await store.consume(challenge.challengeId);
    expect(first.status).toBe('ok');
    if (first.status == 'ok') expect(first.challenge).toEqual(challenge);

    let second = await store.consume(challenge.challengeId);
    expect(second.status).toBe('already_consumed');
  });

  it('reports unknown challenge ids as not_found', async () => {
    let store = new RedisChallengeStore({ client: new FakeRedisClient() });
    let result = await store.consume('och_missing');
    expect(result.status).toBe('not_found');
  });

  it('rejects an expired challenge without marking it consumed', async () => {
    let store = new RedisChallengeStore({ client: new FakeRedisClient() });
    let challenge = makeChallenge({ expiresAt: new Date(Date.now() - 1_000) });
    await store.save(challenge);

    let result = await store.consume(challenge.challengeId);
    expect(result.status).toBe('expired');
  });

  it('namespaces keys under the configured prefix', async () => {
    let client = new FakeRedisClient();
    let store = new RedisChallengeStore({ client, keyPrefix: 'custom:' });
    let challenge = makeChallenge();
    await store.save(challenge);

    expect(await client.get(`custom:${challenge.challengeId}`)).not.toBeNull();
  });

  it('sets a TTL that covers the challenge lifetime plus retention', async () => {
    let client = new FakeRedisClient();
    let store = new RedisChallengeStore({ client, retentionMs: 5_000 });
    let expiresAt = new Date(Date.now() + 60_000);
    let challenge = makeChallenge({ expiresAt });

    await store.save(challenge);

    let ttlMs = client.lastTtlMsByKey.get(`outpost:challenge:${challenge.challengeId}`)!;
    expect(ttlMs).toBeGreaterThan(60_000);
    expect(ttlMs).toBeLessThanOrEqual(65_000);
  });
});
