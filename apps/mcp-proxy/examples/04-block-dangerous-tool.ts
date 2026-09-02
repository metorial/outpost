/**
 * Deny a specific tool call. It is never forwarded to Metorial.
 *
 * Run with:
 *   METORIAL_OUTPOST_CREDENTIAL=metorial_op_... bun run examples/04-block-dangerous-tool.ts
 */
import { assertToolName, errorResponse, mcpMiddleware, McpProxy } from '@metorial/mcp-proxy';

let blockDeleteDatabase = mcpMiddleware({
  name: 'block-delete-database',
  handle: async message => {
    assertToolName(message, 'delete_database');

    // `call()` is never invoked here, so Metorial never sees this request.

    return errorResponse(
      message,
      'This outpost blocks the "delete_database" tool. Contact your administrator.'
    );
  }
});

async function main() {
  await McpProxy.create({
    outpostCredential: process.env.METORIAL_OUTPOST_CREDENTIAL!,
    baseUrl: 'https://mcp.example.com',
    proxy: { port: 8080 },
    middleware: [blockDeleteDatabase]
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
