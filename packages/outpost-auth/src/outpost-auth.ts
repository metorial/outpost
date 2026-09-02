import {
  decodeCredentialEnvelope,
  type OutpostCredential,
  type OutpostCredentialEnvelope
} from '@metorial-outpost/credential-envelope';
import { base64url, Ed25519 } from '@metorial-outpost/crypto';
import { noopLogger, type Logger } from '@metorial-outpost/logger';
import {
  canonicalizeSignedHeaders,
  encodeSignatureHeader,
  generateRequestId,
  hashBody,
  OUTPOST_ID_HEADER,
  OUTPOST_INSTANCE_TOKEN_HEADER,
  OUTPOST_SIGNATURE_HEADER,
  OUTPOST_SIGNATURE_HEADER_NAMES,
  PROTOCOL_VERSION,
  signRequest,
  type HeaderMap,
  type OutpostChain,
  type OutpostProxyContext,
  type OutpostSignatureMetadata,
  type RequestSignatureInput
} from '@metorial-outpost/signature';
import type { InstanceCredentialStore } from './credential-store';
import { registerInstance } from './registration';
import { MemoryInstanceCredentialStore } from './stores/memory';
import type { DeclaredService, InstanceCredentials, OutpostAuthSnapshot } from './types';

export type SignRequestInput = {
  method: string;
  url: string;
  service?: string;
  headers?: HeaderMap;
  body?: Uint8Array | string;
  proxyContext?: OutpostProxyContext;
  outpostChain?: OutpostChain;
};

export type OutpostAuthOptions = {
  credential: OutpostCredentialEnvelope;
  store?: InstanceCredentialStore;
  defaultService?: string;
  services?: DeclaredService[];
  fetch?: typeof fetch;
  logger?: Logger;
  upstreamUrl?: string;
};

let encoder = new TextEncoder();

let INSTANCE_TOKEN_REFRESH_BUFFER_MS = 60_000;

export class OutpostAuth {
  private credential: OutpostCredential;
  private store: InstanceCredentialStore;
  private defaultService: string | undefined;
  private declaredServices: DeclaredService[];
  private fetchImpl: typeof fetch;
  private logger: Logger;

  readonly upstreamUrl: string | undefined;

  private registeredCredentials: InstanceCredentials | null = null;
  private registrationPromise: Promise<InstanceCredentials> | null = null;
  private refreshPromise: Promise<InstanceCredentials> | null = null;
  private instancePrivateKeyCache: { encoded: string; key: CryptoKey } | null = null;

  constructor(opts: OutpostAuthOptions) {
    this.credential = decodeCredentialEnvelope(opts.credential);
    this.store = opts.store ?? new MemoryInstanceCredentialStore();
    this.defaultService = opts.defaultService;
    this.declaredServices = opts.services ?? [];
    this.fetchImpl = opts.fetch ?? fetch;
    this.logger = opts.logger ?? noopLogger;
    this.upstreamUrl = opts.upstreamUrl;
  }

  get endpoint(): string {
    return this.upstreamUrl ?? this.credential.endpoint;
  }

  getSnapshot(): OutpostAuthSnapshot {
    return {
      outpostId: this.credential.outpost_id,
      credentialId: this.credential.credential_id,
      endpoint: this.endpoint,
      instanceId: this.registeredCredentials?.instanceId,
      registered: this.registeredCredentials != null,
      tokenExpiresAt: this.registeredCredentials?.instanceTokenExpiresAt ?? null
    };
  }

  async ensureRegistered(opts?: {
    services?: DeclaredService[];
  }): Promise<InstanceCredentials> {
    if (opts?.services) this.declaredServices = opts.services;

    if (this.registeredCredentials) return this.ensureActive(this.registeredCredentials);

    this.registrationPromise ??= this.loadOrRegister().catch(err => {
      this.registrationPromise = null;
      throw err;
    });

    let credentials = await this.registrationPromise;
    this.registeredCredentials = credentials;

    return this.ensureActive(credentials);
  }

  private async ensureActive(credentials: InstanceCredentials): Promise<InstanceCredentials> {
    let expiresAt = credentials.instanceTokenExpiresAt;
    if (expiresAt == null) return credentials;

    let now = Date.now();

    if (now >= expiresAt) {
      this.logger.warn(
        'outpost-auth: instance token expired, blocking signatures until refreshed',
        {
          outpostId: this.credential.outpost_id,
          instanceId: credentials.instanceId,
          expiredForMs: now - expiresAt
        }
      );
      return this.refresh(credentials);
    }

    if (now >= expiresAt - INSTANCE_TOKEN_REFRESH_BUFFER_MS) {
      this.logger.debug(
        'outpost-auth: instance token nearing expiry, refreshing in background',
        {
          outpostId: this.credential.outpost_id,
          instanceId: credentials.instanceId,
          msUntilExpiry: expiresAt - now
        }
      );

      this.refresh(credentials).catch(() => {});
    }

    return credentials;
  }

