import { render, screen } from "@testing-library/react";

import { OfficeRoundOneRosterDialog } from "./officeRoundOneRosterDialog";

const candidates = [
  {
    userFlowId: 1,
    name: "张三",
    studentId: "B001",
    choice: 1,
    round: 2,
    status: "ongoing",
    evaluations: [{ round: 1, score: 88 }],
  },
  {
    userFlowId: 2,
    name: "李四",
    studentId: "B002",
    choice: 2,
    round: 1,
    status: "failed",
    evaluations: [],
  },
  {
    /* 一面还没出结果：不进名单 */
    userFlowId: 3,
    name: "王五",
    studentId: "B003",
    choice: 1,
    round: 1,
    status: "ongoing",
    evaluations: [{ round: 1, score: 90 }],
  },
];

describe("OfficeRoundOneRosterDialog", () => {
  it("lists the confirmed round-one outcomes with volunteer and score", () => {
    render(
      <OfficeRoundOneRosterDialog
        open
        onOpenChange={() => {}}
        flowTitle="2026 办公室面试招新"
        candidates={candidates}
      />,
    );

    expect(screen.getByText("一面名单")).toBeInTheDocument();
    expect(screen.getByText(/2026 办公室面试招新/)).toBeInTheDocument();
    expect(screen.getByText("通过 1")).toBeInTheDocument();
    expect(screen.getByText("不通过 1")).toBeInTheDocument();

    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("第一志愿")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("通过")).toBeInTheDocument();

    expect(screen.getByText("李四")).toBeInTheDocument();
    expect(screen.getByText("第二志愿")).toBeInTheDocument();
    /* 没有一面记录的人得分留空位，不展示 0 */
    expect(screen.getByText("不通过")).toBeInTheDocument();
    expect(screen.queryByText("王五")).not.toBeInTheDocument();
  });

  it("shows an empty state before the round-one roster exists", () => {
    render(
      <OfficeRoundOneRosterDialog
        open
        onOpenChange={() => {}}
        flowTitle="2026 办公室面试招新"
        candidates={[]}
      />,
    );

    expect(
      screen.getByText("该流程还没有一面名单（确认一面后生成）。"),
    ).toBeInTheDocument();
  });
});
