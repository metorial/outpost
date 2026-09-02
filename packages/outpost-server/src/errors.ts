export type OutpostErrorCode =
  | 'invalid_request'
  | 'invalid_challenge'
  | 'expired_challenge'
  | 'consumed_challenge'
  | 'invalid_registration_signature'
  | 'invalid_instance_signature'
  | 'invalid_credential_signature'
  | 'unknown_outpost_credential'
  | 'revoked_outpost_credential'
  | 'registration_disabled'
  | 'unknown_issuer_key'
  | 'missing_authentication'
  | 'malformed_signature_header'
  | 'unsupported_version'
  | 'invalid_instance_token'
  | 'outpost_mismatch'
  | 'outpost_disabled'
  | 'instance_disabled'
  | 'service_mismatch'
  | 'stale_request'
  | 'future_request'
  | 'missing_required_signed_header'
  | 'invalid_signature'
  | 'unknown_outpost'
  | 'insufficient_capabilities';

export let ERROR_STATUS: Record<OutpostErrorCode, number> = {
  invalid_request: 400,
  invalid_challenge: 400,
  expired_challenge: 400,
  consumed_challenge: 409,
  invalid_registration_signature: 401,
  invalid_instance_signature: 401,
  invalid_credential_signature: 401,
  unknown_outpost_credential: 404,
  revoked_outpost_credential: 403,
  registration_disabled: 403,
  unknown_issuer_key: 404,
  missing_authentication: 401,
  malformed_signature_header: 400,
  unsupported_version: 400,
  invalid_instance_token: 401,
  outpost_mismatch: 401,
  outpost_disabled: 403,
  instance_disabled: 403,
  service_mismatch: 403,
  stale_request: 401,
  future_request: 401,
  missing_required_signed_header: 400,
  invalid_signature: 401,
  unknown_outpost: 404,
  insufficient_capabilities: 403
};

export class OutpostServerError extends Error {
  readonly code: OutpostErrorCode;
  readonly status: number;

  constructor(code: OutpostErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
    this.status = ERROR_STATUS[code];
  }
}
