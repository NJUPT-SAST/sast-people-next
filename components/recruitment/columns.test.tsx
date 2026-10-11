import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UserEvent } from "@testing-library/user-event";
import type { ReactNode } from "react";

jest.mock("@/components/manage/viewUserInfoSheet", () => ({
  ViewUserInfoSheet: ({ trigger }: { trigger?: ReactNode }) => (
    <div>{trigger}</div>
  ),
}));

const mockClearPoints = jest.fn();
jest.mock("@/action/user-flow/user-point/clear", () => ({
  clearPoints: (...args: unknown[]) => mockClearPoints(...args),
}));

jest.mock("sonner", () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

const mockToastError = jest.requireMock("sonner").toast.error as jest.Mock;
const mockToastSuccess = jest.requireMock("sonner").toast.success as jest.Mock;

import { makeColumns } from "@/components/recruitment/columns";

const columns = makeColumns(3);

const nameColumn = columns.find(
  (column) => "accessorKey" in column && column.accessorKey === "name",
);

const getColumnKey = (column: (typeof columns)[number]) =>
  column.id ?? ("accessorKey" in column ? column.accessorKey : undefined);

const scoredProblems = [
  {
    id: 11,
    title: "第一题",
    score: 10,
    points: 8,
    graded: true,
    judgerName: "李老师",
    note: null,
  },
  {
    id: 12,
    title: "第二题",
    score: 10,
    points: 0,
    graded: false,
    judgerName: null,
    note: null,
  },
];

const renderScoreDialog = ({
  role = 4,
  problems = scoredProblems,
  studentId = "2026001",
  onScoresChanged,
}: {
  role?: number;
  problems?: unknown[];
  studentId?: string | null;
  onScoresChanged?: () => void;
} = {}) => {
  const scoreColumn = makeColumns(role, { onScoresChanged }).find(
    (column) =>
      "accessorKey" in column && column.accessorKey === "problemScores",
  );
  const cell = scoreColumn?.cell as ((props: never) => ReactNode) | undefined;
  expect(typeof cell).toBe("function");

  return render(
    <>
      {cell?.({
        row: {
          original: {
            userFlowId: 77,
            name: "张三",
            studentId,
            problemScores: problems,
          },
        },
      } as never)}
    </>,
  );
};

const openScoreDialog = async (user: UserEvent) => {
  await user.click(screen.getByRole("button", { name: "查看得分" }));
};

describe("score breakdown dialog", () => {
  beforeEach(() => {
    mockClearPoints.mockReset();
    mockToastError.mockReset();
    mockToastSuccess.mockReset();
  });

  it("marks problems without a score record as 未批 instead of 0 分", async () => {
    const user = userEvent.setup();
    renderScoreDialog();

    await openScoreDialog(user);

    /* 弹窗盖住表格的姓名 / 学号列，身份必须自带 */
    expect(await screen.findByText("张三（2026001）")).toBeInTheDocument();
    expect(screen.getByText("8/10")).toBeInTheDocument();
    expect(screen.getByText("未批")).toBeInTheDocument();
    expect(screen.getByText("阅卷：李老师")).toBeInTheDocument();
    /* 未批的题没有阅卷人可显示，也不该有清分入口 */
    expect(screen.getAllByRole("button", { name: "清分" })).toHaveLength(1);
  });

  it("marks a missing student id instead of leaving it blank", async () => {
    const user = userEvent.setup();
    renderScoreDialog({ studentId: null });

    await openScoreDialog(user);

    expect(await screen.findByText("张三（无学号）")).toBeInTheDocument();
  });

  it("hides the clear-score affordance from managers and lecturers", async () => {
    const user = userEvent.setup();
    renderScoreDialog({ role: 3 });

    await openScoreDialog(user);

    expect(await screen.findByText("得分组成")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "清分" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "清空全部得分" }),
    ).not.toBeInTheDocument();
  });

  it("clears one problem only after confirmation and reloads the list", async () => {
    mockClearPoints.mockResolvedValue({ success: true, clearedProblemIds: [11] });
    const onScoresChanged = jest.fn();
    const user = userEvent.setup();
    renderScoreDialog({ onScoresChanged });

    await openScoreDialog(user);
    await user.click(await screen.findByRole("button", { name: "清分" }));

    expect(mockClearPoints).not.toHaveBeenCalled();
    expect(
      screen.getByText(/清除「第一题」的得分后/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "确认清分" }));

    expect(mockClearPoints).toHaveBeenCalledWith(77, [11]);
    expect(mockToastSuccess).toHaveBeenCalledWith(
      "已清除该题得分，题目回到未批卷",
    );
    expect(onScoresChanged).toHaveBeenCalled();
  });

  it("clears every graded problem but skips the ungraded ones", async () => {
    mockClearPoints.mockResolvedValue({ success: true, clearedProblemIds: [11] });
    const user = userEvent.setup();
    renderScoreDialog();

    await openScoreDialog(user);
    await user.click(screen.getByRole("button", { name: "清空全部得分" }));
    await user.click(screen.getByRole("button", { name: "确认清分" }));

    expect(mockClearPoints).toHaveBeenCalledWith(77, [11]);
  });

  it("keeps the dialog open and shows the server reason when the flow is locked", async () => {
    mockClearPoints.mockResolvedValue({
      success: false,
      error: { message: "该流程结果正在发布或已经发布，名单和结果已锁定" },
    });
    const user = userEvent.setup();
    renderScoreDialog();

    await openScoreDialog(user);
    await user.click(await screen.findByRole("button", { name: "清分" }));
    await user.click(screen.getByRole("button", { name: "确认清分" }));

    expect(mockToastError).toHaveBeenCalledWith(
      "该流程结果正在发布或已经发布，名单和结果已锁定",
    );
    expect(screen.getByText("得分组成")).toBeInTheDocument();
  });
});

