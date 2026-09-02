import { isJSONRPCRequest, isJSONRPCResultResponse } from '@metorial-outpost/mcp';
import type {
  CallToolRequest,
  CallToolResult,
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResultResponse
} from '@modelcontextprotocol/sdk/types.js';
import { McpMiddlewareSkip } from './skip';

export type ToolCallMessage = JSONRPCRequest & CallToolRequest;
export type ToolCallResultMessage = JSONRPCResultResponse & { result: CallToolResult };

export let isToolCall = (message: JSONRPCMessage): message is ToolCallMessage =>
  isJSONRPCRequest(message) && message.method === 'tools/call';

export let isToolName = (message: JSONRPCMessage, name: string): message is ToolCallMessage =>
  isToolCall(message) && message.params.name === name;

export let getToolName = (message: JSONRPCMessage): string | null =>
  isToolCall(message) ? message.params.name : null;

export let getToolParams = (
  message: JSONRPCMessage
): Record<string, unknown> | CallToolResult | null => {
  if (isToolCall(message)) return message.params.arguments ?? {};
  if (isJSONRPCResultResponse(message)) return (message as ToolCallResultMessage).result;
  return null;
};

export let getToolResult = getToolParams;

export let assertToolCall: (
  message: JSONRPCMessage
) => asserts message is ToolCallMessage = message => {
  if (!isToolCall(message)) throw new McpMiddlewareSkip('expected a "tools/call" request');
};

export let assertToolName: (
  message: JSONRPCMessage,
  name: string
) => asserts message is ToolCallMessage = (message, name) => {
  if (!isToolName(message, name)) throw new McpMiddlewareSkip(`expected tool call "${name}"`);
};
