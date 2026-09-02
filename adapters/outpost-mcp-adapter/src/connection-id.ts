import type { Context } from 'hono';

let counter = 0;

let fallbackId = (): string => {
  counter = (counter + 1) % 1_000_000;
  return `mcpx_${Date.now().toString(36)}${counter.toString(36).padStart(4, '0')}`;
};

export let resolveConnectionId = (c: Context): string =>
  c.req.header('mcp-session-id') || c.req.query('connection_token') || fallbackId();
