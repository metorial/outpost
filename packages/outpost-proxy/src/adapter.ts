import type { Hono } from 'hono';

export type OutpostProxyAdapter = {
  path: string;
  app: Hono<any>;
};

let pathSpecificity = (path: string): number =>
  path == '' || path == '/' ? 0 : path.split('/').filter(Boolean).length + 1;

export let sortOutpostProxyAdapters = (
  adapters: OutpostProxyAdapter[]
): OutpostProxyAdapter[] =>
  [...adapters].sort((a, b) => pathSpecificity(b.path) - pathSpecificity(a.path));
