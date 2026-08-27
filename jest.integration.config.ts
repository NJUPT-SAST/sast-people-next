import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  dir: "./",
});

const config: Config = {
  clearMocks: true,
  maxWorkers: 1,
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
  },
  modulePathIgnorePatterns: [
    "<rootDir>/.next/",
    "<rootDir>/.worktrees/",
    "<rootDir>/tmp/",
  ],
  testEnvironment: "node",
  testMatch: ["<rootDir>/integration/**/*.integration.test.ts"],
  testTimeout: 30_000,
};

export default createJestConfig(config);
