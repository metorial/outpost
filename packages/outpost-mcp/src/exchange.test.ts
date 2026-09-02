import { BaseLogger, type LogEntry } from '@metorial-outpost/logger';
import type { JSONRPCMessage, JSONRPCRequest } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it, vi } from 'vitest';
import {
  runBroadcastMessage,
  runStreamableHttpPostExchange,
  type UpstreamPost
} from './exchange';
import { formatSseFrame } from './sse';
import type { McpMiddleware, McpMiddlewareContext } from './types';

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

let buildCtx = (overrides: Partial<McpMiddlewareContext> = {}): McpMiddlewareContext => ({
  direction: 'to_server',
  connectionId: 'conn_1',
  auth: {},
  logger: new RecordingLogger(),
  ...overrides
});

let passthrough: McpMiddleware = (message, call) => call(message);

describe('runStreamableHttpPostExchange', () => {
  it('mirrors a 202 with no body for a notification', async () => {
    let upstreamPost: UpstreamPost = vi.fn(async () => new Response(null, { status: 202 }));

    let res = await runStreamableHttpPostExchange({
      message: {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {}
      } as JSONRPCMessage,
      middleware: [passthrough],
      ctx: buildCtx(),
      upstreamPost
    });

    expect(res.status).toBe(202);
    expect(await res.text()).toBe('');
  });

  it('mirrors a plain JSON reply as plain JSON', async () => {
    let upstreamPost: UpstreamPost = vi.fn(async () =>
      Response.json({ jsonrpc: '2.0', id: '1', result: { ok: true } })
    );

    let res = await runStreamableHttpPostExchange({
      message: request('1'),
      middleware: [passthrough],
      ctx: buildCtx(),
      upstreamPost
    });

    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({ jsonrpc: '2.0', id: '1', result: { ok: true } });
  });

  it('forwards SSE intermediates untouched and streams the transformed terminal message last', async () => {
    let progress1 = { jsonrpc: '2.0', method: 'notifications/progress', params: { pct: 10 } };
    let progress2 = { jsonrpc: '2.0', method: 'notifications/progress', params: { pct: 50 } };
    let terminal = { jsonrpc: '2.0', id: '1', result: { value: 'raw' } };

    let body =
      formatSseFrame(progress1 as JSONRPCMessage) +
      formatSseFrame(progress2 as JSONRPCMessage) +
      formatSseFrame(terminal as JSONRPCMessage);

    let upstreamPost: UpstreamPost = vi.fn(
      async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    );

    let mw: McpMiddleware = async (message, call) => {
      let raw = (await call(message)) as any;
      return { ...raw, result: { value: 'transformed' } };
    };

    let res = await runStreamableHttpPostExchange({
      message: request('1'),
      middleware: [mw],
      ctx: buildCtx(),
      upstreamPost
    });

    expect(res.headers.get('content-type')).toContain('text/event-stream');
    let text = await res.text();
    let frames = text.split('\n\n').filter(Boolean);
    expect(frames).toHaveLength(3);
    expect(frames[0]).toContain('"pct":10');
    expect(frames[1]).toContain('"pct":50');
    expect(JSON.parse(frames[2]!.replace('data: ', ''))).toEqual({
      jsonrpc: '2.0',
      id: '1',
      result: { value: 'transformed' }
    });
  });

  it('relays session-continuity headers from upstream onto the JSON response', async () => {
    let upstreamPost: UpstreamPost = vi.fn(
      async () =>
        new Response(JSON.stringify({ jsonrpc: '2.0', id: '1', result: {} }), {
          headers: {
            'content-type': 'application/json',
            'mcp-session-id': 'sess-abc',
            'metorial-connection-id': 'conn-xyz'
          }
        })
    );

    let res = await runStreamableHttpPostExchange({
      message: request('1'),
      middleware: [passthrough],
      ctx: buildCtx(),
      upstreamPost
    });

    expect(res.headers.get('mcp-session-id')).toBe('sess-abc');
    expect(res.headers.get('metorial-connection-id')).toBe('conn-xyz');
  });

  it('relays session-continuity headers from upstream onto the SSE response', async () => {
    let body = formatSseFrame({ jsonrpc: '2.0', id: '1', result: {} } as JSONRPCMessage);
    let upstreamPost: UpstreamPost = vi.fn(
      async () =>
        new Response(body, {
          headers: { 'content-type': 'text/event-stream', 'mcp-session-id': 'sess-abc' }
        })
    );

    let res = await runStreamableHttpPostExchange({
      message: request('1'),
      middleware: [passthrough],
      ctx: buildCtx(),
      upstreamPost
    });

    expect(res.headers.get('mcp-session-id')).toBe('sess-abc');
  });

  it('never calls upstream when a middleware blocks the request', async () => {
    let upstreamPost: UpstreamPost = vi.fn(async () => Response.json({}));
    let block: McpMiddleware = message =>
      Promise.resolve({
        jsonrpc: '2.0',
        id: (message as JSONRPCRequest).id,
        error: { code: -32000, message: 'blocked' }
      } as JSONRPCMessage);

    let res = await runStreamableHttpPostExchange({
      message: request('1'),
      middleware: [block],
      ctx: buildCtx(),
      upstreamPost
    });

    expect(upstreamPost).not.toHaveBeenCalled();
    let body = (await res.json()) as any;
    expect(body.error.message).toBe('blocked');
  });

  it('fails closed with an upstream-attributed error when the fetch itself fails', async () => {
    let logger = new RecordingLogger();
    let upstreamPost: UpstreamPost = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });

    let res = await runStreamableHttpPostExchange({
      message: request('1'),
      middleware: [passthrough],
      ctx: buildCtx({ logger }),
      upstreamPost
    });

    let body = (await res.json()) as any;
    expect(body.error.code).toBe(-32051);
    expect(body.error.data.source).toBe('metorial_outpost.upstream');
    expect(body.error.message).toContain('Metorial Outpost');
    expect(logger.entries.some(e => e.level === 'error')).toBe(true);
  });

  it('relays a non-2xx JSON error body from upstream as-is, without masking it as an outpost failure', async () => {
    let upstreamPost: UpstreamPost = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: '1',
            error: { code: -32001, message: 'unauthorized' }
          }),
          {
            status: 401,
            headers: { 'content-type': 'application/json' }
          }
        )
    );

    let res = await runStreamableHttpPostExchange({
      message: request('1'),
      middleware: [passthrough],
      ctx: buildCtx(),
      upstreamPost
    });

    let body = (await res.json()) as any;
    expect(body.error.code).toBe(-32001);
    expect(body.error.message).toBe('unauthorized');
  });

  it('fails closed with a protocol error when the upstream body is unparseable', async () => {
    let upstreamPost: UpstreamPost = vi.fn(
      async () =>
        new Response('not json', { status: 200, headers: { 'content-type': 'text/plain' } })
    );

    let res = await runStreamableHttpPostExchange({
      message: request('1'),
      middleware: [passthrough],
      ctx: buildCtx(),
      upstreamPost
    });

    let body = (await res.json()) as any;
    expect(body.error.code).toBe(-32052);
  });

  it('fails closed with a protocol error when the SSE stream never produces the terminal reply', async () => {
    let body = formatSseFrame({
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: {}
    } as JSONRPCMessage);
    let upstreamPost: UpstreamPost = vi.fn(
      async () => new Response(body, { headers: { 'content-type': 'text/event-stream' } })
    );

    let res = await runStreamableHttpPostExchange({
      message: request('1'),
      middleware: [passthrough],
      ctx: buildCtx(),
      upstreamPost
    });

    let text = await res.text();
    let frames = text.split('\n\n').filter(Boolean);
    let last = JSON.parse(frames[frames.length - 1]!.replace('data: ', ''));
    expect(last.error.code).toBe(-32052);
    expect(last.error.data.reason).toBe('no_terminal_reply');
  });
});

