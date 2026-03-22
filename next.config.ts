import type { NextConfig } from "next";
import path from "path";

const isMock = process.env.NEXT_PUBLIC_MOCK === "true";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    unoptimized: true,
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["*.sast.fun", "127.0.0.1", "localhost"],
    },
  },
  // Mock mode: replace db, dal, session, and event modules with in-memory mocks
  ...(isMock
    ? {
        // Turbopack resolve aliases (Next.js 16 default bundler)
        turbopack: {
          resolveAlias: {
            "@/db/drizzle": "./mock/drizzle-mock.ts",
            "@/lib/dal": "./mock/dal-mock.ts",
            "@/lib/session": "./mock/session-mock.ts",
            "@/event": "./mock/event-mock.ts",
          },
        },
        // Webpack resolve aliases (fallback when using --webpack flag)
        webpack: (config) => {
          config.resolve = config.resolve || {};
          config.resolve.alias = {
            ...config.resolve.alias,
            "@/db/drizzle": path.resolve(__dirname, "mock/drizzle-mock.ts"),
            "@/lib/dal": path.resolve(__dirname, "mock/dal-mock.ts"),
            "@/lib/session": path.resolve(__dirname, "mock/session-mock.ts"),
            "@/event": path.resolve(__dirname, "mock/event-mock.ts"),
          };
          return config;
        },
      }
    : {}),
};

export default nextConfig;
