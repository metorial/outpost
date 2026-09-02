import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

export let SSE_CONTENT_TYPE = 'text/event-stream';

export type SseFrame = {
  raw: string;
  id?: string;
  event?: string;
  data: string;
};

export let parseSseStream = async function* (
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<SseFrame> {
  let reader = stream.getReader();
  let decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      let { value, done } = await reader.read();
      if (done) break;

      buffer += normalizeLineEndings(decoder.decode(value, { stream: true }));

      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        let raw = buffer.slice(0, boundary + 2);
        buffer = buffer.slice(boundary + 2);
        let frame = parseFrame(raw);
        if (frame) yield frame;
      }
    }

    buffer += normalizeLineEndings(decoder.decode());
    let trailing = buffer.trim();
    if (trailing.length > 0) {
      let frame = parseFrame(trailing + '\n\n');
      if (frame) yield frame;
    }
  } finally {
    reader.releaseLock();
  }
};

let normalizeLineEndings = (text: string): string => text.replace(/\r\n|\r/g, '\n');

let parseFrame = (raw: string): SseFrame | null => {
  let lines = raw.split('\n');
  let id: string | undefined;
  let event: string | undefined;
  let dataLines: string[] = [];
  let sawField = false;

  for (let line of lines) {
    if (line === '') continue;
    if (line.startsWith(':')) continue;

    let colonIndex = line.indexOf(':');
    let field = colonIndex === -1 ? line : line.slice(0, colonIndex);
    let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1).replace(/^ /, '');

    if (field === 'id') {
      id = value;
      sawField = true;
    } else if (field === 'event') {
      event = value;
      sawField = true;
    } else if (field === 'data') {
      dataLines.push(value);
      sawField = true;
    }
  }

  if (!sawField) return null;

  return { raw, id, event, data: dataLines.join('\n') };
};

export type FormatSseFrameOptions = {
  id?: string;
  event?: string;
};

export let formatSseFrame = (
  message: JSONRPCMessage,
  options: FormatSseFrameOptions = {}
): string => {
  let lines: string[] = [];
  if (options.event) lines.push(`event: ${options.event}`);
  if (options.id !== undefined) lines.push(`id: ${options.id}`);
  lines.push(`data: ${JSON.stringify(message)}`);
  return lines.join('\n') + '\n\n';
};
