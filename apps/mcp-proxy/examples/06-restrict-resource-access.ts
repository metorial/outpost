/**
 * Only allow `resources/read` for URIs under an allow-list of prefixes.
 *
 * Run with:
 *   METORIAL_OUTPOST_CREDENTIAL=metorial_op_... bun run examples/06-restrict-resource-access.ts
 */
import {
  assertResourceRead,
  errorResponse,
  mcpMiddleware,
  McpProxy
} from '@metorial/mcp-proxy';

let ALLOWED_PREFIXES = ['file:///workspace/', 'https://docs.example.com/'];

let restrictResourceAccess = mcpMiddleware({
  name: 'restrict-resource-access',
  handle: async (message, call) => {
    assertResourceRead(message);

    if (ALLOWED_PREFIXES.some(prefix => message.params.uri.startsWith(prefix))) {
      return call(message);
    }

    return errorResponse(
      message,
      `Resource "${message.params.uri}" is outside this outpost's allow-list.`
    );
  }
});

async function main() {
  await McpProxy.create({
    outpostCredential: process.env.METORIAL_OUTPOST_CREDENTIAL!,
    baseUrl: 'https://mcp.example.com',
    proxy: { port: 8080 },
    middleware: [restrictResourceAccess]
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
