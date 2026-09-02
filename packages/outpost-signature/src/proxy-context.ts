import type { OutpostProxyContext } from './metadata';

export let normalizeProxyContext = (
  context: OutpostProxyContext | undefined
): [string, string][] => {
  if (!context) return [];

  return Object.entries(context)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
};
