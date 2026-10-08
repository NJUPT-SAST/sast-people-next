/** @jest-environment node */

/**
 * 办公类一面名单导出：确认一面后工作台用「导出一面名单」下载。
 * 名单与工作台的「查看一面名单」同一份推导（进入二面 = 通过，止步一面 = 不通过），
 * 分数取一面面评；没有名单（还没确认一面）与技术流程都要给出明确的 4xx。
 */

const mockVerifyManager = jest.fn();
const mockAssertFlowEditableRecord = jest.fn();
const mockGetEvaluationCandidates = jest.fn();
const mockFlowSelect = jest.fn();

jest.mock("@/lib/authz", () => ({ verifyManager: () => mockVerifyManager() }));
jest.mock("@/lib/flow-access", () => ({
  assertFlowEditableRecord: (...args: unknown[]) =>
    mockAssertFlowEditableRecord(...args),
}));
jest.mock("@/action/user-flow/evaluation", () => ({
  getEvaluationCandidates: (...args: unknown[]) =>
    mockGetEvaluationCandidates(...args),
}));
jest.mock("@/db/drizzle", () => ({ db: { select: () => mockFlowSelect() } }));

import { NextRequest } from "next/server";
import { GET } from "./route";

/* 流程归属查询：select().from(flow).where().limit(1) */
const flowQuery = (rows: unknown[]) => ({
  from: () => ({ where: () => ({ limit: async () => rows }) }),
});

const request = (flowId: string) =>
  new NextRequest(
    `https://people.example/api/flow/office-round-one-export?flowId=${flowId}`,
  );

const officeFlowRow = {
  title: "2026 办公室面试招新",
  department: "office",
  type: "office_interview",
};

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
    evaluations: [{ round: 1, score: 61 }],
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

beforeEach(() => {
  mockVerifyManager.mockReset();
  mockVerifyManager.mockResolvedValue({ uid: 1, role: 4, scope: { kind: "all" } });
  mockAssertFlowEditableRecord.mockReset();
  mockGetEvaluationCandidates.mockReset();
  mockFlowSelect.mockReset();
  mockFlowSelect.mockReturnValue(flowQuery([]));
});

describe("办公类一面名单导出", () => {
  it("按确认结论导出名单与一面得分", async () => {
    mockFlowSelect.mockReturnValue(flowQuery([officeFlowRow]));
    mockGetEvaluationCandidates.mockResolvedValue(candidates as never);

    const response = await GET(request("11"));

    expect(response.status).toBe(200);
    expect(mockAssertFlowEditableRecord).toHaveBeenCalledWith(
      { kind: "all" },
      officeFlowRow,
    );
    /* Excel 需要 UTF-8 BOM；Node 的 response.text() 会吞掉 BOM，所以按字节断言 */
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder("utf-8", { ignoreBOM: true })
      .decode(bytes)
      .replace(/^\uFEFF/, "")
      .trimEnd()
      .split("\n");
    expect(lines).toEqual([
      "姓名,学号,志愿,一面得分,结论",
      "张三,B001,第一志愿,88,通过",
      "李四,B002,第二志愿,61,不通过",
    ]);
    expect(response.headers.get("Content-Disposition")).toContain(
      encodeURIComponent("2026 办公室面试招新-一面名单.csv"),
    );
  });

  it("还没有一面名单时返回 404", async () => {
    mockFlowSelect.mockReturnValue(flowQuery([officeFlowRow]));
    mockGetEvaluationCandidates.mockResolvedValue([
      {
        userFlowId: 3,
        name: "王五",
        studentId: null,
        choice: 1,
        round: 1,
        status: "ongoing",
        evaluations: [],
      },
    ] as never);

    const response = await GET(request("11"));

    expect(response.status).toBe(404);
  });

  it("技术流程没有一面名单，返回 400", async () => {
    mockFlowSelect.mockReturnValue(
      flowQuery([{ title: "笔试", department: null, type: "recruitment" }]),
    );

    const response = await GET(request("12"));

    expect(response.status).toBe(400);
    expect(mockGetEvaluationCandidates).not.toHaveBeenCalled();
  });

  it("缺少有效流程 ID 时返回 400", async () => {
    const response = await GET(request("abc"));

    expect(response.status).toBe(400);
    expect(mockVerifyManager).not.toHaveBeenCalled();
  });
});
