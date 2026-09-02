import { LocalCache } from '@metorial-outpost/cache-local';
import { base64url, Ed25519 } from '@metorial-outpost/crypto';
import { describe, expect, it, vi } from 'vitest';
import { createIssuerKeyResolver } from './issuer-key-resolver';

describe('createIssuerKeyResolver', () => {
  it('fetches and imports the public key for a known kid', async () => {
    let keyPair = await Ed25519.generateKeyPair();
    let rawPublicKey = await Ed25519.exportPublicKey(keyPair.publicKey);

    let fetch = vi.fn(async (url: string) => {
      expect(url).toBe('https://outpost.metorial.com/outpost/issuer-key/mik_1');
      return new Response(
        JSON.stringify({ kid: 'mik_1', public_key: base64url.encode(rawPublicKey) })
      );
    });

    let resolve = createIssuerKeyResolver({
      endpoint: 'https://outpost.metorial.com',
      basePath: '/outpost',
      fetch: fetch as any,
      cache: new LocalCache()
    });

    let resolved = await resolve('mik_1');
    expect(resolved).toBeDefined();
    expect(await Ed25519.exportPublicKey(resolved!)).toEqual(rawPublicKey);
  });

  it('returns undefined for an unknown kid, without caching the miss', async () => {
    let fetch = vi.fn(async () => new Response('{}', { status: 404 }));

    let resolve = createIssuerKeyResolver({
      endpoint: 'https://outpost.metorial.com',
      basePath: '/outpost',
      fetch: fetch as any,
      cache: new LocalCache()
    });

    expect(await resolve('mik_unknown')).toBeUndefined();
    expect(await resolve('mik_unknown')).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('caches a successful lookup and does not re-fetch on the next call', async () => {
    let keyPair = await Ed25519.generateKeyPair();
    let rawPublicKey = await Ed25519.exportPublicKey(keyPair.publicKey);

    let fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ kid: 'mik_1', public_key: base64url.encode(rawPublicKey) })
        )
    );

    let resolve = createIssuerKeyResolver({
      endpoint: 'https://outpost.metorial.com',
      basePath: '/outpost',
      fetch: fetch as any,
      cache: new LocalCache()
    });

    await resolve('mik_1');
    await resolve('mik_1');

    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
