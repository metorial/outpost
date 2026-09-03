# 3. Logging

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

The provided logging adapters are:

- `ConsoleLogger`: prints to stdout and stderr.
- `DatadogLogger`: sends logs to Datadog.
- `SplunkLogger`: sends logs to Splunk.
- `ElasticLogger`: sends logs to Elasticsearch.
- `HttpLogger`: sends logs to any HTTP endpoint.
- `OtelLogger`: sends logs to an OpenTelemetry collector.

Next: [4. Dockerize it](./04-docker.md).
