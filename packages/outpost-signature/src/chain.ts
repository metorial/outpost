export type OutpostChainEntry = [outpostId: string, instanceId: string];
export type OutpostChain = OutpostChainEntry[];

export let normalizeOutpostChain = (chain: OutpostChain = []): OutpostChain => {
  let seen = new Set<string>();
  return chain.filter(([outpostId]) => {
    if (seen.has(outpostId)) return false;
    seen.add(outpostId);
    return true;
  });
};

export let appendToOutpostChain = (
  chain: OutpostChain | undefined,
  outpostId: string,
  instanceId: string
): OutpostChain => normalizeOutpostChain([...(chain ?? []), [outpostId, instanceId]]);
