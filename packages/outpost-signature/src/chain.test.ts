import { describe, expect, it } from 'vitest';
import { appendToOutpostChain, normalizeOutpostChain } from './chain';

describe('normalizeOutpostChain', () => {
  it('defaults to an empty array', () => {
    expect(normalizeOutpostChain()).toEqual([]);
  });

  it('deduplicates while preserving the original (request-flow) order', () => {
    expect(
      normalizeOutpostChain([
        ['otp_b', 'oti_b1'],
        ['otp_a', 'oti_a1'],
        ['otp_b', 'oti_b2']
      ])
    ).toEqual([
      ['otp_b', 'oti_b1'],
      ['otp_a', 'oti_a1']
    ]);
  });
});

describe('appendToOutpostChain', () => {
  it('adds an Outpost and Instance ID tuple to an empty chain', () => {
    expect(appendToOutpostChain(undefined, 'otp_a', 'oti_a')).toEqual([['otp_a', 'oti_a']]);
  });

  it('appends after the existing chain and deduplicates', () => {
    expect(
      appendToOutpostChain(
        [
          ['otp_c', 'oti_c'],
          ['otp_a', 'oti_a']
        ],
        'otp_b',
        'oti_b'
      )
    ).toEqual([
      ['otp_c', 'oti_c'],
      ['otp_a', 'oti_a'],
      ['otp_b', 'oti_b']
    ]);
    expect(
      appendToOutpostChain([['otp_a', 'oti_original']], 'otp_a', 'oti_duplicate')
    ).toEqual([['otp_a', 'oti_original']]);
  });
});
