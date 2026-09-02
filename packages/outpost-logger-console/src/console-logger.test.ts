import { describe, expect, it, vi } from 'vitest';
import { ConsoleLogger } from './console-logger';

let fakeConsole = () => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
});

describe('ConsoleLogger', () => {
  it('routes each level to the matching console method', () => {
    let console = fakeConsole();
    let logger = new ConsoleLogger({ level: 'trace', console });

    logger.trace('a');
    logger.debug('b');
    logger.info('c');
    logger.warn('d');
    logger.error('e');

    expect(console.trace).toHaveBeenCalledTimes(1);
    expect(console.debug).toHaveBeenCalledTimes(1);
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('includes fields as a second argument when present', () => {
    let console = fakeConsole();
    let logger = new ConsoleLogger({ console });

    logger.info('hello', { requestId: 'req_1' });

    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('hello'), {
      requestId: 'req_1'
    });
  });

  it('omits the second argument when there are no fields', () => {
    let console = fakeConsole();
    let logger = new ConsoleLogger({ console });

    logger.info('hello');

    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('hello'));
    expect(console.info).toHaveBeenCalledTimes(1);
    expect(console.info.mock.calls[0]).toHaveLength(1);
  });

  it('respects the configured level', () => {
    let console = fakeConsole();
    let logger = new ConsoleLogger({ level: 'error', console });

    logger.warn('should be dropped');
    logger.error('should log');

    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
