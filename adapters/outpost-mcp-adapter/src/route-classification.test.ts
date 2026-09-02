import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { classifyRequest } from './route-classification';

let appWithClassifier = () => {
  let app = new Hono();
  app.all('/*', async c => {
    let classification = await classifyRequest(c);
    return c.json(
      classification.kind === 'mcp_post'
        ? { kind: classification.kind, message: classification.message }
        : { kind: classification.kind }
    );
  });
  return app;
};

describe('classifyRequest', () => {
  it('forwards any request with no Authorization header', async () => {
    let app = appWithClassifier();
    let res = await app.request('/.well-known/oauth-authorization-server');
    expect(await res.json()).toEqual({ kind: 'passthrough' });
  });

  it('forwards a POST with no Authorization header, even with a JSON-RPC body', async () => {
    let app = appWithClassifier();
    let res = await app.request('/connect/mcp/sess1', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' })
    });
    expect(await res.json()).toEqual({ kind: 'passthrough' });
  });

  it('intercepts GET when Authorization is present', async () => {
    let app = appWithClassifier();
    let res = await app.request('/connect/mcp/sess1', {
      headers: { authorization: 'Bearer key' }
    });
    expect(await res.json()).toEqual({ kind: 'mcp_get' });
  });

  it('intercepts a POST with a valid JSON-RPC body when Authorization is present', async () => {
    let app = appWithClassifier();
    let message = { jsonrpc: '2.0', id: 1, method: 'tools/call', params: {} };
    let res = await app.request('/connect/mcp/sess1', {
      method: 'POST',
      headers: { authorization: 'Bearer key', 'content-type': 'application/json' },
      body: JSON.stringify(message)
    });
    expect(await res.json()).toEqual({ kind: 'mcp_post', message });
  });

  it('falls back to passthrough for a POST whose body is not JSON-RPC, even with Authorization set', async () => {
    // e.g. an /oauth/token exchange using client_secret_basic
    let app = appWithClassifier();
    let res = await app.request('/oauth/token', {
      method: 'POST',
      headers: {
        authorization: 'Basic ' + btoa('client:secret'),
        'content-type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=authorization_code&code=abc'
    });
    expect(await res.json()).toEqual({ kind: 'passthrough' });
  });

  it('falls back to passthrough for a POST with an empty body', async () => {
    let app = appWithClassifier();
    let res = await app.request('/connect/mcp/sess1', {
      method: 'POST',
      headers: { authorization: 'Bearer key' }
    });
    expect(await res.json()).toEqual({ kind: 'passthrough' });
  });

  it('falls back to passthrough for a POST whose body is JSON but not JSON-RPC shaped', async () => {
    let app = appWithClassifier();
    let res = await app.request('/oauth/register', {
      method: 'POST',
      headers: { authorization: 'Bearer key', 'content-type': 'application/json' },
      body: JSON.stringify({ redirect_uris: ['https://example.com'] })
    });
    expect(await res.json()).toEqual({ kind: 'passthrough' });
  });

  it('forwards DELETE regardless of Authorization', async () => {
    let app = appWithClassifier();
    let res = await app.request('/connect/mcp/sess1', {
      method: 'DELETE',
      headers: { authorization: 'Bearer key' }
    });
    expect(await res.json()).toEqual({ kind: 'passthrough' });
  });
});
