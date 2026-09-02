import { Ed25519, base64url, canonicalMessage, field } from '@metorial-outpost/crypto';
import { beforeAll, describe, expect, test } from 'vitest';
import { OutpostTokens } from './tokens';

describe('OutpostTokens', () => {
  let privateKey: CryptoKey;
  let publicKey: CryptoKey;
  let kid = 'mik_2026_01';
  let tokens: OutpostTokens;

  beforeAll(async () => {
    let pair = await Ed25519.generateKeyPair();
    privateKey = pair.privateKey;
    publicKey = pair.publicKey;

    tokens = new OutpostTokens({
      signing: { kid, privateKey: async () => privateKey, publicKey: async () => publicKey }
    });
  });

  test('should sign and verify tokens', async () => {
    let data = { foo: 'bar' };
    let type = 'test_token';
    let token = await tokens.sign({ type, data });
    let payload = new TextDecoder().decode(base64url.decode(token.split('.').at(-2)!));
    let result = await tokens.verify({ expectedType: type, token });
    expect(payload.startsWith('mtopt')).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.type).toBe(type);
    expect(result.data).toEqual(data);
  });

  test('should not verify tokens without the payload prefix', async () => {
    let type = 'test_token';
    let dataBase64url = base64url.encode(
      new TextEncoder().encode(JSON.stringify({ d: { foo: 'bar' }, c: Date.now(), k: kid }))
    );
    let tokenPrefix = `${type}.v1.${dataBase64url}`;
    let signature = base64url.encode(
      await Ed25519.sign(
        privateKey,
        canonicalMessage('metorial-outpost-token-v1', [field.string('token', tokenPrefix)])
      )
    );

    let token = `${tokenPrefix}.${signature}`;
    expect((await tokens.verify({ expectedType: type, token })).verified).toBe(false);
    expect(OutpostTokens.decode(token)).toBeNull();
  });

  test('should not verify tokens with wrong type', async () => {
    let data = { foo: 'bar' };
    let type = 'test_token';
    let token = await tokens.sign({ type, data });
    let result = await tokens.verify({ expectedType: 'wrong', token });
    expect(result.verified).toBe(false);
  });

  test('should not verify tokens with wrong version', async () => {
    let data = { foo: 'bar' };
    let type = 'test_token';
    let token = await tokens.sign({ type, data });
    let parts = token.split('.');
    parts[parts.length - 2 - 1] = 'wrong';
    let modifiedToken = parts.join('.');
    let result = await tokens.verify({ expectedType: type, token: modifiedToken });
    expect(result.verified).toBe(false);
  });

  test('should not verify tokens with wrong signature', async () => {
    let data = { foo: 'bar' };
    let type = 'test_token';
    let token = await tokens.sign({ type, data });
    let parts = token.split('.');
    parts[parts.length - 1] = 'wrong';
    let modifiedToken = parts.join('.');
    let result = await tokens.verify({ expectedType: type, token: modifiedToken });
    expect(result.verified).toBe(false);
  });

  test('should not verify tokens with too few parts', async () => {
    let data = { foo: 'bar' };
    let type = 'test_token';
    let token = await tokens.sign({ type, data });
    let parts = token.split('.');
    parts.pop();
    let modifiedToken = parts.join('.');
    let result = await tokens.verify({ expectedType: type, token: modifiedToken });
    expect(result.verified).toBe(false);
  });

  test('should not verify expired tokens', async () => {
    let data = { foo: 'bar' };
    let type = 'test_token';
    let token = await tokens.sign({
      type,
      data,
      expiresAt: new Date(Date.now() - 60_000)
    });
    let result = await tokens.verify({ expectedType: type, token });
    expect(result.verified).toBe(false);
  });

  test('tolerates a small clock skew past expiresAt', async () => {
    let data = { foo: 'bar' };
    let type = 'test_token';
    let token = await tokens.sign({
      type,
      data,
      expiresAt: new Date(Date.now() - 1000)
    });
    let result = await tokens.verify({ expectedType: type, token });
    expect(result.verified).toBe(true);
  });

  test('should not verify a token signed with a different key', async () => {
    let other = await Ed25519.generateKeyPair();
    let otherTokens = new OutpostTokens({
      signing: { kid: 'mik_other', privateKey: other.privateKey, publicKey: other.publicKey }
    });

    let token = await otherTokens.sign({ type: 'test_token', data: { foo: 'bar' } });
    let result = await tokens.verify({ expectedType: 'test_token', token });
    expect(result.verified).toBe(false);
  });

  test('should not verify a signature computed for a different canonical context', async () => {
    let type = 'test_token';
    let token = await tokens.sign({ type, data: { foo: 'bar' } });

    let parts = token.split('.');
    let tokenPrefix = parts.slice(0, -1).join('.');

    let foreignSignature = base64url.encode(
      await Ed25519.sign(
        privateKey,
        canonicalMessage('some-other-outpost-context-v1', [field.string('token', tokenPrefix)])
      )
    );

    let forgedToken = `${tokenPrefix}.${foreignSignature}`;
    let result = await tokens.verify({ expectedType: type, token: forgedToken });
    expect(result.verified).toBe(false);
  });

  test('decode returns the payload data without verifying the signature', async () => {
    let data = { foo: 'bar' };
    let token = await tokens.sign({ type: 'test_token', data });
    expect(OutpostTokens.decode(token)).toEqual(data);
  });

  describe('kid-based key resolution', () => {
    test('embeds the signing kid and round-trips it through verify', async () => {
      let token = await tokens.sign({ type: 'test_token', data: { foo: 'bar' } });
      let result = await tokens.verify({ expectedType: 'test_token', token });
      expect(result.verified).toBe(true);
    });

    test('rejects a token whose kid is unknown to the verifier', async () => {
      let other = await Ed25519.generateKeyPair();
      let otherTokens = new OutpostTokens({
        signing: {
          kid: 'mik_unknown',
          privateKey: other.privateKey,
          publicKey: other.publicKey
        }
      });
      let token = await otherTokens.sign({ type: 'test_token', data: { foo: 'bar' } });

      let verifier = new OutpostTokens({ verification: { [kid]: publicKey } });
      let result = await verifier.verify({ expectedType: 'test_token', token });
      expect(result.verified).toBe(false);
    });

    test('resolves the correct key by kid out of a multi-entry verification map', async () => {
      let other = await Ed25519.generateKeyPair();
      let otherKid = 'mik_2026_02';
      let otherTokens = new OutpostTokens({
        signing: { kid: otherKid, privateKey: other.privateKey, publicKey: other.publicKey }
      });

      let verifier = new OutpostTokens({
        verification: { [kid]: publicKey, [otherKid]: other.publicKey }
      });

      let tokenFromFirst = await tokens.sign({ type: 'test_token', data: { foo: 1 } });
      let tokenFromOther = await otherTokens.sign({ type: 'test_token', data: { foo: 2 } });

      expect(
        (await verifier.verify({ expectedType: 'test_token', token: tokenFromFirst })).verified
      ).toBe(true);
      expect(
        (await verifier.verify({ expectedType: 'test_token', token: tokenFromOther })).verified
      ).toBe(true);
    });

    test('a verify-only instance (no signing key) can verify a token from a separate signing-only instance', async () => {
      let signer = new OutpostTokens({
        signing: { kid, privateKey, publicKey }
      });
      let verifier = new OutpostTokens({
        verification: { resolve: async k => (k == kid ? publicKey : undefined) }
      });

      let token = await signer.sign({ type: 'test_token', data: { foo: 'bar' } });
      let result = await verifier.verify({ expectedType: 'test_token', token });
      expect(result.verified).toBe(true);

      await expect(verifier.sign({ type: 'test_token', data: {} })).rejects.toThrow();
    });

    test('throws when signing without a configured signing key', async () => {
      let verifyOnly = new OutpostTokens({ verification: { [kid]: publicKey } });
      await expect(verifyOnly.sign({ type: 'test_token', data: {} })).rejects.toThrow();
    });

    test('throws when verifying without any configured key material', async () => {
      let unconfigured = new OutpostTokens({});
      await expect(
        unconfigured.verify({ expectedType: 'test_token', token: 'a.v1.b.c' })
      ).rejects.toThrow();
    });
  });
});
