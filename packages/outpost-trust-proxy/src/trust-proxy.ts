import type { OutpostProxyContext } from '@metorial-outpost/signature';
import type { Context } from 'hono';

export type TrustProxyOptions = {
  ipHeader?: string;
};

type BunLikeServer = { requestIP: (request: Request) => { address: string } | null };
type NodeLikeEnv = { incoming?: { socket?: { remoteAddress?: string } } };

let resolveRuntimeIp = (c: Context): string | undefined => {
  let env = c.env as unknown;
  if (!env || typeof env != 'object') return undefined;

  let bunCandidate = 'server' in env ? (env as { server: unknown }).server : env;
  if (bunCandidate && typeof (bunCandidate as BunLikeServer).requestIP == 'function') {
    try {
      return (bunCandidate as BunLikeServer).requestIP(c.req.raw)?.address ?? undefined;
    } catch {
      return undefined;
    }
  }

  let remoteAddress = (env as NodeLikeEnv).incoming?.socket?.remoteAddress;
  if (remoteAddress) return remoteAddress;

  return undefined;
};

export let resolveClientIp = (
  c: Context,
  trustProxy?: boolean | TrustProxyOptions
): string | undefined => {
  if (trustProxy) {
    let ipHeader = (typeof trustProxy == 'object' && trustProxy.ipHeader) || 'x-forwarded-for';
    return c.req.header(ipHeader)?.split(',')[0]?.trim() || undefined;
  }

  return resolveRuntimeIp(c);
};

export let resolveProxyContext = (
  c: Context,
  trustProxy?: boolean | TrustProxyOptions
): OutpostProxyContext => ({
  ip: resolveClientIp(c, trustProxy),
  user_agent: c.req.header('user-agent')
});
