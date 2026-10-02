/** @jest-environment node */

/**
 * 结果导出 CSV：办公类在「面试时段」后补「一面均分」「二面均分」两列。
 * 快照可能来自旧版本（没有分轮字段），此时两列输出空单元格而不是报错。
 */

const mockVerifyManager = jest.fn();
const mockAssertFlowEditableRecord = jest.fn();
const mockGetPublishedFlowResult = jest.fn();
const mockFlowSelect = jest.fn();

jest.mock("@/lib/authz", () => ({ verifyManager: () => mockVerifyManager() }));
jest.mock("@/lib/flow-access", () => ({
  assertFlowEditableRecord: (...args: unknown[]) =>
    mockAssertFlowEditableRecord(...args),
}));
jest.mock("@/action/flow/result-publication", () => ({
  getPublishedFlowResult: (...args: unknown[]) =>
    mockGetPublishedFlowResult(...args),
}));
jest.mock("@/db/drizzle", () => ({
  db: { select: () => mockFlowSelect() },
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

/* 路由测试 mock 了 @/lib/authz，错误类型必须取真实实现 */
const { DepartmentAccessError } = jest.requireActual<
  typeof import("@/lib/authz")
>("@/lib/authz");

/* 流程归属查询：select().from(flow).where().limit(1) */
const flowQuery = (rows: unknown[]) => ({
  from: () => ({ where: () => ({ limit: async () => rows }) }),
});

const request = (flowId: string) =>
  new NextRequest(`https://people.example/api/flow/result-export?flowId=${flowId}`);

const publishedResult = (rows: Array<Record<string, unknown>>) => ({
  resultSnapshot: { flowTitle: "2026 秋招办公室面试", rows },
});

beforeEach(() => {
  mockVerifyManager.mockReset();
  mockVerifyManager.mockResolvedValue({ uid: 1, role: 4, scope: { kind: "all" } });
  mockAssertFlowEditableRecord.mockReset();
  mockGetPublishedFlowResult.mockReset();
  mockFlowSelect.mockReset();
  mockFlowSelect.mockReturnValue(flowQuery([]));
});

describe("办公类结果导出", () => {
  it("在面试时段后导出两轮均分，列顺序固定", async () => {
    mockFlowSelect.mockReturnValue(
      flowQuery([{ department: "office", type: "office_interview" }]),
    );
    mockGetPublishedFlowResult.mockResolvedValue(
      publishedResult([
        {
          name: "张三",
          studentId: "B24040001",
          choice: 1,
          department: "office",
          interviewSlot: "9月1日 14:00",
          round1Average: 84.3,
          round2Average: 90,
          finalDepartment: "publicity",
          status: "passed",
          userFlowId: 21,
        },
      ]),
    );

    const response = await GET(request("7"));

    expect(response.headers.get("Content-Type")).toContain("text/csv");
    /* Excel 需要 UTF-8 BOM；Node 的 response.text() 会吞掉 BOM，所以按字节断言 */
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const lines = new TextDecoder("utf-8", { ignoreBOM: true })
      .decode(bytes)
      .split("\n");
    expect(lines[0]).toBe(
      "\uFEFF姓名,学号,志愿,投递部门,面试时段,一面均分,二面均分,最终去向,结果,结果来源记录 ID",
    );
    expect(lines[1]).toBe(
      "张三,B24040001,第一志愿,办公室,9月1日 14:00,84.3,90,科宣部,passed,21",
    );
  });

  it("旧快照缺少分轮字段时输出空单元格", async () => {
    mockFlowSelect.mockReturnValue(
      flowQuery([{ department: "office", type: "office_interview" }]),
    );
    mockGetPublishedFlowResult.mockResolvedValue(
      publishedResult([
        {
          name: "李四",
          studentId: "B24040002",
          choice: 2,
          department: "publicity",
          interviewSlot: "9月2日 10:00",
          finalDepartment: null,
          status: "failed",
          userFlowId: 22,
        },
      ]),
    );

    const response = await GET(request("7"));

    const lines = (await response.text()).split("\n");
    expect(lines[1]).toBe(
      "李四,B24040002,第二志愿,科宣部,9月2日 10:00,,,,failed,22",
    );
  });

  it("非办公类流程保持原有列", async () => {
    mockFlowSelect.mockReturnValue(
      flowQuery([{ department: "software", type: "recruitment" }]),
    );
    mockGetPublishedFlowResult.mockResolvedValue({
      resultSnapshot: {
        flowTitle: "2026 秋招笔试",
        rows: [
          {
            name: "王五",
            studentId: "B24040003",
            applyGroup: "software",
            status: "passed",
            userFlowId: 23,
          },
        ],
      },
    });

    const response = await GET(request("8"));

    const lines = (await response.text()).split("\n");
    expect(lines[0]).toBe("姓名,学号,投递组别,结果,结果来源记录 ID");
    expect(lines[1]).toBe("王五,B24040003,software,passed,23");
  });

  it("缺少有效流程 ID 时返回 400", async () => {
    const response = await GET(request("abc"));

    expect(response.status).toBe(400);
  });

  it("未登录时返回 401（不把登录跳转吞成 500/403）", async () => {
    mockVerifyManager.mockRejectedValue(
      Object.assign(new Error("NEXT_REDIRECT"), {
        digest: "NEXT_REDIRECT;replace;/login;307;",
      }),
    );

    const response = await GET(request("7"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      success: false,
      message: "未登录或会话已失效",
    });
  });

  it("无权导出时返回 403", async () => {
    mockVerifyManager.mockRejectedValue(
      new DepartmentAccessError("无权访问该部门"),
    );

    const response = await GET(request("7"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      success: false,
      message: "无权访问该部门",
    });
  });

  it("内部错误返回 500 且不回显内部信息", async () => {
    mockVerifyManager.mockRejectedValue(new Error("数据库连接串不可用"));

    const response = await GET(request("7"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      message: "导出流程结果失败",
    });
  });
});
