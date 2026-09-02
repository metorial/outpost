# `@metorial/mcp-proxy`

A ready-to-run Metorial Outpost for proxying MCP connections. It wires up
[`OutpostInstance`](../../packages/outpost-instance) with both `@metorial/outpost-mcp-adapter` (the
MCP connect/discovery proxy) and `@metorial/outpost-parent-adapter` (so further outposts can nest
behind this one), and gives you a higher-level way to write MCP middleware.

## Installation

```bash
npm install @metorial/mcp-proxy
yarn add @metorial/mcp-proxy
bun add @metorial/mcp-proxy
pnpm add @metorial/mcp-proxy
```

## Usage

```typescript
import { assertToolName, getToolResult, McpProxy, mcpMiddleware } from '@metorial/mcp-proxy';

let redactSecretTool = mcpMiddleware({
  name: 'redact-secret-tool',
  handle: async (message, call) => {
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

let proxy = await McpProxy.create({
  outpostCredential: process.env.METORIAL_OUTPOST_CREDENTIAL!,
  baseUrl: 'https://mcp.example.com',
  proxy: { port: 8080 },
  cors: ['https://app.example.com'],
  middleware: [redactSecretTool]
});

await proxy.stop();
```

## `mcpMiddleware()`

`@metorial/outpost-mcp`'s own `McpMiddleware` contract is
`(message, call, ctx) => Promise<JSONRPCMessage | null>` -- it hands you the raw forwarding
function (`call`) and expects you to invoke it yourself to continue the chain.
`mcpMiddleware()` adds a `filter` on top of that same contract:

- `filter(message, ctx)` -- decides whether `handle` should run for this message. A message that
  doesn't match is forwarded on via `call(message)` without running `handle` at all. Defaults to
  matching every message.
- `handle(message, call, ctx)` -- runs when `filter` matches. It's handed the same `call`/`ctx` the
  underlying `McpMiddleware` contract gets, and its return value becomes this middleware's reply --
  call `call(...)` yourself to continue the chain (transformed or as-is), or return without calling
  it to short-circuit.

Middleware runs for every MCP message crossing the proxy in both directions (`ctx.direction` is
`'to_server'` or `'from_server'`), in the order given to `McpProxy.create()`.

### Message helpers

Small helpers for working with `tools/call`, `prompts/get`, and `resources/read` messages, on
either side of the exchange (`isX`/`getX` work on both the request and its response):

| | Tools | Prompts | Resources |
| --- | --- | --- | --- |
| Is this a call? | `isToolCall(message)` | `isPromptGet(message)` | `isResourceRead(message)` |
| Is it this specific one? | `isToolName(message, name)` | `isPromptName(message, name)` | `isResourceUri(message, uri)` |
| Get its name/uri | `getToolName(message)` | `getPromptName(message)` | `getResourceUri(message)` |
| Get its payload | `getToolParams` / `getToolResult` | `getPromptParams` / `getPromptResult` | `getResourceParams` / `getResourceResult` |

`getToolParams`/`getToolResult` (and the prompt/resource equivalents) are literally the same
function exported under two names, so a call site can use whichever reads better: on a request it
returns the call's arguments (`params.arguments`, or `params` itself for resources, since
`resources/read` has no `arguments` wrapper), on a response it returns `result`, and `null`
otherwise.

### Assert helpers

`assertToolCall(message)`, `assertToolName(message, name)`, `assertPromptGet(message)`,
`assertPromptName(message, name)`, `assertResourceRead(message)`, and
`assertResourceUri(message, uri)` are guard-clause versions of the `is*` checks above: instead of
returning `false`, they throw `McpMiddlewareSkip`. `mcpMiddleware()` catches that specific error
around `handle` and forwards the original message unchanged, as if `filter` had returned `false` --
it's never treated as a middleware failure. This lets you write early-exit guards imperatively
inside `handle` instead of a separate `filter`, as in the example above.

### `errorResponse(request, message)`

Builds a JSON-RPC error reply to `request` -- for a middleware to return instead of calling
`call(...)`, e.g. to reject a tool call outright:

```typescript
handle: async message => {
  assertToolName(message, 'delete_database');
  return errorResponse(message, 'This outpost blocks the "delete_database" tool.');
};
```

The error code is fixed at `-32000` (the first of the JSON-RPC spec's reserved "server error"
range) -- it's always this outpost's own middleware rejecting the call, never the upstream MCP
server, so there's nothing to configure. See
[examples/04-block-dangerous-tool.ts](examples/04-block-dangerous-tool.ts).

## `McpProxy.create(options)`

- `outpostCredential` -- **required.** The encoded `OutpostCredentialEnvelope` issued for this
  instance.
- `baseUrl` -- **required.** The public URL clients use to reach this proxy, e.g.
  `https://mcp.example.com`.
- `proxy` -- **required.** `{ hostname?, port }` -- the hostname and port this proxy listens on.
- `middleware` -- `McpMiddleware[]`, typically built with `mcpMiddleware()`.
- `middlewareTimeoutMs` -- how long a single middleware may take before the message fails closed.
  Defaults to 30s.
- `cors` -- allowed browser origins for the connect endpoints (`string[]` or a predicate
  function). Defaults to allowing any origin.
- `parent` -- set to `false` to skip mounting `OutpostParentAdapter`, or pass an
  `OutpostParentAdapterConfig` to configure it. Defaults to `true`.
- `upstreamUrl`, `store`, `logger`, `cache`, `fetch`, `stdout`, `basePath`, `trustProxy` -- passed
  straight through to `OutpostInstance.start()`.

`McpProxy.create()` resolves once the instance has registered with Metorial and started listening.
Call `proxy.stop()` to shut it down; the underlying `OutpostInstance` is available as
`proxy.instance` for anything not exposed here directly.

## License

This project is licensed under the Apache License 2.0.

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>
