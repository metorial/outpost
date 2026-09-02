import type { Cache } from '@metorial-outpost/cache';
import type { OutpostFetchFunction } from '@metorial-outpost/fetch';
import type { Logger } from '@metorial-outpost/logger';
import type { OutpostAdapter, OutpostAdapterContext, OutpostProxyRegistration } from './types';

export abstract class BaseOutpostAdapter<TConfig = void> implements OutpostAdapter {
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly capabilities: Record<string, unknown>;

  constructor(
    protected context: OutpostAdapterContext,
    protected config: TConfig
  ) {}

  protected get logger(): Logger {
    return this.context.logger.child({ adapter: this.name });
  }

  protected get fetch(): OutpostFetchFunction {
    return (input, init) => this.context.fetch(input, { service: this.name, ...init });
  }

  protected get cache(): Cache {
    return this.context.cache;
  }

  protected get upstreamUrl(): string {
    return this.context.auth.endpoint;
  }

  protected get baseUrl(): string {
    return this.context.baseUrl;
  }

  startProxy?():
    OutpostProxyRegistration | undefined | Promise<OutpostProxyRegistration | undefined>;
  start?(): Promise<void> | void;
  stop?(): Promise<void> | void;
}
