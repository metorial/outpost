import type { InstanceCredentialStore } from '../credential-store';
import type { InstanceCredentials } from '../types';

export class MemoryInstanceCredentialStore implements InstanceCredentialStore {
  private credentials: InstanceCredentials | null = null;

  constructor(initial: InstanceCredentials | null = null) {
    this.credentials = initial;
  }

  async load(): Promise<InstanceCredentials | null> {
    return this.credentials;
  }

  async save(credentials: InstanceCredentials): Promise<void> {
    this.credentials = credentials;
  }

  async clear(): Promise<void> {
    this.credentials = null;
  }
}
