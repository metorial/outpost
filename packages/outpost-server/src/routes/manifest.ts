import type { Context } from 'hono';
import type { AuthenticatedOutpostRequest } from '../authenticate';
import { OutpostServerError } from '../errors';
import type { OutpostRegistrationResolver } from '../resolver';

export type ManifestHandlerDeps = {
  resolver: OutpostRegistrationResolver;
};

export let manifestHandler = (deps: ManifestHandlerDeps) => async (c: Context) => {
  let outpostId = c.req.param('outpostId')!;
  let requestedBy = c.get('outpostAuth') as AuthenticatedOutpostRequest | undefined;

  let resolved = await deps.resolver.resolveManifest({ outpostId, requestedBy });
  if (resolved.status == 'unknown') throw new OutpostServerError('unknown_outpost');

  return c.json(resolved.manifest);
};
