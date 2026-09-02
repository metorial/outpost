import { describe, expect, it } from 'vitest';
import { canonicalizeSignedHeaders, findMissingRequiredSignedHeaders } from './headers';

describe('canonicalizeSignedHeaders', () => {
  it('lowercases and sorts header names lexicographically', () => {
    let headers = { 'Content-Type': 'application/json', Authorization: 'Bearer abc' };

    let signed = canonicalizeSignedHeaders(headers, ['Authorization', 'Content-Type']);

    expect(signed).toEqual([
      { name: 'authorization', value: 'Bearer abc' },
      { name: 'content-type', value: 'application/json' }
    ]);
  });

  it('de-duplicates repeated header names', () => {
    let headers = { authorization: 'Bearer abc' };

    let signed = canonicalizeSignedHeaders(headers, [
      'authorization',
      'Authorization',
      'AUTHORIZATION'
    ]);

    expect(signed).toHaveLength(1);
  });

  it('skips headers that are not present', () => {
    let signed = canonicalizeSignedHeaders({ authorization: 'Bearer abc' }, [
      'authorization',
      'content-type'
    ]);
    expect(signed.map(h => h.name)).toEqual(['authorization']);
  });

  it('joins repeated header values but never combines names it was not asked to sign', () => {
    let headers = { 'x-forwarded-for': ['1.1.1.1', '2.2.2.2'] };
    let signed = canonicalizeSignedHeaders(headers, ['x-forwarded-for']);

    expect(signed).toEqual([{ name: 'x-forwarded-for', value: '1.1.1.1, 2.2.2.2' }]);
  });

  it('trims optional leading/trailing whitespace but preserves internal whitespace', () => {
    let headers = { authorization: '  Bearer  abc  ' };
    let signed = canonicalizeSignedHeaders(headers, ['authorization']);

    expect(signed[0]!.value).toBe('Bearer  abc');
  });

  it('rejects header values containing CR, LF, or NUL', () => {
    expect(() => canonicalizeSignedHeaders({ 'x-evil': 'a\r\nb' }, ['x-evil'])).toThrow();
    expect(() => canonicalizeSignedHeaders({ 'x-evil': 'a\0b' }, ['x-evil'])).toThrow();
  });
});

describe('findMissingRequiredSignedHeaders', () => {
  it('flags a required header that is present but not signed', () => {
    let missing = findMissingRequiredSignedHeaders(['authorization', 'x-custom'], []);
    expect(missing).toEqual(['authorization']);
  });

  it('does not flag required headers that were signed', () => {
    let missing = findMissingRequiredSignedHeaders(['authorization'], ['authorization']);
    expect(missing).toEqual([]);
  });

  it('does not flag headers that are not required', () => {
    let missing = findMissingRequiredSignedHeaders(['x-custom'], []);
    expect(missing).toEqual([]);
  });

  it('supports wildcard-style patterns via RegExp', () => {
    let missing = findMissingRequiredSignedHeaders(
      ['metorial-forwarded-authorization'],
      [],
      [/^metorial-forwarded-/]
    );

    expect(missing).toEqual(['metorial-forwarded-authorization']);
  });

  it('is case-insensitive', () => {
    let missing = findMissingRequiredSignedHeaders(['Authorization'], ['authorization']);
    expect(missing).toEqual([]);
  });
});
