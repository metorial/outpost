import { base64url } from '@metorial-outpost/crypto';
import { PROTOCOL_VERSION } from '@metorial-outpost/signature';
import { OutpostServerError } from './errors';
import type { RequestedService } from './service-types';

export type ChallengeRequestBody = {
  version: number;
  outpostId: string;
  credentialId: string;
  instanceId: string;
  instancePublicKey: Uint8Array;
  requestedServices: RequestedService[];
};

let asRecord = (body: unknown): Record<string, unknown> => {
  if (typeof body != 'object' || body === null) {
    throw new OutpostServerError('invalid_request', 'request body must be a JSON object');
  }
  return body as Record<string, unknown>;
};

let requireString = (body: Record<string, unknown>, key: string): string => {
  let value = body[key];
  if (typeof value != 'string' || value.length == 0) {
    throw new OutpostServerError('invalid_request', `missing or invalid "${key}"`);
  }
  return value;
};

let requireVersion = (body: Record<string, unknown>): number => {
  if (body.version !== PROTOCOL_VERSION) {
    throw new OutpostServerError('invalid_request', 'missing or unsupported "version"');
  }
  return body.version;
};

let parseRequestedServices = (body: Record<string, unknown>): RequestedService[] => {
  let value = body.services;
  if (value == null) return [];

  if (!Array.isArray(value)) {
    throw new OutpostServerError('invalid_request', '"services" must be an array');
  }

  let seen = new Set<string>();

  return value.map(rawEntry => {
    let entry = asRecord(rawEntry);
    let id = requireString(entry, 'id');

    if (seen.has(id)) {
      throw new OutpostServerError('invalid_request', `duplicate service "${id}"`);
    }
    seen.add(id);

    if (entry.version != null && typeof entry.version != 'string') {
      throw new OutpostServerError(
        'invalid_request',
        `service "${id}" has a non-string "version"`
      );
    }

    if (
      entry.capabilities != null &&
      (typeof entry.capabilities != 'object' || Array.isArray(entry.capabilities))
    ) {
      throw new OutpostServerError(
        'invalid_request',
        `service "${id}" has a non-object "capabilities"`
      );
    }

    return {
      id,
      version: (entry.version as string | undefined) ?? undefined,
      capabilities: (entry.capabilities as Record<string, unknown> | undefined) ?? undefined
    };
  });
};

export let parseChallengeRequestBody = (rawBody: unknown): ChallengeRequestBody => {
  let body = asRecord(rawBody);

  let version = requireVersion(body);
  let outpostId = requireString(body, 'outpost_id');
  let credentialId = requireString(body, 'credential_id');
  let instanceId = requireString(body, 'instance_id');
  let instancePublicKeyEncoded = requireString(body, 'instance_public_key');

  let instancePublicKey: Uint8Array;
  try {
    instancePublicKey = base64url.decode(instancePublicKeyEncoded);
  } catch {
    throw new OutpostServerError(
      'invalid_request',
      '"instance_public_key" is not valid base64url'
    );
  }
  if (instancePublicKey.length != 32) {
    throw new OutpostServerError(
      'invalid_request',
      '"instance_public_key" must be a 32-byte Ed25519 public key'
    );
  }

  return {
    version,
    outpostId,
    credentialId,
    instanceId,
    instancePublicKey,
    requestedServices: parseRequestedServices(body)
  };
};

export type RegisterRequestBody = {
  version: number;
  challengeId: string;
  signature: string;
  instanceSignature: string;
  credentialInstanceIdSignature: string;
};

export let parseRegisterRequestBody = (rawBody: unknown): RegisterRequestBody => {
  let body = asRecord(rawBody);

  let version = requireVersion(body);
  let challengeId = requireString(body, 'challenge_id');
  let signature = requireString(body, 'signature');
  let instanceSignature = requireString(body, 'instance_signature');
  let credentialInstanceIdSignature = requireString(body, 'credential_instance_id_signature');

  return { version, challengeId, signature, instanceSignature, credentialInstanceIdSignature };
};
