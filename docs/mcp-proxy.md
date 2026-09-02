# Using `@metorial/mcp-proxy`

`McpProxy` is the quickest way to run an MCP-capable Outpost. It creates an `OutpostInstance` with
the MCP adapter and, by default, the parent adapter so other Outposts can nest behind it.

## Minimal proxy

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

`outpostCredential`, `baseUrl`, and `proxy.port` are required. `baseUrl` must be the outpost 
server's public URL, this is where MCP clients and agents will connect. 
CORS defaults to allowing every origin, pass an allow-list (or the adapter's supported predicate form) for browser-facing deployments.

## Middleware model

Pass `mcpMiddleware()` results through `middleware`. They run in supplied order for every JSON-RPC
message in both directions. `ctx.direction` is `to_server` or `from_server`; `ctx.logger` is the
instance logger. A handler must return `call(message)` to continue, call it with a transformed
message to modify traffic, return `null` to drop a message, or return an error response to block a
request. A middleware timeout fails closed after 30 seconds by default; configure
`middlewareTimeoutMs` when needed.

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

## Logging

Pass a logger to `McpProxy.create()` to make it available to the proxy runtime and every
middleware through `ctx.logger`.

```ts
import {
  getPromptName,
  getResourceUri,
  getToolName,
  isPromptGet,
  isResourceRead,
  isToolCall,
  McpProxy,
  mcpMiddleware
} from '@metorial/mcp-proxy';
import { MultiLogger, not, scopeIs } from '@metorial-outpost/logger';
import { ConsoleLogger } from '@metorial-outpost/logger-console';
import { DatadogLogger } from '@metorial-outpost/logger-http';

let logger = new MultiLogger([
  new ConsoleLogger({
    level: 'debug',
    bindings: { environment: process.env.NODE_ENV ?? 'development' },
    filters: [not(scopeIs('mcp-heartbeat'))]
  }),
  new DatadogLogger({
    level: 'info',
    apiKey: process.env.DATADOG_API_KEY!,
    service: 'mcp-proxy',
    ddsource: 'metorial-outpost'
  })
]);

let auditLog = mcpMiddleware({
  name: 'audit-log',
  handle: async (message, call, ctx) => {
    let fields = { connectionId: ctx.connectionId, direction: ctx.direction };

    if (isToolCall(message)) {
      ctx.logger.info('audit: tool call', { ...fields, tool: getToolName(message) });
    } else if (isPromptGet(message)) {
      ctx.logger.info('audit: prompt get', { ...fields, prompt: getPromptName(message) });
    } else if (isResourceRead(message)) {
      ctx.logger.info('audit: resource read', { ...fields, uri: getResourceUri(message) });
    }

    return call(message);
  }
});

await McpProxy.create({
  outpostCredential: process.env.METORIAL_OUTPOST_CREDENTIAL!,
  baseUrl: 'https://metorial-outpost.company.com',
  proxy: { port: 8080 },
  logger,
  middleware: [auditLog]
});
```

## Bundled examples

Each file is a standalone proxy configuration. Run one with Bun from `apps/mcp-proxy` after
setting `METORIAL_OUTPOST_CREDENTIAL` (and any destination-specific logging environment values).

| Example | What it demonstrates |
| --- | --- |
| [01 — basic proxy](../../apps/mcp-proxy/examples/01-basic-proxy.ts) | Minimal proxy and graceful shutdown. |
| [01 — nested proxy](../../apps/mcp-proxy/examples/01-basic-proxy_nested.ts) | Proxying through a parent Outpost. |
| [02 — redact tool arguments](../../apps/mcp-proxy/examples/02-redact-tool-arguments.ts) | Removing a sensitive tool argument before forwarding. |
| [03 — redact tool result](../../apps/mcp-proxy/examples/03-redact-tool-result.ts) | Scrubbing a field from an upstream tool result. |
| [04 — block dangerous tool](../../apps/mcp-proxy/examples/04-block-dangerous-tool.ts) | Rejecting a call with `errorResponse()` without contacting the server. |
| [05 — redact prompt arguments](../../apps/mcp-proxy/examples/05-redact-prompt-arguments.ts) | Applying the same pattern to `prompts/get`. |
| [06 — restrict resources](../../apps/mcp-proxy/examples/06-restrict-resource-access.ts) | Allow-listing resource URI prefixes. |
| [07 — audit logging](../../apps/mcp-proxy/examples/07-audit-logging.ts) | Recording tools, prompts, and resources to console, Datadog, and Splunk. |
| [08 — compose middleware](../../apps/mcp-proxy/examples/08-compose-multiple-middleware.ts) | Ordering audit, blocking, and result-redaction policies. |
