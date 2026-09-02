export type Ed25519KeyPair = {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
};

export let Ed25519 = {
  generateKeyPair: async (): Promise<Ed25519KeyPair> => {
    let keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
      'sign',
      'verify'
    ])) as CryptoKeyPair;

    return { publicKey: keyPair.publicKey, privateKey: keyPair.privateKey };
  },

  exportPublicKey: async (key: CryptoKey): Promise<Uint8Array> =>
    new Uint8Array(await crypto.subtle.exportKey('raw', key)),

  exportPrivateKey: async (key: CryptoKey): Promise<Uint8Array> =>
    new Uint8Array(await crypto.subtle.exportKey('pkcs8', key)),

  importPublicKey: (raw: Uint8Array): Promise<CryptoKey> =>
    crypto.subtle.importKey('raw', raw as BufferSource, { name: 'Ed25519' }, true, ['verify']),

  importPrivateKey: (pkcs8: Uint8Array): Promise<CryptoKey> =>
    crypto.subtle.importKey('pkcs8', pkcs8 as BufferSource, { name: 'Ed25519' }, true, [
      'sign'
    ]),

  sign: async (privateKey: CryptoKey, data: Uint8Array): Promise<Uint8Array> =>
    new Uint8Array(await crypto.subtle.sign('Ed25519', privateKey, data as BufferSource)),

  verify: (publicKey: CryptoKey, signature: Uint8Array, data: Uint8Array): Promise<boolean> =>
    crypto.subtle.verify('Ed25519', publicKey, signature as BufferSource, data as BufferSource)
};
