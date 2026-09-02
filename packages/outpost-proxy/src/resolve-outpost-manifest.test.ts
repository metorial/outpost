import { LocalCache } from '@metorial-outpost/cache-local';
import type { OutpostFetchFunction } from '@metorial-outpost/fetch';
import { describe, expect, it, vi } from 'vitest';
import { createOutpostManifestResolver } from './resolve-outpost-manifest';

let MANIFEST = { outpost: { id: 'otp_child', name: 'Child' }, access: [] };

describe('createOutpostManifestResolver', () => {
  it('fetches the manifest for a given outpostId, signed for the given service', async () => {
    let calls: [unknown, unknown][] = [];
    let fetch = vi.fn(async (input, init) => {
      calls.push([input, init]);
      return new Response(JSON.stringify(MANIFEST), {
        headers: { 'content-type': 'application/json' }
      });
    }) as unknown as OutpostFetchFunction;

    let resolve = createOutpostManifestResolver({
      endpoint: 'https://parent.example.com',
      basePath: '/outpost',
      service: 'metorial.outpost',
      fetch,
      cache: new LocalCache()
    });

    let manifest = await resolve('otp_child');

    expect(manifest).toEqual(MANIFEST);
    expect(calls[0]![0]).toBe('https://parent.example.com/outpost/manifest/otp_child');
    expect(calls[0]![1]).toMatchObject({ method: 'GET', service: 'metorial.outpost' });
  });

  it('returns undefined for an unknown outpost, without caching the miss', async () => {
    let fetch = vi.fn(
      async () => new Response('{}', { status: 404 })
    ) as unknown as OutpostFetchFunction;

    let resolve = createOutpostManifestResolver({
      endpoint: 'https://parent.example.com',
      basePath: '/outpost',
      service: 'metorial.outpost',
      fetch,
      cache: new LocalCache()
    });

    expect(await resolve('otp_unknown')).toBeUndefined();
    expect(await resolve('otp_unknown')).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('caches a successful lookup and does not re-fetch on the next call', async () => {
    let fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(MANIFEST), {
          headers: { 'content-type': 'application/json' }
        })
    ) as unknown as OutpostFetchFunction;

    let resolve = createOutpostManifestResolver({
      endpoint: 'https://parent.example.com',
      basePath: '/outpost',
      service: 'metorial.outpost',
      fetch,
      cache: new LocalCache()
    });

    await resolve('otp_child');
    await resolve('otp_child');

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
