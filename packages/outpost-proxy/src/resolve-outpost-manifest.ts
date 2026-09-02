import type { Cache } from '@metorial-outpost/cache';
import type { OutpostFetchFunction } from '@metorial-outpost/fetch';
import type { OutpostManifest } from '@metorial-outpost/server';

let DEFAULT_MANIFEST_CACHE_TTL_MS = 60_000;

export type ResolveOutpostManifestOptions = {
  endpoint: string;
  basePath: string;
  service: string;
  fetch: OutpostFetchFunction;
  cache: Cache;
  cacheTtlMs?: number;
};

let joinUrl = (endpoint: string, path: string): string =>
  `${endpoint.replace(/\/+$/, '')}${path}`;

export let createOutpostManifestResolver = (
  options: ResolveOutpostManifestOptions
): ((outpostId: string) => Promise<OutpostManifest | undefined>) => {
  let compartment = options.cache.compartment('outpost-proxy:nested-manifest', {
    defaultTtlMs: options.cacheTtlMs ?? DEFAULT_MANIFEST_CACHE_TTL_MS
  });

  return async outpostId => {
    let cached = await compartment.get<OutpostManifest>(outpostId);
    if (cached) return cached;

    let response = await options.fetch(
      joinUrl(options.endpoint, `${options.basePath}/manifest/${outpostId}`),
      { method: 'GET', service: options.service }
    );
    if (!response.ok) return undefined;

    let manifest = (await response.json()) as OutpostManifest;
    await compartment.set(outpostId, manifest);

    return manifest;
  };
};
