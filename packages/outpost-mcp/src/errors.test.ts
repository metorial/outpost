import { describe, expect, it } from 'vitest';
import { buildOutpostErrorReply, generateErrorId, OUTPOST_ERROR_CODE } from './errors';

describe('buildOutpostErrorReply', () => {
  it('uses the reserved middleware error code and names the middleware', () => {
    let { message } = buildOutpostErrorReply({
      id: 'req-1',
      source: 'middleware',
      reason: 'exception',
      middleware: 'redact-secrets',
      connectionId: 'conn_1',
      direction: 'to_server'
    });

    expect((message as any).id).toBe('req-1');
    expect((message as any).error.code).toBe(OUTPOST_ERROR_CODE.middleware);
    expect((message as any).error.message).toContain('redact-secrets');
    expect((message as any).error.message).toContain('Metorial Outpost');
    expect((message as any).error.data.middleware).toBe('redact-secrets');
  });

  it('explicitly attributes the failure away from the platform and the integration', () => {
    let { message } = buildOutpostErrorReply({
      id: 1,
      source: 'upstream',
      reason: 'unreachable',
      connectionId: 'conn_1',
      direction: 'to_server'
    });

    let text = (message as any).error.message as string;
    expect(text).toMatch(/not in the Metorial platform or the connected MCP server/i);
  });

  it('uses the upstream and protocol codes for their respective sources', () => {
    let upstream = buildOutpostErrorReply({
      id: 1,
      source: 'upstream',
      reason: 'bad_status',
      connectionId: 'c',
      direction: 'to_server'
    });
    let protocol = buildOutpostErrorReply({
      id: 1,
      source: 'protocol',
      reason: 'no_terminal_reply',
      connectionId: 'c',
      direction: 'to_server'
    });

    expect((upstream.message as any).error.code).toBe(OUTPOST_ERROR_CODE.upstream);
    expect((protocol.message as any).error.code).toBe(OUTPOST_ERROR_CODE.protocol);
  });

  it('never includes raw error text or stack traces in the client-facing message', () => {
    let cause = new Error('super secret internal detail: db password is hunter2');
    let { message } = buildOutpostErrorReply({
      id: 1,
      source: 'upstream',
      reason: 'unreachable',
      connectionId: 'c',
      direction: 'to_server',
      cause
    });

    let serialized = JSON.stringify(message);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).not.toContain(cause.stack ?? '__no_stack__');
  });

  it('generates a distinct errorId per call for log correlation', () => {
    let a = buildOutpostErrorReply({
      id: 1,
      source: 'upstream',
      reason: 'unreachable',
      connectionId: 'c',
      direction: 'to_server'
    });
    let b = buildOutpostErrorReply({
      id: 1,
      source: 'upstream',
      reason: 'unreachable',
      connectionId: 'c',
      direction: 'to_server'
    });

    expect(a.errorId).not.toBe(b.errorId);
    expect((a.message as any).error.data.errorId).toBe(a.errorId);
  });
});

describe('generateErrorId', () => {
  it('produces unique ids across many calls', () => {
    let ids = new Set(Array.from({ length: 500 }, () => generateErrorId()));
    expect(ids.size).toBe(500);
  });
});
