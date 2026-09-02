import type { OutpostStatusPageData } from '../types';

export let fetchOutpostStatus = async (): Promise<OutpostStatusPageData> => {
  let res = await fetch('/outpost-status/api/status', {
    headers: { accept: 'application/json' }
  });
  if (!res.ok) throw new Error(`Status endpoint responded with ${res.status}`);
  return (await res.json()) as OutpostStatusPageData;
};
