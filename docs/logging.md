# Logging for an Outpost instance

Pass a logger to `OutpostInstance.start()` or `McpProxy.create()` and it is shared with auth,
manifest refreshes, and every adapter. `BaseOutpostAdapter` automatically adds
`{ adapter: this.name }` to its child logger.

```ts
import { ConsoleLogger } from '@metorial-outpost/logger-console';
import { OutpostInstance } from '@metorial-outpost/instance';

let logger = new ConsoleLogger({ level: 'info', bindings: { environment: 'production' } });
let instance = await OutpostInstance.start({
  credential: process.env.METORIAL_OUTPOST_CREDENTIAL!,
  baseUrl: 'https://outpost.example.com',
  adapters: [],
  proxy: { port: 8080 },
  logger
});
```

Without a logger, the runtime uses `noopLogger`; diagnostic events are discarded.
The interface is synchronous (`trace`, `debug`, `info`, `warn`, `error`) and every call accepts an
optional structured fields object. Use `logger.child({ ... })` to bind common fields.

## Destinations and filtering

`ConsoleLogger` formats timestamps and sends each level to the matching console method.
`OtelLogger` maps entries to OpenTelemetry Log Records; provide an `@opentelemetry/api-logs`
logger. `HttpLogger` batches POSTs, and offers
`DatadogLogger`, `SplunkLogger`, and `ElasticLogger` presets.

```ts
import { MultiLogger, not, scopeIs } from '@metorial-outpost/logger';
import { ConsoleLogger } from '@metorial-outpost/logger-console';
import { DatadogLogger } from '@metorial-outpost/logger-http';

let logger = new MultiLogger([
  new ConsoleLogger({ level: 'debug', filters: [not(scopeIs('noisy'))] }),
  new DatadogLogger({
    level: 'info', apiKey: process.env.DATADOG_API_KEY!,
    service: 'mcp-proxy', ddsource: 'metorial-outpost'
  })
]);
```

`MultiLogger` fans out to all destinations and preserves child bindings. `BaseLogger` defaults to
`info`; configure `level`, `bindings`, and filters such as `minLevel`, `scopeIs`,
`scopeStartsWith`, `and`, `or`, and `not` at the backend that needs them.

## Flushing on shutdown

`HttpLogger` handles delivery errors through its `onError` callback and does not throw them into
the Outpost request path. It exposes `flush()` and `close()` to deliver buffered entries. Retain a
reference to each HTTP logger and close it after stopping the instance:

```ts
process.on('SIGINT', async () => {
  await instance.stop();
  await datadogLogger.close();
  process.exit(0);
});
```
