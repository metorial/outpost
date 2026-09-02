import { BaseOutpostAdapter, type OutpostAdapterContext } from '@metorial-outpost/adapter';
import {
  MemoryInstanceCredentialStore,
  OutpostAuth,
  type InstanceCredentials
} from '@metorial-outpost/auth';
import { LocalCache } from '@metorial-outpost/cache-local';
import {
  encodeCredentialEnvelope,
  type OutpostCredential
} from '@metorial-outpost/credential-envelope';
import { base64url, Ed25519 } from '@metorial-outpost/crypto';
import type { Logger } from '@metorial-outpost/logger';
import { OutpostTokens } from '@metorial-outpost/tokens';
import { Hono } from 'hono';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutpostInstance, type OutpostInstanceOptions } from './outpost-instance';

let rawCredential: OutpostCredential = {
  version: 1,
  endpoint: 'https://outpost.metorial.com',
  outpost_id: 'otp_123',
  credential_id: 'otc_456',
  private_key: 'unused-in-these-tests'
};

let credential = encodeCredentialEnvelope(rawCredential);

let instancePrivateKey: string;
let instancePublicKey: string;

beforeAll(async () => {
  let instanceKeyPair = await Ed25519.generateKeyPair();
  instancePrivateKey = base64url.encode(
    await Ed25519.exportPrivateKey(instanceKeyPair.privateKey)
  );
  instancePublicKey = base64url.encode(
    await Ed25519.exportPublicKey(instanceKeyPair.publicKey)
  );
});

let preRegisteredStore = (overrides: Partial<InstanceCredentials> = {}) =>
  new MemoryInstanceCredentialStore({
    instanceId: 'oti_789',
    instancePrivateKey,
    instancePublicKey,
    instanceToken: 'unused',
    ...overrides
  });

let TEST_MANIFEST = { outpost: { id: 'otp_123', name: 'Test Outpost' }, access: [] };

let defaultFetch = (async (url: RequestInfo | URL) => {
  if (String(url).includes('/manifest/')) {
    return new Response(JSON.stringify(TEST_MANIFEST), {
      headers: { 'content-type': 'application/json' }
    });
  }
  return new Response(JSON.stringify({ error: 'not_found' }), { status: 404 });
}) as typeof fetch;

let baseOptions = (
  overrides: Partial<OutpostInstanceOptions> = {}
): OutpostInstanceOptions => ({
  credential,
  adapters: [],
  store: preRegisteredStore(),
  stdout: () => {},
  fetch: defaultFetch,
  baseUrl: 'https://abc.outpost.example',
  ...overrides
});

class PlainAdapter extends BaseOutpostAdapter {
  readonly name = 'plain';
}

class ConfiguredAdapter extends BaseOutpostAdapter<{ label: string }> {
  get name() {
    return this.config.label;
  }
}

let fakeServer = () => ({ hostname: 'localhost', port: 4123, stop: vi.fn() });

