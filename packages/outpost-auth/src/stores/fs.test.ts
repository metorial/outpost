import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsInstanceCredentialStore } from './fs';

let credentials = {
  instanceId: 'oti_123',
  instancePrivateKey: 'priv',
  instancePublicKey: 'pub',
  instanceToken: 'token'
};

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'outpost-auth-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('FsInstanceCredentialStore', () => {
  it('returns null when the file does not exist', async () => {
    let store = new FsInstanceCredentialStore(join(dir, 'credentials.json'));
    expect(await store.load()).toBeNull();
  });

  it('round-trips saved credentials, creating parent directories as needed', async () => {
    let path = join(dir, 'nested', 'credentials.json');
    let store = new FsInstanceCredentialStore(path);

    await store.save(credentials);
    expect(await store.load()).toEqual(credentials);

    let content = JSON.parse(await readFile(path, 'utf8'));
    expect(content).toEqual(credentials);
  });

  it('writes the credential file with restrictive permissions', async () => {
    let path = join(dir, 'credentials.json');
    let store = new FsInstanceCredentialStore(path);
    await store.save(credentials);

    let mode = (await stat(path)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('removes the file on clear and tolerates a missing file', async () => {
    let path = join(dir, 'credentials.json');
    let store = new FsInstanceCredentialStore(path);

    await store.save(credentials);
    await store.clear();
    expect(await store.load()).toBeNull();

    await expect(store.clear()).resolves.toBeUndefined();
  });

  it('rejects a malformed credential file', async () => {
    let path = join(dir, 'credentials.json');
    let store = new FsInstanceCredentialStore(path);

    await store.save({ ...credentials, instanceToken: undefined as any });
    await expect(store.load()).rejects.toThrow(/instanceToken/);
  });
});
