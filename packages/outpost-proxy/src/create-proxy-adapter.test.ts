import type { OutpostFetchFunction } from '@metorial-outpost/fetch';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createProxyAdapter } from './create-proxy-adapter';

let buildFetchMock = () => {
  let calls: [RequestInfo | URL, RequestInit & { service?: string; proxyContext?: any }][] =
    [];
  let fetch: OutpostFetchFunction = vi.fn(async (input, init) => {
    calls.push([input, init as any]);
    return new Response('upstream ok');
  }) as unknown as OutpostFetchFunction;
  return { fetch, calls };
};

describe('createProxyAdapter', () => {
  it('strips the adapter path prefix before forwarding to the target', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = createProxyAdapter({
      path: '/abc',
      fetch,
      target: 'https://parent.example.com'
    });

    let root = new Hono();
    root.route(adapter.path, adapter.app);

    await root.request('https://proxy.local/abc/foo?x=1');

    let [url] = calls[0];
    expect(new URL(url as string).toString()).toBe('https://parent.example.com/foo?x=1');
  });

  it('does not strip anything for a "/" fallback adapter', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = createProxyAdapter({
      path: '/',
      fetch,
      target: 'https://parent.example.com'
    });

    let root = new Hono();
    root.route(adapter.path, adapter.app);

    await root.request('https://proxy.local/whatever/path');

    let [url] = calls[0];
    expect(new URL(url as string).toString()).toBe('https://parent.example.com/whatever/path');
  });

  it('forwards GET requests without a body', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = createProxyAdapter({
      path: '/',
      fetch,
      target: 'https://parent.example.com'
    });

    let root = new Hono();
    root.route(adapter.path, adapter.app);
    await root.request('https://proxy.local/foo');

    let [, init] = calls[0];
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('buffers and forwards a POST body, and signs with the given service', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = createProxyAdapter({
      path: '/',
      fetch,
      target: 'https://parent.example.com',
      service: 'metorial.proxy'
    });

    let root = new Hono();
    root.route(adapter.path, adapter.app);
    await root.request('https://proxy.local/foo', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' })
    });

    let [, init] = calls[0];
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe('{"hello":"world"}');
    expect(init.service).toBe('metorial.proxy');
  });

  it('strips hop-by-hop headers before forwarding', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = createProxyAdapter({
      path: '/',
      fetch,
      target: 'https://parent.example.com'
    });

    let root = new Hono();
    root.route(adapter.path, adapter.app);
    await root.request('https://proxy.local/foo', {
      headers: { 'content-type': 'application/json', connection: 'keep-alive' }
    });

    let [, init] = calls[0];
    let headers = init.headers as Record<string, string>;
    expect(headers.host).toBeUndefined();
    expect(headers.connection).toBeUndefined();
    expect(headers['content-type']).toBe('application/json');
  });

  it('lets a proxyContext override bypass trustProxy entirely', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = createProxyAdapter({
      path: '/',
      fetch,
      target: 'https://parent.example.com',
      proxyContext: () => ({ ip: '9.9.9.9', user_agent: 'custom' })
    });

    let root = new Hono();
    root.route(adapter.path, adapter.app);
    await root.request('https://proxy.local/foo', {
      headers: { 'x-forwarded-for': '1.2.3.4' }
    });

    let [, init] = calls[0];
    expect(init.proxyContext).toEqual({ ip: '9.9.9.9', user_agent: 'custom' });
  });

  it('supports a custom rewritePath', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = createProxyAdapter({
      path: '/abc',
      fetch,
      target: 'https://parent.example.com',
      rewritePath: path => `/prefixed${path}`
    });

    let root = new Hono();
    root.route(adapter.path, adapter.app);
    await root.request('https://proxy.local/abc/foo');

    let [url] = calls[0];
    expect(new URL(url as string).pathname).toBe('/prefixed/abc/foo');
  });

  it('prefers the proxy_context and extends outpost_chain from an already-authenticated hop', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = createProxyAdapter({
      path: '/',
      fetch,
      target: 'https://parent.example.com'
    });

    let root = new Hono();
    root.use('*', async (c: any, next) => {
      c.set('outpostAuth', {
        outpostId: 'otp_child',
        instanceId: 'oti_1',
        credentialId: 'otc_1',
        service: 'metorial.proxy',
        requestId: 'req_1',
        timestamp: 0,
        outpostChain: [['otp_a', 'oti_a']],
        proxyContext: { ip: '5.5.5.5', user_agent: 'original-client' }
      });
      await next();
    });
    root.route(adapter.path, adapter.app);

    await root.request('https://proxy.local/foo', {
      headers: { 'x-forwarded-for': '1.2.3.4' }
    });

    let [, init] = calls[0];
    expect(init.proxyContext).toEqual({ ip: '5.5.5.5', user_agent: 'original-client' });
    expect((init as any).outpostChain).toEqual([
      ['otp_a', 'oti_a'],
      ['otp_child', 'oti_1']
    ]);
  });

  it('keeps an authenticated proxyContext ahead of an explicit local override', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = createProxyAdapter({
      path: '/',
      fetch,
      target: 'https://parent.example.com',
      proxyContext: () => ({ ip: '9.9.9.9', user_agent: 'custom' })
    });

    let root = new Hono();
    root.use('*', async (c: any, next) => {
      c.set('outpostAuth', {
        outpostId: 'otp_child',
        instanceId: 'oti_1',
        credentialId: 'otc_1',
        service: 'metorial.proxy',
        requestId: 'req_1',
        timestamp: 0,
        outpostChain: [],
        proxyContext: { ip: '5.5.5.5', user_agent: 'original-client' }
      });
      await next();
    });
    root.route(adapter.path, adapter.app);

    await root.request('https://proxy.local/foo');

    let [, init] = calls[0];
    expect(init.proxyContext).toEqual({ ip: '5.5.5.5', user_agent: 'original-client' });
  });

  it('omits outpost_chain entirely for a request with no prior authentication', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = createProxyAdapter({
      path: '/',
      fetch,
      target: 'https://parent.example.com'
    });

    let root = new Hono();
    root.route(adapter.path, adapter.app);
    await root.request('https://proxy.local/foo');

    let [, init] = calls[0];
    expect((init as any).outpostChain).toBeUndefined();
  });

  it('supports a target resolved per-request', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = createProxyAdapter({
      path: '/',
      fetch,
      target: () => 'https://dynamic.example.com'
    });

    let root = new Hono();
    root.route(adapter.path, adapter.app);
    await root.request('https://proxy.local/foo');

    let [url] = calls[0];
    expect(new URL(url as string).origin).toBe('https://dynamic.example.com');
  });
});
