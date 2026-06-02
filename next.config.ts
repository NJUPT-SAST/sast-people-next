import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

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
};

export default withSentryConfig(nextConfig, {
  org: "sast-an",
  project: "sast-people",
  silent: true,
  telemetry: false,
  sourcemaps: {
    disable: true,
  },
});
