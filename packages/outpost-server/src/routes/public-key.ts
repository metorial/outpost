import { base64url } from '@metorial-outpost/crypto';
import type { Context } from 'hono';
import type { AuthenticatedOutpostRequest } from '../authenticate';
import { OutpostServerError } from '../errors';
import type { OutpostRegistrationResolver } from '../resolver';

export type PublicKeyHandlerDeps = {
  resolver: OutpostRegistrationResolver;
};

export let publicKeyHandler = (deps: PublicKeyHandlerDeps) => async (c: Context) => {
  let outpostId = c.req.param('outpostId')!;
  let credentialId = c.req.param('credentialId')!;
  let requestedBy = c.get('outpostAuth') as AuthenticatedOutpostRequest | undefined;

  let credential = await deps.resolver.resolveEnrollmentCredential({
    outpostId,
    credentialId,
    requestedBy
  });

  if (credential.status == 'unknown')
    throw new OutpostServerError('unknown_outpost_credential');
  if (credential.status == 'revoked')
    throw new OutpostServerError('revoked_outpost_credential');
  if (credential.status == 'registration_disabled') {
    throw new OutpostServerError('registration_disabled');
  }

  return c.json({
    outpost_id: outpostId,
    credential_id: credentialId,
    public_key: base64url.encode(credential.publicKey)
  });
};
