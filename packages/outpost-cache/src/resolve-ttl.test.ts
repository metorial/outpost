import { describe, expect, it } from 'vitest';
import { resolveTtl } from './resolve-ttl';

describe('resolveTtl', () => {
  it('prefers the explicit ttlMs over the default', () => {
    expect(resolveTtl(1_000, 60_000)).toBe(1_000);
  });

  it('falls back to defaultTtlMs when ttlMs is omitted', () => {
    expect(resolveTtl(undefined, 60_000)).toBe(60_000);
  });

  it('throws when neither ttlMs nor defaultTtlMs is available', () => {
    expect(() => resolveTtl(undefined, undefined)).toThrow(/ttlMs is required/);
  });

  it('rejects a zero or negative ttl', () => {
    expect(() => resolveTtl(0, undefined)).toThrow(/positive number/);
    expect(() => resolveTtl(-1, undefined)).toThrow(/positive number/);
  });

  it('rejects a non-finite ttl', () => {
    expect(() => resolveTtl(Infinity, undefined)).toThrow(/positive number/);
    expect(() => resolveTtl(NaN, undefined)).toThrow(/positive number/);
  });
});
