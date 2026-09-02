import { base64url, Ed25519, randomBytes } from '@metorial-outpost/crypto';
import { noopLogger, type Logger } from '@metorial-outpost/logger';
import {
  PROTOCOL_VERSION,
  signInstanceId,
  signRegistration
} from '@metorial-outpost/signature';
import type { DeclaredService, GrantedService, InstanceCredentials } from './types';

export let generateInstanceId = (): string => `oti_${base64url.encode(randomBytes(16))}`;

type ChallengeResponseBody = {
  challenge_id: string;
  challenge: string;
  expires_at?: number;
};

type RegisterResponseBody = {
  instance_token: string;
  expires_at?: number;
  services?: unknown;
};

export type RegisterInstanceOptions = {
  endpoint: string;
  outpostId: string;
  credentialId: string;
  enrollmentPrivateKey: CryptoKey;
  instanceId?: string;
  instanceKeyPair?: { privateKey: CryptoKey; publicKey: CryptoKey };
  /** Services this instance runs, declared as part of the registration handshake. */
  services?: DeclaredService[];
  fetch?: typeof fetch;
  logger?: Logger;
};

let parseGrantedServices = (raw: unknown): GrantedService[] => {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap(entry => {
    if (typeof entry != 'object' || entry === null) return [];
    let { id, granted } = entry as { id?: unknown; granted?: unknown };
    if (typeof id != 'string') return [];

    return [{ id, granted: granted === true }];
  });
};

let joinUrl = (endpoint: string, path: string): string =>
  `${endpoint.replace(/\/+$/, '')}${path}`;

let postJson = async (
  fetchImpl: typeof fetch,
  url: string,
  body: unknown,
  logger: Logger
): Promise<unknown> => {
  let response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    let text = await response.text().catch(() => '');
    logger.error('outpost-registration: request failed', { url, status: response.status });
    throw new Error(
      `Outpost registration request to ${url} failed with status ${response.status}: ${text}`
    );
  }

  return response.json();
};

export let registerInstance = async (
  opts: RegisterInstanceOptions
): Promise<InstanceCredentials> => {
  let fetchImpl = opts.fetch ?? fetch;
  let logger = opts.logger ?? noopLogger;

  let instanceId = opts.instanceId ?? generateInstanceId();
  let instanceKeyPair = opts.instanceKeyPair ?? (await Ed25519.generateKeyPair());
  let instancePublicKeyBytes = await Ed25519.exportPublicKey(instanceKeyPair.publicKey);
  let instancePublicKey = base64url.encode(instancePublicKeyBytes);

  logger.debug('outpost-registration: requesting challenge', {
    outpostId: opts.outpostId,
    instanceId
  });

  let challengeResponse = (await postJson(
    fetchImpl,
    joinUrl(opts.endpoint, '/outpost/register/challenge'),
    {
      version: PROTOCOL_VERSION,
      outpost_id: opts.outpostId,
      credential_id: opts.credentialId,
      instance_id: instanceId,
      instance_public_key: instancePublicKey,
      services: (opts.services ?? []).map(service => ({
        id: service.id,
        ...(service.version === undefined ? {} : { version: service.version }),
        ...(service.capabilities === undefined ? {} : { capabilities: service.capabilities })
      }))
    },
    logger
  )) as ChallengeResponseBody;

  if (
    typeof challengeResponse?.challenge_id != 'string' ||
    typeof challengeResponse?.challenge != 'string'
  ) {
    logger.error('outpost-registration: challenge response missing required fields', {
      outpostId: opts.outpostId,
      instanceId
    });
    throw new Error('Outpost registration challenge response is missing required fields');
  }

  let signatureInput = {
    challengeId: challengeResponse.challenge_id,
    challenge: base64url.decode(challengeResponse.challenge),
    outpostId: opts.outpostId,
    credentialId: opts.credentialId,
    instanceId,
    instancePublicKey: instancePublicKeyBytes
  };

  let signature = await signRegistration(opts.enrollmentPrivateKey, signatureInput);
  let instanceSignature = await signRegistration(instanceKeyPair.privateKey, signatureInput);

  let credentialInstanceIdSignature = await signInstanceId(opts.enrollmentPrivateKey, {
    outpostId: opts.outpostId,
    credentialId: opts.credentialId,
    instanceId
  });

  logger.debug('outpost-registration: submitting registration signature', {
    outpostId: opts.outpostId,
    instanceId
  });

  let registerResponse = (await postJson(
    fetchImpl,
    joinUrl(opts.endpoint, '/outpost/register'),
    {
      version: PROTOCOL_VERSION,
      challenge_id: challengeResponse.challenge_id,
      signature,
      instance_signature: instanceSignature,
      credential_instance_id_signature: credentialInstanceIdSignature
    },
    logger
  )) as RegisterResponseBody;

  if (typeof registerResponse?.instance_token != 'string') {
    logger.error('outpost-registration: register response missing instance_token', {
      outpostId: opts.outpostId,
      instanceId
    });
    throw new Error('Outpost registration response is missing "instance_token"');
  }

  let instancePrivateKey = base64url.encode(
    await Ed25519.exportPrivateKey(instanceKeyPair.privateKey)
  );

  let instanceTokenExpiresAt =
    typeof registerResponse.expires_at == 'number' ? registerResponse.expires_at * 1000 : null;

  let services = parseGrantedServices(registerResponse.services);

  logger.info('outpost-registration: instance token issued', {
    outpostId: opts.outpostId,
    instanceId,
    expiresAt: instanceTokenExpiresAt,
    grantedServices: services.filter(service => service.granted).map(service => service.id)
  });

  return {
    instanceId,
    instancePrivateKey,
    instancePublicKey,
    instanceToken: registerResponse.instance_token,
    instanceTokenExpiresAt,
    services
  };
};
