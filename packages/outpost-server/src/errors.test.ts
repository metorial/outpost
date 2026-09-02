import { describe, expect, it } from 'vitest';
import { ERROR_STATUS, OutpostServerError } from './errors';

describe('OutpostServerError', () => {
  it('carries the status mapped for its code', () => {
    let error = new OutpostServerError('revoked_outpost_credential');
    expect(error.code).toBe('revoked_outpost_credential');
    expect(error.status).toBe(ERROR_STATUS.revoked_outpost_credential);
    expect(error.message).toBe('revoked_outpost_credential');
  });

  it('accepts a custom message without changing the status', () => {
    let error = new OutpostServerError('invalid_request', 'missing "outpost_id"');
    expect(error.message).toBe('missing "outpost_id"');
    expect(error.status).toBe(400);
  });

  it('maps every error code to a distinct, sensible HTTP status', () => {
    expect(ERROR_STATUS.consumed_challenge).toBe(409);
    expect(ERROR_STATUS.invalid_registration_signature).toBe(401);
    expect(ERROR_STATUS.unknown_outpost_credential).toBe(404);
  });
});
