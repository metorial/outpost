import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import { McpMiddlewareSkip } from './skip';
import {
  assertToolCall,
  assertToolName,
  getToolName,
  getToolParams,
  getToolResult,
  isToolCall,
  isToolName
} from './tools';

let toolCall = (
  overrides: Partial<{ name: string; arguments: Record<string, unknown> }> = {}
) =>
  ({
    jsonrpc: '2.0',
    id: '1',
    method: 'tools/call',
    params: { name: 'super_secret_method', arguments: { a: 1 }, ...overrides }
  }) as JSONRPCMessage;

let toolResult = (result: Record<string, unknown> = { value: 42 }) =>
  ({ jsonrpc: '2.0', id: '1', result }) as JSONRPCMessage;

let notATool: JSONRPCMessage = { jsonrpc: '2.0', id: '1', method: 'ping' } as JSONRPCMessage;

describe('isToolCall', () => {
  it('is true for a tools/call request', () => {
    expect(isToolCall(toolCall())).toBe(true);
  });

  it('is false for anything else', () => {
    expect(isToolCall(notATool)).toBe(false);
    expect(isToolCall(toolResult())).toBe(false);
  });
});

describe('isToolName', () => {
  it('matches the call name', () => {
    expect(isToolName(toolCall({ name: 'super_secret_method' }), 'super_secret_method')).toBe(
      true
    );
    expect(isToolName(toolCall({ name: 'other' }), 'super_secret_method')).toBe(false);
  });

  it('is false for a non tool-call message', () => {
    expect(isToolName(notATool, 'super_secret_method')).toBe(false);
  });
});

describe('getToolName', () => {
  it('returns the tool name for a call, null otherwise', () => {
    expect(getToolName(toolCall({ name: 'super_secret_method' }))).toBe('super_secret_method');
    expect(getToolName(notATool)).toBeNull();
    expect(getToolName(toolResult())).toBeNull();
  });
});

describe('getToolParams / getToolResult', () => {
  it('are the same function', () => {
    expect(getToolResult).toBe(getToolParams);
  });

  it('returns the call arguments for a request', () => {
    expect(getToolParams(toolCall({ arguments: { a: 1 } }))).toEqual({ a: 1 });
  });

  it('returns the result for a response', () => {
    expect(getToolResult(toolResult({ value: 42 }))).toEqual({ value: 42 });
  });

  it('returns null for anything else', () => {
    expect(getToolParams(notATool)).toBeNull();
  });
});

describe('assertToolCall / assertToolName', () => {
  it('does not throw for a matching message', () => {
    expect(() => assertToolCall(toolCall())).not.toThrow();
    expect(() =>
      assertToolName(toolCall({ name: 'super_secret_method' }), 'super_secret_method')
    ).not.toThrow();
  });

  it('throws McpMiddlewareSkip for a non-matching message', () => {
    expect(() => assertToolCall(notATool)).toThrow(McpMiddlewareSkip);
    expect(() => assertToolName(toolCall({ name: 'other' }), 'super_secret_method')).toThrow(
      McpMiddlewareSkip
    );
  });
});
