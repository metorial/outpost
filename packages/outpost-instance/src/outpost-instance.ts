import {
  resolveAdapterRegistration,
  type OutpostAdapter,
  type OutpostAdapterContext,
  type OutpostAdapterRegistration
} from '@metorial-outpost/adapter';
import {
  OutpostAuth,
  type InstanceCredentials,
  type InstanceCredentialStore
} from '@metorial-outpost/auth';
import type { Cache } from '@metorial-outpost/cache';
import { LocalCache } from '@metorial-outpost/cache-local';
import {
  decodeCredentialEnvelope,
  type OutpostCredentialEnvelope
} from '@metorial-outpost/credential-envelope';
import { createOutpostFetch } from '@metorial-outpost/fetch';
import { noopLogger, type Logger } from '@metorial-outpost/logger';
import {
  createOutpostProxy,
  type OutpostProxyAdapter,
  type TrustProxyOptions
} from '@metorial-outpost/proxy';
import {
  DEFAULT_BASE_PATH,
  OUTPOST_PROTOCOL_SERVICE,
  type OutpostManifest
} from '@metorial-outpost/server';
import {
  createOutpostStatusPage,
  type OutpostStatusPageService
} from '@metorial-outpost/status-page';
import { OutpostTokens } from '@metorial-outpost/tokens';
import { createIssuerKeyResolver } from './issuer-key-resolver';
import { startManifestFetcher } from './manifest-fetcher';

export type OutpostInstanceOptions = {
  credential: OutpostCredentialEnvelope;
  adapters: OutpostAdapterRegistration[];
  store?: InstanceCredentialStore;
  logger?: Logger;
  cache?: Cache;
  fetch?: typeof fetch;
  proxy?: { hostname?: string; port?: number };
  stdout?: (line: string) => void;
  basePath?: string;
  manifestRefreshIntervalMs?: number;
  upstreamUrl?: string;
  /**
   * The public base URL clients use to reach this outpost, e.g. `https://abc.outpost.com`.
   * Required -- shared by every adapter (via `OutpostAdapterContext.baseUrl`) so Metorial can
   * rewrite the connect/discovery URLs it hands back to clients (SSE endpoints, OAuth
   * issuer/authorization/token URLs, etc.) to this base instead of its own public host.
   */
  baseUrl: string;
  /** How to resolve the original client IP behind this outpost's own reverse proxy, if any. */
  trustProxy?: boolean | TrustProxyOptions;
};