describe('runBroadcastMessage', () => {
  it('delivers a transformed message to the client', async () => {
    let writeToClient = vi.fn();
    let mw: McpMiddleware = (message, call) =>
      call({ ...message, params: { decorated: true } } as JSONRPCMessage);

    await runBroadcastMessage({
      message: {
        jsonrpc: '2.0',
        method: 'notifications/tools/list_changed',
        params: {}
      } as JSONRPCMessage,
      middleware: [mw],
      ctx: buildCtx({ direction: 'from_server' }),
      writeToClient
    });

    expect(writeToClient).toHaveBeenCalledWith(
      expect.objectContaining({ params: { decorated: true } })
    );
  });

  it('never delivers the message when a middleware blocks it', async () => {
    let writeToClient = vi.fn();
    let block: McpMiddleware = () => Promise.resolve(null);

    await runBroadcastMessage({
      message: {
        jsonrpc: '2.0',
        method: 'notifications/tools/list_changed',
        params: {}
      } as JSONRPCMessage,
      middleware: [block],
      ctx: buildCtx({ direction: 'from_server' }),
      writeToClient
    });

    expect(writeToClient).not.toHaveBeenCalled();
  });

  it('does not throw and does not deliver when a middleware throws', async () => {
    let writeToClient = vi.fn();
    let buggy: McpMiddleware = async () => {
      throw new Error('boom');
    };

    await expect(
      runBroadcastMessage({
        message: {
          jsonrpc: '2.0',
          method: 'notifications/tools/list_changed',
          params: {}
        } as JSONRPCMessage,
        middleware: [buggy],
        ctx: buildCtx({ direction: 'from_server' }),
        writeToClient
      })
    ).resolves.toBeUndefined();

    expect(writeToClient).not.toHaveBeenCalled();
  });
});
