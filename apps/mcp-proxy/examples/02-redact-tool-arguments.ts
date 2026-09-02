/**
 * Strip a sensitive argument out of a specific tool call before it reaches Metorial.
 *
 * Run with:
 *   METORIAL_OUTPOST_CREDENTIAL=metorial_op_... bun run examples/02-redact-tool-arguments.ts
 */
import { assertToolName, mcpMiddleware, McpProxy } from '@metorial/mcp-proxy';

let stripApiKeyArgument = mcpMiddleware({
  name: 'strip-api-key-argument',
  handle: async (message, call, ctx) => {
    // Skips anything that isn't a `tools/call_external_api` request
    assertToolName(message, 'call_external_api');

    let { apiKey, ...safeArguments } = message.params.arguments ?? {};
    if (apiKey !== undefined) {
      ctx.logger.info('outpost example: stripped apiKey before forwarding call_external_api', {
        connectionId: ctx.connectionId
      });
    }

    return call({ ...message, params: { ...message.params, arguments: safeArguments } });
  }
});

async function main() {
  await McpProxy.create({
    outpostCredential: process.env.METORIAL_OUTPOST_CREDENTIAL!,
    baseUrl: 'https://mcp.example.com',
    proxy: { port: 8080 },
    middleware: [stripApiKeyArgument]
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
