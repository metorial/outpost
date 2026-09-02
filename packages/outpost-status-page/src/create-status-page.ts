import type { OutpostProxyAdapter } from '@metorial-outpost/proxy';
import { Hono } from 'hono';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { OutpostStatusPageData } from './types';

export type CreateOutpostStatusPageOptions = {
  getData: () => OutpostStatusPageData | Promise<OutpostStatusPageData>;
  path?: string;
  distDir?: string;
};

let defaultDistDir = join(dirname(fileURLToPath(import.meta.url)), 'client');

let FALLBACK_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Metorial Outpost</title>
  </head>
  <body style="font: 14px -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; color: #333">
    <h1>Metorial Outpost</h1>
    <p>
      The status page hasn't been built yet. Run <code>bun run build</code> in
      <code>@metorial/outpost-status-page</code> to generate it.
    </p>
  </body>
</html>`;

let ASSET_CONTENT_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

let readFileIfExists = async (path: string): Promise<Buffer | undefined> => {
  try {
    return await readFile(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
};

export let createOutpostStatusPage = (
  options: CreateOutpostStatusPageOptions
): OutpostProxyAdapter => {
  let distDir = options.distDir ?? defaultDistDir;
  let assetsDir = join(distDir, 'assets');

  let cachedIndexHtml: string | null = null;
  let readIndexHtml = async (): Promise<string> => {
    if (cachedIndexHtml) return cachedIndexHtml;

    let contents = await readFileIfExists(join(distDir, 'index.html'));
    if (!contents) return FALLBACK_HTML;

    let html = contents.toString('utf8');
    if (process.env.NODE_ENV === 'production') cachedIndexHtml = html;
    return html;
  };

  let app = new Hono();

  app.get('/', async c => c.html(await readIndexHtml()));

  app.get('/outpost-status/api/status', async c => c.json(await options.getData()));

  app.get('/assets/:key{.+}', async c => {
    let key = c.req.param('key');

    let targetPath = resolve(assetsDir, key);
    if (!targetPath.startsWith(assetsDir)) return c.text('Forbidden', 403);

    let contents = await readFileIfExists(targetPath);
    if (!contents) return c.text('Not Found', 404);

    return c.body(new Uint8Array(contents), {
      headers: {
        'Content-Type': ASSET_CONTENT_TYPES[extname(targetPath)] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  });

  return { path: options.path ?? '/', app };
};