// Every OutpostInstance now always starts a proxy server (the status page is always mounted),
// so every test needs a fake `Bun.serve` -- individual tests may still call `vi.stubGlobal`
// themselves to inspect a specific call.
beforeEach(() => {
  vi.stubGlobal('Bun', { serve: vi.fn(() => fakeServer()) });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OutpostInstance.start', () => {
  let started: OutpostInstance[] = [];
  let start = async (options: OutpostInstanceOptions) => {
    let instance = await OutpostInstance.start(options);
    started.push(instance);
    return instance;
  };

  afterEach(async () => {
    await Promise.all(started.map(instance => instance.stop()));
    started = [];
  });

  it('registers auth and constructs adapters from every registration form', async () => {
    let receivedContexts: OutpostAdapterContext[] = [];

    class FactoryTarget {
      readonly name = 'from-factory';
    }

    let instance = await start(
      baseOptions({
        adapters: [
          PlainAdapter,
          [ConfiguredAdapter, { label: 'configured' }],
          (ctx: OutpostAdapterContext) => {
            receivedContexts.push(ctx);
            return new FactoryTarget();
          }
        ]
      })
    );

    expect(instance.adapters.map(a => a.name)).toEqual([
      'plain',
      'configured',
      'from-factory'
    ]);
    expect(receivedContexts).toHaveLength(1);
    expect(receivedContexts[0].auth).toBe(instance.auth);
  });

  it('logs the registered outpost instance ID via console.log when no custom stdout is given', async () => {
    let log = vi.spyOn(console, 'log').mockImplementation(() => {});

    try {
      // baseOptions() defaults to a no-op stdout for every other test's sake -- override it back
      // to undefined here so OutpostInstance falls through to its real default (console.log).
      await start(baseOptions({ stdout: undefined }));

      expect(log).toHaveBeenCalledWith('  Outpost instance oti_789 registered');
    } finally {
      log.mockRestore();
    }
  });

  it('defaults to a LocalCache when no cache option is given', async () => {
    let receivedContexts: OutpostAdapterContext[] = [];

    class FactoryTarget {
      readonly name = 'from-factory';
    }

    await start(
      baseOptions({
        adapters: [
          (ctx: OutpostAdapterContext) => {
            receivedContexts.push(ctx);
            return new FactoryTarget();
          }
        ]
      })
    );

    expect(receivedContexts[0].cache).toBeInstanceOf(LocalCache);
  });

  it('passes through a provided cache instance', async () => {
    let cache = new LocalCache();
    let receivedContexts: OutpostAdapterContext[] = [];

    class FactoryTarget {
      readonly name = 'from-factory';
    }

    await start(
      baseOptions({
        cache,
        adapters: [
          (ctx: OutpostAdapterContext) => {
            receivedContexts.push(ctx);
            return new FactoryTarget();
          }
        ]
      })
    );

    expect(receivedContexts[0].cache).toBe(cache);
  });

  it('fetches its own manifest on start and exposes it via context.manifest', async () => {
    let receivedContexts: OutpostAdapterContext[] = [];

    await start(
      baseOptions({
        adapters: [
          (ctx: OutpostAdapterContext) => {
            receivedContexts.push(ctx);
            return { name: 'from-factory' };
          }
        ]
      })
    );

    expect(receivedContexts[0].manifest.current()).toEqual(TEST_MANIFEST);
  });

  it('builds a verify-only OutpostTokens and exposes it via context.tokens', async () => {
    let receivedContexts: OutpostAdapterContext[] = [];

    await start(
      baseOptions({
        adapters: [
          (ctx: OutpostAdapterContext) => {
            receivedContexts.push(ctx);
            return { name: 'from-factory' };
          }
        ]
      })
    );

    expect(receivedContexts[0].tokens).toBeInstanceOf(OutpostTokens);

    await expect(
      receivedContexts[0].tokens.sign({ type: 'metorial-outpost-instance', data: {} })
    ).rejects.toThrow();
  });

  it('requires a baseUrl and shares it (and trustProxy) with every adapter via context', async () => {
    let receivedContexts: OutpostAdapterContext[] = [];

    await start(
      baseOptions({
        baseUrl: 'https://abc.outpost.example/',
        trustProxy: { ipHeader: 'x-forwarded-for' },
        adapters: [
          (ctx: OutpostAdapterContext) => {
            receivedContexts.push(ctx);
            return { name: 'from-factory' };
          }
        ]
      })
    );

    expect(receivedContexts[0].baseUrl).toBe('https://abc.outpost.example');
    expect(receivedContexts[0].trustProxy).toEqual({ ipHeader: 'x-forwarded-for' });
  });

  it('rejects a missing or malformed baseUrl before starting anything', async () => {
    await expect(
      OutpostInstance.start(baseOptions({ baseUrl: undefined as any }))
    ).rejects.toThrow(/baseUrl/);

    await expect(OutpostInstance.start(baseOptions({ baseUrl: 'not-a-url' }))).rejects.toThrow(
      /baseUrl/
    );
  });

  it('prints the startup banner in order and always starts the proxy server for the status page', async () => {
    let lines: string[] = [];

    await start(
      baseOptions({
        adapters: [PlainAdapter],
        stdout: line => lines.push(line)
      })
    );

    // Adapters are resolved before registration so their services can be declared in the
    // handshake, which is why they're listed first. No adapter has a proxy of its own here, but
    // the status page is always mounted, so the proxy server still starts.
    expect(lines).toEqual([
      'Starting Metorial Outpost otp_123...',
      'Adapters:',
      '  -> plain',
      '  Outpost instance oti_789 registered',
      '  manifest fetched (0 access entries)',
      '     status page: -> /',
      'Proxy listening on http://localhost:4123',
      'Metorial Outpost otp_123 ready'
    ]);
  });

  it('collects proxies via startProxy() and starts one combined server', async () => {
    let serve = vi.fn(() => fakeServer());
    vi.stubGlobal('Bun', { serve });

    class ProxyAdapter extends BaseOutpostAdapter {
      readonly name = 'proxy-adapter';
      startProxy() {
        return { path: '/proxy-adapter', app: new Hono() };
      }
    }

    let lines: string[] = [];
    await start(
      baseOptions({
        adapters: [PlainAdapter, ProxyAdapter],
        stdout: line => lines.push(line)
      })
    );

    expect(serve).toHaveBeenCalledTimes(1);
    expect(lines).toContain('     proxy: proxy-adapter -> /proxy-adapter');
    expect(lines).toContain('Proxy listening on http://localhost:4123');
  });

  it('calls start() sequentially, after every adapter is constructed and proxies are registered', async () => {
    let order: string[] = [];
    let serve = vi.fn(() => fakeServer());
    vi.stubGlobal('Bun', { serve });

    class First extends BaseOutpostAdapter {
      readonly name = 'first';
      startProxy() {
        order.push('first:startProxy');
        return { path: '/first', app: new Hono() };
      }
      async start() {
        order.push('first:start');
      }
    }

    class Second extends BaseOutpostAdapter {
      readonly name = 'second';
      async start() {
        order.push('second:start');
      }
    }

    await start(baseOptions({ adapters: [First, Second] }));

    expect(order).toEqual(['first:startProxy', 'first:start', 'second:start']);
  });

  it('declares every adapter as a service, with its version and capabilities', async () => {
    class Versioned extends BaseOutpostAdapter {
      readonly name = 'versioned';
      readonly version = '2.1.0';
      readonly capabilities = { nested: true };
    }

    let store = preRegisteredStore();
    let ensureRegistered = vi.spyOn(OutpostAuth.prototype, 'ensureRegistered');

    try {
      await start(baseOptions({ adapters: [PlainAdapter, Versioned], store }));

      expect(ensureRegistered).toHaveBeenCalledWith({
        services: [
          { id: 'plain', version: undefined, capabilities: undefined },
          { id: 'versioned', version: '2.1.0', capabilities: { nested: true } }
        ]
      });
    } finally {
      ensureRegistered.mockRestore();
    }
  });

  it('does not start an adapter whose service was denied, and warns about it', async () => {
    let order: string[] = [];
    let serve = vi.fn(() => fakeServer());
    vi.stubGlobal('Bun', { serve });

    class Allowed extends BaseOutpostAdapter {
      readonly name = 'allowed';
      async start() {
        order.push('allowed:start');
      }
    }

    class Denied extends BaseOutpostAdapter {
      readonly name = 'denied';
      startProxy() {
        order.push('denied:startProxy');
        return { path: '/denied', app: new Hono() };
      }
      async start() {
        order.push('denied:start');
      }
    }

    let warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      let instance = await start(
        baseOptions({
          adapters: [Allowed, Denied],
          store: preRegisteredStore({
            services: [
              { id: 'allowed', granted: true },
              { id: 'denied', granted: false }
            ]
          })
        })
      );

      expect(order).toEqual(['allowed:start']);
      expect(instance.adapters.map(adapter => adapter.name)).toEqual(['allowed']);
      expect(instance.skippedAdapters.map(adapter => adapter.name)).toEqual(['denied']);
      // The denied adapter's own proxy never starts, but the server itself still comes up for
      // the always-on status page.
      expect(serve).toHaveBeenCalledTimes(1);

      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toContain('"denied"');
    } finally {
      warn.mockRestore();
    }
  });

  it('starts every adapter when the server reports no service decisions', async () => {
    let instance = await start(
      baseOptions({ adapters: [PlainAdapter], store: preRegisteredStore() })
    );

    expect(instance.adapters.map(adapter => adapter.name)).toEqual(['plain']);
    expect(instance.skippedAdapters).toEqual([]);
  });

  it('logs the services it ultimately starts', async () => {
    let info = vi.fn();
    let logger = {
      debug: vi.fn(),
      info,
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn(() => logger)
    } as unknown as Logger;

    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await start(
      baseOptions({
        adapters: [PlainAdapter],
        logger,
        store: preRegisteredStore({ services: [{ id: 'plain', granted: true }] })
      })
    );

    expect(info).toHaveBeenCalledWith('outpost: starting services', {
      outpostId: 'otp_123',
      instanceId: 'oti_789',
      services: ['plain'],
      skippedServices: []
    });
  });
});

describe('OutpostInstance.stop', () => {
  it('stops the proxy server, the manifest refresh, and calls adapter.stop() in reverse order', async () => {
    let order: string[] = [];
    let server = fakeServer();
    vi.stubGlobal('Bun', { serve: vi.fn(() => server) });

    class First extends BaseOutpostAdapter {
      readonly name = 'first';
      startProxy() {
        return { path: '/first', app: new Hono() };
      }
      async stop() {
        order.push('first:stop');
      }
    }

    class Second extends BaseOutpostAdapter {
      readonly name = 'second';
      async stop() {
        order.push('second:stop');
      }
    }

    let instance = await OutpostInstance.start(baseOptions({ adapters: [First, Second] }));
    await instance.stop();

    expect(server.stop).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['second:stop', 'first:stop']);
  });
});
