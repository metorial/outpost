import type { JSONRPCMessage, RequestId } from '@modelcontextprotocol/sdk/types.js';
import {
  isJSONRPCErrorResponse,
  isJSONRPCNotification,
  isJSONRPCRequest,
  isJSONRPCResultResponse
} from '@modelcontextprotocol/sdk/types.js';

export { isJSONRPCErrorResponse, isJSONRPCNotification, isJSONRPCRequest, isJSONRPCResultResponse };

export let isJSONRPCReply = (message: JSONRPCMessage): boolean =>
  isJSONRPCResultResponse(message) || isJSONRPCErrorResponse(message);

export let messageId = (message: JSONRPCMessage): RequestId | undefined =>
  'id' in message ? message.id : undefined;

export let expectsReply = (message: JSONRPCMessage): boolean => isJSONRPCRequest(message);
