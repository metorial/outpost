<h1 align="center">Outpost</h1>

<p align="center">
  <a href="./docs/mcp-proxy/README.md">MCP Proxy Guide</a> •
  <a href="./docs/README.md">Docs</a> •
  <a href="./apps/mcp-proxy/examples">Examples</a> •
  <a href="https://metorial.com">Metorial</a>
</p>

An Outpost is a process you run inside your own network that connects out to Metorial over a
signed, authenticated channel. Instead of clients directly connecting to Metorial, the Outpost
registers itself, gets an instance credential, and opens the connection. Your agents and clients can then connect to the Outpost. 
It works behind a firewall or NAT with nothing inbound to expose.

What an Outpost actually does at runtime depends on which **adapters** it runs. Adapters plug into
a shared `OutpostInstance` and expose whatever proxy surface or background work they need.

## The MCP proxy

The most common Outpost is the **MCP proxy**: it lets MCP clients and agents connect to it
directly, and it forwards their traffic to Metorial. Because the traffic flows through your own
network first, you can observe, transform, or block it before it reaches Metorial.

```typescript
import { McpProxy, mcpMiddleware, assertToolName } from '@metorial/mcp-proxy';

let redactApiKey = mcpMiddleware({
  handle: async (message, call) => {
    assertToolName(message, 'call_external_api');
    let { apiKey, ...rest } = message.params.arguments ?? {};
    return call({ ...message, params: { ...message.params, arguments: rest } });
  }
});

let proxy = await McpProxy.create({
  outpostCredential: process.env.METORIAL_OUTPOST_CREDENTIAL!,
  baseUrl: 'https://mcp.example.com',
  proxy: { port: 8080 },
  middleware: [redactApiKey]
});
```

- **[Setting up an MCP proxy Outpost](./docs/mcp-proxy/README.md)**: step-by-step, from creating
  the Outpost in the dashboard through writing, dockerizing, and deploying the proxy.
- **[Examples](./apps/mcp-proxy/examples)**: standalone middleware for redacting arguments,
  blocking tools, restricting resources, audit logging, and composing several at once.
- **[`@metorial/mcp-proxy` reference](./apps/mcp-proxy/README.md)**: the full
  `McpProxy.create()` and `mcpMiddleware()` API.

## License

This project is licensed under the Apache License 2.0.

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>
