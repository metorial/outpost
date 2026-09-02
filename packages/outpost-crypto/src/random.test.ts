import { describe, expect, it } from 'vitest';
import { randomBytes } from './random';

describe('randomBytes', () => {
  it('returns the requested length', () => {
    expect(randomBytes(32)).toHaveLength(32);
    expect(randomBytes(0)).toHaveLength(0);
  });

  it('is not deterministic', () => {
    expect(randomBytes(32)).not.toEqual(randomBytes(32));
  });
});
