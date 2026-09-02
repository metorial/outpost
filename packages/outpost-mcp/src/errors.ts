import type { JSONRPCMessage, RequestId } from '@modelcontextprotocol/sdk/types.js';

export let OUTPOST_ERROR_CODE = {
  middleware: -32050,
  upstream: -32051,
  protocol: -32052
} as const;

export type OutpostErrorReason =
  | 'exception'
  | 'timeout'
  | 'contract_violation'
  | 'unreachable'
  | 'bad_status'
  | 'unparseable_response'
  | 'no_terminal_reply';

let errorIdCounter = 0;

export let generateErrorId = (): string => {
  errorIdCounter = (errorIdCounter + 1) % 1_000_000;
  return `oer_${Date.now().toString(36)}${errorIdCounter.toString(36).padStart(4, '0')}`;
};

let REASON_TEXT: Record<OutpostErrorReason, string> = {
  exception: 'it threw an error',
  timeout: 'it did not complete in time',
  contract_violation:
    'it violated the middleware contract (no reply was ever produced for a request)',
  unreachable: 'the outpost could not reach the upstream Metorial connection API',
  bad_status: 'the upstream Metorial connection API returned an unexpected status',
  unparseable_response: 'the upstream response could not be parsed as MCP protocol messages',
  no_terminal_reply: 'the upstream response stream ended without a reply for this request'
};

export type OutpostErrorSource = 'middleware' | 'upstream' | 'protocol';

export type BuildOutpostErrorReplyInput = {
  id: RequestId;
  source: OutpostErrorSource;
  reason: OutpostErrorReason;
  middleware?: string;
  connectionId: string;
  direction: 'to_server' | 'from_server';
  cause?: unknown;
};

export let buildOutpostErrorReply = (
  input: BuildOutpostErrorReplyInput
): { message: JSONRPCMessage; errorId: string } => {
  let errorId = generateErrorId();
  let code = OUTPOST_ERROR_CODE[input.source];
  let attribution =
    'This failure occurred inside the Metorial Outpost running in your own infrastructure -- ' +
    'not in the Metorial platform or the connected MCP server.';

  let subject =
    input.source === 'middleware' && input.middleware
      ? `Middleware "${input.middleware}" failed while processing this request`
      : input.source === 'upstream'
        ? 'The Outpost failed to forward this request upstream'
        : 'The Outpost could not process the upstream response for this request';

  let message: JSONRPCMessage = {
    jsonrpc: '2.0',
    id: input.id,
    error: {
      code,
      message: `Metorial Outpost: ${subject} because ${REASON_TEXT[input.reason]}. ${attribution} Reference: ${errorId}.`,
      data: {
        source: `metorial_outpost.${input.source}`,
        reason: input.reason,
        middleware: input.middleware,
        connectionId: input.connectionId,
        direction: input.direction,
        errorId
      }
    }
  } as JSONRPCMessage;

  return { message, errorId };
};

export let serializeErrorForLog = (error: unknown): Record<string, unknown> => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: error };
};

export class MiddlewareContractError extends Error {
  constructor(readonly middlewareNameValue: string) {
    super(`Middleware "${middlewareNameValue}" returned no reply for a request`);
    this.name = 'MiddlewareContractError';
  }
}

export class MiddlewareTimeoutError extends Error {
  constructor(
    readonly middlewareNameValue: string,
    timeoutMs: number
  ) {
    super(`Middleware "${middlewareNameValue}" did not complete within ${timeoutMs}ms`);
    this.name = 'MiddlewareTimeoutError';
  }
}
