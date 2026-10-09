import path from "node:path";

// The build workspace keeps the repository shape: <root>/templates/interior-03/v1
// (this Next.js project) + <root>/platform + <root>/node_modules.
const workspaceRoot = path.resolve(import.meta.dirname, "../../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: { root: workspaceRoot },
  outputFileTracingRoot: workspaceRoot,
  // Deterministic build id: the site builder passes the buildInputId.
  generateBuildId: async () => process.env.RECON_BUILD_ID ?? "recon-dev",
};

export default nextConfig;
