import { BaseLogger, type LogEntry } from '@metorial-outpost/logger';
import type {
  JSONRPCMessage,
  JSONRPCNotification,
  JSONRPCRequest
} from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeMcpMiddleware, runMcpMiddlewareChain } from './chain';
import type { McpForward, McpMiddleware, McpMiddlewareContext } from './types';

class RecordingLogger extends BaseLogger {
  entries: LogEntry[] = [];
  protected write(entry: LogEntry): void {
    this.entries.push(entry);
  }
}

let request = (id: string | number, method = 'tools/call'): JSONRPCRequest => ({
  jsonrpc: '2.0',
  id,
  method,
  params: {}
});

let notification = (method = 'notifications/progress'): JSONRPCNotification => ({
  jsonrpc: '2.0',
  method,
  params: {}
});

let reply = (id: string | number, result: unknown = { ok: true }): JSONRPCMessage =>
  ({ jsonrpc: '2.0', id, result }) as JSONRPCMessage;

let buildCtx = (overrides: Partial<McpMiddlewareContext> = {}): McpMiddlewareContext => ({
  direction: 'to_server',
  connectionId: 'conn_1',
  auth: {},
  logger: new RecordingLogger(),
  ...overrides
});

describe('composeMcpMiddleware', () => {
  it('with no middleware, calling the composed forward just calls send', async () => {
    let send: McpForward = vi.fn(async m => reply((m as JSONRPCRequest).id));
    let composed = composeMcpMiddleware([], send, buildCtx());

    let result = await composed(request('1'));

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toEqual(reply('1'));
  });

  it('forwards a request unchanged through a single passthrough middleware', async () => {
    let send: McpForward = vi.fn(async m => reply((m as JSONRPCRequest).id, { value: 42 }));
    let passthrough: McpMiddleware = (message, call) => call(message);

    let result = await runMcpMiddlewareChain({
      middleware: [passthrough],
      message: request('1'),
      ctx: buildCtx(),
      send
    });

    expect(result).toEqual(reply('1', { value: 42 }));
  });

  it('lets one middleware transform both the outbound message and the inbound reply', async () => {
    let send: McpForward = vi.fn(async m =>
      reply((m as JSONRPCRequest).id, { echoed: (m as any).params.value })
    );

    let mw: McpMiddleware = async (message, call) => {
      let sendingMessage = { ...message, params: { value: 'rewritten' } } as JSONRPCRequest;
      let rawResponse = (await call(sendingMessage)) as any;
      return { ...rawResponse, result: { ...rawResponse.result, decorated: true } };
    };

    let result = (await runMcpMiddlewareChain({
      middleware: [mw],
      message: request('1'),
      ctx: buildCtx(),
      send
    })) as any;

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ params: { value: 'rewritten' } })
    );
    expect(result.result).toEqual({ echoed: 'rewritten', decorated: true });
  });

  it('composes multiple middleware onion-style in registration order', async () => {
    let order: string[] = [];
    let send: McpForward = async m => {
      order.push('send');
      return reply((m as JSONRPCRequest).id);
    };

    let mwA: McpMiddleware = async (message, call) => {
      order.push('a:before');
      let result = await call(message);
      order.push('a:after');
      return result;
    };
    let mwB: McpMiddleware = async (message, call) => {
      order.push('b:before');
      let result = await call(message);
      order.push('b:after');
      return result;
    };

    await runMcpMiddlewareChain({
      middleware: [mwA, mwB],
      message: request('1'),
      ctx: buildCtx(),
      send
    });

    expect(order).toEqual(['a:before', 'b:before', 'send', 'b:after', 'a:after']);
  });

  it('blocking a request never calls send', async () => {
    let send: McpForward = vi.fn(async m => reply((m as JSONRPCRequest).id));
    let block: McpMiddleware = message =>
      Promise.resolve(reply((message as JSONRPCRequest).id, { blocked: true }));

    let result = (await runMcpMiddlewareChain({
      middleware: [block],
      message: request('1'),
      ctx: buildCtx(),
      send
    })) as any;

    expect(send).not.toHaveBeenCalled();
    expect(result.result).toEqual({ blocked: true });
  });

  it('dropping a notification never calls send and resolves null', async () => {
    let send: McpForward = vi.fn(async () => null);
    let drop: McpMiddleware = () => Promise.resolve(null);

    let result = await runMcpMiddlewareChain({
      middleware: [drop],
      message: notification(),
      ctx: buildCtx(),
      send
    });

    expect(send).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('forwarding a notification calls send and resolves null', async () => {
    let send: McpForward = vi.fn(async () => null);
    let passthrough: McpMiddleware = (message, call) => call(message);

    let result = await runMcpMiddlewareChain({
      middleware: [passthrough],
      message: notification(),
      ctx: buildCtx(),
      send
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(result).toBeNull();
  });

  it('call() may be invoked more than once', async () => {
    let calls = 0;
    let send: McpForward = async m => {
      calls++;
      return reply((m as JSONRPCRequest).id, { attempt: calls });
    };
    let retryOnce: McpMiddleware = async (message, call) => {
      await call(message);
      return call(message);
    };

    let result = (await runMcpMiddlewareChain({
      middleware: [retryOnce],
      message: request('1'),
      ctx: buildCtx(),
      send
    })) as any;

    expect(calls).toBe(2);
    expect(result.result).toEqual({ attempt: 2 });
  });

  it('fails closed with an outpost middleware error when a middleware throws for a request', async () => {
    let logger = new RecordingLogger();
    let send: McpForward = vi.fn(async m => reply((m as JSONRPCRequest).id));
    let named = {
      name: 'buggy-transform',
      handle: async () => {
        throw new Error('boom');
      }
    };

    let result = (await runMcpMiddlewareChain({
      middleware: [named],
      message: request('1'),
      ctx: buildCtx({ logger }),
      send
    })) as any;

    expect(send).not.toHaveBeenCalled();
    expect(result.error.code).toBe(-32050);
    expect(result.error.data.middleware).toBe('buggy-transform');
    expect(result.error.data.reason).toBe('exception');
    expect(result.error.message).toContain('Metorial Outpost');
    expect(result.error.message).toContain('buggy-transform');

    let errorEntry = logger.entries.find(e => e.level === 'error');
    expect(errorEntry).toBeTruthy();
    expect(errorEntry!.fields.middleware).toBe('buggy-transform');
  });

  it('drops a notification and logs when a middleware throws (no reply channel)', async () => {
    let logger = new RecordingLogger();
    let send: McpForward = vi.fn(async () => null);
    let buggy: McpMiddleware = async () => {
      throw new Error('boom');
    };

    let result = await runMcpMiddlewareChain({
      middleware: [buggy],
      message: notification(),
      ctx: buildCtx({ logger }),
      send
    });

    expect(result).toBeNull();
    expect(logger.entries.some(e => e.level === 'error')).toBe(true);
  });

  it('treats returning null for a request as a contract violation and fails closed', async () => {
    let send: McpForward = vi.fn(async m => reply((m as JSONRPCRequest).id));
    let swallow: McpMiddleware = async () => null;

    let result = (await runMcpMiddlewareChain({
      middleware: [swallow],
      message: request('1'),
      ctx: buildCtx(),
      send
    })) as any;

    expect(result.error.code).toBe(-32050);
    expect(result.error.data.reason).toBe('contract_violation');
  });

  it('pins the reply id back to the request id if a middleware mismatches it', async () => {
    let logger = new RecordingLogger();
    let send: McpForward = vi.fn(async () => reply('wrong-id'));
    let passthrough: McpMiddleware = (message, call) => call(message);

    let result = (await runMcpMiddlewareChain({
      middleware: [passthrough],
      message: request('correct-id'),
      ctx: buildCtx({ logger }),
      send
    })) as any;

    expect(result.id).toBe('correct-id');
    expect(logger.entries.some(e => e.level === 'warn')).toBe(true);
  });

  describe('timeouts', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('fails closed when a middleware does not resolve within the timeout', async () => {
      let send: McpForward = vi.fn(async m => reply((m as JSONRPCRequest).id));
      let hangs: McpMiddleware = () => new Promise(() => {});

      let resultPromise = runMcpMiddlewareChain({
        middleware: [{ name: 'hangs', handle: hangs }],
        message: request('1'),
        ctx: buildCtx(),
        send,
        options: { middlewareTimeoutMs: 1000 }
      });

      await vi.advanceTimersByTimeAsync(1001);
      let result = (await resultPromise) as any;

      expect(result.error.code).toBe(-32050);
      expect(result.error.data.reason).toBe('timeout');
      expect(result.error.data.middleware).toBe('hangs');
    });
  });
});