let normalizeBaseUrl = (baseUrl: unknown): string => {
  if (typeof baseUrl != 'string' || baseUrl.trim().length === 0) {
    throw new Error(
      'OutpostInstance: "baseUrl" is required -- set it to the public URL clients use to reach ' +
        'this outpost, e.g. "https://abc.outpost.com".'
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error(`OutpostInstance: "baseUrl" must be an absolute URL, got "${baseUrl}"`);
  }

  if (parsed.protocol != 'http:' && parsed.protocol != 'https:') {
    throw new Error(`OutpostInstance: "baseUrl" must use http or https, got "${baseUrl}"`);
  }

  return baseUrl.replace(/\/+$/, '');
};

let partitionOnGrants = (
  resolved: OutpostAdapter[],
  credentials: InstanceCredentials
): { adapters: OutpostAdapter[]; skippedAdapters: OutpostAdapter[] } => {
  let decisions = new Map(
    (credentials.services ?? []).map(service => [service.id, service.granted])
  );

  let adapters: OutpostAdapter[] = [];
  let skippedAdapters: OutpostAdapter[] = [];

  for (let adapter of resolved) {
    if (decisions.get(adapter.name) === false) skippedAdapters.push(adapter);
    else adapters.push(adapter);
  }

  return { adapters, skippedAdapters };
};

export class OutpostInstance {
  private constructor(
    readonly auth: OutpostAuth,
    readonly adapters: OutpostAdapter[],
    readonly skippedAdapters: OutpostAdapter[],
    private server: ReturnType<typeof Bun.serve> | undefined,
    private stopManifestFetcher: () => void
  ) {}

  static async start(options: OutpostInstanceOptions): Promise<OutpostInstance> {
    if (!options.credential) {
      throw new Error('Outpost credential is required to start an OutpostInstance');
    }

    let logger = options.logger ?? noopLogger;
    let stdout = options.stdout ?? ((line: string) => console.log(line));
    let credential = decodeCredentialEnvelope(options.credential);
    let outpostId = credential.outpost_id;
    let basePath = options.basePath ?? DEFAULT_BASE_PATH;
    let cache = options.cache ?? new LocalCache();
    let baseUrl = normalizeBaseUrl(options.baseUrl);
    let startedAt = Date.now();

    stdout(`Starting Metorial Outpost ${outpostId}...`);

    let auth = new OutpostAuth({
      credential: options.credential,
      store: options.store,
      fetch: options.fetch,
      logger,
      upstreamUrl: options.upstreamUrl
    });

    let contextFetch = createOutpostFetch({ auth, fetch: options.fetch });

    let tokens = new OutpostTokens({
      verification: {
        resolve: createIssuerKeyResolver({
          endpoint: auth.endpoint,
          basePath,
          fetch: options.fetch ?? fetch,
          cache
        })
      }
    });

    let manifest: { current(): OutpostManifest | undefined } | undefined;

    let context: OutpostAdapterContext = {
      auth,
      fetch: contextFetch,
      logger,
      cache,
      manifest: { current: () => manifest?.current() },
      tokens,
      upstreamUrl: options.upstreamUrl,
      baseUrl,
      basePath,
      trustProxy: options.trustProxy
    };

    stdout('Adapters:');
    let resolvedAdapters: OutpostAdapter[] = [];
    for (let registration of options.adapters) {
      let adapter = await resolveAdapterRegistration(registration, context);
      resolvedAdapters.push(adapter);
      stdout(`  -> ${adapter.name}`);
    }

    let credentials = await auth.ensureRegistered({
      services: resolvedAdapters.map(adapter => ({
        id: adapter.name,
        version: adapter.version,
        capabilities: adapter.capabilities
      }))
    });
    stdout(`  Outpost instance ${credentials.instanceId} registered`);

    let { adapters, skippedAdapters } = partitionOnGrants(resolvedAdapters, credentials);

    for (let adapter of skippedAdapters) {
      console.warn(
        `Metorial Outpost ${outpostId}: service "${adapter.name}" is installed but this outpost is not allowed to run it, so it was not started.`
      );
      stdout(`  -> ${adapter.name} not allowed, skipped`);
    }

    logger.info('outpost: starting services', {
      outpostId,
      instanceId: credentials.instanceId,
      services: adapters.map(adapter => adapter.name),
      skippedServices: skippedAdapters.map(adapter => adapter.name)
    });

    let { holder, stop: stopManifestFetcher } = await startManifestFetcher({
      endpoint: auth.endpoint,
      basePath,
      outpostId,
      service: OUTPOST_PROTOCOL_SERVICE,
      fetch: contextFetch,
      logger,
      refreshIntervalMs: options.manifestRefreshIntervalMs
    });
    manifest = holder;
    stdout(`  manifest fetched (${manifest.current()?.access.length ?? 0} access entries)`);

    let proxyAdapters: OutpostProxyAdapter[] = [];
    let proxyPathsByAdapter = new Map<string, string[]>();
    for (let adapter of adapters) {
      let result = await adapter.startProxy?.();
      if (!result) continue;

      let paths: string[] = [];
      for (let proxy of Array.isArray(result) ? result : [result]) {
        proxyAdapters.push(proxy);
        paths.push(proxy.path);
        stdout(`     proxy: ${adapter.name} -> ${proxy.path}`);
      }
      proxyPathsByAdapter.set(adapter.name, paths);
    }

    // Every outpost always exposes a non-sensitive status page at its proxy root, whether or not
    // any adapter has a proxy of its own -- so the proxy server is always started.
    let statusPage = createOutpostStatusPage({
      getData: () => ({
        outpostId,
        outpostName: manifest?.current()?.outpost.name,
        credentialId: credential.credential_id,
        instanceId: auth.getSnapshot().instanceId,
        registered: auth.getSnapshot().registered,
        tokenExpiresAt: auth.getSnapshot().tokenExpiresAt,
        baseUrl,
        startedAt,
        upstream: {
          kind: options.upstreamUrl ? 'outpost' : 'metorial',
          host: new URL(auth.endpoint).host
        },
        services: [
          ...adapters.map((adapter): OutpostStatusPageService => ({
            id: adapter.name,
            version: adapter.version,
            granted: true,
            paths: proxyPathsByAdapter.get(adapter.name) ?? []
          })),
          ...skippedAdapters.map((adapter): OutpostStatusPageService => ({
            id: adapter.name,
            version: adapter.version,
            granted: false,
            paths: []
          }))
        ],
        access: manifest?.current()?.access.map(entry => ({
          organizationId: entry.compartment.organizationId,
          projectId: entry.compartment.projectId,
          instanceId: entry.compartment.instanceId,
          services: entry.services.map(service => service.id)
        }))
      })
    });
    proxyAdapters.push(statusPage);
    stdout(`     status page: -> ${statusPage.path}`);

    let app = createOutpostProxy({ adapters: proxyAdapters });
    let server = Bun.serve({
      fetch: app.fetch,
      hostname: options.proxy?.hostname,
      port: options.proxy?.port,
      idleTimeout: 255
    });
    stdout(`Proxy listening on http://${server.hostname}:${server.port}`);

    for (let adapter of adapters) {
      await adapter.start?.();
    }

    stdout(`Metorial Outpost ${outpostId} ready`);

    return new OutpostInstance(auth, adapters, skippedAdapters, server, stopManifestFetcher);
  }

  async stop(): Promise<void> {
    this.server?.stop();
    this.stopManifestFetcher();

    for (let adapter of [...this.adapters].reverse()) {
      await adapter.stop?.();
    }
  }
}
