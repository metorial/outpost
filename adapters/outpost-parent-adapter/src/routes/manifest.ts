import type { CacheCompartment } from '@metorial-outpost/cache';
import type { OutpostFetchFunction } from '@metorial-outpost/fetch';
import { OUTPOST_PROTOCOL_SERVICE } from '@metorial-outpost/server';
import type { Context } from 'hono';
import { joinUrl, replayableHeaders } from '../forward';

export type ManifestHandlerDeps = {
  endpoint: string;
  basePath: string;
  fetch: OutpostFetchFunction;
  cache: CacheCompartment;
};

type CachedManifestResponse = {
  status: number;
  headers: [string, string][];
  body: string;
};

export let manifestHandler = (deps: ManifestHandlerDeps) => async (c: Context) => {
  let outpostId = c.req.param('outpostId')!;

  let cached = await deps.cache.get<CachedManifestResponse>(outpostId);
  if (cached)
    return new Response(cached.body, { status: cached.status, headers: cached.headers });

  let response = await deps.fetch(
    joinUrl(deps.endpoint, `${deps.basePath}/manifest/${outpostId}`),
    { method: 'GET', service: OUTPOST_PROTOCOL_SERVICE }
  );
  if (!response.ok) return response;

  let snapshot: CachedManifestResponse = {
    status: response.status,
    headers: replayableHeaders(response.headers),
    body: await response.text()
  };
  await deps.cache.set(outpostId, snapshot);

  return new Response(snapshot.body, { status: snapshot.status, headers: snapshot.headers });
};
