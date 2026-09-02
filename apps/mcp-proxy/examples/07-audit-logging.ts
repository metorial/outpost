/**
 * Log every tool call, prompt get, and resource read crossing the
 * proxy, in both directions. Message contents remain unchanged.
 *
 * Run with:
 *   METORIAL_OUTPOST_CREDENTIAL=metorial_op_... \
 *   DATADOG_API_KEY=... \
 *   SPLUNK_HEC_ENDPOINT=https://splunk.example.com:8088 SPLUNK_HEC_TOKEN=... \
 *   bun run examples/07-audit-logging.ts
 */
import {
  getPromptName,
  getResourceUri,
  getToolName,
  isPromptGet,
  isResourceRead,
  isToolCall,
  mcpMiddleware,
  McpProxy
} from '@metorial/mcp-proxy';
import { MultiLogger } from '@metorial-outpost/logger';
import { ConsoleLogger } from '@metorial-outpost/logger-console';
import { DatadogLogger, SplunkLogger } from '@metorial-outpost/logger-http';

let datadogLogger = new DatadogLogger({
  apiKey: process.env.DATADOG_API_KEY!,
  service: 'mcp-proxy',
  hostname: 'mcp-proxy',
  ddsource: 'metorial-mcp-proxy'
});

let splunkLogger = new SplunkLogger({
  endpoint: process.env.SPLUNK_HEC_ENDPOINT!,
  token: process.env.SPLUNK_HEC_TOKEN!,
  sourcetype: 'mcp:proxy',
  source: 'metorial-mcp-proxy'
});

let logger = new MultiLogger([new ConsoleLogger(), datadogLogger, splunkLogger]);

let auditLog = mcpMiddleware({
  name: 'audit-log',
  handle: async (message, call, ctx) => {
    if (isToolCall(message)) {
      ctx.logger.info('audit: tool call', {
        connectionId: ctx.connectionId,
        direction: ctx.direction,
        tool: getToolName(message)
      });
    } else if (isPromptGet(message)) {
      ctx.logger.info('audit: prompt get', {
        connectionId: ctx.connectionId,
        direction: ctx.direction,
        prompt: getPromptName(message)
      });
    } else if (isResourceRead(message)) {
      ctx.logger.info('audit: resource read', {
        connectionId: ctx.connectionId,
        direction: ctx.direction,
        uri: getResourceUri(message)
      });
    }

    return call(message);
  }
});

async function main() {
  await McpProxy.create({
    outpostCredential: process.env.METORIAL_OUTPOST_CREDENTIAL!,
    baseUrl: 'https://mcp.example.com',
    proxy: { port: 8080 },
    logger,
    middleware: [auditLog]
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
