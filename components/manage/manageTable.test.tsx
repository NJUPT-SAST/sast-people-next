import { render, screen, within } from "@testing-library/react";

import { ManageTable } from "./manageTable";

jest.mock("./editUserFlowSheet", () => ({
  EditUserFlowSheet: ({ userInfo }: { userInfo: { name: string } }) => (
    <div>flow-{userInfo.name}</div>
  ),
}));

jest.mock("./removeUserInfoDialog", () => ({
  RemoveUserInfoDialog: ({ uid }: { uid: number }) => <div>remove-{uid}</div>,
}));

jest.mock("./searchInput", () => ({
  SearchInput: ({ defaultValue }: { defaultValue: string }) => (
    <div>search-{defaultValue}</div>
  ),
}));

jest.mock("./viewUserInfoSheet", () => ({
  ViewUserInfoSheet: ({ userInfo }: { userInfo: { name: string } }) => (
    <div>view-{userInfo.name}</div>
  ),
}));

jest.mock("@/components/ui/pagination", () => ({
  PaginationComponent: ({ currentPage }: { currentPage: number }) => (
    <div>pagination-{currentPage}</div>
  ),
}));

jest.mock("@/lib/dayjs", () => {
  return (date: Date) => ({
    format: () => `fmt:${date.toISOString().slice(0, 10)}`,
  });
});

describe("ManageTable", () => {
  it("renders rows, search, and pagination summary", () => {
    render(
      <ManageTable
        users={[
          {
            id: 1,
            name: "张三",
            studentId: "2026001",
            phone: "13800138000",
            email: "zs@example.com",
            createdAt: new Date("2026-03-22T00:00:00.000Z"),
          },
        ] as never}
        totalCount={15}
        totalPages={2}
        search="张"
        currentPage={1}
        role={3}
      />,
    );

    expect(screen.getByText("search-张")).toBeInTheDocument();
    expect(screen.getAllByText("张三")[0]).toBeInTheDocument();
    expect(screen.getAllByText("flow-张三")[0]).toBeInTheDocument();
    expect(screen.getAllByText("remove-1")[0]).toBeInTheDocument();
    expect(screen.getByText(/显示 1 - 10 共 15 条结果/)).toBeInTheDocument();
    expect(screen.getByText("pagination-1")).toBeInTheDocument();
  });

  it("shows the empty state when no users are present", () => {
    render(
      <ManageTable
        users={[]}
        totalCount={0}
        totalPages={0}
        search=""
        currentPage={1}
        role={2}
      />,
    );

    expect(screen.getAllByText("暂时没有用户数据")[0]).toBeInTheDocument();
  });

  it("shows QQ but not phone numbers to lecturers", () => {
    const { container } = render(
      <ManageTable
        users={[
          {
            id: 2,
            name: "李四",
            studentId: "2026002",
            phone: "13800138001",
            email: "ls@example.com",
            qq: "200000",
            createdAt: new Date("2026-03-22T00:00:00.000Z"),
          },
        ] as never}
        totalCount={1}
        totalPages={1}
        search=""
        currentPage={1}
        role={2}
      />,
    );

    expect(within(container).getAllByText("QQ").length).toBeGreaterThan(0);
    expect(within(container).getAllByText("200000").length).toBeGreaterThan(0);
    expect(within(container).queryByText("手机号码")).not.toBeInTheDocument();
    expect(within(container).queryByText("13800138001")).not.toBeInTheDocument();
  });
});
