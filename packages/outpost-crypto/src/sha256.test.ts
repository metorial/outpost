import { describe, expect, it } from 'vitest';
import { base64url } from './base64url';
import { sha256 } from './sha256';

let toHex = (bytes: Uint8Array) =>
  Array.from(bytes)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');

describe('sha256', () => {
  it('matches the known digest of the empty byte sequence', async () => {
    let digest = await sha256(new Uint8Array(0));
    expect(toHex(digest)).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('matches the known digest of "abc"', async () => {
    let digest = await sha256(new TextEncoder().encode('abc'));
    expect(toHex(digest)).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });

  it('produces 32 bytes', async () => {
    let digest = await sha256(new TextEncoder().encode('metorial'));
    expect(digest).toHaveLength(32);
  });

  it('is stable and encodable', async () => {
    let digest = await sha256(new TextEncoder().encode('outpost'));
    expect(base64url.decode(base64url.encode(digest))).toEqual(digest);
  });
});
