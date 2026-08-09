const encoder = new TextEncoder();

declare global {
  interface SubtleCrypto {
    timingSafeEqual(a: BufferSource, b: BufferSource): boolean;
  }
}

export async function timingSafeEqualText(provided: string, expected: string) {
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected))
  ]);

  return crypto.subtle.timingSafeEqual(providedHash, expectedHash);
}
