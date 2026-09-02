import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { InstanceCredentialStore } from '../credential-store';
import type { InstanceCredentials } from '../types';

let isNodeError = (err: unknown, code: string): boolean =>
  typeof err == 'object' && err !== null && (err as { code?: string }).code == code;

let assertInstanceCredentials: (
  value: unknown
) => asserts value is InstanceCredentials = value => {
  if (typeof value != 'object' || value === null) {
    throw new Error('Invalid instance credential file: expected an object');
  }

  let credentials = value as Record<string, unknown>;
  for (let key of ['instanceId', 'instancePrivateKey', 'instancePublicKey', 'instanceToken']) {
    if (typeof credentials[key] != 'string') {
      throw new Error(`Invalid instance credential file: missing or invalid "${key}"`);
    }
  }
};

export class FsInstanceCredentialStore implements InstanceCredentialStore {
  constructor(private path: string) {}

  async load(): Promise<InstanceCredentials | null> {
    let raw: string;
    try {
      raw = await readFile(this.path, 'utf8');
    } catch (err) {
      if (isNodeError(err, 'ENOENT')) return null;
      throw err;
    }

    let parsed = JSON.parse(raw);
    assertInstanceCredentials(parsed);
    return parsed;
  }

  async save(credentials: InstanceCredentials): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(credentials, null, 2), { mode: 0o600 });
  }

  async clear(): Promise<void> {
    try {
      await rm(this.path);
    } catch (err) {
      if (!isNodeError(err, 'ENOENT')) throw err;
    }
  }
}
