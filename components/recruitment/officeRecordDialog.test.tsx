import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { OfficeInterviewRecord } from "@/action/user-flow/office-record";

const mockGetOfficeInterviewRecord = jest.fn();

jest.mock("@/action/user-flow/office-record", () => ({
  getOfficeInterviewRecord: (...args: unknown[]) =>
    mockGetOfficeInterviewRecord(...args),
}));

import { OfficeRecordDialog } from "./officeRecordDialog";

/** 两面都有记录：一面单人已确认、二面两位部长打分但尚未确认名单 */
const buildRecord = (): OfficeInterviewRecord => ({
  candidate: {
    userFlowId: 21,
    name: "张三",
    studentId: "B24040001",
    qq: "123456",
    choice: 1,
    siblingDepartment: "office",
    interviewSlot: "13:00-14:00",
    status: "ongoing",
    round: 2,
    finalDepartment: null,
  },
  rounds: [
    {
      round: 1,
      evaluations: [
        {
          id: 1,
          score: 88,
          recommendation: "passed",
          content: "一面表现不错，沟通清晰。",
          authorName: "部长甲",
          isMine: false,
          createdAt: "2026-08-01T02:00:00.000Z",
        },
      ],
      averageScore: 88,
      decision: {
        passed: true,
        decidedAt: "2026-08-02T03:00:00.000Z",
        decidedBy: "部长甲",
        evaluationCount: 1,
        averageScore: 88,
      },
    },
    {
      round: 2,
      evaluations: [
        {
          id: 2,
          score: 80,
          recommendation: "passed",
          content: "二面发言较少。",
          authorName: "部长乙",
          isMine: true,
          createdAt: "2026-08-03T04:00:00.000Z",
        },
        {
          id: 3,
          score: 90,
          recommendation: "failed",
          content: "二面思路清晰。",
          authorName: "部长丙",
          isMine: false,
          createdAt: "2026-08-03T05:00:00.000Z",
        },
      ],
      averageScore: 85,
      decision: null,
    },
  ],
});

const renderDialog = (props: Partial<Parameters<typeof OfficeRecordDialog>[0]> = {}) =>
  render(
    <OfficeRecordDialog
      open
      userFlowId={21}
      onOpenChange={() => {}}
      {...props}
    />,
  );

describe("OfficeRecordDialog", () => {
  it("展示候选人信息、两轮面评与名单确认结论", async () => {
    mockGetOfficeInterviewRecord.mockResolvedValue(buildRecord());
    renderDialog();

    expect(await screen.findByText("张三")).toBeInTheDocument();
    expect(mockGetOfficeInterviewRecord).toHaveBeenCalledWith(21);
    expect(screen.getByText(/学号 B24040001/)).toBeInTheDocument();
    expect(screen.getByText(/QQ 123456/)).toBeInTheDocument();
    expect(screen.getByText("进行中")).toBeInTheDocument();
    /* 信息行：志愿 / 另一志愿部门 / 面试时段 / 最终去向 */
    expect(screen.getByText("第一志愿")).toBeInTheDocument();
    expect(screen.getByText("办公室")).toBeInTheDocument();
    expect(screen.getByText("13:00-14:00")).toBeInTheDocument();
    expect(screen.getByText("未确定")).toBeInTheDocument();

    const roundOne = within(screen.getByRole("region", { name: "一面记录" }));
    const roundTwo = within(screen.getByRole("region", { name: "二面记录" }));

    /* 一面：单人分数 + 意见 + 确认结论快照（结论压成一行，不再整块说明） */
    expect(roundOne.getByText("88 分")).toBeInTheDocument();
    expect(roundOne.getByText("一面表现不错，沟通清晰。")).toBeInTheDocument();
    expect(roundOne.getByText(/建议通过/)).toBeInTheDocument();
    expect(roundOne.getByText("均分 88 · 1 份")).toBeInTheDocument();
    expect(roundOne.getByText("通过")).toBeInTheDocument();
    expect(roundOne.getByText(/操作人 部长甲/)).toBeInTheDocument();
    expect(roundOne.getByText(/确认时刻均分 88（1 份）/)).toBeInTheDocument();

    /* 二面：多人面评 + 平均分带份数；尚未确认名单是一行提示 */
    expect(roundTwo.getByText("80 分")).toBeInTheDocument();
    expect(roundTwo.getByText("90 分")).toBeInTheDocument();
    expect(roundTwo.getByText("（我）")).toBeInTheDocument();
    expect(roundTwo.getByText("均分 85 · 2 份")).toBeInTheDocument();
    expect(roundTwo.getByText("名单确认：尚未确认")).toBeInTheDocument();
    expect(roundTwo.getByText(/建议不通过/)).toBeInTheDocument();
  });

  it("某轮还没有面评与名单确认时给出空态", async () => {
    mockGetOfficeInterviewRecord.mockResolvedValue({
      candidate: {
        userFlowId: 22,
        name: "李四",
        studentId: null,
        qq: null,
        choice: 2,
        siblingDepartment: null,
        interviewSlot: null,
        status: "passed",
        round: 2,
        finalDepartment: "office",
      },
      rounds: [
        { round: 1, evaluations: [], averageScore: null, decision: null },
        { round: 2, evaluations: [], averageScore: null, decision: null },
      ],
    } satisfies OfficeInterviewRecord);
    renderDialog({ userFlowId: 22 });

    expect(await screen.findByText("李四")).toBeInTheDocument();
    expect(screen.getByText("尚未记录一面面评")).toBeInTheDocument();
    expect(screen.getByText("尚未记录二面面评")).toBeInTheDocument();
    /* 空轮次不再渲染均分与名单确认区块，只留一行空态 —— 没有的信息不摆占位 */
    expect(screen.queryByText("名单确认：尚未确认")).not.toBeInTheDocument();
    expect(screen.queryByText(/确认时刻均分/)).not.toBeInTheDocument();
    /* 未填写的信息用占位文案展示，不显示空白 */
    expect(screen.getByText("无")).toBeInTheDocument();
    expect(screen.getByText("未选择")).toBeInTheDocument();
    expect(screen.getByText("办公室")).toBeInTheDocument();
  });

  it("加载失败时展示错误与重试，重试成功后渲染记录", async () => {
    mockGetOfficeInterviewRecord.mockRejectedValueOnce(
      new Error("无权操作其他部门的候选人"),
    );
    renderDialog();

    expect(
      await screen.findByText("无权操作其他部门的候选人"),
    ).toBeInTheDocument();

    mockGetOfficeInterviewRecord.mockResolvedValueOnce(buildRecord());
    await userEvent.click(screen.getByRole("button", { name: /重试/ }));

    expect(await screen.findByText("张三")).toBeInTheDocument();
    expect(screen.queryByText("无权操作其他部门的候选人")).not.toBeInTheDocument();
    await waitFor(() => expect(mockGetOfficeInterviewRecord).toHaveBeenCalledTimes(2));
  });

  it("没有选中候选人时不请求记录", async () => {
    renderDialog({ userFlowId: null });
    await waitFor(() => expect(screen.queryByText("加载中…")).not.toBeInTheDocument());
    expect(mockGetOfficeInterviewRecord).not.toHaveBeenCalled();
  });
});
