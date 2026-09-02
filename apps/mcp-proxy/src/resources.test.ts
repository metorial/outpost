import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import {
  assertResourceRead,
  assertResourceUri,
  getResourceParams,
  getResourceResult,
  getResourceUri,
  isResourceRead,
  isResourceUri
} from './resources';
import { McpMiddlewareSkip } from './skip';

let resourceRead = (uri = 'file:///secrets.txt') =>
  ({ jsonrpc: '2.0', id: '1', method: 'resources/read', params: { uri } }) as JSONRPCMessage;

let resourceResult = (result: Record<string, unknown> = { contents: [] }) =>
  ({ jsonrpc: '2.0', id: '1', result }) as JSONRPCMessage;

let notAResource: JSONRPCMessage = {
  jsonrpc: '2.0',
  id: '1',
  method: 'ping'
} as JSONRPCMessage;

describe('isResourceRead', () => {
  it('is true for a resources/read request', () => {
    expect(isResourceRead(resourceRead())).toBe(true);
  });

  it('is false for anything else', () => {
    expect(isResourceRead(notAResource)).toBe(false);
    expect(isResourceRead(resourceResult())).toBe(false);
  });
});

describe('isResourceUri', () => {
  it('matches the resource uri', () => {
    expect(isResourceUri(resourceRead('file:///secrets.txt'), 'file:///secrets.txt')).toBe(
      true
    );
    expect(isResourceUri(resourceRead('file:///other.txt'), 'file:///secrets.txt')).toBe(
      false
    );
  });
});

describe('getResourceUri', () => {
  it('returns the uri for a call, null otherwise', () => {
    expect(getResourceUri(resourceRead('file:///secrets.txt'))).toBe('file:///secrets.txt');
    expect(getResourceUri(notAResource)).toBeNull();
  });
});

describe('getResourceParams / getResourceResult', () => {
  it('are the same function', () => {
    expect(getResourceResult).toBe(getResourceParams);
  });

  it('returns the request params for a request', () => {
    expect(getResourceParams(resourceRead('file:///secrets.txt'))).toEqual({
      uri: 'file:///secrets.txt'
    });
  });

  it('returns the result for a response', () => {
    expect(
      getResourceResult(resourceResult({ contents: [{ uri: 'file:///secrets.txt' }] }))
    ).toEqual({
      contents: [{ uri: 'file:///secrets.txt' }]
    });
  });

  it('returns null for anything else', () => {
    expect(getResourceParams(notAResource)).toBeNull();
  });
});

describe('assertResourceRead / assertResourceUri', () => {
  it('does not throw for a matching message', () => {
    expect(() => assertResourceRead(resourceRead())).not.toThrow();
    expect(() =>
      assertResourceUri(resourceRead('file:///secrets.txt'), 'file:///secrets.txt')
    ).not.toThrow();
  });

  it('throws McpMiddlewareSkip for a non-matching message', () => {
    expect(() => assertResourceRead(notAResource)).toThrow(McpMiddlewareSkip);
    expect(() =>
      assertResourceUri(resourceRead('file:///other.txt'), 'file:///secrets.txt')
    ).toThrow(McpMiddlewareSkip);
  });
});
