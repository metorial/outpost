import type { RequestedService } from './service-types';

export type StoredChallenge = {
  challengeId: string;
  challenge: Uint8Array;
  outpostId: string;
  credentialId: string;
  instanceId: string;
  instancePublicKey: Uint8Array;
  requestedServices: RequestedService[];
  expiresAt: Date;
};

export type ConsumeChallengeResult =
  | { status: 'ok'; challenge: StoredChallenge }
  | { status: 'not_found' }
  | { status: 'expired' }
  | { status: 'already_consumed' };

export interface ChallengeStore {
  save(challenge: StoredChallenge): Promise<void>;

  consume(challengeId: string): Promise<ConsumeChallengeResult>;
}

type Entry = {
  challenge: StoredChallenge;
  consumedAt: Date | null;
};

export class InMemoryChallengeStore implements ChallengeStore {
  private entries = new Map<string, Entry>();

  constructor(private ttlMs = 60_000) {}

  async save(challenge: StoredChallenge): Promise<void> {
    this.sweep();
    this.entries.set(challenge.challengeId, { challenge, consumedAt: null });
  }

  async consume(challengeId: string): Promise<ConsumeChallengeResult> {
    let entry = this.entries.get(challengeId);
    if (!entry) return { status: 'not_found' };
    if (entry.consumedAt) return { status: 'already_consumed' };
    if (entry.challenge.expiresAt.getTime() < Date.now()) return { status: 'expired' };

    entry.consumedAt = new Date();

    return { status: 'ok', challenge: entry.challenge };
  }

  private sweep(): void {
    let cutoff = Date.now() - this.ttlMs;
    for (let [id, entry] of this.entries) {
      let staleSince = entry.consumedAt?.getTime() ?? entry.challenge.expiresAt.getTime();
      if (staleSince < cutoff) this.entries.delete(id);
    }
  }
}
