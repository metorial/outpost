import { describe, expect, it } from 'vitest';
import { isTimestampFresh } from './timestamp';

describe('isTimestampFresh', () => {
  it('accepts a timestamp equal to now', () => {
    expect(isTimestampFresh(1000, { now: 1000 })).toBe(true);
  });

  it('accepts a timestamp within the max age', () => {
    expect(isTimestampFresh(1000 - 300, { now: 1000, maxAgeSeconds: 300 })).toBe(true);
  });

  it('rejects a timestamp older than the max age', () => {
    expect(isTimestampFresh(1000 - 301, { now: 1000, maxAgeSeconds: 300 })).toBe(false);
  });

  it('accepts a timestamp within the future skew allowance', () => {
    expect(isTimestampFresh(1000 + 15, { now: 1000, maxFutureSkewSeconds: 15 })).toBe(true);
  });

  it('rejects a timestamp beyond the future skew allowance', () => {
    expect(isTimestampFresh(1000 + 16, { now: 1000, maxFutureSkewSeconds: 15 })).toBe(false);
  });

  it('defaults to the spec-recommended 300s / 15s window', () => {
    let now = 1_000_000;
    expect(isTimestampFresh(now - 300, { now })).toBe(true);
    expect(isTimestampFresh(now - 301, { now })).toBe(false);
    expect(isTimestampFresh(now + 15, { now })).toBe(true);
    expect(isTimestampFresh(now + 16, { now })).toBe(false);
  });
});
