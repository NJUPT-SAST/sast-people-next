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

const sentryBuildPluginEnabled =
  process.env.SENTRY_BUILD_PLUGIN === "true" ||
  (process.env.CI === "true" && Boolean(process.env.SENTRY_AUTH_TOKEN));

const sentryBuildConfig = {
  org: "sast-an",
  project: "sast-people",
  silent: true,
  telemetry: false,
  sourcemaps: {
    disable: true,
  },
};

export default sentryBuildPluginEnabled
  ? withSentryConfig(nextConfig, sentryBuildConfig)
  : nextConfig;
