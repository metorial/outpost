import type { JSONRPCMessage, RequestId } from '@modelcontextprotocol/sdk/types.js';

export let errorResponse = (request: { id: RequestId }, message: string): JSONRPCMessage => ({
  jsonrpc: '2.0',
  id: request.id,
  error: { code: -32000, message }
});
