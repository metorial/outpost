# Examples

Each file is a standalone `McpProxy.create()` setup for one scenario.

Run any of them with a real Outpost credential:

```bash
METORIAL_OUTPOST_CREDENTIAL=metorial_op_... bun run examples/01-basic-proxy.ts
```

| Example | Demonstrates |
| --- | --- |
| [01-basic-proxy.ts](./01-basic-proxy.ts) | The minimal setup, plus graceful shutdown on `SIGINT`. |
| [02-redact-tool-arguments.ts](./02-redact-tool-arguments.ts) | Stripping a sensitive argument from a tool call before it reaches the upstream server. |
| [03-redact-tool-result.ts](./03-redact-tool-result.ts) | Letting a call through, then scrubbing a field out of its result. |
| [04-block-dangerous-tool.ts](./04-block-dangerous-tool.ts) | Denying a tool call outright with `errorResponse()`, no upstream call. |
| [05-redact-prompt-arguments.ts](./05-redact-prompt-arguments.ts) | The same argument-stripping idea, for `prompts/get`. |
| [06-restrict-resource-access.ts](./06-restrict-resource-access.ts) | Allow-listing `resources/read` by URI prefix, `errorResponse()` for anything else. |
| [07-audit-logging.ts](./07-audit-logging.ts) | Read-only logging of every tool call, prompt get, and resource read -- shipped to Datadog and Splunk at once. |
| [08-compose-multiple-middleware.ts](./08-compose-multiple-middleware.ts) | Combining several single-purpose middleware, and why their order matters. |

See the package [README](../README.md) for the full `mcpMiddleware()`/`McpProxy.create()` reference.
