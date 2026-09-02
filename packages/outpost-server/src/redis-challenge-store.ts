import { base64url } from '@metorial-outpost/crypto';
import type {
  ChallengeStore,
  ConsumeChallengeResult,
  StoredChallenge
} from './challenge-store';
import type { RequestedService } from './service-types';

/**
 * The minimal Redis surface this store needs. Deliberately not typed against `ioredis` or
 * `redis` directly, so this package doesn't force either as a dependency — adapt whichever
 * client you already use with a one-line wrapper, e.g.:
 *
 * ioredis:
 *   {
 *     set: (key, value, ttlMs) => redis.set(key, value, 'PX', ttlMs).then(() => {}),
 *     setIfNotExists: (key, value, ttlMs) =>
 *       redis.set(key, value, 'PX', ttlMs, 'NX').then(r => r === 'OK'),
 *     get: key => redis.get(key)
 *   }
 *
 * node-redis (v4/v5):
 *   {
 *     set: (key, value, ttlMs) => client.set(key, value, { PX: ttlMs }).then(() => {}),
 *     setIfNotExists: (key, value, ttlMs) =>
 *       client.set(key, value, { PX: ttlMs, NX: true }).then(r => r === 'OK'),
 *     get: key => client.get(key)
 *   }
 */
export interface RedisChallengeStoreClient {
  /** Store `value` at `key`, expiring after `ttlMs` milliseconds. */
  set(key: string, value: string, ttlMs: number): Promise<void>;
  /** Like `set`, but only writes if `key` doesn't already exist. Returns whether it was set. */
  setIfNotExists(key: string, value: string, ttlMs: number): Promise<boolean>;
  get(key: string): Promise<string | null>;
}

export type RedisChallengeStoreOptions = {
  client: RedisChallengeStoreClient;
  keyPrefix?: string;
  retentionMs?: number;
};

type SerializedChallenge = {
  challengeId: string;
  challenge: string;
  outpostId: string;
  credentialId: string;
  instanceId: string;
  instancePublicKey: string;
  requestedServices: RequestedService[];
  expiresAt: number;
};

let serialize = (challenge: StoredChallenge): string =>
  JSON.stringify({
    challengeId: challenge.challengeId,
    challenge: base64url.encode(challenge.challenge),
    outpostId: challenge.outpostId,
    credentialId: challenge.credentialId,
    instanceId: challenge.instanceId,
    instancePublicKey: base64url.encode(challenge.instancePublicKey),
    requestedServices: challenge.requestedServices,
    expiresAt: challenge.expiresAt.getTime()
  } satisfies SerializedChallenge);

let deserialize = (raw: string): StoredChallenge => {
  let parsed = JSON.parse(raw) as SerializedChallenge;
  return {
    challengeId: parsed.challengeId,
    challenge: base64url.decode(parsed.challenge),
    outpostId: parsed.outpostId,
    credentialId: parsed.credentialId,
    instanceId: parsed.instanceId,
    instancePublicKey: base64url.decode(parsed.instancePublicKey),
    requestedServices: parsed.requestedServices ?? [],
    expiresAt: new Date(parsed.expiresAt)
  };
};

export class RedisChallengeStore implements ChallengeStore {
  private client: RedisChallengeStoreClient;
  private keyPrefix: string;
  private retentionMs: number;

  constructor(options: RedisChallengeStoreOptions) {
    this.client = options.client;
    this.keyPrefix = options.keyPrefix ?? 'outpost:challenge:';
    this.retentionMs = options.retentionMs ?? 60_000;
  }

  private dataKey(challengeId: string): string {
    return `${this.keyPrefix}${challengeId}`;
  }

  private consumedKey(challengeId: string): string {
    return `${this.keyPrefix}${challengeId}:consumed`;
  }

  private ttlFor(expiresAt: Date): number {
    return Math.max(expiresAt.getTime() - Date.now(), 0) + this.retentionMs;
  }

  async save(challenge: StoredChallenge): Promise<void> {
    await this.client.set(
      this.dataKey(challenge.challengeId),
      serialize(challenge),
      this.ttlFor(challenge.expiresAt)
    );
  }

  async consume(challengeId: string): Promise<ConsumeChallengeResult> {
    let raw = await this.client.get(this.dataKey(challengeId));
    if (!raw) return { status: 'not_found' };

    let challenge = deserialize(raw);
    if (challenge.expiresAt.getTime() < Date.now()) return { status: 'expired' };

    let acquired = await this.client.setIfNotExists(
      this.consumedKey(challengeId),
      '1',
      this.ttlFor(challenge.expiresAt)
    );
    if (!acquired) return { status: 'already_consumed' };

    return { status: 'ok', challenge };
  }
}
