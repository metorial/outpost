let HOP_BY_HOP_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding'
]);

export let forwardableHeaders = (
  headers: Headers,
  extraDrop: string[] = []
): Record<string, string> => {
  let drop = new Set([...HOP_BY_HOP_HEADERS, ...extraDrop.map(h => h.toLowerCase())]);
  let record: Record<string, string> = {};
  headers.forEach((value, name) => {
    if (!drop.has(name.toLowerCase())) record[name] = value;
  });
  return record;
};

export let headersToRecord = (headers: Headers): Record<string, string> => {
  let record: Record<string, string> = {};
  headers.forEach((value, name) => (record[name.toLowerCase()] = value));
  return record;
};
