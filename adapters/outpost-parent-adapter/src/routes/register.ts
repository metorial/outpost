import type { OutpostFetchFunction } from '@metorial-outpost/fetch';
import { OUTPOST_PROTOCOL_SERVICE } from '@metorial-outpost/server';
import type { OutpostTokens } from '@metorial-outpost/tokens';
import type { TrustProxyOptions } from '@metorial-outpost/trust-proxy';
import type { Context } from 'hono';
import { filterHeadersForResigning, joinUrl } from '../forward';
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

  return deps.fetch(joinUrl(deps.endpoint, `${deps.basePath}/register`), {
    method: 'POST',
    headers: filterHeadersForResigning(c.req.raw.headers),
    body,
    service: OUTPOST_PROTOCOL_SERVICE,
    proxyContext
  });
};
