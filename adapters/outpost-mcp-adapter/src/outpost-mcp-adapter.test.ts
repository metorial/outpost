import type { OutpostAdapterContext } from '@metorial-outpost/adapter';
import type { OutpostFetchFunction, OutpostFetchInit } from '@metorial-outpost/fetch';
import { BaseLogger, type LogEntry } from '@metorial-outpost/logger';
import type { McpMiddleware } from '@metorial-outpost/mcp';
import { createOutpostProxy } from '@metorial-outpost/proxy';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { OutpostMcpAdapter } from './outpost-mcp-adapter';

class RecordingLogger extends BaseLogger {
  entries: LogEntry[] = [];
  protected write(entry: LogEntry): void {
    this.entries.push(entry);
  }
}

let buildMockUpstream = () => {
  let calls: { url: string; init: OutpostFetchInit }[] = [];

  let fetch: OutpostFetchFunction = vi.fn(async (input, init = {}) => {
    let url = new URL(input.toString());
    calls.push({ url: url.toString(), init });
    let method = init.method ?? 'GET';

    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return Response.json({ issuer: 'https://upstream.internal' });
    }

    if (url.pathname === '/oauth/token') {
      if (!(init.headers as Record<string, string>)?.authorization?.startsWith('Basic ')) {
        return Response.json({ error: 'invalid_client' }, { status: 401 });
      }
      return Response.json({ access_token: 'tok_123', token_type: 'Bearer' });
    }

    if (url.pathname.startsWith('/connect/mcp/')) {
      let headers = init.headers as Record<string, string> | undefined;
      if (!headers?.authorization) {
        return Response.json(
          { error: 'invalid_token' },
          { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } }
        );
      }

      if (method === 'GET') {
        let body =
          'id: evt-1\ndata: {"jsonrpc":"2.0","method":"notifications/tools/list_changed","params":{}}\n\n';
        return new Response(body, {
          headers: { 'content-type': 'text/event-stream', 'mcp-session-id': 'sess-1' }
        });
      }

      if (method === 'DELETE') {
        return new Response('OK');
      }

      let bodyText = init.body
        ? init.body instanceof Uint8Array
          ? new TextDecoder().decode(init.body)
          : String(init.body)
        : '';
      let message = JSON.parse(bodyText);

      if (message.method === 'ping') {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: message.id, result: {} }), {
          headers: { 'content-type': 'application/json', 'mcp-session-id': 'sess-1' }
        });
      }

      if (message.method === 'tools/call') {
        let body =
          `data: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { pct: 50 } })}\n\n` +
          `data: ${JSON.stringify({ jsonrpc: '2.0', id: message.id, result: { value: 'from-upstream' } })}\n\n`;
        return new Response(body, {
          headers: { 'content-type': 'text/event-stream', 'mcp-session-id': 'sess-1' }
        });
      }

      return Response.json({ jsonrpc: '2.0', id: message.id, result: {} });
    }

    return new Response('not found', { status: 404 });
  }) as unknown as OutpostFetchFunction;

  return { fetch, calls };
};

let makeContext = (overrides: Partial<OutpostAdapterContext> = {}): OutpostAdapterContext => ({
  auth: {
    endpoint: 'https://upstream.internal',
    getSnapshot: () => ({ outpostId: 'otp_parent' })
  } as any,
  fetch: buildMockUpstream().fetch,
  logger: new RecordingLogger(),
  cache: {} as any,
  manifest: { current: () => undefined },
  tokens: {} as any,
  baseUrl: 'https://proxy.local',
  ...overrides
});

let buildAdapter = (middleware: McpMiddleware[] = [], logger = new RecordingLogger()) => {
  let { fetch, calls } = buildMockUpstream();
  let context = makeContext({ fetch, logger });
  let adapter = new OutpostMcpAdapter(context, { middleware });
  let [proxy] = adapter.startProxy();
  return { adapter, proxy, calls, logger };
};

