import { describe, expect, it } from 'vitest';
import { base64url } from './base64url';

describe('base64url', () => {
  it('round-trips arbitrary bytes', () => {
    let bytes = crypto.getRandomValues(new Uint8Array(64));
    expect(base64url.decode(base64url.encode(bytes))).toEqual(bytes);
  });

  it('never emits padding', () => {
    for (let length = 0; length < 8; length++) {
      let bytes = new Uint8Array(length).fill(1);
      expect(base64url.encode(bytes)).not.toMatch(/=/);
    }
  });

  it('never emits + or /', () => {
    let bytes = new Uint8Array([251, 255, 190, 255]);
    let encoded = base64url.encode(bytes);
    expect(encoded).not.toMatch(/[+/]/);
  });

  it('matches a known vector', () => {
    let bytes = new TextEncoder().encode('hello world');
    expect(base64url.encode(bytes)).toBe('aGVsbG8gd29ybGQ');
    expect(base64url.decode('aGVsbG8gd29ybGQ')).toEqual(bytes);
  });

  it('decodes the empty string to zero bytes', () => {
    expect(base64url.decode('')).toEqual(new Uint8Array(0));
  });
});
