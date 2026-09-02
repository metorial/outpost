import type { OutpostAuth } from '@metorial-outpost/auth';
import type { Cache } from '@metorial-outpost/cache';
import type { OutpostFetchFunction } from '@metorial-outpost/fetch';
import type { Logger } from '@metorial-outpost/logger';
import type { OutpostProxyAdapter, TrustProxyOptions } from '@metorial-outpost/proxy';
import type { OutpostManifest } from '@metorial-outpost/server';
import type { OutpostTokens } from '@metorial-outpost/tokens';

export type OutpostAdapterContext = {
  auth: OutpostAuth;
  fetch: OutpostFetchFunction;
  logger: Logger;
  cache: Cache;
  manifest: { current(): OutpostManifest | undefined };
  tokens: OutpostTokens;
  upstreamUrl?: string;
  /**
   * The public base URL clients use to reach this outpost, e.g. `https://abc.outpost.com`.
   * Set once for the whole outpost instance (see `OutpostInstanceOptions.baseUrl`) and shared
   * by every adapter -- an outpost has exactly one public front door.
   */
  baseUrl: string;
  /** Base path used by this Outpost's protocol routes. */
  basePath?: string;
  trustProxy?: boolean | TrustProxyOptions;
};

export type OutpostProxyRegistration = OutpostProxyAdapter | OutpostProxyAdapter[];

export interface OutpostAdapter {
  readonly name: string;
  readonly version: string;
  readonly capabilities: Record<string, unknown>;

  startProxy?():
    OutpostProxyRegistration | undefined | Promise<OutpostProxyRegistration | undefined>;

  start?(): Promise<void> | void;

  stop?(): Promise<void> | void;
}

export type OutpostAdapterConstructor<TConfig = void> = new (
  context: OutpostAdapterContext,
  config: TConfig
) => OutpostAdapter;

export type OutpostAdapterFactory<TAdapter extends OutpostAdapter = OutpostAdapter> = (
  context: OutpostAdapterContext
) => TAdapter | Promise<TAdapter>;

export type OutpostAdapterRegistration<TConfig = any> =
  | OutpostAdapterConstructor<TConfig>
  | [OutpostAdapterConstructor<TConfig>, TConfig]
  | OutpostAdapterFactory;
