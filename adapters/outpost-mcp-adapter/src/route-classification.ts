import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Context } from 'hono';

export type RouteClassification =
  | { kind: 'passthrough' }
  | { kind: 'mcp_get' }
  | { kind: 'mcp_post'; message: JSONRPCMessage };

export let classifyRequest = async (c: Context): Promise<RouteClassification> => {
  let authorization = c.req.header('authorization');
  if (!authorization) return { kind: 'passthrough' };

  let method = c.req.method;
  if (method === 'GET') return { kind: 'mcp_get' };
  if (method !== 'POST') return { kind: 'passthrough' };

  let bodyBytes = new Uint8Array(await c.req.raw.clone().arrayBuffer());
  let message = parseJsonRpcMessage(bodyBytes);
  if (!message) return { kind: 'passthrough' };

  return { kind: 'mcp_post', message };
};

let parseJsonRpcMessage = (bytes: Uint8Array): JSONRPCMessage | null => {
  if (bytes.byteLength === 0) return null;

  try {
    let parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (parsed && typeof parsed === 'object' && (parsed as any).jsonrpc === '2.0') {
      return parsed as JSONRPCMessage;
    }
  } catch {}

  return null;
};
