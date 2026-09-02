# `@metorial/outpost-status-page`

A small, self-contained React status page for an Outpost instance -- the equivalent of
Tailscale's "This device" screen. `@metorial/outpost-instance` always mounts it at the proxy's
root path (`/`), so every running Outpost has a human-friendly overview available even if none of
its adapters expose anything there.

The page shows ids, connection status, uptime, which services are running and at which paths, and
the organization/project/instance compartments this outpost has been granted access to. It never
renders private keys or instance tokens -- it's served without authentication to anyone who can
reach the outpost, so keep anything added to `OutpostStatusPageData` to data that's fine to expose
that way.

This package deliberately does **not** depend on `@metorial/ui`, `@metorial/ui-product`, or
`@metorial-enterprise/nexus-basic-layout` -- an Outpost instance is meant to run standalone, so its
UI is a handful of plain React components and one CSS file, styled to resemble the dashboard's
`nexus-basic` layout without depending on it.

## Installation

```bash
npm install @metorial/outpost-status-page
yarn add @metorial/outpost-status-page
bun add @metorial/outpost-status-page
pnpm add @metorial/outpost-status-page
```

## Building the client

The server half (`createOutpostStatusPage`) is consumed as plain TypeScript, like every other
`outpost-*` package. The React page, though, needs to be bundled first:

```bash
bun run build   # runs the "prebuild" script (`vite build`) before type-checking
```

`prebuild` runs `vite build`, producing `dist/index.html` and `dist/assets/**`. Run it once as
part of your deploy before starting an app that uses this package -- if `dist/index.html` doesn't
exist yet, `createOutpostStatusPage` serves a plain "not built yet" placeholder instead of
crashing.

Use `bun run dev` to iterate on the page itself with Vite's dev server (data comes from whatever
`/outpost-status/api/status` responds with at `http://localhost:5190` -- proxy that to a real
running outpost, or mock it, while working on the UI).

## Usage

```typescript
import { createOutpostStatusPage } from '@metorial-outpost/status-page';
import { createOutpostProxy } from '@metorial-outpost/proxy';

let statusPage = createOutpostStatusPage({
  getData: () => ({
    outpostId: 'otp_123',
    outpostName: 'Acme Corp Outpost',
    credentialId: 'otc_456',
    instanceId: 'oti_789',
    registered: true,
    tokenExpiresAt: Date.now() + 60_000,
    baseUrl: 'https://abc.outpost.example',
    startedAt: Date.now() - 60_000,
    upstream: { kind: 'metorial', host: 'outpost.metorial.com' },
    services: [
      { id: 'mcp_connection_proxy', version: '1.0.0', granted: true, paths: ['/connect/mcp'] }
    ],
    access: [
      {
        organizationId: 'org_123',
        projectId: 'proj_456',
        instanceId: 'inst_789',
        services: ['mcp_connection_proxy']
      }
    ]
  })
});

let proxy = createOutpostProxy({ adapters: [statusPage] });
```

`getData` is called fresh on every `GET /outpost-status/api/status` request, so it should read from live
in-memory state (a closure over the running instance) rather than doing its own caching -- the
page itself polls that endpoint every 15s to keep the dot colors and uptime current.

## License

This project is licensed under the Apache License 2.0.

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>
