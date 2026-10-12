import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CheckinConsole from "./checkinConsole";
import type {
  CheckinEntry,
  CheckinStation,
  VenueDepartmentSnapshot,
  VenueSnapshot,
} from "@/action/user-flow/checkin";

jest.mock("@/action/user-flow/checkin", () => ({
  callNextAtStation: jest.fn(),
  checkInCandidate: jest.fn(),
  createCheckinStation: jest.fn(),
  deleteCheckinStation: jest.fn(),
  transitionCheckin: jest.fn(),
  updateCheckinStation: jest.fn(),
}));

jest.mock("sonner", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

/* 测试直接吃首屏那份 fallback 快照，不真的轮询接口 */
jest.mock("swr", () => ({
  __esModule: true,
  default: (
    key: string,
    _fetcher: unknown,
    options: { fallback?: Record<string, unknown> } | undefined,
  ) => ({ data: options?.fallback?.[key], mutate: jest.fn() }),
}));

jest.mock("@/components/recruitment/checkin/checkinScanner", () => ({
  __esModule: true,
  default: () => null,
}));

/* 随手写面评弹窗只回显收到的目标：用它断言「谁能写、写的是谁」 */
jest.mock("@/components/recruitment/checkin/officeRecordQuickDialog", () => ({
  __esModule: true,
  default: ({ target }: { target: { queueNo: string; round: number } | null }) =>
    target ? (
      <p data-testid="record-target">{`${target.queueNo}·${target.round}`}</p>
    ) : null,
}));

jest.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuItem: ({ children, onSelect }: { children: React.ReactNode; onSelect?: () => void }) => (
    <button type="button" onClick={() => onSelect?.()}>
      {children}
    </button>
  ),
}));

jest.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div {...props}>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder}</span>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const makeStation = (overrides: Partial<CheckinStation> = {}): CheckinStation => ({
  id: 1,
  flowId: 121,
  departmentLabel: "办公室",
  label: "1 号位",
  interviewerUid: 213,
  interviewerName: "邵晨",
  sortOrder: 0,
  status: "active",
  occupant: null,
  ...overrides,
});

const makeEntry = (overrides: Partial<CheckinEntry> = {}): CheckinEntry => ({
  id: 11,
  flowId: 121,
  userFlowId: 601,
  uid: 301,
  name: "王思远",
  studentId: "B24000001",
  interviewSlot: "13:00-14:00",
  choice: 1,
  round: 1,
  queueNo: "B001",
  queueSeq: 1,
  status: "done",
  method: "staff_scan",
  room: null,
  stationId: 1,
  stationLabel: "1 号位",
  block: null,
  otherDepartments: [],
  checkedInAt: "2026-10-11T05:00:00.000Z",
  calledAt: "2026-10-11T05:10:00.000Z",
  startedAt: "2026-10-11T05:12:00.000Z",
  finishedAt: "2026-10-11T05:40:00.000Z",
  callCount: 1,
  skipCount: 0,
  note: null,
  candidateDepartment: "office",
  canWriteRecord: true,
  ...overrides,
});

/**
 * 一个部门块。`write=false` 模拟「候选人报名归属在别的部门」——面评入口按报名归属判定，
 * 与 createEvaluation / getOfficeInterviewRecord 同一谓词。
 */
const makeSnapshot = (
  overrides: Partial<VenueDepartmentSnapshot> = {},
  write = true,
): VenueSnapshot => ({
  round: 1,
  updatedAt: "2026-10-11T05:45:00.000Z",
  departments: [
    {
      flowId: 121,
      title: "2026 校科协办公室 面试",
      department: "office",
      departmentLabel: "办公室",
      stations: [
        /* 已叫号：还没开始面试，不该露「写面评」 */
        makeStation({
          id: 1,
          occupant: {
            checkinId: 11,
            userFlowId: 601,
            uid: 301,
            name: "王思远",
            queueNo: "B001",
            status: "called",
            round: 1,
            calledAt: "2026-10-11T05:10:00.000Z",
            candidateDepartment: "office",
            canWriteRecord: write,
          },
        }),
        /* 面试中：可以写 */
        makeStation({
          id: 2,
          label: "2 号位",
          sortOrder: 1,
          occupant: {
            checkinId: 12,
            userFlowId: 602,
            uid: 302,
            name: "沈亦舟",
            queueNo: "B002",
            status: "interviewing",
            round: 1,
            calledAt: "2026-10-11T05:20:00.000Z",
            candidateDepartment: "office",
            canWriteRecord: write,
          },
        }),
      ],
      entries: [
        makeEntry({ status: "waiting", queueNo: "B003", queueSeq: 3, id: 13 }),
        makeEntry({
          status: "done",
          queueNo: "B004",
          queueSeq: 4,
          id: 14,
          canWriteRecord: write,
        }),
      ],
      awaiting: [],
      counts: {
        waiting: 1,
        called: 1,
        interviewing: 1,
        done: 1,
        skipped: 0,
        cancelled: 0,
        total: 4,
      },
      ...overrides,
    },
  ],
});

describe("CheckinConsole 写面评入口", () => {
  it("本部门：面试位要开始面试后才给写面评，队列里已完成的行也能补写", async () => {
    const user = userEvent.setup();
    render(<CheckinConsole initial={makeSnapshot()} initialDept="office" />);

    /* 两张面试位卡片（已叫号 / 面试中）+ 队列里一条已完成：只有后两者露出「写面评」 */
    const recordButtons = screen.getAllByRole("button", { name: "写面评" });
    expect(recordButtons).toHaveLength(2);
    expect(screen.getByRole("button", { name: "开始面试" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "结束面试" })).toBeInTheDocument();

    await user.click(recordButtons[1]);
    /* 队列行补写的是这一行的候选人、而不是面试位上那个人 */
    expect(screen.getByTestId("record-target")).toHaveTextContent("B004·1");
  });

  it("别的部门：叫号/推进照旧，但不给写面评入口（面评按报名归属）", async () => {
    const snapshot = makeSnapshot(
      {
        flowId: 122,
        title: "2026 校科协科宣部 面试",
        department: "publicity",
        departmentLabel: "科宣部",
      },
      /* 候选人报名归属不在本部门（例如存量记录被改派）→ 服务端会拒绝写入 */
      false,
    );
    render(<CheckinConsole initial={snapshot} initialDept="publicity" />);

    expect(screen.queryAllByRole("button", { name: "写面评" })).toHaveLength(0);
    /* 场地是共用的：叫号/开始/结束面试这些照样能用 */
    expect(screen.getByRole("button", { name: "开始面试" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "结束面试" })).toBeInTheDocument();
    expect(screen.getByText("2 号位 · 邵晨")).toBeInTheDocument();
  });
});