describe('OutpostMcpAdapter', () => {
  it('registers exactly the connect api surface, not the whole server', () => {
    let { fetch } = buildMockUpstream();
    let adapter = new OutpostMcpAdapter(makeContext({ fetch }), {});

    let result = adapter.startProxy();

    expect(result.map(r => r.path).sort()).toEqual(
      [
        '/.well-known',
        '/connect/magic',
        '/connect/mcp',
        '/connect/plugin',
        '/connect/portal',
        '/oauth'
      ].sort()
    );
  });

  it('shares the outpost proxy server with another adapter mounted outside /connect', async () => {
    let { fetch } = buildMockUpstream();
    let adapter = new OutpostMcpAdapter(makeContext({ fetch }), {});

    let otherApp = new Hono();
    otherApp.all('/*', c => c.text('from other adapter'));

    let server = createOutpostProxy({
      adapters: [...adapter.startProxy(), { path: '/outpost', app: otherApp }]
    });

    let ownRes = await server.request('https://proxy.local/connect/mcp/sess1', {
      method: 'POST',
      headers: { authorization: 'Bearer key', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'ping' })
    });
    expect(await ownRes.json()).toEqual({ jsonrpc: '2.0', id: '1', result: {} });

    let otherRes = await server.request('https://proxy.local/outpost/register');
    expect(await otherRes.text()).toBe('from other adapter');
  });

  it('forwards OAuth discovery requests untouched, with no auth required', async () => {
    let { proxy, calls } = buildAdapter();

    let res = await proxy.app.request(
      'https://proxy.local/.well-known/oauth-authorization-server'
    );

    expect(await res.json()).toEqual({ issuer: 'https://upstream.internal' });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(
      'https://upstream.internal/.well-known/oauth-authorization-server'
    );
  });

  it('forwards /ping through to the connect api', async () => {
    let { proxy, calls } = buildAdapter();

    await proxy.app.request('https://proxy.local/ping');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://upstream.internal/ping');
  });

  it('forwards an unauthenticated hit on the connect endpoint untouched, letting upstream 401', async () => {
    let { proxy } = buildAdapter();

    let res = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })
    });

    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer');
  });

  it('forwards the token endpoint untouched even though it carries an Authorization header', async () => {
    let { proxy, calls } = buildAdapter();

    let res = await proxy.app.request('https://proxy.local/oauth/token', {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + btoa('client:secret'),
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ access_token: 'tok_123', token_type: 'Bearer' });
    expect(calls).toHaveLength(1);
  });

  it('intercepts an authenticated MCP POST and returns the plain-JSON reply as-is with no middleware', async () => {
    let { proxy } = buildAdapter();

    let res = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
      method: 'POST',
      headers: { authorization: 'Bearer key', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'ping' })
    });

    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ jsonrpc: '2.0', id: '1', result: {} });
    expect(res.headers.get('mcp-session-id')).toBe('sess-1');
  });

  it('runs an authenticated MCP POST through configured middleware', async () => {
    let redact: McpMiddleware = async (message, call) => {
      let raw = (await call(message)) as any;
      return { ...raw, result: { ...raw.result, redacted: true } };
    };
    let { proxy } = buildAdapter([redact]);

    let res = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
      method: 'POST',
      headers: { authorization: 'Bearer key', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'ping' })
    });

    expect(await res.json()).toEqual({ jsonrpc: '2.0', id: '1', result: { redacted: true } });
  });

  it('forwards SSE progress untouched and applies middleware only to the terminal reply', async () => {
    let mw: McpMiddleware = async (message, call) => {
      let raw = (await call(message)) as any;
      return { ...raw, result: { value: 'transformed' } };
    };
    let { proxy } = buildAdapter([mw]);

    let res = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
      method: 'POST',
      headers: { authorization: 'Bearer key', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'tools/call', params: {} })
    });

    let text = await res.text();
    let frames = text.split('\n\n').filter(Boolean);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toContain('"pct":50');
    expect(JSON.parse(frames[1]!.replace('data: ', ''))).toEqual({
      jsonrpc: '2.0',
      id: '1',
      result: { value: 'transformed' }
    });
  });

  it('blocks a request via middleware without ever calling upstream', async () => {
    let block: McpMiddleware = message =>
      Promise.resolve({
        jsonrpc: '2.0',
        id: (message as any).id,
        error: { code: -32000, message: 'not allowed' }
      } as any);
    let { proxy, calls } = buildAdapter([block]);

    let res = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
      method: 'POST',
      headers: { authorization: 'Bearer key', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'tools/call', params: {} })
    });

    expect(calls).toHaveLength(0);
    let body = (await res.json()) as any;
    expect(body.error.message).toBe('not allowed');
  });

  it('relays the broadcast (GET) stream, running every message through middleware', async () => {
    let mw: McpMiddleware = (message, call) =>
      call({ ...message, params: { decorated: true } } as any);
    let { proxy } = buildAdapter([mw]);

    let res = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
      headers: { authorization: 'Bearer key' }
    });

    expect(res.headers.get('content-type')).toContain('text/event-stream');
    let text = await res.text();
    let frame = text.split('\n\n')[0]!;
    let dataLine = frame.split('\n').find(l => l.startsWith('data:'))!;
    expect(JSON.parse(dataLine.replace('data: ', ''))).toMatchObject({
      params: { decorated: true }
    });
  });

  it('forwards DELETE untouched, running no middleware', async () => {
    let mw = vi.fn(async (message: any, call: any) => call(message));
    let { proxy } = buildAdapter([mw]);

    let res = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer key' }
    });

    expect(res.status).toBe(200);
    expect(mw).not.toHaveBeenCalled();
  });

  it('fails closed with an outpost-attributed error, logged verbosely, when middleware throws', async () => {
    let logger = new RecordingLogger();
    let buggy: McpMiddleware = {
      name: 'crashy',
      handle: async () => {
        throw new Error('boom');
      }
    };
    let { proxy } = buildAdapter([buggy], logger);

    let res = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
      method: 'POST',
      headers: { authorization: 'Bearer key', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'ping' })
    });

    let body = (await res.json()) as any;
    expect(body.error.code).toBe(-32050);
    expect(body.error.data.middleware).toBe('crashy');
    expect(body.error.message).toContain('Metorial Outpost');
    expect(logger.entries.some(e => e.level === 'error')).toBe(true);
  });

  it('signs context.baseUrl (shared by the whole outpost instance) into the proxy context for classified mcp requests', async () => {
    let { proxy, calls } = buildAdapter();

    await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
      method: 'POST',
      headers: {
        authorization: 'Bearer key',
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.9'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'ping' })
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.proxyContext).toMatchObject({ base_url: 'https://proxy.local' });
  });

  it('signs context.baseUrl into the proxy context for passthrough (discovery) requests too', async () => {
    let { proxy, calls } = buildAdapter();

    await proxy.app.request('https://proxy.local/.well-known/oauth-authorization-server');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.proxyContext).toMatchObject({ base_url: 'https://proxy.local' });
  });

  it('uses whatever baseUrl the outpost instance configured, not a hardcoded value', async () => {
    let { fetch, calls } = buildMockUpstream();
    let adapter = new OutpostMcpAdapter(
      makeContext({ fetch, baseUrl: 'https://custom.outpost.example' }),
      {}
    );
    let [proxy] = adapter.startProxy();

    await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
      method: 'POST',
      headers: { authorization: 'Bearer key', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'ping' })
    });

    expect(calls[0]!.init.proxyContext).toMatchObject({
      base_url: 'https://custom.outpost.example'
    });
  });

  it('preserves the first outpost baseUrl from an authenticated nested request', async () => {
    let { proxy, calls } = buildAdapter();
    let root = new Hono();
    root.use('*', async (c: any, next) => {
      c.set('outpostAuth', {
        outpostId: 'otp_child',
        instanceId: 'oti_child',
        outpostChain: [],
        proxyContext: {
          ip: '203.0.113.9',
          user_agent: 'original-client',
          base_url: 'https://first-outpost.example'
        }
      });
      await next();
    });
    root.route('/', proxy.app);

    await root.request('https://parent-outpost.example/connect/mcp/sess1', {
      method: 'POST',
      headers: { authorization: 'Bearer key', 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'ping' })
    });

    expect(calls[0]!.init.proxyContext).toEqual({
      ip: '203.0.113.9',
      user_agent: 'original-client',
      base_url: 'https://first-outpost.example'
    });
    expect(calls[0]!.init.outpostChain).toEqual([['otp_child', 'oti_child']]);
  });

  it('preserves nested context and chain for passthrough requests', async () => {
    let { proxy, calls } = buildAdapter();
    let root = new Hono();
    root.use('*', async (c: any, next) => {
      c.set('outpostAuth', {
        outpostId: 'otp_child',
        instanceId: 'oti_child',
        outpostChain: [['otp_first', 'oti_first']],
        proxyContext: { base_url: 'https://first-outpost.example' }
      });
      await next();
    });
    root.route('/', proxy.app);

    await root.request(
      'https://parent-outpost.example/.well-known/oauth-authorization-server'
    );

    expect(calls[0]!.init.proxyContext).toEqual({
      base_url: 'https://first-outpost.example'
    });
    expect(calls[0]!.init.outpostChain).toEqual([
      ['otp_first', 'oti_first'],
      ['otp_child', 'oti_child']
    ]);
  });

  it('authenticates signed nested requests before forwarding them', async () => {
    let { proxy, calls } = buildAdapter();

    let response = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
      headers: { 'metorial-outpost-signature': 'invalid' }
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: 'missing_authentication' });
    expect(calls).toHaveLength(0);
  });

  describe('CORS', () => {
    it('answers an OPTIONS preflight locally, with no upstream call', async () => {
      let { proxy, calls } = buildAdapter();

      let res = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
        method: 'OPTIONS',
        headers: { origin: 'https://client.example', 'access-control-request-method': 'POST' }
      });

      expect(calls).toHaveLength(0);
      expect(res.status).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe('https://client.example');
      expect(res.headers.get('access-control-allow-methods')).toContain('POST');
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    });

    it('allows any origin by default on a regular response', async () => {
      let { proxy } = buildAdapter();

      let res = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
        method: 'POST',
        headers: {
          authorization: 'Bearer key',
          'content-type': 'application/json',
          origin: 'https://anywhere.example'
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'ping' })
      });

      expect(res.headers.get('access-control-allow-origin')).toBe('https://anywhere.example');
    });

    it('restricts to a configured origin allow-list', async () => {
      let { fetch, calls } = buildMockUpstream();
      let adapter = new OutpostMcpAdapter(makeContext({ fetch }), {
        corsOrigins: ['https://allowed.example']
      });
      let [proxy] = adapter.startProxy();

      let blocked = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
        method: 'OPTIONS',
        headers: { origin: 'https://blocked.example' }
      });
      expect(blocked.headers.get('access-control-allow-origin')).toBeNull();

      let allowed = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
        method: 'POST',
        headers: {
          authorization: 'Bearer key',
          'content-type': 'application/json',
          origin: 'https://allowed.example'
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'ping' })
      });
      expect(allowed.headers.get('access-control-allow-origin')).toBe(
        'https://allowed.example'
      );
      expect(calls).toHaveLength(1);
    });

    it('supports a predicate function for corsOrigins', async () => {
      let { fetch } = buildMockUpstream();
      let adapter = new OutpostMcpAdapter(makeContext({ fetch }), {
        corsOrigins: origin => origin.endsWith('.allowed.example')
      });
      let [proxy] = adapter.startProxy();

      let res = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
        method: 'OPTIONS',
        headers: { origin: 'https://sub.allowed.example' }
      });
      expect(res.headers.get('access-control-allow-origin')).toBe(
        'https://sub.allowed.example'
      );
    });

    it('strips any CORS headers the upstream connection api set, overriding with its own', async () => {
      let fetch: OutpostFetchFunction = vi.fn(async () =>
        Response.json(
          { jsonrpc: '2.0', id: '1', result: {} },
          {
            headers: {
              'access-control-allow-origin': 'https://upstream-said-this.example',
              'access-control-allow-credentials': 'false'
            }
          }
        )
      ) as unknown as OutpostFetchFunction;
      let adapter = new OutpostMcpAdapter(makeContext({ fetch }), {});
      let [proxy] = adapter.startProxy();

      let res = await proxy.app.request('https://proxy.local/connect/mcp/sess1', {
        method: 'POST',
        headers: {
          authorization: 'Bearer key',
          'content-type': 'application/json',
          origin: 'https://client.example'
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: '1', method: 'ping' })
      });

      expect(res.headers.get('access-control-allow-origin')).toBe('https://client.example');
      expect(res.headers.get('access-control-allow-credentials')).toBe('true');
    });
  });
});
