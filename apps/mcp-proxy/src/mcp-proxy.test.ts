import {
  MemoryInstanceCredentialStore,
  type InstanceCredentials
} from '@metorial-outpost/auth';
import {
  encodeCredentialEnvelope,
  type OutpostCredential
} from '@metorial-outpost/credential-envelope';
import { base64url, Ed25519 } from '@metorial-outpost/crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { McpProxy, type McpProxyOptions } from './mcp-proxy';
import { mcpMiddleware } from './middleware';

let rawCredential: OutpostCredential = {
  version: 1,
  endpoint: 'https://outpost.metorial.com',
  outpost_id: 'otp_123',
  credential_id: 'otc_456',
  private_key: 'unused-in-these-tests'
};

let outpostCredential = encodeCredentialEnvelope(rawCredential);

let instancePrivateKey: string;
let instancePublicKey: string;

beforeAll(async () => {
  let keyPair = await Ed25519.generateKeyPair();
  instancePrivateKey = base64url.encode(await Ed25519.exportPrivateKey(keyPair.privateKey));
  instancePublicKey = base64url.encode(await Ed25519.exportPublicKey(keyPair.publicKey));
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

// `McpProxyOptions.fetch` (like `OutpostInstanceOptions.fetch`) is the raw, unsigned transport
// that `@metorial/outpost-fetch` wraps to sign every outbound request -- a plain `typeof fetch`,
// not the signed `OutpostFetchFunction` an adapter's own `this.fetch` exposes.
let buildMockUpstream = () => {
  let calls: { url: string; init: RequestInit }[] = [];

  let upstreamFetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    let url = new URL(input.toString());
    calls.push({ url: url.toString(), init });

    if (url.pathname.includes('/manifest/')) {
      return Response.json(TEST_MANIFEST);
    }

    if (url.pathname.startsWith('/connect/mcp/')) {
      let headers = init.headers as Record<string, string> | undefined;
      if (!headers?.authorization)
        return Response.json({ error: 'invalid_token' }, { status: 401 });

      let bodyText = init.body
        ? init.body instanceof Uint8Array
          ? new TextDecoder().decode(init.body)
          : String(init.body)
        : '';
      let message = JSON.parse(bodyText);
      return Response.json({
        jsonrpc: '2.0',
        id: message.id,
        result: { value: 'from-upstream' }
      });
    }

    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;

  return { fetch: upstreamFetch, calls };
};

let baseOptions = (overrides: Partial<McpProxyOptions> = {}): McpProxyOptions => {
  let { fetch } = buildMockUpstream();
  return {
    outpostCredential,
    baseUrl: 'https://proxy.local',
    proxy: { port: 4123 },
    fetch,
    stdout: () => {},
    store: preRegisteredStore(),
    ...overrides
  };
};

describe('McpProxy.create', () => {
  let started: McpProxy[] = [];
  let capturedFetch: ((request: Request) => Promise<Response>) | undefined;
  let create = async (options: McpProxyOptions) => {
    let proxy = await McpProxy.create(options);
    started.push(proxy);
    return proxy;
  };

  beforeAll(() => {});

  afterEach(async () => {
    await Promise.all(started.map(proxy => proxy.stop()));
    started = [];
    vi.unstubAllGlobals();
  });

  let stubBunServe = () => {
    vi.stubGlobal('Bun', {
      serve: vi.fn(({ fetch }: { fetch: (request: Request) => Promise<Response> }) => {
        capturedFetch = fetch;
        return { hostname: 'localhost', port: 4123, stop: vi.fn() };
      })
    });
  };

  it('mounts both the MCP proxy adapter and the nested-outpost parent adapter by default', async () => {
    stubBunServe();
    let proxy = await create(baseOptions());

    expect(proxy.instance.adapters.map(adapter => adapter.name)).toEqual([
      'mcp_connection_proxy',
      'outpost_registration_proxy'
    ]);
  });

  it('skips the parent adapter when parent is false', async () => {
    stubBunServe();
    let proxy = await create(baseOptions({ parent: false }));

    expect(proxy.instance.adapters.map(adapter => adapter.name)).toEqual([
      'mcp_connection_proxy'
    ]);
  });

  it('proxies an authenticated MCP request through to the upstream connection api', async () => {
    stubBunServe();
    await create(baseOptions());

    let res = await capturedFetch!(
      new Request('https://proxy.local/connect/mcp/sess1', {
        method: 'POST',
        headers: { authorization: 'Bearer key', 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'ping' })
      })
    );

    expect(await res.json()).toEqual({
      jsonrpc: '2.0',
      id: '1',
      result: { value: 'from-upstream' }
    });
  });

  it('runs mcpMiddleware()-built middleware over proxied messages, in order', async () => {
    stubBunServe();
    let seen: string[] = [];
    let tagFirst = mcpMiddleware({
      name: 'tag-first',
      handle: (message, call) => {
        seen.push('first');
        return call(message);
      }
    });
    let redactResult = mcpMiddleware({
      name: 'redact-result',
      filter: message => (message as any).method === 'ping',
      handle: async (message, call) => call(message)
    });

    await create(baseOptions({ middleware: [tagFirst, redactResult] }));

    let res = await capturedFetch!(
      new Request('https://proxy.local/connect/mcp/sess1', {
        method: 'POST',
        headers: { authorization: 'Bearer key', 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'ping' })
      })
    );

    expect(seen).toEqual(['first']);
    expect(await res.json()).toEqual({
      jsonrpc: '2.0',
      id: '1',
      result: { value: 'from-upstream' }
    });
  });

  it('restricts CORS to the configured origin allow-list', async () => {
    stubBunServe();
    await create(baseOptions({ cors: ['https://allowed.example'] }));

    let blocked = await capturedFetch!(
      new Request('https://proxy.local/connect/mcp/sess1', {
        method: 'OPTIONS',
        headers: { origin: 'https://blocked.example' }
      })
    );
    expect(blocked.headers.get('access-control-allow-origin')).toBeNull();

    let allowed = await capturedFetch!(
      new Request('https://proxy.local/connect/mcp/sess1', {
        method: 'OPTIONS',
        headers: { origin: 'https://allowed.example' }
      })
    );
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://allowed.example');
  });

  it('mounts the parent adapter protocol routes so nested outposts can register', async () => {
    stubBunServe();
    let { fetch, calls } = buildMockUpstream();
    await create(baseOptions({ fetch }));

    let res = await capturedFetch!(
      new Request('https://proxy.local/outpost/manifest/otp_123')
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(TEST_MANIFEST);
    expect(calls.some(call => call.url.includes('/outpost/manifest/otp_123'))).toBe(true);
  });

  it('stop() stops the underlying outpost instance', async () => {
    stubBunServe();
    let proxy = await McpProxy.create(baseOptions());

    await proxy.stop();

    let server = (globalThis as any).Bun.serve.mock.results[0].value;
    expect(server.stop).toHaveBeenCalledTimes(1);
  });
});
