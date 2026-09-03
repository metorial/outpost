import type { OutpostFetchFunction } from '@metorial-outpost/fetch';
import { OUTPOST_PROTOCOL_SERVICE } from '@metorial-outpost/server';
import type { OutpostTokens } from '@metorial-outpost/tokens';
import type { TrustProxyOptions } from '@metorial-outpost/trust-proxy';
import type { Context } from 'hono';
import { filterHeadersForResigning, joinUrl, replayableHeaders } from '../forward';
import { resolveForwardingProxyContext } from '../proxy-context';

export type RegisterHandlerDeps = {
  endpoint: string;
  basePath: string;
  fetch: OutpostFetchFunction;
  tokens: OutpostTokens;
  trustProxy?: boolean | TrustProxyOptions;
};

export let registerHandler = (deps: RegisterHandlerDeps) => async (c: Context) => {
  let proxyContext = await resolveForwardingProxyContext(c, deps);
  let body = new Uint8Array(await c.req.raw.arrayBuffer());

  let response = await deps.fetch(joinUrl(deps.endpoint, `${deps.basePath}/register`), {
    method: 'POST',
    headers: filterHeadersForResigning(c.req.raw.headers),
    body,
    service: OUTPOST_PROTOCOL_SERVICE,
    proxyContext
  });

  return new Response(await response.arrayBuffer(), {
    status: response.status,
    headers: replayableHeaders(response.headers)
  });
};
