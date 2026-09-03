import type { OutpostFetchFunction } from '@metorial-outpost/fetch';
import {
  runStreamableHttpPostExchange,
  type McpMiddleware,
  type McpMiddlewareContext
} from '@metorial-outpost/mcp';
import type { OutpostChain, OutpostProxyContext } from '@metorial-outpost/signature';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Context } from 'hono';
import { forwardableHeaders } from './headers';

export type McpPostDeps = {
  fetch: OutpostFetchFunction;
  targetUrl: string;
  middleware: McpMiddleware[];
  middlewareTimeoutMs?: number;
  ctx: McpMiddlewareContext;
  serviceName: string;
  proxyContext?: OutpostProxyContext;
  outpostChain?: OutpostChain;
};

export let handleMcpPost = (
  c: Context,
  message: JSONRPCMessage,
  deps: McpPostDeps
): Promise<Response> => {
  let upstreamPost = (msg: JSONRPCMessage) =>
    deps.fetch(deps.targetUrl, {
      method: 'POST',
      headers: {
        ...forwardableHeaders(c.req.raw.headers, ['content-encoding']),
        'content-type': 'application/json'
      },
      body: JSON.stringify(msg),
      service: deps.serviceName,
      proxyContext: deps.proxyContext,
      outpostChain: deps.outpostChain
    });

  return runStreamableHttpPostExchange({
    message,
    middleware: deps.middleware,
    ctx: deps.ctx,
    upstreamPost,
    options: { middlewareTimeoutMs: deps.middlewareTimeoutMs }
  });
};
