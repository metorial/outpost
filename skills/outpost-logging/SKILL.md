---
name: outpost-logging
description: Configure, extend, or troubleshoot logging for a Metorial Outpost instance or adapter. Use for console, HTTP, OpenTelemetry, filtering, and graceful log flushing.
---

# Outpost Logging

Use the Outpost logger packages rather than introducing an unrelated logging abstraction. Read the [logging guide](../../../docs/logging.md) before changing logger configuration; inspect the relevant package source when changing a logger implementation.

## Configure the runtime

- Pass one `Logger` to `OutpostInstance.start()` or `McpProxy.create()`. It is shared by authentication, manifest refreshes, adapters, and MCP middleware. Omitting it intentionally uses `noopLogger`.
- Prefer structured fields over interpolating values into messages. Use `logger.child()` for bindings shared by a request, component, or deployment. `BaseOutpostAdapter` already adds its adapter name to its child logger.
- Choose the smallest destination set that meets the requested observability outcome: `ConsoleLogger` for local/runtime output, `OtelLogger` for an existing OpenTelemetry log pipeline, and `HttpLogger` or its Datadog, Splunk, or Elastic presets for remote ingestion. Use `MultiLogger` to fan out to multiple destinations.
- Put level and filter choices on the destination that needs them. `BaseLogger` defaults to `info`; available filter helpers include `minLevel`, `scopeIs`, `scopeStartsWith`, `and`, `or`, and `not`.

## Shutdown and reliability

- Keep a reference to every HTTP-backed logger. Stop the Outpost first, then `await logger.close()` (or `flush()` when the logger remains in use) so buffered entries are delivered.
- HTTP logger delivery errors belong in its `onError` callback; do not let telemetry failures fail an Outpost request path.
- Do not log credentials, API keys, authorization headers, or unredacted sensitive tool arguments/results. Bind stable identifiers such as `connectionId`, adapter name, and environment instead.

For logger API shapes and package behavior, inspect `packages/outpost-logger*/src/`. For an MCP audit-log pattern, read [the MCP proxy guide](../../../docs/mcp-proxy.md) and its linked `07-audit-logging.ts` example.
