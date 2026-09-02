import { noopLogger } from '@metorial-outpost/logger';
import { describe, expect, it } from 'vitest';
import { resolveAdapterRegistration } from './resolve-registration';
import type { OutpostAdapter, OutpostAdapterContext } from './types';

let context: OutpostAdapterContext = {
  auth: {} as any,
  fetch: (async () => new Response()) as any,
  logger: noopLogger,
  cache: {} as any,
  manifest: {} as any,
  tokens: {} as any,
  baseUrl: 'https://proxy.local'
};

class NoConfigAdapter implements OutpostAdapter {
  readonly name = 'no-config';
  receivedContext: OutpostAdapterContext;
  receivedConfig: unknown;

  constructor(ctx: OutpostAdapterContext, config: unknown) {
    this.receivedContext = ctx;
    this.receivedConfig = config;
  }
}

class ConfiguredAdapter implements OutpostAdapter {
  readonly name = 'configured';
  constructor(
    public ctx: OutpostAdapterContext,
    public config: { dir: string }
  ) {}
}

describe('resolveAdapterRegistration', () => {
  it('constructs a bare class with no config', async () => {
    let adapter = (await resolveAdapterRegistration(
      NoConfigAdapter,
      context
    )) as NoConfigAdapter;
    expect(adapter).toBeInstanceOf(NoConfigAdapter);
    expect(adapter.name).toBe('no-config');
    expect(adapter.receivedContext).toBe(context);
    expect(adapter.receivedConfig).toBeUndefined();
  });

  it('constructs a class + config tuple', async () => {
    let adapter = (await resolveAdapterRegistration(
      [ConfiguredAdapter, { dir: './data' }],
      context
    )) as ConfiguredAdapter;
    expect(adapter).toBeInstanceOf(ConfiguredAdapter);
    expect(adapter.ctx).toBe(context);
    expect(adapter.config).toEqual({ dir: './data' });
  });

  it('invokes a factory closure with the context', async () => {
    let received: OutpostAdapterContext | undefined;
    let built: OutpostAdapter = { name: 'from-factory' };

    let adapter = await resolveAdapterRegistration(ctx => {
      received = ctx;
      return built;
    }, context);

    expect(adapter).toBe(built);
    expect(received).toBe(context);
  });

  it('awaits an async factory closure', async () => {
    let built: OutpostAdapter = { name: 'async-factory' };
    let adapter = await resolveAdapterRegistration(async () => built, context);
    expect(adapter).toBe(built);
  });

  it('does not confuse a class with a factory closure', async () => {
    let adapter = await resolveAdapterRegistration(NoConfigAdapter, context);
    expect(adapter.name).toBe('no-config');
  });
});
