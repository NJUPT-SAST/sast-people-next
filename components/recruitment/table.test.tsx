import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "./table";

const mockBatchEndByUid = jest.fn().mockResolvedValue(undefined);
const mockBatchSetOutcomeByUid = jest.fn().mockResolvedValue(undefined);
const mockToastPromise = jest.fn((promise: Promise<unknown>) => promise);

jest.mock("@/action/user-flow/edit", () => ({
  batchEndByUid: (...args: Parameters<typeof mockBatchEndByUid>) =>
    mockBatchEndByUid(...args),
  batchSetOutcomeByUid: (...args: Parameters<typeof mockBatchSetOutcomeByUid>) =>
    mockBatchSetOutcomeByUid(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    promise: (...args: Parameters<typeof mockToastPromise>) =>
      mockToastPromise(...args),
  },
}));

describe("Recruitment DataTable", () => {
  type RecruitmentRow = {
    uid: number;
    userFlowId?: number;
    stepId: number;
    name: string;
    totalScore: string;
    status: string;
  };

  const columns: ColumnDef<RecruitmentRow>[] = [
    {
      id: "select",
      header: "select",
      cell: ({ row }) => (
        <input
          aria-label={`select-${row.original.uid}`}
          type="checkbox"
          checked={row.getIsSelected()}
          onChange={(event) => row.toggleSelected(event.target.checked)}
        />
      ),
    },
    { accessorKey: "name", header: "姓名" },
    { accessorKey: "totalScore", header: "总分" },
  ];

  beforeEach(() => {
    mockBatchEndByUid.mockClear();
    mockBatchSetOutcomeByUid.mockClear();
    mockToastPromise.mockClear();
    jest.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the empty state", () => {
    render(<DataTable columns={columns} data={[]} flowTypeId={7} role={3} />);

    expect(screen.getAllByText("暂时没有内容。")[0]).toBeInTheDocument();
  });

  it("does not crash when table inputs are temporarily undefined", () => {
    render(
      <DataTable
        columns={undefined as never}
        data={undefined as never}
        flowTypeId={7}
        role={3}
      />,
    );

    expect(screen.getAllByText("暂时没有内容。")[0]).toBeInTheDocument();
  });

  it("sets selected rows as passed without changing unselected rows", async () => {
    const user = userEvent.setup();

    render(
      <DataTable
        columns={columns}
        flowTypeId={9}
        role={3}
        data={[
          { uid: 1, stepId: 3, name: "张三", totalScore: "90", status: "ongoing" },
          { uid: 2, stepId: 3, name: "李四", totalScore: "70", status: "ongoing" },
        ]}
      />,
    );

    await user.click(screen.getAllByLabelText("select-1")[0]);
    await user.click(screen.getByRole("button", { name: "设为通过" }));

    await waitFor(() => {
      expect(mockBatchSetOutcomeByUid).toHaveBeenCalledWith(9, 3, "passed", [1]);
      expect(mockBatchSetOutcomeByUid).not.toHaveBeenCalledWith(9, 3, "failed", [2]);
      expect(mockToastPromise).toHaveBeenCalled();
    });
  });

  it("sets selected rows as failed", async () => {
    const user = userEvent.setup();

    render(
      <DataTable
        columns={columns}
        flowTypeId={9}
        role={3}
        data={[
          { uid: 1, stepId: 3, name: "张三", totalScore: "90", status: "ongoing" },
          { uid: 2, stepId: 3, name: "李四", totalScore: "70", status: "ongoing" },
        ]}
      />,
    );

    await user.click(screen.getAllByLabelText("select-2")[0]);
    await user.click(screen.getByRole("button", { name: "设为不通过" }));

    await waitFor(() => {
      expect(mockBatchSetOutcomeByUid).toHaveBeenCalledWith(9, 3, "failed", [2]);
    });
  });

  it("does not update outcomes when the confirmation is cancelled", async () => {
    jest.spyOn(window, "confirm").mockReturnValue(false);
    const user = userEvent.setup();

    render(
      <DataTable
        columns={columns}
        flowTypeId={9}
        role={3}
        data={[
          { uid: 1, stepId: 3, name: "张三", totalScore: "90", status: "ongoing" },
        ]}
      />,
    );

    await user.click(screen.getAllByLabelText("select-1")[0]);
    await user.click(screen.getByRole("button", { name: "设为通过" }));

    expect(window.confirm).toHaveBeenCalledWith(
      "确定将 1 人设为通过吗？标完后请到邮件中心发送结果通知。",
    );
    expect(mockBatchSetOutcomeByUid).not.toHaveBeenCalled();
  });

  it("does not expose email sending controls in score management", () => {
    render(
      <DataTable
        columns={columns}
        flowTypeId={9}
        role={3}
        data={[
          { uid: 1, stepId: 3, name: "张三", totalScore: "90", status: "passed" },
          { uid: 2, stepId: 3, name: "李四", totalScore: "70", status: "failed" },
        ]}
      />,
    );

    expect(screen.queryByRole("button", { name: /邮件/ })).not.toBeInTheDocument();
  });

  it("uses distinct target ids for desktop and mobile render paths", () => {
    render(
      <DataTable
        columns={columns}
        flowTypeId={9}
        role={3}
        targetUserFlowId={42}
        data={[
          {
            uid: 1,
            userFlowId: 42,
            stepId: 3,
            name: "张三",
            totalScore: "90",
            status: "passed",
          },
        ]}
      />,
    );

    expect(document.getElementById("user-flow-42-desktop")).toBeInTheDocument();
    expect(document.getElementById("user-flow-42-mobile")).toBeInTheDocument();
    expect(document.getElementById("user-flow-42")).not.toBeInTheDocument();
  });
});
