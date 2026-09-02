export type OutpostCredential = {
  version: number;
  endpoint: string;
  outpost_id: string;
  credential_id: string;
  private_key: string;
};

export type OutpostCredentialEnvelope = string;
