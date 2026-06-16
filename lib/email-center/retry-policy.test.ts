jest.mock("server-only", () => ({}));

import {
  getFailedDeliveryRetryState,
  getNextEmailRetryAt,
} from "@/lib/email-center/retry-policy";

const originalEnv = {
  EMAIL_RETRY_MAX_ATTEMPTS: process.env.EMAIL_RETRY_MAX_ATTEMPTS,
  EMAIL_RETRY_BASE_DELAY_SECONDS: process.env.EMAIL_RETRY_BASE_DELAY_SECONDS,
  EMAIL_RETRY_MAX_DELAY_SECONDS: process.env.EMAIL_RETRY_MAX_DELAY_SECONDS,
};

describe("email retry policy", () => {
  beforeEach(() => {
    process.env.EMAIL_RETRY_MAX_ATTEMPTS = "3";
    process.env.EMAIL_RETRY_BASE_DELAY_SECONDS = "10";
    process.env.EMAIL_RETRY_MAX_DELAY_SECONDS = "25";
  });

  afterAll(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("uses exponential backoff capped by max delay", () => {
    const now = new Date("2026-06-10T12:00:00.000Z");

    expect(getNextEmailRetryAt({ attemptCount: 1, now })).toEqual(
      new Date("2026-06-10T12:00:10.000Z"),
    );
    expect(getNextEmailRetryAt({ attemptCount: 3, now })).toEqual(
      new Date("2026-06-10T12:00:25.000Z"),
    );
  });

  it("dead-letters deliveries that reach the max attempt count", () => {
    const now = new Date("2026-06-10T12:00:00.000Z");

    expect(getFailedDeliveryRetryState({ attemptCount: 2, now })).toMatchObject({
      status: "failed",
      deadLetteredAt: null,
    });
    expect(getFailedDeliveryRetryState({ attemptCount: 3, now })).toEqual({
      status: "dead",
      nextRetryAt: null,
      deadLetteredAt: now,
    });
  });
});
