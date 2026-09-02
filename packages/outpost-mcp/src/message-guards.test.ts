import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import { expectsReply, isJSONRPCReply, messageId } from './message-guards';

let asMessage = (value: unknown) => value as JSONRPCMessage;

describe('messageId', () => {
  it('returns the id for a request', () => {
    expect(messageId(asMessage({ jsonrpc: '2.0', id: 1, method: 'x' }))).toBe(1);
  });

  it('returns undefined for a notification', () => {
    expect(messageId(asMessage({ jsonrpc: '2.0', method: 'x' }))).toBeUndefined();
  });

  it('returns the id for a response', () => {
    expect(messageId(asMessage({ jsonrpc: '2.0', id: 'abc', result: {} }))).toBe('abc');
  });
});

describe('expectsReply', () => {
  it('is true for a request', () => {
    expect(expectsReply(asMessage({ jsonrpc: '2.0', id: 1, method: 'x' }))).toBe(true);
  });

  it('is false for a notification', () => {
    expect(expectsReply(asMessage({ jsonrpc: '2.0', method: 'x' }))).toBe(false);
  });

  it('is false for a response', () => {
    expect(expectsReply(asMessage({ jsonrpc: '2.0', id: 1, result: {} }))).toBe(false);
  });
});

describe('isJSONRPCReply', () => {
  it('is true for a result response', () => {
    expect(isJSONRPCReply(asMessage({ jsonrpc: '2.0', id: 1, result: {} }))).toBe(true);
  });

  it('is true for an error response', () => {
    expect(
      isJSONRPCReply(asMessage({ jsonrpc: '2.0', id: 1, error: { code: -1, message: 'x' } }))
    ).toBe(true);
  });

  it('is false for a request', () => {
    expect(isJSONRPCReply(asMessage({ jsonrpc: '2.0', id: 1, method: 'x' }))).toBe(false);
  });

  it('is false for a notification', () => {
    expect(isJSONRPCReply(asMessage({ jsonrpc: '2.0', method: 'x' }))).toBe(false);
  });
});
