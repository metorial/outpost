import type {
  McpForward,
  McpMiddleware,
  McpMiddlewareContext,
  McpMiddlewareFn
} from '@metorial-outpost/mcp';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { McpMiddlewareSkip } from './skip';

export type McpMiddlewareOptions = {
  /** Shown in outpost logs and in the error reply an outpost sends if this middleware fails. */
  name?: string;

  /**
   * Decides whether `handle` should run for this message. A message that doesn't match is
   * forwarded on unchanged. Defaults to matching every message.
   */
  filter?: (message: JSONRPCMessage, ctx: McpMiddlewareContext) => boolean | Promise<boolean>;

  /**
   * Transforms a matched message before it continues to the next middleware (or upstream).
   * Return `null` to drop the message instead of forwarding it.
   */
  handle: (
    message: JSONRPCMessage,
    call: McpForward,
    ctx: McpMiddlewareContext
  ) => JSONRPCMessage | null | Promise<JSONRPCMessage | null>;
};

/**
 * MCP interceptor that can transform messages. If the `filter` matches, the `handle` function runs
 * and can transform the message before the client sees it. Middleware runs in the order it is provided to `McpProxy.create()`,
 * and each middleware sees the message as transformed by any previous middleware.
 */
export let mcpMiddleware = (options: McpMiddlewareOptions): McpMiddleware => {
  let fn: McpMiddlewareFn = async (message, call, ctx) => {
    let matches = options.filter ? await options.filter(message, ctx) : true;
    if (!matches) return call(message);

    try {
      return await options.handle(message, call, ctx);
    } catch (error) {
      // Thrown by assertToolCall/assertToolName/... (and any hand-rolled equivalent) -- treat it
      // like a filter miss instead of a middleware failure.
      if (error instanceof McpMiddlewareSkip) return call(message);
      throw error;
    }
  };

  return options.name ? { name: options.name, handle: fn } : fn;
};
