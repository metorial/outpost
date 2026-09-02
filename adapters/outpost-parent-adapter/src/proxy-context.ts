import { OUTPOST_PROTOCOL_SERVICE, verifyOutpostRequest } from '@metorial-outpost/server';
import {
  OUTPOST_INSTANCE_TOKEN_HEADER,
  OUTPOST_SIGNATURE_HEADER,
  type OutpostProxyContext
} from '@metorial-outpost/signature';
import type { OutpostTokens } from '@metorial-outpost/tokens';
import { resolveProxyContext, type TrustProxyOptions } from '@metorial-outpost/trust-proxy';
import type { Context } from 'hono';

export type ResolveForwardingProxyContextDeps = {
  tokens: OutpostTokens;
  trustProxy?: boolean | TrustProxyOptions;
};

export let resolveForwardingProxyContext = async (
  c: Context,
  deps: ResolveForwardingProxyContextDeps
): Promise<OutpostProxyContext> => {
  if (c.req.header(OUTPOST_SIGNATURE_HEADER) || c.req.header(OUTPOST_INSTANCE_TOKEN_HEADER)) {
    let authed = await verifyOutpostRequest(
      { tokens: deps.tokens, service: OUTPOST_PROTOCOL_SERVICE },
      c
    );
    if (authed.proxyContext) return authed.proxyContext;
  }

  return resolveProxyContext(c, deps.trustProxy);
};
