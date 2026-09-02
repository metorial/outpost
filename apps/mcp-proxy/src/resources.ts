import { isJSONRPCRequest, isJSONRPCResultResponse } from '@metorial-outpost/mcp';
import type {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResultResponse,
  ReadResourceRequest,
  ReadResourceResult
} from '@modelcontextprotocol/sdk/types.js';
import { McpMiddlewareSkip } from './skip';

export type ResourceReadMessage = JSONRPCRequest & ReadResourceRequest;
export type ResourceReadResultMessage = JSONRPCResultResponse & { result: ReadResourceResult };

export let isResourceRead = (message: JSONRPCMessage): message is ResourceReadMessage =>
  isJSONRPCRequest(message) && message.method === 'resources/read';

export let isResourceUri = (
  message: JSONRPCMessage,
  uri: string
): message is ResourceReadMessage => isResourceRead(message) && message.params.uri === uri;

export let getResourceUri = (message: JSONRPCMessage): string | null =>
  isResourceRead(message) ? message.params.uri : null;

export let getResourceParams = (
  message: JSONRPCMessage
): ReadResourceRequest['params'] | ReadResourceResult | null => {
  if (isResourceRead(message)) return message.params;
  if (isJSONRPCResultResponse(message)) return (message as ResourceReadResultMessage).result;
  return null;
};

export let getResourceResult = getResourceParams;

export let assertResourceRead: (
  message: JSONRPCMessage
) => asserts message is ResourceReadMessage = message => {
  if (!isResourceRead(message))
    throw new McpMiddlewareSkip('expected a "resources/read" request');
};

export let assertResourceUri: (
  message: JSONRPCMessage,
  uri: string
) => asserts message is ResourceReadMessage = (message, uri) => {
  if (!isResourceUri(message, uri)) throw new McpMiddlewareSkip(`expected resource "${uri}"`);
};
