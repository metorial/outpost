import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { runMcpMiddlewareChain } from './chain';
import {
  buildOutpostErrorReply,
  serializeErrorForLog,
  type OutpostErrorReason
} from './errors';
import { expectsReply, messageId } from './message-guards';
import { formatSseFrame, parseSseStream, SSE_CONTENT_TYPE } from './sse';
import type {
  McpForward,
  McpMiddleware,
  McpMiddlewareChainOptions,
  McpMiddlewareContext
} from './types';

export type UpstreamPost = (message: JSONRPCMessage) => Promise<Response>;

export type RunStreamableHttpPostExchangeInput = {
  message: JSONRPCMessage;
  middleware: McpMiddleware[];
  ctx: McpMiddlewareContext;
  upstreamPost: UpstreamPost;
  options?: McpMiddlewareChainOptions;
};

let isEventStream = (contentType: string | null): boolean =>
  !!contentType && contentType.split(';')[0]!.trim() === SSE_CONTENT_TYPE;

let isJson = (contentType: string | null): boolean =>
  !!contentType && contentType.split(';')[0]!.trim() === 'application/json';

let RESPONSE_HEADERS_TO_RELAY = [
  'mcp-session-id',
  'mcp-protocol-version',
  'metorial-session-id',
  'metorial-connection-id',
  'metorial-connection-token'
];

let relayableHeaders = (headers: Headers): [string, string][] =>
  RESPONSE_HEADERS_TO_RELAY.flatMap(name => {
    let value = headers.get(name);
    return value == null ? [] : [[name, value] as [string, string]];
  });

class ExchangeFailure extends Error {
  constructor(
    readonly source: 'upstream' | 'protocol',
    readonly reason: OutpostErrorReason,
    cause?: unknown
  ) {
    super(`mcp exchange failed: ${reason}`, { cause });
  }
}

export let runStreamableHttpPostExchange = async (
  input: RunStreamableHttpPostExchangeInput
): Promise<Response> => {
  let { message, middleware, ctx, upstreamPost, options } = input;
  let intermediateFrames: string[] = [];
  let sawUpstream = false;
  let relayedHeaders: [string, string][] = [];

  let send: McpForward = async (sendingMessage: JSONRPCMessage) => {
    sawUpstream = true;

    try {
      let response: Response;
      try {
        response = await upstreamPost(sendingMessage);
      } catch (error) {
        throw new ExchangeFailure('upstream', 'unreachable', error);
      }

      relayedHeaders = relayableHeaders(response.headers);

      if (response.status === 202) return null;

      let contentType = response.headers.get('content-type');

      if (isJson(contentType)) {
        let text = await response.text();
        let parsed = parseJsonMessage(text);
        if (!parsed) throw new ExchangeFailure('protocol', 'unparseable_response');
        return parsed;
      }

      if (isEventStream(contentType) && response.body) {
        let expectedId = messageId(sendingMessage);
        let terminal: JSONRPCMessage | null = null;

        for await (let frame of parseSseStream(response.body)) {
          let parsed = parseJsonMessage(frame.data);
          if (parsed && expectedId !== undefined && messageId(parsed) === expectedId) {
            terminal = parsed;
            break;
          }
          intermediateFrames.push(frame.raw);
        }

        if (expectedId === undefined) return null;
        if (!terminal) throw new ExchangeFailure('protocol', 'no_terminal_reply');
        return terminal;
      }

      if (!response.ok) throw new ExchangeFailure('upstream', 'bad_status');

      throw new ExchangeFailure('protocol', 'unparseable_response');
    } catch (error) {
      let failure =
        error instanceof ExchangeFailure
          ? error
          : new ExchangeFailure('protocol', 'exception', error);

      ctx.logger.error('outpost mcp: exchange with upstream failed', {
        connectionId: ctx.connectionId,
        direction: ctx.direction,
        messageId: messageId(sendingMessage),
        source: failure.source,
        reason: failure.reason,
        error: serializeErrorForLog(failure.cause ?? failure)
      });

      if (!expectsReply(sendingMessage)) return null;

      let id = messageId(sendingMessage);
      if (id === undefined) return null;

      let { message: errorReply } = buildOutpostErrorReply({
        id,
        source: failure.source,
        reason: failure.reason,
        connectionId: ctx.connectionId,
        direction: ctx.direction,
        cause: failure.cause
      });

      return errorReply;
    }
  };

  let finalMessage = await runMcpMiddlewareChain({ middleware, message, ctx, send, options });

  if (!sawUpstream || intermediateFrames.length === 0) {
    if (finalMessage == null)
      return new Response(null, { status: 202, headers: relayedHeaders });
    return new Response(JSON.stringify(finalMessage), {
      headers: [['content-type', 'application/json'], ...relayedHeaders]
    });
  }

  let body = intermediateFrames.join('') + (finalMessage ? formatSseFrame(finalMessage) : '');
  return new Response(body, {
    headers: [['content-type', SSE_CONTENT_TYPE], ...relayedHeaders]
  });
};

let parseJsonMessage = (text: string): JSONRPCMessage | null => {
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as JSONRPCMessage;
  } catch {
    return null;
  }
};

export type RunBroadcastMessageInput = {
  message: JSONRPCMessage;
  middleware: McpMiddleware[];
  ctx: McpMiddlewareContext;
  writeToClient: (message: JSONRPCMessage) => void | Promise<void>;
  options?: McpMiddlewareChainOptions;
};

export let runBroadcastMessage = async (input: RunBroadcastMessageInput): Promise<void> => {
  let send: McpForward = async message => {
    await input.writeToClient(message);
    return null;
  };

  await runMcpMiddlewareChain({
    middleware: input.middleware,
    message: input.message,
    ctx: input.ctx,
    send,
    options: input.options
  });
};
