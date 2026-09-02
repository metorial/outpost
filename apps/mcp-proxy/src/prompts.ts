import { isJSONRPCRequest, isJSONRPCResultResponse } from '@metorial-outpost/mcp';
import type {
  GetPromptRequest,
  GetPromptResult,
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResultResponse
} from '@modelcontextprotocol/sdk/types.js';
import { McpMiddlewareSkip } from './skip';

export type PromptGetMessage = JSONRPCRequest & GetPromptRequest;
export type PromptGetResultMessage = JSONRPCResultResponse & { result: GetPromptResult };

export let isPromptGet = (message: JSONRPCMessage): message is PromptGetMessage =>
  isJSONRPCRequest(message) && message.method === 'prompts/get';

export let isPromptName = (
  message: JSONRPCMessage,
  name: string
): message is PromptGetMessage => isPromptGet(message) && message.params.name === name;

export let getPromptName = (message: JSONRPCMessage): string | null =>
  isPromptGet(message) ? message.params.name : null;

export let getPromptParams = (
  message: JSONRPCMessage
): Record<string, string> | GetPromptResult | null => {
  if (isPromptGet(message)) return message.params.arguments ?? {};
  if (isJSONRPCResultResponse(message)) return (message as PromptGetResultMessage).result;
  return null;
};

export let getPromptResult = getPromptParams;

export let assertPromptGet: (
  message: JSONRPCMessage
) => asserts message is PromptGetMessage = message => {
  if (!isPromptGet(message)) throw new McpMiddlewareSkip('expected a "prompts/get" request');
};

export let assertPromptName: (
  message: JSONRPCMessage,
  name: string
) => asserts message is PromptGetMessage = (message, name) => {
  if (!isPromptName(message, name)) throw new McpMiddlewareSkip(`expected prompt "${name}"`);
};
