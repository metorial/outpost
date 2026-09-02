import type { OutpostFetchFunction } from '@metorial-outpost/fetch';
import {
  formatSseFrame,
  parseSseStream,
  runBroadcastMessage,
  SSE_CONTENT_TYPE,
  type McpMiddleware,
  type McpMiddlewareContext
} from '@metorial-outpost/mcp';
import type { OutpostChain, OutpostProxyContext } from '@metorial-outpost/signature';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Context } from 'hono';
import { forwardableHeaders } from './headers';

export type McpGetDeps = {
  fetch: OutpostFetchFunction;
  targetUrl: string;
  middleware: McpMiddleware[];
  middlewareTimeoutMs?: number;
  ctx: McpMiddlewareContext;
  serviceName: string;
  proxyContext?: OutpostProxyContext;
  outpostChain?: OutpostChain;
};

let tryParseJson = (text: string): JSONRPCMessage | null => {
  try {
    return JSON.parse(text) as JSONRPCMessage;
  } catch {
    return null;
  }
};

let logError = (ctx: McpMiddlewareContext, message: string, error: unknown) => {
  ctx.logger.error(message, {
    connectionId: ctx.connectionId,
    error:
      error instanceof Error ? { name: error.name, message: error.message } : { value: error }
  });
};

export let handleMcpGet = async (c: Context, deps: McpGetDeps): Promise<Response> => {
  let abortController = new AbortController();
  let onClientAbort = () => abortController.abort();
  c.req.raw.signal.addEventListener('abort', onClientAbort);

  let upstreamResponse: Response;
  try {
    upstreamResponse = await deps.fetch(deps.targetUrl, {
      method: 'GET',
      headers: forwardableHeaders(c.req.raw.headers),
      service: deps.serviceName,
      proxyContext: deps.proxyContext,
      outpostChain: deps.outpostChain,
      signal: abortController.signal
    });
  } catch (error) {
    logError(deps.ctx, 'outpost mcp: failed to open the broadcast stream', error);
    return new Response(
      'Metorial Outpost: failed to reach the upstream Metorial connection API.',
      {
        status: 502
      }
    );
  }

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    let bodyText = await upstreamResponse.text().catch(() => '');
    return new Response(bodyText, {
      status: upstreamResponse.status,
      headers: forwardableHeaders(upstreamResponse.headers)
    });
  }

  let encoder = new TextEncoder();
  let upstreamBody = upstreamResponse.body;

  let stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (let frame of parseSseStream(upstreamBody)) {
          let parsed = tryParseJson(frame.data);
          if (!parsed) {
            controller.enqueue(encoder.encode(frame.raw));
            continue;
          }

          await runBroadcastMessage({
            message: parsed,
            middleware: deps.middleware,
            ctx: deps.ctx,
            writeToClient: outgoing =>
              controller.enqueue(
                encoder.encode(formatSseFrame(outgoing, { id: frame.id, event: frame.event }))
              ),
            options: { middlewareTimeoutMs: deps.middlewareTimeoutMs }
          });
        }
      } catch (error) {
        logError(deps.ctx, 'outpost mcp: broadcast relay failed', error);
      } finally {
        controller.close();
        c.req.raw.signal.removeEventListener('abort', onClientAbort);
      }
    },
    cancel() {
      abortController.abort();
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': SSE_CONTENT_TYPE,
      ...forwardableHeaders(upstreamResponse.headers, ['content-type'])
    }
  });
};
