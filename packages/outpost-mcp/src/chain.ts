import type { JSONRPCMessage, RequestId } from '@modelcontextprotocol/sdk/types.js';
import {
  buildOutpostErrorReply,
  MiddlewareContractError,
  MiddlewareTimeoutError,
  serializeErrorForLog
} from './errors';
import { expectsReply, messageId } from './message-guards';
import {
  middlewareHandle,
  middlewareName,
  type McpForward,
  type McpMiddleware,
  type McpMiddlewareChainOptions,
  type McpMiddlewareContext
} from './types';

let DEFAULT_MIDDLEWARE_TIMEOUT_MS = 30_000;

let withTimeout = <T>(
  promise: Promise<T>,
  timeoutMs: number,
  onTimeout: () => Error
): Promise<T> => {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(onTimeout());
    }, timeoutMs);

    promise.then(
      value => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
};

let pinReplyId = (
  reply: JSONRPCMessage,
  expectedId: RequestId,
  ctx: McpMiddlewareContext,
  name: string
): JSONRPCMessage => {
  if (expectedId === undefined) return reply;
  let actualId = messageId(reply);

  if (actualId === expectedId) return reply;

  ctx.logger.warn(
    'outpost mcp: middleware reply id did not match the request id, correcting it',
    {
      middleware: name,
      connectionId: ctx.connectionId,
      direction: ctx.direction,
      expectedId,
      actualId
    }
  );

  return { ...reply, id: expectedId } as JSONRPCMessage;
};

export let composeMcpMiddleware = (
  middlewares: McpMiddleware[],
  send: McpForward,
  ctx: McpMiddlewareContext,
  options: McpMiddlewareChainOptions = {}
): McpForward => {
  let timeoutMs = options.middlewareTimeoutMs ?? DEFAULT_MIDDLEWARE_TIMEOUT_MS;

  return middlewares.reduceRight<McpForward>((next, middleware, index) => {
    let name = middlewareName(middleware, index);
    let handle = middlewareHandle(middleware);

    return async (message: JSONRPCMessage): Promise<JSONRPCMessage | null> => {
      let needsReply = expectsReply(message);
      let id = messageId(message);

      try {
        let result = await withTimeout(
          handle(message, next, ctx),
          timeoutMs,
          () => new MiddlewareTimeoutError(name, timeoutMs)
        );

        if (needsReply && result == null) {
          throw new MiddlewareContractError(name);
        }

        if (result == null) return null;
        if (id === undefined) return result;

        return pinReplyId(result, id, ctx, name);
      } catch (error) {
        let reason =
          error instanceof MiddlewareTimeoutError
            ? ('timeout' as const)
            : error instanceof MiddlewareContractError
              ? ('contract_violation' as const)
              : ('exception' as const);

        ctx.logger.error('outpost mcp: middleware failed, failing closed', {
          middleware: name,
          connectionId: ctx.connectionId,
          direction: ctx.direction,
          messageId: id,
          reason,
          error: serializeErrorForLog(error)
        });

        if (!needsReply || id === undefined) return null;

        let { message: errorReply } = buildOutpostErrorReply({
          id,
          source: 'middleware',
          reason,
          middleware: name,
          connectionId: ctx.connectionId,
          direction: ctx.direction,
          cause: error
        });

        return errorReply;
      }
    };
  }, send);
};

export type RunMcpMiddlewareChainInput = {
  middleware: McpMiddleware[];
  message: JSONRPCMessage;
  ctx: McpMiddlewareContext;
  send: McpForward;
  options?: McpMiddlewareChainOptions;
};

export let runMcpMiddlewareChain = (
  input: RunMcpMiddlewareChainInput
): Promise<JSONRPCMessage | null> => {
  let composed = composeMcpMiddleware(input.middleware, input.send, input.ctx, input.options);
  return composed(input.message);
};
