import { render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";

import ErrorBoundary from "./error";

jest.mock("@sentry/nextjs", () => ({
  captureException: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe("app error boundary", () => {
  it("shows recovery navigation without an ineffective retry action", () => {
    mockUseRouter.mockReturnValue({
      bfcacheId: "0",
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
      push: jest.fn(),
      replace: jest.fn(),
      prefetch: jest.fn(),
    });

    render(
      <ErrorBoundary
        error={Object.assign(new Error("数据库连接失败"), {
          digest: "digest-1",
        })}
      />,
    );

    expect(screen.getByText("错误编号：digest-1")).toBeInTheDocument();
    expect(screen.getByText("数据库连接失败")).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "重试加载" })).not.toBeInTheDocument();
  });
});
