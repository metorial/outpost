/**
 * Strip sensitive data out of a specific prompt before it reaches Metorial.
 *
 * Run with:
 *   METORIAL_OUTPOST_CREDENTIAL=metorial_op_... bun run examples/05-redact-prompt-arguments.ts
 */
import { assertPromptName, mcpMiddleware, McpProxy } from '@metorial/mcp-proxy';

let dropInternalNote = mcpMiddleware({
  name: 'drop-internal-note',
  handle: async (message, call, ctx) => {
    assertPromptName(message, 'customer_reply');

    let { internalNote, ...safeArguments } = message.params.arguments ?? {};
    if (internalNote !== undefined) {
      ctx.logger.info('outpost example: dropped internalNote before forwarding prompts/get', {
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
    middleware: [dropInternalNote]
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
