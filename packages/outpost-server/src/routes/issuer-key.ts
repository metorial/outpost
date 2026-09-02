import { base64url, Ed25519 } from '@metorial-outpost/crypto';
import type { OutpostTokens } from '@metorial-outpost/tokens';
import type { Context } from 'hono';
import { OutpostServerError } from '../errors';

export type IssuerKeyHandlerDeps = {
  tokens: OutpostTokens;
};

export let issuerKeyHandler = (deps: IssuerKeyHandlerDeps) => async (c: Context) => {
  let kid = c.req.param('kid')!;

  let publicKey = await deps.tokens.publicKeyFor(kid);
  if (!publicKey) throw new OutpostServerError('unknown_issuer_key');

  return c.json({
    kid,
    public_key: base64url.encode(await Ed25519.exportPublicKey(publicKey))
  });
};
