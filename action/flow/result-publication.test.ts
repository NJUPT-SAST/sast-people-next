/**
 * 结果快照的分轮成绩留档：一面=单人终评、二面=2-3 位部长均分。
 * getFlowRows 产出的行会原样写进 resultSnapshot.rows，并被导出 CSV / 名单弹窗消费，
 * 所以这里用假的 db 断言行结构（含两轮均分、份数与当前轮 scores 的兼容语义）。
 */

type MockDbState = {
  /** 按调用顺序排队的查询返回：每次 select().from(table) 消费一条 */
  selectQueue: Array<{ table: unknown; rows: unknown[] }>;
  updateValues: unknown[];
  updateQueue: unknown[][];
  insertValues: unknown[];
  insertQueue: unknown[][];
};

jest.mock("@/db/drizzle", () => {
  const state: MockDbState = {
    selectQueue: [],
    updateValues: [],
    updateQueue: [],
    insertValues: [],
    insertQueue: [],
  };

  /* 极简的 drizzle 链式替身：where/orderBy/limit/innerJoin 都只是原样返回，最后按队列返回数据 */
  const chainable = (resolve: () => unknown[]) => {
    const builder: Record<string, unknown> = {
      innerJoin: () => builder,
      where: () => builder,
      orderBy: () => builder,
      limit: () => builder,
      then: (
        onFulfilled: (rows: unknown[]) => unknown,
        onRejected?: (error: unknown) => unknown,
      ) => Promise.resolve().then(resolve).then(onFulfilled, onRejected),
    };
    return builder;
  };

  const db = {
    select: () => ({
      from: (table: unknown) => {
        const step = state.selectQueue.shift();
        if (!step) throw new Error("测试未准备这次查询的返回数据");
        if (step.table !== table) throw new Error("查询的表与测试预期不一致");
        return chainable(() => step.rows);
      },
    }),
    update: () => {
      const builder: Record<string, unknown> = {
        set: (values: unknown) => {
          state.updateValues.push(values);
          return builder;
        },
        where: () => builder,
        returning: () => Promise.resolve(state.updateQueue.shift() ?? []),
      };
      return builder;
    },
    insert: () => {
      const builder: Record<string, unknown> = {
        values: (values: unknown) => {
          state.insertValues.push(values);
          return builder;
        },
        returning: () => Promise.resolve(state.insertQueue.shift() ?? []),
      };
      return builder;
    },
  };

  return { db, __state: state };
});

const mockListPeopleUsersByLinkIds = jest.fn();
jest.mock("@/lib/link/user-lookup", () => ({
  listPeopleUsersByLinkIds: (...args: unknown[]) =>
    mockListPeopleUsersByLinkIds(...args),
}));

const mockReadResultEmailTemplateSetting = jest.fn();
jest.mock("@/lib/email-center/template-resolution", () => ({
  readResultEmailTemplateSetting: (...args: unknown[]) =>
    mockReadResultEmailTemplateSetting(...args),
}));

const mockVerifyManager = jest.fn();
const mockAssertFlowEditableRecord = jest.fn();
jest.mock("@/lib/authz", () => ({ verifyManager: () => mockVerifyManager() }));
jest.mock("@/lib/flow-access", () => ({
  assertFlowEditableRecord: (...args: unknown[]) =>
    mockAssertFlowEditableRecord(...args),
  canEditFlowRecord: () => true,
}));

jest.mock("@/lib/email-center/batch", () => ({
  createResultEmailBatch: jest.fn(async () => ({ batchId: null })),
}));
jest.mock("@/action/email/send", () => ({ sendEmailBatch: jest.fn() }));
jest.mock("@/action/user-flow/roleTransition", () => ({
  syncUserIdentityFromAcceptedFlows: jest.fn(async () => undefined),
}));
jest.mock("@/lib/operation-audit", () => ({
  writeOperationAudit: jest.fn(async () => undefined),
}));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/email/result-email", () => ({
  getResultEmailTemplateKey: () => "result_template",
}));

import {
  flow,
  flowResultPublication,
  interviewEvaluation,
  userFlow,
} from "@/db/schema";
import {
  getFlowResultPublicationSummary,
  publishFlowResults,
} from "./result-publication";

const dbState = (jest.requireMock("@/db/drizzle") as { __state: MockDbState })
  .__state;

