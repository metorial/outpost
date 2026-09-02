import { base64url, randomBytes } from '@metorial-outpost/crypto';
import { generateChallenge, PROTOCOL_VERSION } from '@metorial-outpost/signature';
import type { OutpostTokens } from '@metorial-outpost/tokens';
import type { Context } from 'hono';
import { verifyOutpostRequestIfPresent } from '../authenticate';
import type { ChallengeStore } from '../challenge-store';
import { OUTPOST_PROTOCOL_SERVICE } from '../constants';
import { OutpostServerError } from '../errors';
import type { OutpostRegistrationResolver } from '../resolver';
import { parseChallengeRequestBody } from '../schemas';

export type ChallengeHandlerDeps = {
  resolver: OutpostRegistrationResolver;
  store: ChallengeStore;
  tokens: OutpostTokens;
  challengeTtlMs: number;
};

let generateChallengeId = (): string => `och_${base64url.encode(randomBytes(16))}`;

let parseJsonBody = async (c: Context): Promise<unknown> =>
  c.req.json().catch(() => {
    throw new OutpostServerError('invalid_request', 'request body must be valid JSON');
  });

export let challengeHandler = (deps: ChallengeHandlerDeps) => async (c: Context) => {
  // Relayed through one or more nested Outposts (spec §59): reject a signature that doesn't
  // verify rather than silently ignoring it, same as `/register`. Nothing about the challenge
  // itself depends on the result -- this is purely relay authentication.
  await verifyOutpostRequestIfPresent(
    { tokens: deps.tokens, service: OUTPOST_PROTOCOL_SERVICE, resolver: deps.resolver },
    c
  );

  let body = parseChallengeRequestBody(await parseJsonBody(c));

  let credential = await deps.resolver.resolveEnrollmentCredential({
    outpostId: body.outpostId,
    credentialId: body.credentialId
  });

  if (credential.status == 'unknown')
    throw new OutpostServerError('unknown_outpost_credential');
  if (credential.status == 'revoked')
    throw new OutpostServerError('revoked_outpost_credential');
  if (credential.status == 'registration_disabled') {
    throw new OutpostServerError('registration_disabled');
  }

  let challengeId = generateChallengeId();
  let challenge = generateChallenge();
  let expiresAt = new Date(Date.now() + deps.challengeTtlMs);

  await deps.store.save({
    challengeId,
    challenge,
    outpostId: body.outpostId,
    credentialId: body.credentialId,
    instanceId: body.instanceId,
    instancePublicKey: body.instancePublicKey,
    requestedServices: body.requestedServices,
    expiresAt
  });

  return c.json({
    version: PROTOCOL_VERSION,
    challenge_id: challengeId,
    challenge: base64url.encode(challenge),
    outpost_id: body.outpostId,
    credential_id: body.credentialId,
    instance_id: body.instanceId,
    instance_public_key: base64url.encode(body.instancePublicKey),
    expires_at: Math.floor(expiresAt.getTime() / 1000)
  });
};
