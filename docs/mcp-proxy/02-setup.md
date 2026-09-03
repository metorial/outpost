# 2. Set up the code

`@metorial/mcp-proxy` is the easiest way to run an MCP-capable Outpost. It creates an
`OutpostInstance` with the MCP adapter and, by default, the parent adapter, so that other Outposts
can nest behind it. No prior JavaScript or TypeScript experience is required: the complete program
is a single file.

## Prerequisites

A JavaScript runtime is required. Either of the following works:

- **[Bun](https://bun.sh)** (strongly recommended): a single install step, and it runs the `.ts` file below
  directly, with no additional setup.

  ```bash
  curl -fsSL https://bun.sh/install | bash
  ```

  For Windows and other installation methods, see <https://bun.sh/docs/installation>.

- **[Node.js](https://nodejs.org)** (LTS version, 18 or later), if it is already installed or
  preferred. Node ships with `npm`, which can be used in place of `bun` throughout this guide.

## Install the package

```bash
mkdir mcp-outpost && cd mcp-outpost
bun init -y            # or: npm init -y

bun install @metorial/mcp-proxy
# or: npm install @metorial/mcp-proxy
```

## Write the proxy

Create a file named `proxy.ts` containing:

```ts
import { McpProxy } from '@metorial/mcp-proxy';

let proxy = await McpProxy.create({
  outpostCredential: process.env.METORIAL_OUTPOST_CREDENTIAL!,
  baseUrl: 'https://metorial-outpost.company.com',
  proxy: { hostname: '0.0.0.0', port: 8080 }
});

process.on('SIGINT', async () => {
  await proxy.stop();
  process.exit(0);
});
```

Run it with the credential obtained in [step 1](./01-create-an-outpost.md):

```bash
METORIAL_OUTPOST_CREDENTIAL=metorial_op_... bun run proxy.ts
```

> If you are using Node instead of Bun, you need to bundle the TypeScript file first.

- `outpostCredential`, `baseUrl`, and `proxy.port` are required.
- `baseUrl` must be the Outpost's own public URL: the address that MCP clients and agents actually
  connect to. It is distinct from `upstreamUrl`, which overrides only the Metorial endpoint the
  Outpost registers and communicates with (not needed for a standard setup).
- CORS allows every origin by default. Pass an allow list (`cors: ['https://app.example.com']`)
  for browser-facing deployments.

At this point, the proxy is running on your machine. [Step 4](./04-docker.md) packages it into a
container.

## Middleware model

Pass `mcpMiddleware()` results through `middleware`. They run in supplied order for every JSON-RPC
message in both directions. `ctx.direction` is `to_server` or `from_server`; `ctx.logger` is the
instance logger (see [step 3](./03-logging.md)). A handler must return `call(message)` to
continue, call it with a transformed message to modify traffic, return `null` to drop a message,
or return an error response to block a request. A middleware timeout fails closed after 30 seconds
by default; configure `middlewareTimeoutMs` when needed.

### Remove a sensitive tool argument

```ts
import { assertToolName, mcpMiddleware, McpProxy } from '@metorial/mcp-proxy';

let redactApiKey = mcpMiddleware({
  name: 'redact-api-key',
  handle: async (message, call, ctx) => {
    assertToolName(message, 'call_external_api');
    let { apiKey, ...argumentsWithoutKey } = message.params.arguments ?? {};
    if (apiKey !== undefined) ctx.logger.info('removed API key', { connectionId: ctx.connectionId });
    return call({ ...message, params: { ...message.params, arguments: argumentsWithoutKey } });
  }
});

await McpProxy.create({
  outpostCredential: process.env.METORIAL_OUTPOST_CREDENTIAL!, baseUrl: 'https://metorial-outpost.company.com',
  proxy: { port: 8080 }, middleware: [redactApiKey]
});
```

`assertToolName()` throws a special skip signal when it does not match. `mcpMiddleware()` catches
that signal and forwards the original message unchanged. Use `filter` instead when the selection
logic is declarative.

### Block a dangerous tool

```ts
import { assertToolName, errorResponse, mcpMiddleware } from '@metorial/mcp-proxy';

let blockDelete = mcpMiddleware({
  name: 'block-delete-database',
  handle: async message => {
    // This middleware only applies to delete_database calls. 
    // Other messages will be passed through unchanged.
    assertToolName(message, 'delete_database');

    return errorResponse(message, 'This Outpost does not permit delete_database.');
  }
});
```

### Redact a result only on the way back

```ts
import { assertToolName, getToolResult, mcpMiddleware } from '@metorial/mcp-proxy';

let redactResults = mcpMiddleware({
  name: 'redact-results',
  handle: async (message, call) => {
    // This middleware only applies to get_account_summary calls.
    // Other messages will be passed through unchanged.
    assertToolName(message, 'get_account_summary');

    // Call the next middleware or the MCP server and await its response.
    let response = await call(message);
    if (!response) return response;

    let result = getToolResult(response);
    if (!result || typeof result != 'object') return response;

    return { ...response, result: { ...result, balance: 'REDACTED' } };
  }
});
```

## Bundled examples

| Example | What it demonstrates |
| --- | --- |
| [01: basic proxy](../../apps/mcp-proxy/examples/01-basic-proxy.ts) | Minimal proxy and graceful shutdown. |
| [01: nested proxy](../../apps/mcp-proxy/examples/01-basic-proxy_nested.ts) | Proxying through a parent Outpost. |
| [02: redact tool arguments](../../apps/mcp-proxy/examples/02-redact-tool-arguments.ts) | Removing a sensitive tool argument before forwarding. |
| [03: redact tool result](../../apps/mcp-proxy/examples/03-redact-tool-result.ts) | Scrubbing a field from an upstream tool result. |
| [04: block dangerous tool](../../apps/mcp-proxy/examples/04-block-dangerous-tool.ts) | Rejecting a call with `errorResponse()` without contacting the server. |
| [05: redact prompt arguments](../../apps/mcp-proxy/examples/05-redact-prompt-arguments.ts) | Applying the same pattern to `prompts/get`. |
| [06: restrict resources](../../apps/mcp-proxy/examples/06-restrict-resource-access.ts) | Allow-listing resource URI prefixes. |
| [07: audit logging](../../apps/mcp-proxy/examples/07-audit-logging.ts) | Recording tools, prompts, and resources to console, Datadog, and Splunk. |
| [08: compose middleware](../../apps/mcp-proxy/examples/08-compose-multiple-middleware.ts) | Ordering audit, blocking, and result-redaction policies. |

Next: [3. Logging](./03-logging.md).
