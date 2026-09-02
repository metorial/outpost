export type OutpostStatusPageService = {
  id: string;
  version?: string;
  granted: boolean;
  paths: string[];
};

export type OutpostStatusPageUpstream = {
  kind: 'metorial' | 'outpost';
  host: string;
};

export type OutpostStatusPageAccessEntry = {
  organizationId: string;
  projectId: string;
  instanceId: string;
  services: string[];
};

export type OutpostStatusPageData = {
  outpostId: string;
  outpostName?: string;
  credentialId: string;
  instanceId?: string;
  registered: boolean;
  tokenExpiresAt?: number | null;
  baseUrl: string;
  startedAt: number;
  upstream: OutpostStatusPageUpstream;
  services: OutpostStatusPageService[];
  access?: OutpostStatusPageAccessEntry[];
};
