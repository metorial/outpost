import { describe, expect, it } from 'vitest';
import { errorResponse } from './error-response';

describe('errorResponse', () => {
  it('builds a JSON-RPC error reply carrying the request id', () => {
    expect(errorResponse({ id: '1' }, 'not allowed')).toEqual({
      jsonrpc: '2.0',
      id: '1',
      error: { code: -32000, message: 'not allowed' }
    });
  });

  it('works with a numeric id', () => {
    expect(errorResponse({ id: 42 }, 'nope')).toEqual({
      jsonrpc: '2.0',
      id: 42,
      error: { code: -32000, message: 'nope' }
    });
  });

  it('always uses the same fixed error code', () => {
    let a = errorResponse({ id: '1' }, 'a');
    let b = errorResponse({ id: '2' }, 'b');

    expect((a as any).error.code).toBe(-32000);
    expect((b as any).error.code).toBe(-32000);
  });
});
