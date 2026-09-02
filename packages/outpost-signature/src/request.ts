import {
  base64url,
  canonicalMessage,
  Ed25519,
  field,
  randomBytes,
  sha256,
  type CanonicalField
} from '@metorial-outpost/crypto';
import {
  assertCanonicalPath,
  assertCanonicalQuery,
  normalizeAuthority,
  normalizeScheme
} from './canonicalization';
import { normalizeOutpostChain, type OutpostChain } from './chain';
import { PROTOCOL_VERSION, REQUEST_CONTEXT } from './constants';
import type { SignedHeader } from './headers';
import type { OutpostProxyContext } from './metadata';
import { normalizeProxyContext } from './proxy-context';

export type RequestSignatureInput = {
  version?: number;
  outpostId: string;
  instanceId: string;
  timestamp: number;
  requestId: string;
  service: string;
  method: string;
  scheme: string;
  authority: string;
  path: string;
  query: string;
  signedHeaders: SignedHeader[];
  bodySha256: Uint8Array;
  outpostChain?: OutpostChain;
  proxyContext?: OutpostProxyContext;
};

export let buildRequestSignatureBase = (input: RequestSignatureInput): Uint8Array => {
  assertCanonicalPath(input.path);
  assertCanonicalQuery(input.query);

  let headerFields: CanonicalField[] = [];
  for (let header of input.signedHeaders) {
    headerFields.push(field.string('signed-header-name', header.name));
    headerFields.push(field.string('signed-header-value', header.value));
  }

  let outpostChain = normalizeOutpostChain(input.outpostChain);
  let chainFields: CanonicalField[] = outpostChain.flatMap(([outpostId, instanceId]) => [
    field.string('outpost-chain-id', outpostId),
    field.string('outpost-chain-instance-id', instanceId)
  ]);

  let proxyContext = normalizeProxyContext(input.proxyContext);
  let proxyContextFields: CanonicalField[] = proxyContext.flatMap(([key, value]) => [
    field.string('proxy-context-key', key),
    field.string('proxy-context-value', value)
  ]);

  return canonicalMessage(REQUEST_CONTEXT, [
    field.uint('version', input.version ?? PROTOCOL_VERSION),
    field.string('outpost-id', input.outpostId),
    field.string('instance-id', input.instanceId),
    field.uint('timestamp', input.timestamp),
    field.string('request-id', input.requestId),
    field.string('service', input.service),
    field.string('method', input.method.toUpperCase()),
    field.string('scheme', normalizeScheme(input.scheme)),
    field.string('authority', normalizeAuthority(input.authority)),
    field.string('path', input.path),
    field.string('query', input.query),
    field.uint('signed-header-count', input.signedHeaders.length),
    ...headerFields,
    field.bytes('body-sha256', input.bodySha256),
    field.uint('outpost-chain-count', outpostChain.length),
    ...chainFields,
    field.uint('proxy-context-count', proxyContext.length),
    ...proxyContextFields
  ]);
};

export let signRequest = async (
  privateKey: CryptoKey,
  input: RequestSignatureInput
): Promise<string> =>
  base64url.encode(await Ed25519.sign(privateKey, buildRequestSignatureBase(input)));

export let verifyRequestSignature = (
  publicKey: CryptoKey,
  input: RequestSignatureInput,
  signature: string
): Promise<boolean> =>
  Ed25519.verify(publicKey, base64url.decode(signature), buildRequestSignatureBase(input));

export let hashBody = (body: Uint8Array): Promise<Uint8Array> => sha256(body);

export let generateRequestId = (): string => `oprq_${base64url.encode(randomBytes(16))}`;
