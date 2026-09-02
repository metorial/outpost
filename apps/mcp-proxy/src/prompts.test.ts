import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { describe, expect, it } from 'vitest';
import {
  assertPromptGet,
  assertPromptName,
  getPromptName,
  getPromptParams,
  getPromptResult,
  isPromptGet,
  isPromptName
} from './prompts';
import { McpMiddlewareSkip } from './skip';

let promptGet = (
  overrides: Partial<{ name: string; arguments: Record<string, string> }> = {}
) =>
  ({
    jsonrpc: '2.0',
    id: '1',
    method: 'prompts/get',
    params: { name: 'onboarding', arguments: { userName: 'Ada' }, ...overrides }
  }) as JSONRPCMessage;

let promptResult = (result: Record<string, unknown> = { messages: [] }) =>
  ({ jsonrpc: '2.0', id: '1', result }) as JSONRPCMessage;

let notAPrompt: JSONRPCMessage = { jsonrpc: '2.0', id: '1', method: 'ping' } as JSONRPCMessage;

describe('isPromptGet', () => {
  it('is true for a prompts/get request', () => {
    expect(isPromptGet(promptGet())).toBe(true);
  });

  it('is false for anything else', () => {
    expect(isPromptGet(notAPrompt)).toBe(false);
    expect(isPromptGet(promptResult())).toBe(false);
  });
});

describe('isPromptName', () => {
  it('matches the prompt name', () => {
    expect(isPromptName(promptGet({ name: 'onboarding' }), 'onboarding')).toBe(true);
    expect(isPromptName(promptGet({ name: 'other' }), 'onboarding')).toBe(false);
  });
});

describe('getPromptName', () => {
  it('returns the prompt name for a call, null otherwise', () => {
    expect(getPromptName(promptGet({ name: 'onboarding' }))).toBe('onboarding');
    expect(getPromptName(notAPrompt)).toBeNull();
  });
});

describe('getPromptParams / getPromptResult', () => {
  it('are the same function', () => {
    expect(getPromptResult).toBe(getPromptParams);
  });

  it('returns the call arguments for a request', () => {
    expect(getPromptParams(promptGet({ arguments: { userName: 'Ada' } }))).toEqual({
      userName: 'Ada'
    });
  });

  it('returns the result for a response', () => {
    expect(getPromptResult(promptResult({ messages: [] }))).toEqual({ messages: [] });
  });

  it('returns null for anything else', () => {
    expect(getPromptParams(notAPrompt)).toBeNull();
  });
});

describe('assertPromptGet / assertPromptName', () => {
  it('does not throw for a matching message', () => {
    expect(() => assertPromptGet(promptGet())).not.toThrow();
    expect(() =>
      assertPromptName(promptGet({ name: 'onboarding' }), 'onboarding')
    ).not.toThrow();
  });

  it('throws McpMiddlewareSkip for a non-matching message', () => {
    expect(() => assertPromptGet(notAPrompt)).toThrow(McpMiddlewareSkip);
    expect(() => assertPromptName(promptGet({ name: 'other' }), 'onboarding')).toThrow(
      McpMiddlewareSkip
    );
  });
});
