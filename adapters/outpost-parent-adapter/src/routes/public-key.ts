import type { CacheCompartment } from '@metorial-outpost/cache';
import type { OutpostFetchFunction } from '@metorial-outpost/fetch';
import { OUTPOST_PROTOCOL_SERVICE } from '@metorial-outpost/server';
import type { Context } from 'hono';
import { joinUrl, replayableHeaders } from '../forward';

export type PublicKeyHandlerDeps = {
  endpoint: string;
  basePath: string;
  fetch: OutpostFetchFunction;
  cache: CacheCompartment;
};

type CachedPublicKeyResponse = {
  status: number;
  headers: [string, string][];
  body: string;
};

let cacheKeyFor = (outpostId: string, credentialId: string) => `${outpostId}:${credentialId}`;

export let publicKeyHandler = (deps: PublicKeyHandlerDeps) => async (c: Context) => {
  let outpostId = c.req.param('outpostId')!;
  let credentialId = c.req.param('credentialId')!;
  let key = cacheKeyFor(outpostId, credentialId);

  let cached = await deps.cache.get<CachedPublicKeyResponse>(key);
  if (cached)
    return new Response(cached.body, { status: cached.status, headers: cached.headers });

  let response = await deps.fetch(
    joinUrl(deps.endpoint, `${deps.basePath}/public-key/${outpostId}/${credentialId}`),
    { method: 'GET', service: OUTPOST_PROTOCOL_SERVICE }
  );
  if (!response.ok) return response;

  let snapshot: CachedPublicKeyResponse = {
    status: response.status,
    headers: replayableHeaders(response.headers),
    body: await response.text()
  };
  await deps.cache.set(key, snapshot);

  return new Response(snapshot.body, { status: snapshot.status, headers: snapshot.headers });
};
