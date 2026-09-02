import { SeverityNumber, type Logger as OtelApiLogger } from '@opentelemetry/api-logs';
import { describe, expect, it, vi } from 'vitest';
import { OtelLogger } from './otel-logger';

let fakeOtelLogger = (): OtelApiLogger =>
  ({
    emit: vi.fn()
  }) as unknown as OtelApiLogger;

describe('OtelLogger', () => {
  it('maps level, message, timestamp and fields onto a LogRecord', () => {
    let otelLogger = fakeOtelLogger();
    let logger = new OtelLogger({ level: 'trace', otelLogger });

    logger.warn('something happened', { requestId: 'req_1' });

    expect(otelLogger.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        severityNumber: SeverityNumber.WARN,
        severityText: 'WARN',
        body: 'something happened',
        attributes: { requestId: 'req_1' }
      })
    );
  });

  it('respects the configured level before emitting', () => {
    let otelLogger = fakeOtelLogger();
    let logger = new OtelLogger({ level: 'error', otelLogger });

    logger.info('dropped');
    logger.error('kept');

    expect(otelLogger.emit).toHaveBeenCalledTimes(1);
  });

  it('propagates child() bindings into attributes', () => {
    let otelLogger = fakeOtelLogger();
    let logger = new OtelLogger({ level: 'trace', otelLogger }).child({ scope: 'sign' });

    logger.debug('signed');

    expect(otelLogger.emit).toHaveBeenCalledWith(
      expect.objectContaining({ attributes: { scope: 'sign' } })
    );
  });
});
