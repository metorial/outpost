export let PROTOCOL_VERSION = 1;

export let REGISTRATION_CONTEXT = 'metorial-outpost-registration-v1';
export let REQUEST_CONTEXT = 'metorial-outpost-request-v1';
export let INSTANCE_ID_CONTEXT = 'metorial-outpost-instance-id-v1';

export let OUTPOST_ID_HEADER = 'Metorial-Outpost-Id';
export let OUTPOST_SIGNATURE_HEADER = 'Metorial-Outpost-Signature';
export let OUTPOST_INSTANCE_TOKEN_HEADER = 'Metorial-Outpost-Instance-Token';

export let OUTPOST_SIGNATURE_HEADER_NAMES = [
  OUTPOST_ID_HEADER,
  OUTPOST_SIGNATURE_HEADER,
  OUTPOST_INSTANCE_TOKEN_HEADER
].map(name => name.toLowerCase());

export let DEFAULT_REQUIRED_SIGNED_HEADERS = [
  'authorization',
  'proxy-authorization',
  'content-type',
  'content-encoding'
];

export let DEFAULT_MAX_AGE_SECONDS = 300;
export let DEFAULT_MAX_FUTURE_SKEW_SECONDS = 15;
