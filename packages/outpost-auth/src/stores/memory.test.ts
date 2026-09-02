import { describe, expect, it } from 'vitest';
import { MemoryInstanceCredentialStore } from './memory';

let credentials = {
  instanceId: 'oti_123',
  instancePrivateKey: 'priv',
  instancePublicKey: 'pub',
  instanceToken: 'token'
};

describe('MemoryInstanceCredentialStore', () => {
  it('starts empty', async () => {
    let store = new MemoryInstanceCredentialStore();
    expect(await store.load()).toBeNull();
  });

  it('can be seeded with initial credentials', async () => {
    let store = new MemoryInstanceCredentialStore(credentials);
    expect(await store.load()).toEqual(credentials);
  });

  it('round-trips saved credentials', async () => {
    let store = new MemoryInstanceCredentialStore();
    await store.save(credentials);
    expect(await store.load()).toEqual(credentials);
  });

  it('forgets credentials after clear', async () => {
    let store = new MemoryInstanceCredentialStore(credentials);
    await store.clear();
    expect(await store.load()).toBeNull();
  });
});
