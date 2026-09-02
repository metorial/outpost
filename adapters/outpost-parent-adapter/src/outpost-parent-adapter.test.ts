import type { OutpostAdapterContext } from '@metorial-outpost/adapter';
import { LocalCache } from '@metorial-outpost/cache-local';
import { createOutpostFetch } from '@metorial-outpost/fetch';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutpostParentAdapter } from './outpost-parent-adapter';

let buildFetchMock = () => {
  let calls: [string, RequestInit][] = [];
  let fetch = vi.fn(async (url: string, init: RequestInit) => {
    calls.push([url, init]);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'content-type': 'application/json' }
    });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
};

let fakeAuth = (endpoint: string) => ({ sign: async () => ({}), endpoint }) as any;

let makeContext = (
  fetch: typeof globalThis.fetch = globalThis.fetch,
  endpoint = 'https://parent.example.com'
): OutpostAdapterContext => ({
  auth: fakeAuth(endpoint),
  fetch: createOutpostFetch({ auth: fakeAuth(endpoint), fetch }),
  logger: {} as any,
  cache: new LocalCache(),
  manifest: {} as any,
  tokens: {} as any,
  baseUrl: 'https://proxy.local'
});

describe('OutpostParentAdapter', () => {
  it('declares itself as the outpost_registration_proxy service', () => {
    let adapter = new OutpostParentAdapter(makeContext(), {});

    expect(adapter.name).toBe('outpost_registration_proxy');
  });

  it('exposes itself under the default outpost-server base path', () => {
    let { fetch } = buildFetchMock();
    let adapter = new OutpostParentAdapter(makeContext(), {
      fetch
    });

    expect(adapter.startProxy().path).toBe('/outpost');
  });

  it('supports a custom base path, matched on both sides', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = new OutpostParentAdapter(makeContext(fetch), {
      basePath: '/nested-outposts',
      fetch
    });
    let proxy = adapter.startProxy();

    expect(proxy.path).toBe('/nested-outposts');

    await proxy.app.request('/register', { method: 'POST', body: '{}' });
    expect(calls[0]![0]).toBe('https://parent.example.com/nested-outposts/register');
  });

  it(
    'signs the registration challenge route as its own instance before relaying it -- see ' +
      'routes/challenge.test.ts for the proxy_context and re-signing behavior in detail',
    async () => {
      let { fetch, calls } = buildFetchMock();
      let adapter = new OutpostParentAdapter(makeContext(fetch), {
        fetch
      });
      let proxy = adapter.startProxy();

      let body = JSON.stringify({ version: 1, outpost_id: 'otp_1' });
      let res = await proxy.app.request('/register/challenge', { method: 'POST', body });

      expect(calls[0]![0]).toBe('https://parent.example.com/outpost/register/challenge');
      expect(new TextDecoder().decode(calls[0]![1].body as Uint8Array)).toBe(body);
      expect(await res.json()).toEqual({ ok: true });
    }
  );

  it(
    'signs the registration completion route as its own instance before relaying it -- see ' +
      'routes/register.test.ts for the proxy_context and re-signing behavior in detail',
    async () => {
      let { fetch, calls } = buildFetchMock();
      let adapter = new OutpostParentAdapter(makeContext(fetch), {
        fetch
      });
      let proxy = adapter.startProxy();

      let body = JSON.stringify({ challenge_id: 'och_1', signature: 'sig' });
      await proxy.app.request('/register', { method: 'POST', body });

      expect(calls[0]![0]).toBe('https://parent.example.com/outpost/register');
      expect(new TextDecoder().decode(calls[0]![1].body as Uint8Array)).toBe(body);
    }
  );

  it('resolves the public-key route against the parent, by path param', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = new OutpostParentAdapter(makeContext(fetch), {
      fetch
    });
    let proxy = adapter.startProxy();

    await proxy.app.request('/public-key/otp_1/otc_1');

    expect(calls[0]![0]).toBe('https://parent.example.com/outpost/public-key/otp_1/otc_1');
    expect(calls[0]![1].method).toBe('GET');
  });

  it('resolves the manifest route against the parent, by path param', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = new OutpostParentAdapter(makeContext(fetch), {
      fetch
    });
    let proxy = adapter.startProxy();

    await proxy.app.request('/manifest/otp_1');

    expect(calls[0]![0]).toBe('https://parent.example.com/outpost/manifest/otp_1');
    expect(calls[0]![1].method).toBe('GET');
  });

  it('resolves the issuer-key route against the parent, by path param', async () => {
    let { fetch, calls } = buildFetchMock();
    let adapter = new OutpostParentAdapter(makeContext(), {
      fetch
    });
    let proxy = adapter.startProxy();

    await proxy.app.request('/issuer-key/mik_1');

    expect(calls[0]![0]).toBe('https://parent.example.com/outpost/issuer-key/mik_1');
    expect(calls[0]![1].method).toBe('GET');
  });

  describe('issuer-key caching', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('caches a successful lookup and does not re-fetch on the next request', async () => {
      let { fetch, calls } = buildFetchMock();
      let adapter = new OutpostParentAdapter(makeContext(), {
        fetch
      });
      let proxy = adapter.startProxy();

      await proxy.app.request('/issuer-key/mik_1');
      await proxy.app.request('/issuer-key/mik_1');

      expect(calls).toHaveLength(1);
    });

    it('does not cache a non-ok response from the parent', async () => {
      let calls: string[] = [];
      let fetch = vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify({ error: 'unknown_issuer_key' }), { status: 404 });
      }) as unknown as typeof globalThis.fetch;

      let adapter = new OutpostParentAdapter(makeContext(), {
        fetch
      });
      let proxy = adapter.startProxy();

      await proxy.app.request('/issuer-key/mik_1');
      await proxy.app.request('/issuer-key/mik_1');

      expect(calls).toHaveLength(2);
    });
  });

  describe('public-key caching', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('caches a successful lookup and does not re-fetch on the next request', async () => {
      let { fetch, calls } = buildFetchMock();
      let adapter = new OutpostParentAdapter(makeContext(fetch), {
        fetch
      });
      let proxy = adapter.startProxy();

      let first = await proxy.app.request('/public-key/otp_1/otc_1');
      let second = await proxy.app.request('/public-key/otp_1/otc_1');

      expect(calls).toHaveLength(1);
      expect(await first.json()).toEqual({ ok: true });
      expect(await second.json()).toEqual({ ok: true });
    });

    it('keys the cache by outpost + credential id', async () => {
      let { fetch, calls } = buildFetchMock();
      let adapter = new OutpostParentAdapter(makeContext(fetch), {
        fetch
      });
      let proxy = adapter.startProxy();

      await proxy.app.request('/public-key/otp_1/otc_1');
      await proxy.app.request('/public-key/otp_1/otc_2');

      expect(calls).toHaveLength(2);
    });

    it('does not cache a non-ok response from the parent', async () => {
      let calls: string[] = [];
      let fetch = vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify({ error: 'unknown_outpost_credential' }), {
          status: 404
        });
      }) as unknown as typeof globalThis.fetch;

      let adapter = new OutpostParentAdapter(makeContext(fetch), {
        fetch
      });
      let proxy = adapter.startProxy();

      await proxy.app.request('/public-key/otp_1/otc_1');
      await proxy.app.request('/public-key/otp_1/otc_1');

      expect(calls).toHaveLength(2);
    });

    it('re-fetches once the configured ttl has elapsed', async () => {
      let { fetch, calls } = buildFetchMock();
      let adapter = new OutpostParentAdapter(makeContext(fetch), {
        fetch
      });
      let proxy = adapter.startProxy();

      await proxy.app.request('/public-key/otp_1/otc_1');
      vi.advanceTimersByTime(30 * 60 * 1000 + 1);
      await proxy.app.request('/public-key/otp_1/otc_1');

      expect(calls).toHaveLength(2);
    });

    it('strips transport-specific headers from the replayed cache hit', async () => {
      let fetch = vi.fn(async () => {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' }
        });
      }) as unknown as typeof globalThis.fetch;

      let adapter = new OutpostParentAdapter(makeContext(fetch), {
        fetch
      });
      let proxy = adapter.startProxy();

      await proxy.app.request('/public-key/otp_1/otc_1');
      let second = await proxy.app.request('/public-key/otp_1/otc_1');

      expect(second.headers.get('content-encoding')).toBeNull();
      expect(second.headers.get('content-type')).toBe('application/json');
    });
  });

  describe('manifest caching', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('caches a successful lookup and does not re-fetch on the next request', async () => {
      let { fetch, calls } = buildFetchMock();
      let adapter = new OutpostParentAdapter(makeContext(fetch), {
        fetch
      });
      let proxy = adapter.startProxy();

      await proxy.app.request('/manifest/otp_1');
      await proxy.app.request('/manifest/otp_1');

      expect(calls).toHaveLength(1);
    });

    it('does not cache a non-ok response from the parent', async () => {
      let calls: string[] = [];
      let fetch = vi.fn(async (url: string) => {
        calls.push(url);
        return new Response(JSON.stringify({ error: 'unknown_outpost' }), { status: 404 });
      }) as unknown as typeof globalThis.fetch;

      let adapter = new OutpostParentAdapter(makeContext(fetch), {
        fetch
      });
      let proxy = adapter.startProxy();

      await proxy.app.request('/manifest/otp_1');
      await proxy.app.request('/manifest/otp_1');

      expect(calls).toHaveLength(2);
    });
  });
});
