import { BaseLogger, type LogEntry } from '@metorial-outpost/logger';
import type { McpMiddlewareContext } from '@metorial-outpost/mcp';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import { mcpMiddleware } from './middleware';
import { McpMiddlewareSkip } from './skip';

class RecordingLogger extends BaseLogger {
  entries: LogEntry[] = [];
  protected write(entry: LogEntry): void {
    this.entries.push(entry);
  }
}

let makeCtx = (overrides: Partial<McpMiddlewareContext> = {}): McpMiddlewareContext => ({
  direction: 'to_server',
  connectionId: 'conn_1',
  auth: {},
  logger: new RecordingLogger(),
  ...overrides
});

let request = (overrides: Partial<JSONRPCMessage> = {}): JSONRPCMessage =>
  ({ jsonrpc: '2.0', id: '1', method: 'ping', ...overrides }) as JSONRPCMessage;

describe('mcpMiddleware', () => {
  it('runs handle with the forwarding function, and returns whatever it resolves to', async () => {
    let call = vi.fn(async (message: JSONRPCMessage) => ({
      jsonrpc: '2.0',
      id: (message as any).id,
      result: { received: (message as any).params }
    })) as any;
    let middleware = mcpMiddleware({
      handle: async (message, call) => {
        let decorated = { ...message, params: { decorated: true } } as JSONRPCMessage;
        return call(decorated);
      }
    });

    let handle = typeof middleware === 'function' ? middleware : middleware.handle;
    let result = await handle(request(), call, makeCtx());

    expect(call).toHaveBeenCalledWith({
      jsonrpc: '2.0',
      id: '1',
      method: 'ping',
      params: { decorated: true }
    });
    expect(result).toEqual({
      jsonrpc: '2.0',
      id: '1',
      result: { received: { decorated: true } }
    });
  });

  it('passes the message through unmodified when filter returns false', async () => {
    let call = vi.fn(async (message: JSONRPCMessage) => ({
      jsonrpc: '2.0',
      id: (message as any).id,
      result: {}
    })) as any;
    let handle = vi.fn(message => message);
    let middleware = mcpMiddleware({ filter: async () => false, handle });

    let fn = typeof middleware === 'function' ? middleware : middleware.handle;
    let msg = request();
    await fn(msg, call, makeCtx());

    expect(handle).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledWith(msg);
  });

  it('runs handle only when filter returns true', async () => {
    let call = vi.fn(async (message: JSONRPCMessage) => ({
      jsonrpc: '2.0',
      id: (message as any).id,
      result: {}
    })) as any;
    let handle = vi.fn(
      message => ({ ...message, params: { touched: true } }) as JSONRPCMessage
    );
    let middleware = mcpMiddleware({
      filter: message => (message as any).method === 'ping',
      handle
    });

    let fn = typeof middleware === 'function' ? middleware : middleware.handle;
    await fn(request({ method: 'ping' } as any), call, makeCtx());
    await fn(request({ method: 'other' } as any), call, makeCtx());

    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('drops the message instead of forwarding it when handle returns null', async () => {
    let call = vi.fn();
    let middleware = mcpMiddleware({ handle: () => null });

    let fn = typeof middleware === 'function' ? middleware : middleware.handle;
    let result = await fn(request(), call, makeCtx());

    expect(call).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('carries the given name onto the underlying middleware', () => {
    let middleware = mcpMiddleware({ name: 'redact-secrets', handle: message => message });

    expect(middleware).toMatchObject({ name: 'redact-secrets' });
  });

  it('passes the middleware context through to filter and handle', async () => {
    let ctx = makeCtx({ connectionId: 'conn_42' });
    let seenInFilter: string[] = [];
    let seenInHandle: string[] = [];
    let call = vi.fn(async (message: JSONRPCMessage) => message);
    let middleware = mcpMiddleware({
      filter: (_, c) => {
        seenInFilter.push(c.connectionId);
        return true;
      },
      handle: (message, call, c) => {
        seenInHandle.push(c.connectionId);
        return call(message);
      }
    });

    let fn = typeof middleware === 'function' ? middleware : middleware.handle;
    await fn(request(), call, ctx);

    expect(seenInFilter).toEqual(['conn_42']);
    expect(seenInHandle).toEqual(['conn_42']);
  });

  it('forwards the message unchanged when handle throws McpMiddlewareSkip, instead of failing', async () => {
    let call = vi.fn(async (message: JSONRPCMessage) => ({
      jsonrpc: '2.0',
      id: (message as any).id,
      result: {}
    })) as any;
    let middleware = mcpMiddleware({
      handle: () => {
        throw new McpMiddlewareSkip('not the message this middleware cares about');
      }
    });

    let fn = typeof middleware === 'function' ? middleware : middleware.handle;
    let msg = request();
    let result = await fn(msg, call, makeCtx());

    expect(call).toHaveBeenCalledWith(msg);
    expect(result).toEqual({ jsonrpc: '2.0', id: '1', result: {} });
  });

  it('does not catch errors that are not McpMiddlewareSkip', async () => {
    let call = vi.fn();
    let middleware = mcpMiddleware({
      handle: () => {
        throw new Error('boom');
      }
    });

    let fn = typeof middleware === 'function' ? middleware : middleware.handle;

    await expect(fn(request(), call, makeCtx())).rejects.toThrow('boom');
    expect(call).not.toHaveBeenCalled();
  });
});
