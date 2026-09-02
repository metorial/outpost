import { describe, expect, it } from 'vitest';
import { formatSseFrame, parseSseStream } from './sse';

let streamFromChunks = (chunks: string[]): ReadableStream<Uint8Array> => {
  let encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i]!));
      i++;
    }
  });
};

let collect = async (stream: ReadableStream<Uint8Array>) => {
  let frames = [];
  for await (let frame of parseSseStream(stream)) frames.push(frame);
  return frames;
};

describe('parseSseStream', () => {
  it('parses a single complete frame', async () => {
    let frames = await collect(streamFromChunks(['data: {"a":1}\n\n']));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.data).toBe('{"a":1}');
    expect(frames[0]!.id).toBeUndefined();
  });

  it('parses id and event fields', async () => {
    let frames = await collect(
      streamFromChunks(['id: 42\nevent: message\ndata: {"a":1}\n\n'])
    );
    expect(frames[0]).toMatchObject({ id: '42', event: 'message', data: '{"a":1}' });
  });

  it('parses multiple frames in one chunk', async () => {
    let frames = await collect(streamFromChunks(['data: {"a":1}\n\ndata: {"a":2}\n\n']));
    expect(frames.map(f => f.data)).toEqual(['{"a":1}', '{"a":2}']);
  });

  it('reassembles a frame split across arbitrary chunk boundaries', async () => {
    let full = 'id: 1\ndata: {"hello":"world"}\n\n';
    for (let splitAt = 1; splitAt < full.length; splitAt++) {
      let frames = await collect(
        streamFromChunks([full.slice(0, splitAt), full.slice(splitAt)])
      );
      expect(frames, `split at ${splitAt}`).toHaveLength(1);
      expect(frames[0]!.data).toBe('{"hello":"world"}');
    }
  });

  it('reassembles a frame split byte by byte', async () => {
    let full = 'id: 1\ndata: {"hello":"world"}\n\n';
    let frames = await collect(streamFromChunks(full.split('')));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.data).toBe('{"hello":"world"}');
  });

  it('joins multiple data lines with \\n per the SSE spec', async () => {
    let frames = await collect(streamFromChunks(['data: line1\ndata: line2\n\n']));
    expect(frames[0]!.data).toBe('line1\nline2');
  });

  it('ignores comment lines', async () => {
    let frames = await collect(streamFromChunks([': keep-alive\ndata: {"a":1}\n\n']));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.data).toBe('{"a":1}');
  });

  it('handles CRLF line endings', async () => {
    let frames = await collect(streamFromChunks(['id: 1\r\ndata: {"a":1}\r\n\r\n']));
    expect(frames[0]).toMatchObject({ id: '1', data: '{"a":1}' });
  });

  it('picks up a final frame with no trailing blank line', async () => {
    let frames = await collect(streamFromChunks(['data: {"a":1}\n']));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.data).toBe('{"a":1}');
  });

  it('preserves the raw bytes of a frame verbatim, including unmodeled fields', async () => {
    let raw = 'retry: 5000\nid: 1\nevent: custom\ndata: {"a":1}\n\n';
    let frames = await collect(streamFromChunks([raw]));
    expect(frames[0]!.raw).toBe(raw);
  });

  it('produces no frames for an empty stream', async () => {
    let frames = await collect(streamFromChunks([]));
    expect(frames).toEqual([]);
  });
});

describe('formatSseFrame', () => {
  it('formats a message with no id as just a data line', () => {
    expect(formatSseFrame({ jsonrpc: '2.0', id: 1, result: {} } as any)).toBe(
      'data: {"jsonrpc":"2.0","id":1,"result":{}}\n\n'
    );
  });

  it('includes an id line when given', () => {
    expect(formatSseFrame({ jsonrpc: '2.0', id: 1, result: {} } as any, { id: 'evt-1' })).toBe(
      'id: evt-1\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n'
    );
  });

  it('round-trips through parseSseStream', async () => {
    let message = { jsonrpc: '2.0', id: 7, result: { ok: true } } as any;
    let frame = formatSseFrame(message, { id: 'evt-7' });
    let frames = await collect(streamFromChunks([frame]));
    expect(frames).toHaveLength(1);
    expect(JSON.parse(frames[0]!.data)).toEqual(message);
    expect(frames[0]!.id).toBe('evt-7');
  });
});
