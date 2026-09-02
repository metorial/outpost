import type { CacheCompartment } from '@metorial-outpost/cache';
import type { Context } from 'hono';
import { forwardToParent, type ForwardToParentOptions } from '../forward';

export type IssuerKeyHandlerDeps = ForwardToParentOptions & {
  basePath: string;
  cache: CacheCompartment;
};

type CachedIssuerKeyResponse = {
  status: number;
  headers: [string, string][];
  body: string;
};

let NON_REPLAYABLE_HEADERS = new Set([
  'content-encoding',
  'content-length',
  'transfer-encoding',
  'connection'
]);

let replayableHeaders = (headers: Headers): [string, string][] =>
  [...headers].filter(([name]) => !NON_REPLAYABLE_HEADERS.has(name.toLowerCase()));

export let issuerKeyHandler = (deps: IssuerKeyHandlerDeps) => async (c: Context) => {
  let kid = c.req.param('kid')!;

  let cached = await deps.cache.get<CachedIssuerKeyResponse>(kid);
  if (cached)
    return new Response(cached.body, { status: cached.status, headers: cached.headers });

  let response = await forwardToParent(deps, `${deps.basePath}/issuer-key/${kid}`, c.req.raw);
  if (!response.ok) return response;

  let snapshot: CachedIssuerKeyResponse = {
    status: response.status,
    headers: replayableHeaders(response.headers),
    body: await response.text()
  };
  await deps.cache.set(kid, snapshot);

  return new Response(snapshot.body, { status: snapshot.status, headers: snapshot.headers });
};
