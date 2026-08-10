import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const basePath = process.env.NEXT_PUBLIC_AETHER_BASE_PATH?.replace(/\/$/, "") || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath,
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "aether-storefront.pickofwow.workers.dev" },
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "http", hostname: "localhost" }
    ]
  },
  trailingSlash: true,
  turbopack: {
    root: workspaceRoot
  }
};

export default nextConfig;
