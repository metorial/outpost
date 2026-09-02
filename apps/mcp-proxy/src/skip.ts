export class McpMiddlewareSkip extends Error {
  constructor(reason?: string) {
    super(reason ?? 'middleware skipped: message did not match');
    this.name = 'McpMiddlewareSkip';
  }
}
