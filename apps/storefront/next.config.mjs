import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const basePath = process.env.NEXT_PUBLIC_AETHER_BASE_PATH?.replace(/\/$/, "") || "";
const e2eClerkStub = process.env.AETHER_E2E_STUB_CLERK === "true";

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
  },
  webpack(config) {
    if (e2eClerkStub) {
      config.resolve.alias["@clerk/react"] = resolve(dirname(fileURLToPath(import.meta.url)), "e2e/clerk.tsx");
    }
    return config;
  }
};

export default nextConfig;
