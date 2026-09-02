import type { InstanceCredentials } from './types';

export interface InstanceCredentialStore {
  load(): Promise<InstanceCredentials | null>;
  save(credentials: InstanceCredentials): Promise<void>;
  clear(): Promise<void>;
}
