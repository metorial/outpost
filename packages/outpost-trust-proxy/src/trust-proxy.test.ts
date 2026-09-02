import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { resolveProxyContext } from './trust-proxy';

let capture = () => {
  let captured: any;
  let app = new Hono();
  app.all('/*', c => {
    captured = {
      trustDisabled: resolveProxyContext(c),
      trustEnabled: resolveProxyContext(c, true)
    };
    return c.text('ok');
  });
  return { app, read: () => captured };
};

describe('resolveProxyContext', () => {
  it('ignores forwarded headers by default and falls back to no IP outside of Bun', async () => {
    let { app, read } = capture();

    await app.request('/', {
      headers: { 'x-forwarded-for': '198.51.100.1', 'user-agent': 'curl/8' }
    });

    expect(read().trustDisabled).toEqual({ ip: undefined, user_agent: 'curl/8' });
  });

  it("reads Bun's server.requestIP() when trustProxy is disabled and a Bun server is available", async () => {
    let { app, read } = capture();

    let bunServer = {
      requestIP: () => ({ address: '203.0.113.9', family: 'IPv4', port: 54321 })
    };

    await app.request('/', { headers: { 'x-forwarded-for': '198.51.100.1' } }, bunServer);

    expect(read().trustDisabled.ip).toBe('203.0.113.9');
  });

  it('reads the forwarded header only when trustProxy is enabled', async () => {
    let { app, read } = capture();

    let bunServer = {
      requestIP: () => ({ address: '203.0.113.9', family: 'IPv4', port: 54321 })
    };

    await app.request(
      '/',
      { headers: { 'x-forwarded-for': '198.51.100.1, 10.0.0.1' } },
      bunServer
    );

    expect(read().trustEnabled.ip).toBe('198.51.100.1');
    expect(read().trustDisabled.ip).toBe('203.0.113.9');
  });

  it("reads a Node http.IncomingMessage's socket when trustProxy is disabled", async () => {
    let { app, read } = capture();

    let nodeEnv = { incoming: { socket: { remoteAddress: '198.51.100.42' } } };

    await app.request('/', { headers: { 'x-forwarded-for': '198.51.100.1' } }, nodeEnv);

    expect(read().trustDisabled.ip).toBe('198.51.100.42');
  });

  it('prefers a Bun-like env over a Node-like one when both are somehow present', async () => {
    let { app, read } = capture();

    let hybridEnv = {
      requestIP: () => ({ address: '203.0.113.9', family: 'IPv4', port: 1 }),
      incoming: { socket: { remoteAddress: '198.51.100.42' } }
    };

    await app.request('/', undefined, hybridEnv);

    expect(read().trustDisabled.ip).toBe('203.0.113.9');
  });

  it('supports a custom trusted header name', async () => {
    let app = new Hono();
    let captured: any;
    app.all('/*', c => {
      captured = resolveProxyContext(c, { ipHeader: 'cf-connecting-ip' });
      return c.text('ok');
    });

    await app.request('/', {
      headers: { 'cf-connecting-ip': '192.0.2.7', 'x-forwarded-for': '198.51.100.1' }
    });

    expect(captured.ip).toBe('192.0.2.7');
  });
});
