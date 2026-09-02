/**
 * A more realistic proxy combines several small, single-purpose middleware rather than one giant
 * one. `middleware` runs in the order given, and each middleware sees the message as transformed
 * by whichever ran before it -- order matters. Here: audit everything first (so blocked calls are
 * still logged), then block a dangerous tool, then redact a sensitive result.
 *
 * Run with:
 *   METORIAL_OUTPOST_CREDENTIAL=metorial_op_... bun run examples/08-compose-multiple-middleware.ts
 */
import {
  assertToolName,
  errorResponse,
  getToolName,
  getToolResult,
  isToolCall,
  McpProxy,
  mcpMiddleware
} from '@metorial/mcp-proxy';

let auditLog = mcpMiddleware({
  name: 'audit-log',
  handle: async (message, call, ctx) => {
    if (isToolCall(message)) {
      ctx.logger.info('audit: tool call', {
        connectionId: ctx.connectionId,
        tool: getToolName(message)
      });
    }
    return call(message);
  }
});

let blockDeleteDatabase = mcpMiddleware({
  name: 'block-delete-database',
  handle: async message => {
    assertToolName(message, 'delete_database');
    return errorResponse(message, 'This outpost blocks the "delete_database" tool.');
  }
});

let redactAccountBalance = mcpMiddleware({
  name: 'redact-account-balance',
  handle: async (message, call) => {
    assertToolName(message, 'get_account_summary');

    let response = await call(message);
    let result = response && (getToolResult(response) as Record<string, unknown> | null);
    if (!response || !result) return response;

    return { ...response, result: { ...result, balance: 'REDACTED' } };
  }
});

async function main() {
  await McpProxy.create({
    outpostCredential: process.env.METORIAL_OUTPOST_CREDENTIAL!,
    baseUrl: 'https://mcp.example.com',
    proxy: { port: 8080 },
    middleware: [auditLog, blockDeleteDatabase, redactAccountBalance]
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
