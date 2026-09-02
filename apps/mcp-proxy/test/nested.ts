/**
 * The smallest possible `@metorial/mcp-proxy` setup: no middleware, no CORS restrictions, just an
 * Outpost that proxies MCP connections straight through to Metorial.
 *
 * Run with:
 *   METORIAL_OUTPOST_CREDENTIAL=metorial_op_... bun run examples/01-basic-proxy.ts
 */
import { mcpMiddleware, McpProxy } from '@metorial/mcp-proxy';

let mw1 = mcpMiddleware({
  name: 'mw1',
  handle: async (message, call) => {
    console.log('mw1 middleware called for message:', message);

    let response = await call(message);

    console.log('mw1 middleware received response:', response);

    return response;
  }
});

async function main() {
  let proxy = await McpProxy.create({
    outpostCredential: process.env.METORIAL_OUTPOST_CREDENTIAL_NESTED!,
    upstreamUrl: 'http://localhost:8080',
    baseUrl: 'http://localhost:8081',
    proxy: { port: 8081 },
    middleware: [mw1]
  });

  console.log(`mcp-proxy ready, registered against ${proxy.instance.auth.endpoint}`);

  // Shut down cleanly on Ctrl+C -- every other example skips this for brevity, but it applies to
  // all of them the same way.
  process.on('SIGINT', async () => {
    await proxy.stop();
    process.exit(0);
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
