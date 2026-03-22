import { render, screen } from "@testing-library/react";

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
      />,
    );

    expect(screen.getByText("search-张")).toBeInTheDocument();
    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("flow-张三")).toBeInTheDocument();
    expect(screen.getByText("remove-1")).toBeInTheDocument();
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
      />,
    );

    expect(screen.getByText("暂时没有用户数据")).toBeInTheDocument();
  });
});
