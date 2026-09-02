import type { Logger } from '@metorial-outpost/logger';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export type McpMessageDirection = 'to_server' | 'from_server';

export type McpMiddlewareContext = {
  readonly direction: McpMessageDirection;
  readonly connectionId: string;
  readonly auth: Readonly<Record<string, unknown>>;
  readonly logger: Logger;
};

export type McpForward = (message: JSONRPCMessage) => Promise<JSONRPCMessage | null>;

export type McpMiddlewareFn = (
  message: JSONRPCMessage,
  call: McpForward,
  ctx: McpMiddlewareContext
) => Promise<JSONRPCMessage | null>;

export type McpMiddleware = McpMiddlewareFn | { name: string; handle: McpMiddlewareFn };

export let middlewareName = (middleware: McpMiddleware, index: number): string => {
  if (typeof middleware === 'function') return middleware.name || `middleware[${index}]`;
  return middleware.name || `middleware[${index}]`;
};

export let middlewareHandle = (middleware: McpMiddleware): McpMiddlewareFn =>
  typeof middleware === 'function' ? middleware : middleware.handle;

export type McpMiddlewareChainOptions = {
  middlewareTimeoutMs?: number;
};
