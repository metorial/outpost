let REPLACEMENTS: Record<string, string> = { '+': '-', '/': '_' };

export let base64url = {
  encode: (bytes: Uint8Array): string => {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);

    return btoa(binary)
      .replace(/[+/]/g, char => REPLACEMENTS[char]!)
      .replace(/=+$/, '');
  },

  decode: (encoded: string): Uint8Array => {
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    let padding = (4 - (base64.length % 4)) % 4;
    let binary = atob(base64 + '='.repeat(padding));

    let bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    return bytes;
  }
};
