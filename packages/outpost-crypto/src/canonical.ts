let MAGIC = 'metorial-canonical-v1';
let FIELD_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

let encoder = new TextEncoder();
let decoder = new TextDecoder();

export type CanonicalFieldType = 'string' | 'bytes' | 'uint';

export type CanonicalField =
  | { name: string; type: 'string'; value: string }
  | { name: string; type: 'bytes'; value: Uint8Array }
  | { name: string; type: 'uint'; value: number | bigint };

export type DecodedCanonicalField = {
  name: string;
  type: CanonicalFieldType;
  value: Uint8Array;
};

let TYPE_BYTE: Record<CanonicalFieldType, number> = { string: 0x01, bytes: 0x02, uint: 0x03 };
let TYPE_NAME: Record<number, CanonicalFieldType> = {
  0x01: 'string',
  0x02: 'bytes',
  0x03: 'uint'
};

export let field = {
  string: (name: string, value: string): CanonicalField => ({ name, type: 'string', value }),
  bytes: (name: string, value: Uint8Array): CanonicalField => ({ name, type: 'bytes', value }),
  uint: (name: string, value: number | bigint): CanonicalField => ({
    name,
    type: 'uint',
    value
  })
};

export let canonicalContext = (context: string): CanonicalField =>
  field.string('context', context);

let assertFieldName = (name: string) => {
  if (!FIELD_NAME_PATTERN.test(name)) {
    throw new Error(`Invalid canonical field name: ${name}`);
  }
};

let encodeFieldValue = (fieldToEncode: CanonicalField): Uint8Array => {
  if (fieldToEncode.type == 'string') return encoder.encode(fieldToEncode.value);
  if (fieldToEncode.type == 'bytes') return fieldToEncode.value;

  let value = fieldToEncode.value;
  if (value < 0) {
    throw new Error(`Canonical field "${fieldToEncode.name}" must be a non-negative integer`);
  }

  return encoder.encode(value.toString(10));
};

let writeUint32BE = (value: number): Uint8Array => {
  let bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
};

let concatBytes = (chunks: Uint8Array[]): Uint8Array => {
  let totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  let out = new Uint8Array(totalLength);

  let offset = 0;
  for (let chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  return out;
};

export let encodeCanonical = (fields: CanonicalField[]): Uint8Array => {
  let chunks: Uint8Array[] = [];

  let magicBytes = encoder.encode(MAGIC);
  chunks.push(writeUint32BE(magicBytes.length), magicBytes);
  chunks.push(writeUint32BE(fields.length));

  for (let currentField of fields) {
    assertFieldName(currentField.name);

    let nameBytes = encoder.encode(currentField.name);
    let valueBytes = encodeFieldValue(currentField);

    chunks.push(writeUint32BE(nameBytes.length), nameBytes);
    chunks.push(new Uint8Array([TYPE_BYTE[currentField.type]]));
    chunks.push(writeUint32BE(valueBytes.length), valueBytes);
  }

  return concatBytes(chunks);
};

export let canonicalMessage = (context: string, fields: CanonicalField[]): Uint8Array =>
  encodeCanonical([canonicalContext(context), ...fields]);

export let decodeCanonical = (
  bytes: Uint8Array
): { magic: string; fields: DecodedCanonicalField[] } => {
  let view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  let readUint32 = () => {
    let value = view.getUint32(offset, false);
    offset += 4;
    return value;
  };

  let readBytes = (length: number) => {
    let slice = bytes.subarray(offset, offset + length);
    offset += length;
    return slice;
  };

  let magicLength = readUint32();
  let magic = decoder.decode(readBytes(magicLength));
  if (magic != MAGIC) throw new Error(`Invalid canonical magic value: ${magic}`);

  let fieldCount = readUint32();
  let fields: DecodedCanonicalField[] = [];

  for (let i = 0; i < fieldCount; i++) {
    let nameLength = readUint32();
    let name = decoder.decode(readBytes(nameLength));

    let typeByte = bytes[offset]!;
    offset += 1;

    let type = TYPE_NAME[typeByte];
    if (!type) throw new Error(`Unknown canonical field type ${typeByte} for field "${name}"`);

    let valueLength = readUint32();
    let value = readBytes(valueLength);

    fields.push({ name, type, value });
  }

  return { magic, fields };
};
