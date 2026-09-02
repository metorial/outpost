import { base64url, canonicalMessage, Ed25519, field } from '@metorial-outpost/crypto';
import { EXPIRY_SKEW_MS, PROTOCOL_VERSION, TOKEN_CONTEXT } from './constants';

export type OutpostTokenKey = CryptoKey | (() => Promise<CryptoKey> | CryptoKey);

export type OutpostTokenSigningKey = {
  kid: string;
  privateKey: OutpostTokenKey;
  publicKey: OutpostTokenKey;
};

export type OutpostTokenVerificationKeys =
  | Record<string, OutpostTokenKey>
  | { resolve: (kid: string) => Promise<OutpostTokenKey | undefined> };

export type OutpostTokensOptions = {
  signing?: OutpostTokenSigningKey;
  verification?: OutpostTokenVerificationKeys;
};

let memo = <T>(fn: () => Promise<T> | T): (() => Promise<T>) => {
  let cached: Promise<T> | undefined;
  return () => (cached ??= Promise.resolve(fn()));
};

let resolveKey = (key: OutpostTokenKey): Promise<CryptoKey> | CryptoKey =>
  typeof key == 'function' ? key() : key;

let encoder = new TextEncoder();
let decoder = new TextDecoder();
let TOKEN_PAYLOAD_PREFIX = 'mtopt';

let decodeTokenPayload = (dataBase64url: string) => {
  let payload = decoder.decode(base64url.decode(dataBase64url));
  if (!payload.startsWith(TOKEN_PAYLOAD_PREFIX))
    throw new Error('Invalid token payload prefix');

  return JSON.parse(payload.slice(TOKEN_PAYLOAD_PREFIX.length));
};

let tokenSignatureBase = (tokenPrefix: string): Uint8Array =>
  canonicalMessage(TOKEN_CONTEXT, [field.string('token', tokenPrefix)]);

export class OutpostTokens {
  private getSigningKey: (() => Promise<CryptoKey>) | undefined;
  private resolveVerificationKey: (kid: string) => Promise<CryptoKey | undefined>;

  constructor(private options: OutpostTokensOptions) {
    this.getSigningKey = options.signing
      ? memo(() => resolveKey(options.signing!.privateKey))
      : undefined;

    let verification =
      options.verification ??
      (options.signing ? { [options.signing.kid]: options.signing.publicKey } : undefined);

    if (!verification) {
      this.resolveVerificationKey = async () => undefined;
    } else if (typeof (verification as { resolve?: unknown }).resolve == 'function') {
      let resolve = (
        verification as { resolve: (kid: string) => Promise<OutpostTokenKey | undefined> }
      ).resolve;
      this.resolveVerificationKey = async kid => {
        let key = await resolve(kid);
        return key ? resolveKey(key) : undefined;
      };
    } else {
      let keys = verification as Record<string, OutpostTokenKey>;
      let memoized = new Map<string, () => Promise<CryptoKey>>();
      this.resolveVerificationKey = async kid => {
        let key = keys[kid];
        if (!key) return undefined;

        let getKey = memoized.get(kid);
        if (!getKey) {
          getKey = memo(() => resolveKey(key));
          memoized.set(kid, getKey);
        }

        return getKey();
      };
    }
  }

  async publicKeyFor(kid: string): Promise<CryptoKey | undefined> {
    return this.resolveVerificationKey(kid);
  }

  async sign({ type, data, expiresAt }: { type: string; data: any; expiresAt?: Date }) {
    if (!this.options.signing || !this.getSigningKey) {
      throw new Error('OutpostTokens.sign: no signing key configured');
    }

    let dataBase64url = base64url.encode(
      encoder.encode(
        TOKEN_PAYLOAD_PREFIX +
          JSON.stringify({
            d: data,
            e: expiresAt?.getTime(),
            c: Date.now(),
            k: this.options.signing.kid
          })
      )
    );

    let tokenPrefix = `${type}.v${PROTOCOL_VERSION}.${dataBase64url}`;

    let privateKey = await this.getSigningKey();
    let signature = base64url.encode(
      await Ed25519.sign(privateKey, tokenSignatureBase(tokenPrefix))
    );

    return `${tokenPrefix}.${signature}`;
  }

  async verify({ token, expectedType }: { expectedType: string; token: string }) {
    if (!this.options.signing && !this.options.verification) {
      throw new Error('OutpostTokens.verify: no verification key(s) configured');
    }

    let parts = token.split('.');
    if (parts.length < 4) return { verified: false as const };

    let signature = parts.pop()!;
    let dataBase64url = parts.pop()!;
    let version = parts.pop()!;
    let type = parts.join('.');
    if (type != expectedType) return { verified: false as const };

    if (version != `v${PROTOCOL_VERSION}`) return { verified: false as const };

    let tokenPrefix = `${type}.${version}.${dataBase64url}`;

    try {
      let data = decodeTokenPayload(dataBase64url);

      let publicKey = await this.resolveVerificationKey(data.k);
      if (!publicKey) return { verified: false as const };

      let verified = await Ed25519.verify(
        publicKey,
        base64url.decode(signature),
        tokenSignatureBase(tokenPrefix)
      );
      if (!verified) return { verified: false as const };

      let expiresAt = data.e ? new Date(data.e) : null;
      if (expiresAt && expiresAt.getTime() + EXPIRY_SKEW_MS < Date.now()) {
        return { verified: false as const };
      }

      let createdAt = new Date(data.c);

      return {
        verified: true as const,

        type,
        expiresAt,
        createdAt,
        data: data.d
      };
    } catch {
      return { verified: false as const };
    }
  }

  static decode(token: string) {
    let parts = token.split('.');
    if (parts.length < 4) return null;

    try {
      let dataBase64url = parts[parts.length - 2]!;
      return decodeTokenPayload(dataBase64url).d;
    } catch {
      return null;
    }
  }
}
