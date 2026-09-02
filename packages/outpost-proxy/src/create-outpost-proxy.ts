import { Hono } from 'hono';
import { sortOutpostProxyAdapters, type OutpostProxyAdapter } from './adapter';

export type CreateOutpostProxyOptions = {
  adapters: OutpostProxyAdapter[];
};

export let createOutpostProxy = (options: CreateOutpostProxyOptions): Hono => {
  let app = new Hono();

  app.get('/ping', c => c.text('pong'));
  app.get('/healthz', c => c.json({ status: 'ok' }));

  for (let adapter of sortOutpostProxyAdapters(options.adapters)) {
    app.route(adapter.path, adapter.app);
  }

  return app;
};
