import type { OutpostFetchFunction } from '@metorial-outpost/fetch';
import type { Logger } from '@metorial-outpost/logger';
import type { OutpostManifest } from '@metorial-outpost/server';

let DEFAULT_MANIFEST_REFRESH_INTERVAL_MS = 60_000;

export type ManifestHolder = { current(): OutpostManifest | undefined };

export type ManifestFetcherOptions = {
  endpoint: string;
  basePath: string;
  outpostId: string;
  service: string;
  fetch: OutpostFetchFunction;
  logger: Logger;
  refreshIntervalMs?: number;
};

let joinUrl = (endpoint: string, path: string): string =>
  `${endpoint.replace(/\/+$/, '')}${path}`;

export let startManifestFetcher = async (
  options: ManifestFetcherOptions
): Promise<{ holder: ManifestHolder; stop: () => void }> => {
  let current: OutpostManifest | undefined;
  let url = joinUrl(options.endpoint, `${options.basePath}/manifest/${options.outpostId}`);

  let refresh = async () => {
    try {
      let response = await options.fetch(url, { method: 'GET', service: options.service });
      if (!response.ok) {
        throw new Error(`manifest endpoint responded with status ${response.status}`);
      }
      current = (await response.json()) as OutpostManifest;
    } catch (error) {
      options.logger.warn(
        'outpost-instance: failed to refresh manifest, keeping last known value',
        {
          error
        }
      );
    }
  };

  await refresh();

  let interval = setInterval(
    refresh,
    options.refreshIntervalMs ?? DEFAULT_MANIFEST_REFRESH_INTERVAL_MS
  );

  return {
    holder: { current: () => current },
    stop: () => clearInterval(interval)
  };
};
