# Outpost package guides

These guides describe the public building blocks under `packages/`. They are written for
operators embedding an Outpost in a Bun application and for adapter authors extending one.

- [Signature system](./signature-system.md) — the signed registration and request formats.
- [Outpost registration](./registration.md) — challenge/response enrollment, persistence, and refresh.
- [Logging](./logging.md) — console, HTTP, OpenTelemetry, filtering, and instance integration.
- [Instances and adapters](./instances-and-adapters.md) — starting an instance and exposing services.
- [Setting up an MCP proxy Outpost](./mcp-proxy/README.md): a step-by-step guide from creating an
  Outpost in the dashboard through writing, logging, dockerizing, and deploying the proxy.

Use `baseUrl` for the URL clients actually use to reach the Outpost. It is distinct from
`upstreamUrl`, which only changes the Metorial/parent endpoint the Outpost connects to.