/* 别名与真实查询一致：drizzle 返回的是 select 里定义的字段名 */
const candidateRow = (
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> => ({
  userFlowId: 21,
  userId: 9,
  applyGroup: "办公室",
  status: "ongoing",
  department: "office",
  choice: 1,
  round: 2,
  finalDepartment: null,
  interviewSlot: "9月1日 14:00",
  ...overrides,
});

const officeFlowRow = {
  id: 7,
  title: "2026 秋招办公室面试",
  type: "office_interview",
  department: "office",
  createdAt: new Date("2026-08-01T00:00:00Z"),
};

const templateSetting = {
  templateKey: "result_template",
  updatedAt: null,
  subjectTemplate: "subject",
  contentTemplate: "content",
  department: null,
};

beforeEach(() => {
  dbState.selectQueue = [];
  dbState.updateValues = [];
  dbState.updateQueue = [];
  dbState.insertValues = [];
  dbState.insertQueue = [];
  mockListPeopleUsersByLinkIds.mockReset();
  mockListPeopleUsersByLinkIds.mockResolvedValue(
    new Map([
      [9, { name: "张三", studentId: "B24040001" }],
      [10, { name: "李四", studentId: "B24040002" }],
    ]),
  );
  mockReadResultEmailTemplateSetting.mockReset();
  mockReadResultEmailTemplateSetting.mockResolvedValue(templateSetting);
  mockVerifyManager.mockReset();
  mockVerifyManager.mockResolvedValue({ uid: 1, role: 4, scope: { kind: "all" } });
  mockAssertFlowEditableRecord.mockReset();
});

describe("getFlowResultPublicationSummary 的分轮成绩", () => {
  it("按轮统计已提交/已通过的面评均分与份数，并保留当前轮 scores 的原有语义", async () => {
    dbState.selectQueue = [
      { table: flow, rows: [officeFlowRow] },
      { table: flowResultPublication, rows: [] },
      {
        table: userFlow,
        rows: [
          candidateRow(),
          candidateRow({
            userFlowId: 22,
            userId: 10,
            applyGroup: "科宣部",
            choice: 2,
          }),
        ],
      },
      {
        table: interviewEvaluation,
        rows: [
          { userFlowId: 21, round: 1, status: "submitted", score: 88 },
          /* 退回重写的一面面评不算分 */
          { userFlowId: 21, round: 1, status: "returned", score: 60 },
          { userFlowId: 21, round: 2, status: "approved", score: 84 },
          { userFlowId: 21, round: 2, status: "submitted", score: 90 },
          /* 退回的二面面评仍留在 scores 里供名单确认核对，但不进均分 */
          { userFlowId: 21, round: 2, status: "returned", score: 10 },
          /* 未打分的历史记录直接忽略 */
          { userFlowId: 21, round: 2, status: "submitted", score: null },
          { userFlowId: 22, round: 1, status: "submitted", score: 70 },
          { userFlowId: 22, round: 2, status: "returned", score: 55 },
        ],
      },
      {
        table: userFlow,
        rows: [
          {
            userFlowId: 21,
            userId: 9,
            choice: 1,
            rowDepartment: "office",
            flowDepartment: "office",
            flowTitle: "办公室面试",
          },
          {
            userFlowId: 22,
            userId: 10,
            choice: 2,
            rowDepartment: "publicity",
            flowDepartment: "publicity",
            flowTitle: "科宣部面试",
          },
        ],
      },
    ];

    const summary = await getFlowResultPublicationSummary(7);

    expect(summary.isOfficeFlow).toBe(true);
    expect(summary.rows).toHaveLength(2);
    const [zhang, li] = summary.rows;
    expect(zhang.round1Average).toBe(88);
    expect(zhang.round1Count).toBe(1);
    /* 二面均分 = (84 + 90) / 2，退回的 10 分不计入 */
    expect(zhang.round2Average).toBe(87);
    expect(zhang.round2Count).toBe(2);
    expect(zhang.scores).toEqual([84, 90, 10]);
    expect(zhang.interviewSlot).toBe("9月1日 14:00");

    expect(li.round1Average).toBe(70);
    expect(li.round1Count).toBe(1);
    expect(li.round2Average).toBeNull();
    expect(li.round2Count).toBe(0);
    expect(li.scores).toEqual([55]);
  });

  it("均分保留 1 位小数", async () => {
    dbState.selectQueue = [
      { table: flow, rows: [officeFlowRow] },
      { table: flowResultPublication, rows: [] },
      { table: userFlow, rows: [candidateRow()] },
      {
        table: interviewEvaluation,
        rows: [
          { userFlowId: 21, round: 1, status: "approved", score: 81 },
          { userFlowId: 21, round: 2, status: "submitted", score: 84 },
          { userFlowId: 21, round: 2, status: "submitted", score: 86 },
          { userFlowId: 21, round: 2, status: "submitted", score: 88 },
        ],
      },
      { table: userFlow, rows: [] },
    ];

    const summary = await getFlowResultPublicationSummary(7);

    expect(summary.rows[0].round1Average).toBe(81);
    expect(summary.rows[0].round2Average).toBe(86);
  });

  it("非办公类流程不带分轮成绩", async () => {
    dbState.selectQueue = [
      { table: flow, rows: [{ ...officeFlowRow, type: "recruitment" }] },
      { table: flowResultPublication, rows: [] },
      { table: userFlow, rows: [candidateRow({ round: null, choice: null })] },
    ];

    const summary = await getFlowResultPublicationSummary(7);

    expect(summary.isOfficeFlow).toBe(false);
    expect(summary.rows[0].round1Average).toBeNull();
    expect(summary.rows[0].round1Count).toBe(0);
    expect(summary.rows[0].round2Average).toBeNull();
    expect(summary.rows[0].round2Count).toBe(0);
    expect(summary.rows[0].scores).toEqual([]);
  });

  it("最终去向候选过滤掉已落选/已撤回的志愿部门", async () => {
    dbState.selectQueue = [
      { table: flow, rows: [officeFlowRow] },
      { table: flowResultPublication, rows: [] },
      { table: userFlow, rows: [candidateRow()] },
      { table: interviewEvaluation, rows: [] },
      {
        table: userFlow,
        rows: [
          {
            userFlowId: 21,
            userId: 9,
            choice: 1,
            progressStatus: "ongoing",
            rowDepartment: "office",
            flowDepartment: "office",
            flowTitle: "办公室面试",
          },
          /* 第二志愿已落选：不能作为最终去向，不进选择器 */
          {
            userFlowId: 22,
            userId: 9,
            choice: 2,
            progressStatus: "failed",
            rowDepartment: "publicity",
            flowDepartment: "publicity",
            flowTitle: "科宣部面试",
          },
        ],
      },
    ];

    const summary = await getFlowResultPublicationSummary(7);

    expect(summary.rows[0].officeChoices).toEqual([
      expect.objectContaining({ department: "office", choice: 1 }),
    ]);
  });
});

describe("publishFlowResults 的结果快照", () => {
  it("快照行带上两轮均分与份数，供导出 CSV 与名单弹窗使用", async () => {
    const evaluationRows = [
      { userFlowId: 21, round: 1, status: "submitted", score: 88 },
      { userFlowId: 21, round: 2, status: "submitted", score: 84 },
      { userFlowId: 21, round: 2, status: "approved", score: 92 },
    ];
    const candidate = candidateRow({ status: "passed" });
    /* getFlowRows 的三次查询：候选人、面评分轮、办公类志愿 */
    const rowQueries = [
      { table: userFlow, rows: [candidate] },
      { table: interviewEvaluation, rows: evaluationRows },
      { table: userFlow, rows: [] as unknown[] },
    ];
    dbState.selectQueue = [
      /* 发布前先读一次汇总（流程 + 发布记录 + 行），再单独读一次行用于快照 */
      { table: flow, rows: [officeFlowRow] },
      { table: flowResultPublication, rows: [] },
      ...rowQueries,
      ...rowQueries,
      /* 已存在的发布记录（失败态）→ 走重试更新分支 */
      {
        table: flowResultPublication,
        rows: [{ id: 55, status: "failed", version: 1 }],
      },
    ];
    dbState.updateQueue = [[{ id: 55 }], [{ id: 55 }]];

    const result = await publishFlowResults(7, true);

    expect(result.publicationId).toBe(55);
    const snapshot = dbState.updateValues[0] as {
      resultSnapshot: { rows: Array<Record<string, unknown>> };
    };
    const snapshotRow = snapshot.resultSnapshot.rows[0];
    expect(snapshotRow.round1Average).toBe(88);
    expect(snapshotRow.round1Count).toBe(1);
    expect(snapshotRow.round2Average).toBe(88);
    expect(snapshotRow.round2Count).toBe(2);
    expect(snapshotRow.scores).toEqual([84, 92]);
  });
});
