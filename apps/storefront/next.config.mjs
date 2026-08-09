import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const basePath = process.env.NEXT_PUBLIC_AETHER_BASE_PATH?.replace(/\/$/, "") || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  basePath,
  images: {
    unoptimized: true
  },
  trailingSlash: true,
  turbopack: {
    root: workspaceRoot
  }
};

export default nextConfig;
