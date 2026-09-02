/** A service the outpost declares during registration, with the version it runs. */
export type DeclaredService = {
  id: string;
  version?: string;
  capabilities?: Record<string, unknown>;
};

/** The server's decision on a declared service. */
export type GrantedService = {
  id: string;
  granted: boolean;
};

export type InstanceCredentials = {
  instanceId: string;
  instancePrivateKey: string;
  instancePublicKey: string;
  instanceToken: string;
  instanceTokenExpiresAt?: number | null;
  /**
   * Every service declared at registration with the server's decision. Absent or empty when the
   * server doesn't implement the handshake, in which case nothing is gated.
   */
  services?: GrantedService[];
};

/** A non-sensitive snapshot of an `OutpostAuth` instance -- safe to expose on a status page. */
export type OutpostAuthSnapshot = {
  outpostId: string;
  credentialId: string;
  endpoint: string;
  instanceId?: string;
  registered: boolean;
  tokenExpiresAt?: number | null;
};
