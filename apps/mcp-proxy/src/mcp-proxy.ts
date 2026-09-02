import type { OutpostAdapterRegistration } from '@metorial-outpost/adapter';
import type { InstanceCredentialStore } from '@metorial-outpost/auth';
import type { Cache } from '@metorial-outpost/cache';
import type { CorsOriginOption } from '@metorial-outpost/cors';
import type { OutpostCredentialEnvelope } from '@metorial-outpost/credential-envelope';
import { OutpostInstance } from '@metorial-outpost/instance';
import type { Logger } from '@metorial-outpost/logger';
import type { McpMiddleware } from '@metorial-outpost/mcp';
import { OutpostMcpAdapter } from '@metorial-outpost/mcp-adapter';
import {
  OutpostParentAdapter,
  type OutpostParentAdapterConfig
} from '@metorial-outpost/parent-adapter';
import type { TrustProxyOptions } from '@metorial-outpost/proxy';

export type McpProxyOptions = {
  /** The outpost credential envelope issued for this instance, e.g. `process.env.METORIAL_OUTPOST_CREDENTIAL`. */
  outpostCredential: OutpostCredentialEnvelope;

  /**
   * The public base URL clients use to reach this proxy, e.g. `https://mcp.example.com`. Shared
   * by every mounted adapter so Metorial can rewrite the connect/discovery URLs it hands back to
   * clients to this base instead of its own public host.
   */
  baseUrl: string;

  /** The hostname and port this proxy listens on. */
  proxy: { hostname?: string; port: number };

  /** Message middleware, run in order for every MCP message crossing the proxy. Build entries with `mcpMiddleware()`. */
  middleware?: McpMiddleware[];

  /** How long a single middleware may take before the message fails closed. Defaults to 30s. */
  middlewareTimeoutMs?: number;

  /** Allowed browser origins for the connect endpoints. Defaults to allowing any origin. */
  cors?: CorsOriginOption;

  /**
   * Mounts `OutpostParentAdapter` so further outposts can nest behind this one. Defaults to `true`;
   * pass `false` to skip it, or an `OutpostParentAdapterConfig` to configure it.
   */
  parent?: boolean | OutpostParentAdapterConfig;

  /** Overrides the Metorial endpoint this outpost registers and connects against. */
  upstreamUrl?: string;

  /** How to resolve the original client IP if this proxy itself sits behind its own reverse proxy. */
  trustProxy?: boolean | TrustProxyOptions;

  store?: InstanceCredentialStore;
  logger?: Logger;
  cache?: Cache;
  fetch?: typeof fetch;
  stdout?: (line: string) => void;
  basePath?: string;
};

/** A Metorial Outpost that proxies MCP connections. */
export class McpProxy {
  private constructor(readonly instance: OutpostInstance) {}

  /** Registers with Metorial and starts listening. */
  static async create(options: McpProxyOptions): Promise<McpProxy> {
    if (!options.outpostCredential) {
      throw new Error('McpProxy: "outpostCredential" is required');
    }

    if (!options.baseUrl) {
      throw new Error(
        'McpProxy: "baseUrl" is required -- set it to the public URL clients use to reach ' +
          'this proxy, e.g. "https://mcp.example.com".'
      );
    }

    if (!options.proxy || !options.proxy.port) {
      throw new Error('McpProxy: "proxy.port" is required');
    }

    if (options.middleware && !Array.isArray(options.middleware)) {
      throw new Error('McpProxy: "middleware" must be an array of middleware entries');
    }

    let adapters: OutpostAdapterRegistration[] = [
      [
        OutpostMcpAdapter,
        {
          middleware: options.middleware,
          middlewareTimeoutMs: options.middlewareTimeoutMs,
          corsOrigins: options.cors
        }
      ]
    ];

    if (options.parent !== false) {
      adapters.push([
        OutpostParentAdapter,
        typeof options.parent === 'object' ? options.parent : {}
      ]);
    }

    let instance = await OutpostInstance.start({
      credential: options.outpostCredential,
      baseUrl: options.baseUrl,
      adapters,
      upstreamUrl: options.upstreamUrl,
      store: options.store,
      logger: options.logger,
      cache: options.cache,
      fetch: options.fetch,
      proxy: options.proxy,
      stdout: options.stdout,
      basePath: options.basePath,
      trustProxy: options.trustProxy
    });

    return new McpProxy(instance);
  }

  async stop(): Promise<void> {
    await this.instance.stop();
  }
}
