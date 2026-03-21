import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
const isTauriBuild = !!process.env.TAURI_BUILD;
const internalHost = process.env.TAURI_DEV_HOST || "localhost";

const nextConfig: NextConfig = {
  // Web mode: standalone for Docker deployment; Tauri mode: static export for desktop builds
  output: isTauriBuild ? "export" : "standalone",
  images: {
    unoptimized: true,
  },
  // Tauri dev needs assetPrefix to resolve assets from the dev server
  assetPrefix: isTauriBuild && !isProd ? `http://${internalHost}:3000` : undefined,
  // Server actions only work in non-export mode
  ...(isTauriBuild
    ? {}
    : {
        experimental: {
          serverActions: {
            allowedOrigins: ["*.sast.fun", "127.0.0.1", "localhost"],
          },
        },
      }),
};

export default nextConfig;
