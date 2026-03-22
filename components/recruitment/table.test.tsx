import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "./table";

const mockBatchEndByUid = jest.fn().mockResolvedValue(undefined);
const mockBatchSendEmail = jest.fn().mockResolvedValue(undefined);
const mockToastPromise = jest.fn((promise: Promise<unknown>) => promise);

jest.mock("@/action/user-flow/edit", () => ({
  batchEndByUid: (...args: Parameters<typeof mockBatchEndByUid>) =>
    mockBatchEndByUid(...args),
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
    mockBatchSendEmail.mockClear();
    mockToastPromise.mockClear();
  });

  it("shows the empty state", () => {
    render(<DataTable columns={columns} data={[]} flowTypeId={7} />);

    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("processes selected and unselected rows on confirm", async () => {
    const user = userEvent.setup();

    render(
      <DataTable
        columns={columns}
        flowTypeId={9}
        data={[
          { uid: 1, stepId: 3, name: "张三", totalScore: "90" },
          { uid: 2, stepId: 3, name: "李四", totalScore: "70" },
        ]}
      />,
    );

    await user.click(screen.getByLabelText("select-1"));
    await user.click(screen.getByRole("button", { name: "确认选中同学通过" }));

    await waitFor(() => {
      expect(mockBatchSendEmail).toHaveBeenCalledWith([1], 9, true);
      expect(mockBatchSendEmail).toHaveBeenCalledWith([2], 9, false);
      expect(mockBatchEndByUid).toHaveBeenCalledWith(9, 3, "accepted", [1]);
      expect(mockBatchEndByUid).toHaveBeenCalledWith(9, 3, "rejected", [2]);
      expect(mockToastPromise).toHaveBeenCalled();
    });
  });
});
