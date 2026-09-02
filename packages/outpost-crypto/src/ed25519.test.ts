import { describe, expect, it } from 'vitest';
import { Ed25519 } from './ed25519';

let encode = (data: string) => new TextEncoder().encode(data);

describe('Ed25519', () => {
  it('signs and verifies data with a generated key pair', async () => {
    let { publicKey, privateKey } = await Ed25519.generateKeyPair();
    let data = encode('metorial-outpost-request-v1');

    let signature = await Ed25519.sign(privateKey, data);

    expect(await Ed25519.verify(publicKey, signature, data)).toBe(true);
  });

  it('rejects a signature over different data', async () => {
    let { publicKey, privateKey } = await Ed25519.generateKeyPair();

    let signature = await Ed25519.sign(privateKey, encode('original'));

    expect(await Ed25519.verify(publicKey, signature, encode('tampered'))).toBe(false);
  });

  it('rejects a signature verified with the wrong public key', async () => {
    let a = await Ed25519.generateKeyPair();
    let b = await Ed25519.generateKeyPair();
    let data = encode('outpost');

    let signature = await Ed25519.sign(a.privateKey, data);

    expect(await Ed25519.verify(b.publicKey, signature, data)).toBe(false);
  });

  it('round-trips exported and re-imported keys', async () => {
    let { publicKey, privateKey } = await Ed25519.generateKeyPair();
    let data = encode('round-trip');

    let rawPublicKey = await Ed25519.exportPublicKey(publicKey);
    let pkcs8PrivateKey = await Ed25519.exportPrivateKey(privateKey);

    expect(rawPublicKey).toHaveLength(32);

    let importedPublicKey = await Ed25519.importPublicKey(rawPublicKey);
    let importedPrivateKey = await Ed25519.importPrivateKey(pkcs8PrivateKey);

    let signature = await Ed25519.sign(importedPrivateKey, data);
    expect(await Ed25519.verify(importedPublicKey, signature, data)).toBe(true);
  });
});
