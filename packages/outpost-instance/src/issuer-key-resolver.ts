import type { Cache } from '@metorial-outpost/cache';
import { base64url, Ed25519 } from '@metorial-outpost/crypto';

let DEFAULT_ISSUER_KEY_CACHE_TTL_MS = 30 * 60_000;

export type IssuerKeyResolverOptions = {
  endpoint: string;
  basePath: string;
  fetch: typeof fetch;
  cache: Cache;
  cacheTtlMs?: number;
};

let joinUrl = (endpoint: string, path: string): string =>
  `${endpoint.replace(/\/+$/, '')}${path}`;

export let createIssuerKeyResolver = (
  options: IssuerKeyResolverOptions
): ((kid: string) => Promise<CryptoKey | undefined>) => {
  let compartment = options.cache.compartment('outpost-instance:issuer-key', {
    defaultTtlMs: options.cacheTtlMs ?? DEFAULT_ISSUER_KEY_CACHE_TTL_MS
  });

  return async kid => {
    let cached = await compartment.get<string>(kid);
    if (cached) return Ed25519.importPublicKey(base64url.decode(cached));

    let response = await options.fetch(
      joinUrl(options.endpoint, `${options.basePath}/issuer-key/${kid}`)
    );
    if (!response.ok) return undefined;

    let body = (await response.json()) as { public_key: string };
    await compartment.set(kid, body.public_key);

    return Ed25519.importPublicKey(base64url.decode(body.public_key));
  };
};
