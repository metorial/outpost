---
name: outpost-mcp-proxy
description: Build, configure, or secure a Metorial MCP Proxy, including lifecycle, CORS, and JSON-RPC middleware policies. Use for @metorial/mcp-proxy work, not generic MCP server implementations.
---

# Outpost MCP Proxy

Use `McpProxy.create()` from `@metorial/mcp-proxy` for an MCP-capable Outpost. This skill bundles
the full step-by-step guide as resources; read the file for the task at hand before implementing,
and choose the closest standalone example in `apps/mcp-proxy/examples/` as a starting point.

## Resources

- [resources/README.md](resources/README.md): guide overview and the order of steps.
- [resources/01-create-an-outpost.md](resources/01-create-an-outpost.md): registering an Outpost,
  granting it access, and creating the credential in the Metorial dashboard.
- [resources/02-setup.md](resources/02-setup.md): installing `@metorial/mcp-proxy`, writing the
  proxy script, the middleware model, and the bundled examples table. Read this before
  implementing proxy or middleware behavior.
- [resources/03-logging.md](resources/03-logging.md): wiring a logger into the proxy and the
  built-in status endpoint.
- [resources/04-docker.md](resources/04-docker.md): packaging the proxy into a container image
  with Bun or Node.
- [resources/05-deploy-kubernetes.md](resources/05-deploy-kubernetes.md): Kubernetes
  `Secret`/`Deployment`/`Service` manifests and `baseUrl`/instance-identity considerations.
- [resources/06-deploy-other-platforms.md](resources/06-deploy-other-platforms.md): systemd, AWS
  ECS/Fargate, Google Cloud Run, Fly.io, and Railway.

## Create and operate a proxy

- Supply `outpostCredential`, the public client-facing `baseUrl`, and `proxy.port`. `baseUrl` is not `upstreamUrl`: set `upstreamUrl` only when changing the Metorial/parent endpoint the Outpost connects to.
- Stop the proxy during process shutdown with `await proxy.stop()`. If HTTP loggers are used, close them after the proxy stops.
- The parent adapter is enabled by default, allowing nested Outposts. Set `parent: false` only when nesting should be unavailable; otherwise pass its config deliberately.
- CORS allows every origin by default. For browser-facing deployments, pass an explicit allow-list or supported predicate. Configure `trustProxy` when the proxy sits behind a reverse proxy and source-IP behavior matters.

## Middleware policies

- Create entries with `mcpMiddleware()` and provide them through `middleware`. They run in array order for every JSON-RPC message in both directions; each one receives the prior middleware's transformed message.
- In a handler, return `call(message)` to continue, `call(transformedMessage)` to modify traffic, `null` to drop it, or `errorResponse(message, reason)` to deny a request. Middleware has a fail-closed timeout (30 seconds by default); change `middlewareTimeoutMs` only for a known need.
- Use the supplied guards and selectors (`assertToolName`, `assertResourceRead`, `isToolCall`, `getToolResult`, and peers) instead of reimplementing protocol matching. An assertion mismatch is a skip signal: `mcpMiddleware()` forwards the original message unchanged.
- Keep policies small and single-purpose. Order audit logging before blocking when denied attempts must be recorded; apply redaction before data leaves the intended trust boundary. Check `ctx.direction` when a transformation must affect only responses, and use `ctx.logger` with structured `connectionId` fields for audit events.
- Treat tool arguments and results as sensitive by default. Avoid placing their raw contents in logs; redact or allow-list fields before forwarding where the policy requires it.

Read `apps/mcp-proxy/src/` and its tests when changing proxy or middleware behavior. Use the
examples in `resources/02-setup.md` for argument/result redaction, dangerous-tool blocking,
resource restrictions, audit logging, and composed middleware. For deployment questions, go
straight to `resources/04-docker.md` and the relevant `resources/05-*`/`resources/06-*` file
rather than guessing at platform mechanics.
