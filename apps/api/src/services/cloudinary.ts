import type { Env } from "../types";

// Cloudinary's signed-upload algorithm: sort every param that will be sent
// to the upload API (except file/api_key/signature themselves) alphabetically
// by key, join as "key=value&key=value", append the api_secret directly (no
// separator), then SHA-1 hex-encode the result. Cloudinary recomputes this
// same string server-side and rejects the upload if it doesn't match - the
// secret itself never has to leave this Worker.
// https://cloudinary.com/documentation/authentication_signatures
export async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type CloudinaryUploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  folder: string;
  signature: string;
};

export async function createUploadSignature(env: Env): Promise<CloudinaryUploadSignature | null> {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    return null;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const folder = "aether/products";
  const paramsToSign = `folder=${folder}&timestamp=${timestamp}`;
  const signature = await sha1Hex(`${paramsToSign}${env.CLOUDINARY_API_SECRET}`);

  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    folder,
    signature
  };
}
