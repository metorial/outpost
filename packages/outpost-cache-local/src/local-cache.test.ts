import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalCache } from './local-cache';

describe('LocalCache', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stores and retrieves a value within its compartment', async () => {
    let cache = new LocalCache();
    let compartment = cache.compartment('public-key');

    await compartment.set('otp_1:otc_1', { publicKey: 'abc' }, 60_000);

    expect(await compartment.get('otp_1:otc_1')).toEqual({ publicKey: 'abc' });
  });

  it('isolates keys between compartments', async () => {
    let cache = new LocalCache();
    await cache.compartment('a').set('key', 'from-a', 60_000);
    await cache.compartment('b').set('key', 'from-b', 60_000);

    expect(await cache.compartment('a').get('key')).toBe('from-a');
    expect(await cache.compartment('b').get('key')).toBe('from-b');
  });

  it('reopening the same compartment id returns the same scope', async () => {
    let cache = new LocalCache();
    await cache.compartment('public-key').set('key', 'value', 60_000);

    expect(await cache.compartment('public-key').get('key')).toBe('value');
  });

  it('expires entries after their ttl', async () => {
    let cache = new LocalCache();
    let compartment = cache.compartment('public-key');
    await compartment.set('key', 'value', 1_000);

    vi.advanceTimersByTime(1_001);

    expect(await compartment.get('key')).toBeUndefined();
  });

  it('falls back to the compartment default ttl when set() omits one', async () => {
    let cache = new LocalCache();
    let compartment = cache.compartment('public-key', { defaultTtlMs: 1_000 });
    await compartment.set('key', 'value');

    expect(await compartment.get('key')).toBe('value');
    vi.advanceTimersByTime(1_001);
    expect(await compartment.get('key')).toBeUndefined();
  });

  it('throws when set() has no ttlMs and no compartment default', async () => {
    let cache = new LocalCache();
    await expect(cache.compartment('public-key').set('key', 'value')).rejects.toThrow(
      /ttlMs is required/
    );
  });

  it('deletes a key', async () => {
    let cache = new LocalCache();
    let compartment = cache.compartment('public-key');
    await compartment.set('key', 'value', 60_000);
    await compartment.delete('key');

    expect(await compartment.get('key')).toBeUndefined();
  });

  it('returns undefined for a missing key', async () => {
    let cache = new LocalCache();
    expect(await cache.compartment('public-key').get('missing')).toBeUndefined();
  });
});