  private refresh(staleCredentials: InstanceCredentials): Promise<InstanceCredentials> {
    this.refreshPromise ??= this.performRefresh(staleCredentials)
      .then(credentials => {
        this.registeredCredentials = credentials;
        return credentials;
      })
      .catch(err => {
        this.logger.error('outpost-auth: failed to refresh instance token', {
          outpostId: this.credential.outpost_id,
          instanceId: staleCredentials.instanceId,
          error: err instanceof Error ? err.message : String(err)
        });
        throw err;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  private async performRefresh(
    staleCredentials: InstanceCredentials
  ): Promise<InstanceCredentials> {
    this.logger.info('outpost-auth: refreshing instance token', {
      outpostId: this.credential.outpost_id,
      instanceId: staleCredentials.instanceId
    });

    let enrollmentPrivateKey = await Ed25519.importPrivateKey(
      base64url.decode(this.credential.private_key)
    );
    let instancePrivateKey = await this.getInstancePrivateKey(staleCredentials);
    let instancePublicKey = await Ed25519.importPublicKey(
      base64url.decode(staleCredentials.instancePublicKey)
    );

    let credentials = await registerInstance({
      endpoint: this.endpoint,
      outpostId: this.credential.outpost_id,
      credentialId: this.credential.credential_id,
      enrollmentPrivateKey,
      instanceId: staleCredentials.instanceId,
      instanceKeyPair: { privateKey: instancePrivateKey, publicKey: instancePublicKey },
      services: this.declaredServices,
      fetch: this.fetchImpl,
      logger: this.logger
    });

    this.logger.info('outpost-auth: instance token refreshed', {
      outpostId: this.credential.outpost_id,
      instanceId: credentials.instanceId,
      expiresAt: credentials.instanceTokenExpiresAt
    });

    await this.store.save(credentials);
    return credentials;
  }

  private async loadOrRegister(): Promise<InstanceCredentials> {
    let existing = await this.store.load();
    if (existing) {
      this.logger.debug('outpost-auth: loaded persisted instance credential', {
        outpostId: this.credential.outpost_id,
        instanceId: existing.instanceId
      });
      return existing;
    }

    let enrollmentPrivateKey = await Ed25519.importPrivateKey(
      base64url.decode(this.credential.private_key)
    );

    let credentials = await registerInstance({
      endpoint: this.endpoint,
      outpostId: this.credential.outpost_id,
      credentialId: this.credential.credential_id,
      enrollmentPrivateKey,
      services: this.declaredServices,
      fetch: this.fetchImpl,
      logger: this.logger
    });

    this.logger.info('outpost-auth: registered new instance', {
      outpostId: this.credential.outpost_id,
      instanceId: credentials.instanceId
    });

    await this.store.save(credentials);
    return credentials;
  }

  private async getInstancePrivateKey(credentials: InstanceCredentials): Promise<CryptoKey> {
    if (this.instancePrivateKeyCache?.encoded == credentials.instancePrivateKey) {
      return this.instancePrivateKeyCache.key;
    }

    let key = await Ed25519.importPrivateKey(base64url.decode(credentials.instancePrivateKey));
    this.instancePrivateKeyCache = { encoded: credentials.instancePrivateKey, key };
    return key;
  }

  async sign(input: SignRequestInput): Promise<Record<string, string>> {
    let service = input.service ?? this.defaultService;
    if (!service) {
      this.logger.error(
        'outpost-auth: sign() called without a "service" and no default is configured'
      );
      throw new Error('OutpostAuth.sign: no "service" was given and no default is configured');
    }

    let credentials = await this.ensureRegistered();
    let instancePrivateKey = await this.getInstancePrivateKey(credentials);

    let url = new URL(input.url);
    let headers = Object.fromEntries(
      Object.entries(input.headers ?? {}).filter(
        ([name]) => !OUTPOST_SIGNATURE_HEADER_NAMES.includes(name.toLowerCase())
      )
    );
    let signedHeaders = canonicalizeSignedHeaders(headers, Object.keys(headers));

    let bodyBytes =
      typeof input.body == 'string'
        ? encoder.encode(input.body)
        : (input.body ?? new Uint8Array(0));

    let timestamp = Math.floor(Date.now() / 1000);
    let requestId = generateRequestId();

    let signatureInput: RequestSignatureInput = {
      outpostId: this.credential.outpost_id,
      instanceId: credentials.instanceId,
      timestamp,
      requestId,
      service,
      method: input.method,
      scheme: url.protocol.replace(/:$/, ''),
      authority: url.host,
      path: url.pathname,
      query: url.search.replace(/^\?/, ''),
      signedHeaders,
      bodySha256: await hashBody(bodyBytes),
      proxyContext: input.proxyContext,
      outpostChain: input.outpostChain
    };

    let signature = await signRequest(instancePrivateKey, signatureInput);

    this.logger.debug('outpost-auth: signed request', {
      outpostId: this.credential.outpost_id,
      instanceId: credentials.instanceId,
      service,
      method: input.method,
      path: url.pathname,
      requestId
    });

    let metadata: OutpostSignatureMetadata = {
      version: PROTOCOL_VERSION,
      outpost_id: this.credential.outpost_id,
      timestamp,
      request_id: requestId,
      service,
      signed_headers: signedHeaders.map(header => header.name),
      signature,
      proxy_context: input.proxyContext,
      outpost_chain: input.outpostChain
    };

    return {
      [OUTPOST_ID_HEADER]: this.credential.outpost_id,
      [OUTPOST_INSTANCE_TOKEN_HEADER]: credentials.instanceToken,
      [OUTPOST_SIGNATURE_HEADER]: encodeSignatureHeader(metadata)
    };
  }
}
