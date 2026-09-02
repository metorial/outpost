import { base64url, Ed25519 } from '@metorial-outpost/crypto';
import {
  verifyInstanceIdSignature,
  verifyRegistrationSignature
} from '@metorial-outpost/signature';
import type { OutpostTokens } from '@metorial-outpost/tokens';
import type { Context } from 'hono';
import { verifyOutpostRequestIfPresent } from '../authenticate';
import type { ChallengeStore, StoredChallenge } from '../challenge-store';
import { INSTANCE_TOKEN_TYPE, OUTPOST_PROTOCOL_SERVICE } from '../constants';
import { OutpostServerError } from '../errors';
import type { OutpostRegistrationResolver } from '../resolver';
import { parseRegisterRequestBody } from '../schemas';
import { grantedServiceIds } from '../service-types';

export type RegisterHandlerDeps = {
  resolver: OutpostRegistrationResolver;
  store: ChallengeStore;
  tokens: OutpostTokens;
  signer?: (input: {
    outpostId: string;
    credentialId: string;
    instanceId: string;
  }) => Promise<OutpostTokens>;
  instanceTokenExpiresAt?: (challenge: StoredChallenge) => Date | undefined;
};

let parseJsonBody = async (c: Context): Promise<unknown> =>
  c.req.json().catch(() => {
    throw new OutpostServerError('invalid_request', 'request body must be valid JSON');
  });

let resolveRegistrationIp = async (
  c: Context,
  deps: Pick<RegisterHandlerDeps, 'tokens' | 'resolver'>
): Promise<string | undefined> => {
  let authed = await verifyOutpostRequestIfPresent(
    { tokens: deps.tokens, service: OUTPOST_PROTOCOL_SERVICE, resolver: deps.resolver },
    c
  );

  return authed?.proxyContext?.ip;
};

export let registerHandler = (deps: RegisterHandlerDeps) => async (c: Context) => {
  let ip = await resolveRegistrationIp(c, deps);
  let body = parseRegisterRequestBody(await parseJsonBody(c));

  let consumed = await deps.store.consume(body.challengeId);
  if (consumed.status == 'not_found') throw new OutpostServerError('invalid_challenge');
  if (consumed.status == 'expired') throw new OutpostServerError('expired_challenge');
  if (consumed.status == 'already_consumed')
    throw new OutpostServerError('consumed_challenge');

  let challenge = consumed.challenge;

  let credential = await deps.resolver.resolveEnrollmentCredential({
    outpostId: challenge.outpostId,
    credentialId: challenge.credentialId
  });

  if (credential.status == 'unknown')
    throw new OutpostServerError('unknown_outpost_credential');
  if (credential.status == 'revoked')
    throw new OutpostServerError('revoked_outpost_credential');
  if (credential.status == 'registration_disabled') {
    throw new OutpostServerError('registration_disabled');
  }

  let signatureInput = {
    challengeId: challenge.challengeId,
    challenge: challenge.challenge,
    outpostId: challenge.outpostId,
    credentialId: challenge.credentialId,
    instanceId: challenge.instanceId,
    instancePublicKey: challenge.instancePublicKey
  };

  let enrollmentPublicKey = await Ed25519.importPublicKey(credential.publicKey);
  let verified = await verifyRegistrationSignature(
    enrollmentPublicKey,
    signatureInput,
    body.signature
  );
  if (!verified) throw new OutpostServerError('invalid_registration_signature');

  let instancePublicKey = await Ed25519.importPublicKey(challenge.instancePublicKey);
  let instanceVerified = await verifyRegistrationSignature(
    instancePublicKey,
    signatureInput,
    body.instanceSignature
  );
  if (!instanceVerified) throw new OutpostServerError('invalid_instance_signature');

  let credentialInstanceIdVerified = await verifyInstanceIdSignature(
    enrollmentPublicKey,
    {
      outpostId: challenge.outpostId,
      credentialId: challenge.credentialId,
      instanceId: challenge.instanceId
    },
    body.credentialInstanceIdSignature
  );
  if (!credentialInstanceIdVerified) {
    throw new OutpostServerError('invalid_credential_signature');
  }

  let registration = await deps.resolver.onInstanceRegistered({
    outpostId: challenge.outpostId,
    credentialId: challenge.credentialId,
    instanceId: challenge.instanceId,
    instancePublicKey: challenge.instancePublicKey,
    requestedServices: challenge.requestedServices,
    context: ip ? { ip } : undefined
  });

  let expiresAt =
    registration.instanceTokenExpiresAt ?? deps.instanceTokenExpiresAt?.(challenge);

  let tokens =
    (await deps.signer?.({
      outpostId: challenge.outpostId,
      credentialId: challenge.credentialId,
      instanceId: challenge.instanceId
    })) ?? deps.tokens;

  let instanceToken = await tokens.sign({
    type: INSTANCE_TOKEN_TYPE,
    data: {
      outpost_id: challenge.outpostId,
      instance_id: challenge.instanceId,
      credential_id: challenge.credentialId,
      instance_public_key: base64url.encode(challenge.instancePublicKey),
      credential_instance_id_signature: body.credentialInstanceIdSignature,
      services: grantedServiceIds(registration.services)
    },
    expiresAt
  });

  return c.json({
    instance_token: instanceToken,
    services: registration.services,
    ...(expiresAt ? { expires_at: Math.floor(expiresAt.getTime() / 1000) } : {})
  });
};
