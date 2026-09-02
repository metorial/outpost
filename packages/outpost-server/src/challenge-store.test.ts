import { describe, expect, it } from 'vitest';
import { InMemoryChallengeStore, type StoredChallenge } from './challenge-store';

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

describe('InMemoryChallengeStore', () => {
  it('consumes a saved challenge exactly once', async () => {
    let store = new InMemoryChallengeStore();
    let challenge = makeChallenge();
    await store.save(challenge);

    let first = await store.consume(challenge.challengeId);
    expect(first.status).toBe('ok');
    if (first.status == 'ok') expect(first.challenge).toEqual(challenge);

    let second = await store.consume(challenge.challengeId);
    expect(second.status).toBe('already_consumed');
  });

  it('reports unknown challenge ids as not_found', async () => {
    let store = new InMemoryChallengeStore();
    let result = await store.consume('och_missing');
    expect(result.status).toBe('not_found');
  });

  it('rejects an expired challenge', async () => {
    let store = new InMemoryChallengeStore();
    let challenge = makeChallenge({ expiresAt: new Date(Date.now() - 1_000) });
    await store.save(challenge);

    let result = await store.consume(challenge.challengeId);
    expect(result.status).toBe('expired');
  });
});
