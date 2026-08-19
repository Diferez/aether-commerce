const AES_GCM_IV_BYTES = 12;

async function deriveAesKey(passphrase: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(passphrase));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Encrypts a plaintext secret at rest. Ciphertext is IV || AES-GCM(payload), base64-encoded. */
export async function encryptSecret(passphrase: string, plaintext: string): Promise<string> {
  const key = await deriveAesKey(passphrase);
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext))
  );
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return toBase64(combined);
}

/** Decrypts a value produced by encryptSecret. Throws if the passphrase or ciphertext is wrong/corrupt. */
export async function decryptSecret(passphrase: string, encoded: string): Promise<string> {
  const key = await deriveAesKey(passphrase);
  const combined = fromBase64(encoded);
  const iv = combined.slice(0, AES_GCM_IV_BYTES);
  const ciphertext = combined.slice(AES_GCM_IV_BYTES);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}
