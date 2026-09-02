import { BaseOutpostAdapter } from '@metorial-outpost/adapter';
import type { OutpostProxyAdapter } from '@metorial-outpost/proxy';
import { DEFAULT_BASE_PATH, OutpostServerError } from '@metorial-outpost/server';
import { Hono } from 'hono';
import { challengeHandler } from './routes/challenge';
import { issuerKeyHandler } from './routes/issuer-key';
import { manifestHandler } from './routes/manifest';
import { publicKeyHandler } from './routes/public-key';
import { registerHandler } from './routes/register';

export type OutpostParentAdapterConfig = {
  basePath?: string;
  fetch?: typeof fetch;
};

export class OutpostParentAdapter extends BaseOutpostAdapter<OutpostParentAdapterConfig> {
  readonly name = 'outpost_registration_proxy';
  readonly version = '1.0.0';
  readonly capabilities = {};

  startProxy(): OutpostProxyAdapter {
    let basePath = this.config.basePath ?? DEFAULT_BASE_PATH;
    let endpoint = this.upstreamUrl;
    let deps = {
      endpoint,
      basePath,
      fetch: this.config.fetch ?? fetch
    };
    let signedDeps = {
      endpoint,
      basePath,
      fetch: this.fetch
    };
    let relayDeps = {
      endpoint,
      basePath,
      fetch: this.fetch,
      tokens: this.context.tokens,
      trustProxy: this.context.trustProxy
    };

    let publicKeyCache = this.cache.compartment('outpost-parent:public-key', {
      defaultTtlMs: 30 * 60 * 1000 // 30 minutes
    });
    let issuerKeyCache = this.cache.compartment('outpost-parent:issuer-key', {
      defaultTtlMs: 30 * 60 * 1000 // 30 minutes
    });
    let manifestCache = this.cache.compartment('outpost-parent:manifest', {
      defaultTtlMs: 30 * 1000 // 30 seconds
    });

    let app = new Hono();
    app.onError((error, c) => {
      if (error instanceof OutpostServerError) {
        return c.json(
          { error: error.code, error_message: error.message },
          { status: error.status as any }
        );
      }

      console.error(error);

      return c.json({ error: 'internal_server_error' }, 500);
    });

    app.post('/register/challenge', challengeHandler(relayDeps));
    app.post('/register', registerHandler(relayDeps));
    app.get(
      '/public-key/:outpostId/:credentialId',
      publicKeyHandler({ ...signedDeps, cache: publicKeyCache })
    );
    app.get('/manifest/:outpostId', manifestHandler({ ...signedDeps, cache: manifestCache }));
    app.get('/issuer-key/:kid', issuerKeyHandler({ ...deps, cache: issuerKeyCache }));

    return { path: basePath, app };
  }
}
