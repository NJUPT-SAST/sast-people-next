import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "./table";

const mockBatchEndByUid = jest.fn().mockResolvedValue(undefined);
const mockBatchSetOutcomeByUid = jest.fn().mockResolvedValue(undefined);
const mockBatchSendEmail = jest.fn().mockResolvedValue(undefined);
const mockToastPromise = jest.fn((promise: Promise<unknown>) => promise);

jest.mock("@/action/user-flow/edit", () => ({
  batchEndByUid: (...args: Parameters<typeof mockBatchEndByUid>) =>
    mockBatchEndByUid(...args),
  batchSetOutcomeByUid: (...args: Parameters<typeof mockBatchSetOutcomeByUid>) =>
    mockBatchSetOutcomeByUid(...args),
}));

jest.mock("@/action/user/sendEmail", () => ({
  batchSendEmail: (...args: Parameters<typeof mockBatchSendEmail>) =>
    mockBatchSendEmail(...args),
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
    mockBatchSendEmail.mockClear();
    mockToastPromise.mockClear();
  });

  it("shows the empty state", () => {
    render(<DataTable columns={columns} data={[]} flowTypeId={7} role={3} />);

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
      expect(mockBatchSendEmail).not.toHaveBeenCalled();
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

  it("sends result email to passed and failed rows together", async () => {
    const user = userEvent.setup();

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

    await user.click(screen.getByRole("button", { name: "发送结果邮件并锁定" }));

    await waitFor(() => {
      expect(mockBatchSendEmail).toHaveBeenCalledWith([1], 9, true);
      expect(mockBatchSendEmail).toHaveBeenCalledWith([2], 9, false);
      expect(mockBatchSetOutcomeByUid).not.toHaveBeenCalled();
    });
  });
});
