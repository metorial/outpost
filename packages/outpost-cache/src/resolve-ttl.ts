export let resolveTtl = (
  ttlMs: number | undefined,
  defaultTtlMs: number | undefined
): number => {
  let resolved = ttlMs ?? defaultTtlMs;

  if (resolved == null) {
    throw new Error(
      'Cache.set: a ttlMs is required (pass it explicitly or open the compartment with defaultTtlMs)'
    );
  }

  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new Error(`Cache.set: ttlMs must be a positive number, got ${resolved}`);
  }

  return resolved;
};
