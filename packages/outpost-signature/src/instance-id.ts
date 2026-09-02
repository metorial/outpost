import { base64url, canonicalMessage, Ed25519, field } from '@metorial-outpost/crypto';
import { INSTANCE_ID_CONTEXT, PROTOCOL_VERSION } from './constants';

export type InstanceIdSignatureInput = {
  version?: number;
  outpostId: string;
  credentialId: string;
  instanceId: string;
};

export let buildInstanceIdSignatureBase = (input: InstanceIdSignatureInput): Uint8Array =>
  canonicalMessage(INSTANCE_ID_CONTEXT, [
    field.uint('version', input.version ?? PROTOCOL_VERSION),
    field.string('outpost-id', input.outpostId),
    field.string('credential-id', input.credentialId),
    field.string('instance-id', input.instanceId)
  ]);

export let signInstanceId = async (
  privateKey: CryptoKey,
  input: InstanceIdSignatureInput
): Promise<string> =>
  base64url.encode(await Ed25519.sign(privateKey, buildInstanceIdSignatureBase(input)));

export let verifyInstanceIdSignature = (
  publicKey: CryptoKey,
  input: InstanceIdSignatureInput,
  signature: string
): Promise<boolean> =>
  Ed25519.verify(publicKey, base64url.decode(signature), buildInstanceIdSignatureBase(input));
