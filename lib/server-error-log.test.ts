jest.mock("server-only", () => ({}));
jest.mock("@sentry/nextjs", () => {
  const scope = {
    setTag: jest.fn(),
    setContext: jest.fn(),
    setUser: jest.fn(),
  };

  return {
    __mockScope: scope,
    withScope: jest.fn((callback: (currentScope: typeof scope) => void) =>
      callback(scope),
    ),
    captureException: jest.fn(),
  };
});

import { logServerError } from "./server-error-log";

type SentryMock = {
  __mockScope: {
    setTag: jest.Mock;
    setContext: jest.Mock;
    setUser: jest.Mock;
  };
  captureException: jest.Mock;
};

const sentryMock = jest.requireMock("@sentry/nextjs") as SentryMock;

describe("logServerError", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("removes direct and nested personal data before sending context to Sentry", () => {
    const error = new Error("request failed");

    logServerError("test:privacy", error, {
      path: "/dashboard",
      userId: 7,
      role: 3,
      studentId: "B2600001",
      metadata: {
        flowId: 4,
        email: "member@example.com",
        nested: {
          refreshToken: "secret-refresh-token",
          resourceId: 9,
        },
      },
    });

    expect(sentryMock.__mockScope.setContext).toHaveBeenCalledWith(
      "serverErrorLog",
      {
        path: "/dashboard",
        userId: 7,
        role: 3,
        metadata: {
          flowId: 4,
          nested: { resourceId: 9 },
        },
      },
    );
    expect(sentryMock.__mockScope.setUser).toHaveBeenCalledWith({ id: "7" });
    expect(sentryMock.captureException).toHaveBeenCalledWith(error);
  });
});