describe("recruitment columns", () => {
  it("renders the candidate name as a clickable details trigger", () => {
    const cell = nameColumn?.cell as
      | ((props: never) => ReactNode)
      | undefined;
    expect(typeof cell).toBe("function");

    render(
      <>
        {cell?.({
          row: { original: { uid: 42, name: "张三", studentId: "2026001" } },
          getValue: () => "张三",
        } as never)}
      </>,
    );

    expect(screen.getByRole("button", { name: "张三" })).toBeInTheDocument();
  });

  it("exposes the expected data columns", () => {
    expect(columns.map(getColumnKey)).toEqual([
      "select",
      "studentId",
      "name",
      "department",
      "qq",
      "status",
      "problemScores",
      "totalScore",
    ]);
  });

  it("hides the applied department column when the flow already implies it", () => {
    const withoutDepartment = makeColumns(3, { showDepartment: false });

    expect(withoutDepartment.map(getColumnKey)).toEqual([
      "select",
      "studentId",
      "name",
      "qq",
      "status",
      "problemScores",
      "totalScore",
    ]);
  });

  it("renders the candidate QQ with a placeholder when it is unavailable", () => {
    const qqColumn = columns.find(
      (column) => "accessorKey" in column && column.accessorKey === "qq",
    );
    const cell = qqColumn?.cell as ((props: never) => ReactNode) | undefined;
    expect(typeof cell).toBe("function");

    const { container } = render(
      <>{cell?.({ getValue: () => "12345678" } as never)}</>,
    );
    expect(container).toHaveTextContent("12345678");

    const { container: hiddenContainer } = render(
      <>{cell?.({ getValue: () => null } as never)}</>,
    );
    expect(hiddenContainer).toHaveTextContent("-");
  });

  it("filters rows by total score", () => {
    const totalScoreColumn = columns.find(
      (column) => "accessorKey" in column && column.accessorKey === "totalScore",
    );

    expect(typeof totalScoreColumn?.filterFn).toBe("function");

    if (typeof totalScoreColumn?.filterFn !== "function") {
      throw new Error("Expected totalScore column to expose a filter function");
    }

    expect(
      totalScoreColumn.filterFn(
        { original: { totalScore: "90" } } as never,
        "totalScore",
        "80",
        () => undefined,
      ),
    ).toBe(true);
    expect(
      totalScoreColumn.filterFn(
        { original: { totalScore: "70" } } as never,
        "totalScore",
        "80",
        () => undefined,
      ),
    ).toBe(false);
  });

  it("renders the placeholder Table component as empty", () => {
    const { Table } = jest.requireActual("./columns") as typeof import("./columns");
    const { container } = render(<Table />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
