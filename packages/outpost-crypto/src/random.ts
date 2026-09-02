export let randomBytes = (length: number): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(length));
