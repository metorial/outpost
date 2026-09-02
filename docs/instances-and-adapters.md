# Registering an Outpost instance and adding adapters

`OutpostInstance.start()` is the process-level entry point. It registers (or reloads) an instance,
fetches the Outpost manifest, builds one shared adapter context, starts proxy routes on a single
Bun server, and then starts adapter background work. A non-sensitive status page is always mounted
at the proxy root.

```ts
import { OutpostInstance } from '@metorial-outpost/instance';
import { FsInstanceCredentialStore } from '@metorial-outpost/auth';
import { ConsoleLogger } from '@metorial-outpost/logger-console';
import { MyAdapter } from './my-adapter';

let instance = await OutpostInstance.start({
  credential: process.env.METORIAL_OUTPOST_CREDENTIAL!,
  baseUrl: 'https://outpost.example.com',
  proxy: { hostname: '0.0.0.0', port: 8080 },
  store: new FsInstanceCredentialStore('/var/lib/metorial-outpost/instance.json'),
  logger: new ConsoleLogger(),
  trustProxy: { ipHeader: 'x-forwarded-for' },
  adapters: [[MyAdapter, { upstream: 'https://service.internal' }]]
});

process.on('SIGINT', () => instance.stop());
```

`baseUrl` is required and must be an absolute `http(s)` URL: it is the public front door given to
clients in rewritten discovery/connect URLs. `upstreamUrl` is different; set it only to override
the Metorial endpoint used for registration and upstream protocol calls. `basePath` defaults to
`/outpost` and must match that endpoint's server configuration.

## Adapter contract

An adapter has a stable name, version, and capability declaration. It may return one or more Hono
proxy surfaces from `startProxy()`, run asynchronous setup in `start()`, and release resources in
`stop()`.

```ts
import { BaseOutpostAdapter, type OutpostProxyRegistration } from '@metorial-outpost/adapter';
import { createProxyAdapter } from '@metorial-outpost/proxy';

export class MyAdapter extends BaseOutpostAdapter<{ upstream: string }> {
  readonly name = 'my-service';
  readonly version = '1.0.0';
  readonly capabilities = { proxy: true };

  startProxy(): OutpostProxyRegistration {
    return createProxyAdapter({
      path: '/my-service',
      fetch: this.fetch,
      target: this.config.upstream,
      service: this.name,
      trustProxy: this.context.trustProxy
    });
  }

  async start() {
    this.logger.info('adapter started');
  }
}
```

`BaseOutpostAdapter` provides scoped `logger`, signed `fetch`, shared `cache`, `baseUrl`, and
`upstreamUrl`. Its `fetch` automatically identifies the adapter's `name` as the Outpost service.

Register adapters as a bare class (no config), `[AdapterClass, config]`, or a sync/async factory:

```ts
adapters: [MyAdapter, [MyAdapter, { upstream: 'https://service.internal' }], context => new MyAdapter(context, config)]
```

The registration service declaration is generated from each resolved adapter's `name`, `version`,
and `capabilities`. If the registration authority denies a service, the runtime lists it as skipped
and does not call `startProxy()` or `start()` for that adapter.

## Proxy and trust considerations

Proxy adapters forward through `@metorial-outpost/fetch`, which signs the upstream request. They
strip hop-by-hop and existing Outpost signature headers, preserve normal application headers, and
buffer request bodies so they can be hashed. More-specific adapter paths are mounted before `/`.

Only enable `trustProxy` when a trusted reverse proxy owns and sanitizes the selected forwarding
header. Otherwise leave it unset/false so proxy context takes the actual socket address where the
runtime exposes one. For nested Outposts, put `guardNestedOutpostAccess()` ahead of the proxy
route; it verifies the child and enforces that the child manifest is no broader than the parent.
