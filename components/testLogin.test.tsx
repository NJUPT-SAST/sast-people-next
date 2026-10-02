/** @jest-environment jsdom */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/components/ui/select", () => {
  const SelectContext = React.createContext<{
    onValueChange?: (value: string) => void;
  }>({});

  return {
    Select: ({
      children,
      onValueChange,
    }: {
      children: React.ReactNode;
      onValueChange?: (value: string) => void;
    }) => (
      <SelectContext.Provider value={{ onValueChange }}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectValue: ({ placeholder }: { placeholder?: string }) => (
      <span>{placeholder}</span>
    ),
    SelectContent: ({ children }: { children: React.ReactNode }) => (
      <div>{children}</div>
    ),
    SelectItem: ({
      children,
      value,
    }: {
      children: React.ReactNode;
      value: string;
    }) => {
      const { onValueChange } = React.useContext(SelectContext);
      return (
        <button type="button" onClick={() => onValueChange?.(value)}>
          {children}
        </button>
      );
    },
  };
});

const mockLoginWithMockLinkUser = jest.fn().mockResolvedValue(undefined);
jest.mock("@/action/test-login", () => ({
  loginWithMockLinkUser: (...args: unknown[]) =>
    mockLoginWithMockLinkUser(...args),
}));

const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (callback: () => Promise<unknown>) => ({
      unwrap: async () => {
        await callback();
      },
    }),
  },
}));

import { TestLogin, type MockLoginAccount } from "./testLogin";

const accounts: MockLoginAccount[] = [
  { studentId: "B00000000", name: "管理员", role: 4, department: null },
  { studentId: "B11111111", name: "陈屹", role: 3, department: "software" },
  { studentId: "B44444444", name: "邵晨", role: 3, department: "office" },
  { studentId: "B10000001", name: "周礼", role: 2, department: "software" },
  { studentId: "B10000002", name: "方雨桐", role: 1, department: "software" },
  { studentId: "B10000003", name: "何书宁", role: 1, department: "software" },
  { studentId: "B00040005", name: "李瑶", role: 0, department: null },
];

const submittedStudentId = () => {
  const formData = mockLoginWithMockLinkUser.mock.calls.at(-1)?.[0] as FormData;
  return formData.get("studentId");
};

describe("TestLogin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("defaults to 部长 + first department and logs in with one click", async () => {
    const user = userEvent.setup();
    render(<TestLogin accounts={accounts} />);

    expect(
      screen.getByText(/将使用 B11111111 · 陈屹（部长 · 软件研发部）登录/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(mockLoginWithMockLinkUser).toHaveBeenCalled());
    expect(submittedStudentId()).toBe("B11111111");
    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("switches the account when another department is selected", async () => {
    const user = userEvent.setup();
    render(<TestLogin accounts={accounts} />);

    await user.click(screen.getByRole("button", { name: "办公室" }));
    expect(screen.getByText(/将使用 B44444444 · 邵晨/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(mockLoginWithMockLinkUser).toHaveBeenCalled());
    expect(submittedStudentId()).toBe("B44444444");
  });

  it("offers a per-account pick when a department has several accounts", async () => {
    const user = userEvent.setup();
    render(<TestLogin accounts={accounts} />);

    await user.click(screen.getByRole("button", { name: "部员" }));
    /* 同一部门的两位部员各是一个账号 */
    expect(
      screen.getByRole("button", { name: "方雨桐（B10000002）" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "何书宁（B10000003）" }));
    expect(screen.getByText(/将使用 B10000003 · 何书宁/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(mockLoginWithMockLinkUser).toHaveBeenCalled());
    expect(submittedStudentId()).toBe("B10000003");
  });

  it("lists department-less identities as plain account choices", async () => {
    const user = userEvent.setup();
    render(<TestLogin accounts={accounts} />);

    await user.click(screen.getByRole("button", { name: "新同学" }));
    await user.click(screen.getByRole("button", { name: "李瑶（B00040005）" }));
    await user.click(screen.getByRole("button", { name: "登录" }));

    await waitFor(() => expect(mockLoginWithMockLinkUser).toHaveBeenCalled());
    expect(submittedStudentId()).toBe("B00040005");
  });

  it("keeps a manual student id fallback", async () => {
    const user = userEvent.setup();
    render(<TestLogin accounts={accounts} />);

    await user.type(screen.getByPlaceholderText("例如 B44444444"), "B99999999");
    await user.click(screen.getByRole("button", { name: "登录该学号" }));

    await waitFor(() => expect(mockLoginWithMockLinkUser).toHaveBeenCalled());
    expect(submittedStudentId()).toBe("B99999999");
  });
});
