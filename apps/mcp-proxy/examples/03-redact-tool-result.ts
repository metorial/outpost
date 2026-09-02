/**
 * Let a tool call go through as normal, then scrub a sensitive field out of its result before the
 * agent sees it.
 *
 * Run with:
 *   METORIAL_OUTPOST_CREDENTIAL=metorial_op_... bun run examples/03-redact-tool-result.ts
 */
import { assertToolName, getToolResult, mcpMiddleware, McpProxy } from '@metorial/mcp-proxy';

let redactAccountBalance = mcpMiddleware({
  name: 'redact-account-balance',
  handle: async (message, call) => {
    assertToolName(message, 'get_account_summary');

    let response = await call(message);
    if (!response) return response;

    let result = getToolResult(response) as Record<string, unknown> | null;
    if (!result) return response;

    return { ...response, result: { ...result, balance: 'REDACTED' } };
  }
});

async function main() {
  await McpProxy.create({
    outpostCredential: process.env.METORIAL_OUTPOST_CREDENTIAL!,
    baseUrl: 'https://mcp.example.com',
    proxy: { port: 8080 },
    middleware: [redactAccountBalance]
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
