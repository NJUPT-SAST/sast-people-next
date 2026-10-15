/** @jest-environment node */

/**
 * 阅卷公平性分析的数据加载（部门 scope 与统计口径）：
 * - 本部门部长能加载本部门流程：`observations` 只含 `fk_judger_id` 非空的行，
 *   `points` / `maxPoints` 与写入一致；`unattributedCount` 只计数、不进模型；
 * - `fit.observationCount === observations.length`，且只有一名阅卷人时 `identifiable === false`；
 * - `problemLabels` / `candidateLabels` / `judgerLabels` 恰好覆盖 observations 里出现的 id，
 *   姓名来自 Link 查询；Link 查询抛错时分析照常返回、标签为 null；
 * - 跨部门（其他部门部长）读同一流程返回 null，不抛错；`is_deleted` 流程返回 null；
 * - 全局流程（`flow.department` 为空）里跨部门考生的评分行按候选人部门隔离：
 *   本部门部长只看到本部门考生的卷子，管理员（scope all）看到两个部门；
 * - `listGradingFairnessFlows` 与详情页同口径：只算已归属评分行（`observationCount === fit.observationCount`），
 *   用同一套宽松可见性（全局流程因本部门有报名也会出现）并按候选人部门过滤，
 *   `scope: none` 返回空数组。
 */

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for PostgreSQL integration tests");
}

jest.mock("@/lib/server-error-log", () => ({
  logServerError: jest.fn(),
}));

jest.mock("@/lib/link/user-lookup", () => ({
  listPeopleUsersByLinkIds: jest.fn(),
}));

import type * as authzModule from "@/lib/authz";

type MockSession = {
  uid: number;
  role: number;
  realRole: number;
  name: string;
  department: string | null;
  scope:
    | { kind: "all" }
    | { kind: "department"; department: string }
    | { kind: "none" };
};

const mockSession: MockSession = {
  uid: 922001,
  role: 3,
  realRole: 3,
  name: "部长甲",
  department: "publicity",
  scope: { kind: "department", department: "publicity" },
};

jest.mock("@/lib/authz", () => {
  const actual = jest.requireActual<typeof authzModule>("@/lib/authz");
  return {
    ...actual,
    verifyScopedRole: jest.fn(async (role: number) => {
      if (mockSession.role < role) {
        throw new Error("Unauthorized operation");
      }
      return mockSession;
    }),
  };
});

import { inArray } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { flow, flowStep, problem, userFlow, userPoint } from "@/db/schema";
import {
  listGradingFairnessFlows,
  loadGradingFairnessData,
} from "@/action/user-flow/grading-fairness/load";
import { ADMIN_ROLE, MANAGER_ROLE } from "@/lib/link/role";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { logServerError } from "@/lib/server-error-log";

const OWN_MANAGER_ID = 922001;
const OTHER_MANAGER_ID = 922002;
const OWN_DEPARTMENT = "publicity";
const OTHER_DEPARTMENT = "software";
const TITLE_PREFIX = "SMOKE-公平性加载-";

/** 本部门流程：唯一阅卷人（生产现状） */
const OWN_JUDGER = 922101;
/** 其他部门流程的阅卷人 */
const OTHER_JUDGER = 922102;
const OWN_CANDIDATE_1 = 922201;
const OWN_CANDIDATE_2 = 922202;
/** 只出现在未归属评分行里：不应进入 candidateLabels */
const OWN_CANDIDATE_3 = 922203;
const OTHER_CANDIDATE_1 = 922301;
const OTHER_CANDIDATE_2 = 922302;
/** 全局共享流程（flow.department 为空）里的两名考生：分属本部门与其他部门 */
const GLOBAL_CANDIDATE_OWN = 922401;
const GLOBAL_CANDIDATE_OTHER = 922402;

const OWN_PROBLEM_1_TITLE = `${TITLE_PREFIX}题一`;
const OWN_PROBLEM_2_TITLE = `${TITLE_PREFIX}题二`;

/** Link 姓名查询的固定返回（与用户 ID 一一对应） */
const peopleUsers = new Map<number, { name: string; studentId: string | null }>([
  [OWN_CANDIDATE_1, { name: "考生甲", studentId: "2022001" }],
  [OWN_CANDIDATE_2, { name: "考生乙", studentId: "2022002" }],
  [OWN_CANDIDATE_3, { name: "考生丙", studentId: "2022003" }],
  [OWN_JUDGER, { name: "讲师甲", studentId: null }],
  [GLOBAL_CANDIDATE_OWN, { name: "全局考生甲", studentId: "2024001" }],
  [GLOBAL_CANDIDATE_OTHER, { name: "全局考生乙", studentId: "2024002" }],
]);

const peopleLookup = listPeopleUsersByLinkIds as unknown as jest.Mock;

const createdFlowIds: number[] = [];

const actAsManagerOf = (department: string) => {
  mockSession.uid = department === OWN_DEPARTMENT ? OWN_MANAGER_ID : OTHER_MANAGER_ID;
  mockSession.role = MANAGER_ROLE;
  mockSession.realRole = MANAGER_ROLE;
  mockSession.name = department === OWN_DEPARTMENT ? "部长甲" : "部长乙";
  mockSession.department = department;
  mockSession.scope = { kind: "department", department };
};

const actAsAdmin = () => {
  mockSession.uid = 922003;
  mockSession.role = ADMIN_ROLE;
  mockSession.realRole = ADMIN_ROLE;
  mockSession.name = "管理员";
  mockSession.department = null;
  mockSession.scope = { kind: "all" };
};

type FlowFixture = {
  flowId: number;
  problemIds: number[];
  userFlowIds: number[];
};

const createFlowFixture = async (options: {
  title: string;
  department: string | null;
  isDeleted?: boolean;
  candidates: Array<{ userId: number; department: string | null }>;
  problems: Array<{ title: string; score: number }>;
}): Promise<FlowFixture> => {
  const [flowRow] = await db
    .insert(flow)
    .values({
      title: options.title,
      type: "recruitment",
      department: options.department,
      ownerId: OWN_MANAGER_ID,
      isDeleted: options.isDeleted ?? false,
    })
    .returning({ id: flow.id });
  createdFlowIds.push(flowRow.id);

  const [step] = await db
    .insert(flowStep)
    .values({
      title: `${options.title}-笔试`,
      type: "checking",
      order: 2,
      fkFlowId: flowRow.id,
    })
    .returning({ id: flowStep.id });

  const problemRows = await db
    .insert(problem)
    .values(
      options.problems.map((item) => ({
        title: item.title,
        score: item.score,
        fkFlowStepId: step.id,
      })),
    )
    .returning({ id: problem.id });

  const candidateRows = await db
    .insert(userFlow)
    .values(
      options.candidates.map((candidate) => ({
        fkFlowId: flowRow.id,
        fkUserId: candidate.userId,
        progressStatus: "ongoing" as const,
        department: candidate.department,
        fkCurrentStepId: step.id,
      })),
    )
    .returning({ id: userFlow.id });

  return {
    flowId: flowRow.id,
    problemIds: problemRows.map((row) => row.id),
    userFlowIds: candidateRows.map((row) => row.id),
  };
};

const sortedIds = (ids: number[]) => [...ids].sort((left, right) => left - right);

describe("阅卷公平性数据加载（部门 scope 与统计口径）", () => {
  let own: FlowFixture;
  let other: FlowFixture;
  let unscored: FlowFixture;
  let unattributedOnly: FlowFixture;
  let deleted: FlowFixture;
  let shared: FlowFixture;

  beforeAll(async () => {
    own = await createFlowFixture({
      title: `${TITLE_PREFIX}本部门`,
      department: OWN_DEPARTMENT,
      candidates: [
        { userId: OWN_CANDIDATE_1, department: OWN_DEPARTMENT },
        { userId: OWN_CANDIDATE_2, department: OWN_DEPARTMENT },
        { userId: OWN_CANDIDATE_3, department: OWN_DEPARTMENT },
      ],
      problems: [
        { title: OWN_PROBLEM_1_TITLE, score: 100 },
        { title: OWN_PROBLEM_2_TITLE, score: 60 },
      ],
    });

    other = await createFlowFixture({
      title: `${TITLE_PREFIX}其他部门`,
      department: OTHER_DEPARTMENT,
      candidates: [
        { userId: OTHER_CANDIDATE_1, department: OTHER_DEPARTMENT },
        { userId: OTHER_CANDIDATE_2, department: OTHER_DEPARTMENT },
      ],
      problems: [
        { title: `${TITLE_PREFIX}题一`, score: 100 },
        { title: `${TITLE_PREFIX}题二`, score: 50 },
      ],
    });

    /* 有步骤与考生但没有任何评分记录：不该出现在流程列表里 */
    unscored = await createFlowFixture({
      title: `${TITLE_PREFIX}本部门-未评分`,
      department: OWN_DEPARTMENT,
      candidates: [{ userId: OWN_CANDIDATE_1, department: OWN_DEPARTMENT }],
      problems: [
        { title: OWN_PROBLEM_1_TITLE, score: 100 },
        { title: OWN_PROBLEM_2_TITLE, score: 60 },
      ],
    });

    /* 只有未记录阅卷人的评分行：列表口径只算已归属行，因此同样不该出现 */
    unattributedOnly = await createFlowFixture({
      title: `${TITLE_PREFIX}本部门-仅未归属`,
      department: OWN_DEPARTMENT,
      candidates: [{ userId: OWN_CANDIDATE_2, department: OWN_DEPARTMENT }],
      problems: [
        { title: OWN_PROBLEM_1_TITLE, score: 100 },
        { title: OWN_PROBLEM_2_TITLE, score: 60 },
      ],
    });

    /* 已软删除但有评分记录：既不该被加载，也不该出现在列表里 */
    deleted = await createFlowFixture({
      title: `${TITLE_PREFIX}本部门-已删除`,
      department: OWN_DEPARTMENT,
      isDeleted: true,
      candidates: [{ userId: OWN_CANDIDATE_1, department: OWN_DEPARTMENT }],
      problems: [{ title: OWN_PROBLEM_1_TITLE, score: 100 }],
    });

    /* 全局共享流程：flow.department 为空，考生分属两个部门（本部门有报名故本部门可见） */
    shared = await createFlowFixture({
      title: `${TITLE_PREFIX}全局共享`,
      department: null,
      candidates: [
        { userId: GLOBAL_CANDIDATE_OWN, department: OWN_DEPARTMENT },
        { userId: GLOBAL_CANDIDATE_OTHER, department: OTHER_DEPARTMENT },
      ],
      problems: [
        { title: OWN_PROBLEM_1_TITLE, score: 100 },
        { title: OWN_PROBLEM_2_TITLE, score: 60 },
      ],
    });

    const [ownC1, ownC2, ownC3] = own.userFlowIds;
    const [ownP1, ownP2] = own.problemIds;
    const [otherC1, otherC2] = other.userFlowIds;
    const [otherP1, otherP2] = other.problemIds;

    await db.insert(userPoint).values([
      /* 唯一阅卷人的两条观测：两条题各一条，覆盖两个 problem */
      { fkUserFlowId: ownC1, fkProblemId: ownP1, points: 80, fkJudgerId: OWN_JUDGER },
      /* 未记录阅卷人的评分行：只计数，不进模型 */
      { fkUserFlowId: ownC1, fkProblemId: ownP2, points: 30, fkJudgerId: null },
      { fkUserFlowId: ownC2, fkProblemId: ownP1, points: 90, fkJudgerId: null },
      { fkUserFlowId: ownC2, fkProblemId: ownP2, points: 45, fkJudgerId: OWN_JUDGER },
      /* 该考生只有未归属行：不应进入 candidateLabels */
      { fkUserFlowId: ownC3, fkProblemId: ownP1, points: 55, fkJudgerId: null },
      { fkUserFlowId: ownC3, fkProblemId: ownP2, points: 70, fkJudgerId: null },
    ]);

    await db.insert(userPoint).values([
      { fkUserFlowId: otherC1, fkProblemId: otherP1, points: 70, fkJudgerId: OTHER_JUDGER },
      { fkUserFlowId: otherC1, fkProblemId: otherP2, points: 40, fkJudgerId: null },
      { fkUserFlowId: otherC2, fkProblemId: otherP1, points: 88, fkJudgerId: OTHER_JUDGER },
    ]);

    await db.insert(userPoint).values([
      /* 未归属流程：两条行都没有阅卷人 */
      {
        fkUserFlowId: unattributedOnly.userFlowIds[0],
        fkProblemId: unattributedOnly.problemIds[0],
        points: 60,
        fkJudgerId: null,
      },
      {
        fkUserFlowId: unattributedOnly.userFlowIds[0],
        fkProblemId: unattributedOnly.problemIds[1],
        points: 50,
        fkJudgerId: null,
      },
    ]);

    await db.insert(userPoint).values({
      fkUserFlowId: deleted.userFlowIds[0],
      fkProblemId: deleted.problemIds[0],
      points: 66,
      fkJudgerId: OWN_JUDGER,
    });

    /* 全局流程：本部门考生与其他部门考生各有 1 条已归属 + 1 条未归属评分行 */
    const [sharedOwnCandidate, sharedOtherCandidate] = shared.userFlowIds;
    const [sharedP1, sharedP2] = shared.problemIds;
    await db.insert(userPoint).values([
      {
        fkUserFlowId: sharedOwnCandidate,
        fkProblemId: sharedP1,
        points: 80,
        fkJudgerId: OWN_JUDGER,
      },
      { fkUserFlowId: sharedOwnCandidate, fkProblemId: sharedP2, points: 40, fkJudgerId: null },
      {
        fkUserFlowId: sharedOtherCandidate,
        fkProblemId: sharedP1,
        points: 70,
        fkJudgerId: OTHER_JUDGER,
      },
      { fkUserFlowId: sharedOtherCandidate, fkProblemId: sharedP2, points: 50, fkJudgerId: null },
    ]);
  });

  afterAll(async () => {
    if (createdFlowIds.length === 0) return;

    /* 按外键顺序清理：user_point → user_flow / problem → flow_step → flow */
    const stepRows = await db
      .select({ id: flowStep.id })
      .from(flowStep)
      .where(inArray(flowStep.fkFlowId, createdFlowIds));
    const stepIds = stepRows.map((row) => row.id);

    const problemRows =
      stepIds.length > 0
        ? await db
            .select({ id: problem.id })
            .from(problem)
            .where(inArray(problem.fkFlowStepId, stepIds))
        : [];
    const problemIds = problemRows.map((row) => row.id);

    if (problemIds.length > 0) {
      await db.delete(userPoint).where(inArray(userPoint.fkProblemId, problemIds));
    }
    await db.delete(userFlow).where(inArray(userFlow.fkFlowId, createdFlowIds));
    if (stepIds.length > 0) {
      await db.delete(problem).where(inArray(problem.fkFlowStepId, stepIds));
    }
    await db.delete(flowStep).where(inArray(flowStep.fkFlowId, createdFlowIds));
    await db.delete(flow).where(inArray(flow.id, createdFlowIds));
  });

  beforeEach(() => {
    actAsManagerOf(OWN_DEPARTMENT);
    peopleLookup.mockResolvedValue(peopleUsers);
  });

  it("本部门部长加载：只统计有阅卷人的行，未归属行只计数不进模型", async () => {
    const data = await loadGradingFairnessData(own.flowId);
    if (!data) throw new Error("本部门部长应能加载本部门流程");

    expect(data.flow).toEqual({
      id: own.flowId,
      title: `${TITLE_PREFIX}本部门`,
      department: OWN_DEPARTMENT,
    });

    const [ownC1, ownC2] = own.userFlowIds;
    const [ownP1, ownP2] = own.problemIds;

    /* observations 只有 fk_judger_id 非空的行，且分数/满分与写入一致 */
    const observations = [...data.observations].sort(
      (left, right) =>
        left.userFlowId - right.userFlowId || left.problemId - right.problemId,
    );
    expect(observations).toEqual([
      {
        userFlowId: ownC1,
        problemId: ownP1,
        judgerId: OWN_JUDGER,
        points: 80,
        maxPoints: 100,
      },
      {
        userFlowId: ownC2,
        problemId: ownP2,
        judgerId: OWN_JUDGER,
        points: 45,
        maxPoints: 60,
      },
    ]);

    /* 4 条未记录阅卷人的行只进 unattributedCount */
    expect(data.unattributedCount).toBe(4);

    expect(data.fit.observationCount).toBe(data.observations.length);
    expect(data.fit.observationCount).toBe(2);
    expect(data.fit.candidateCount).toBe(2);
    expect(data.fit.problemCount).toBe(2);
    expect(data.fit.judgerCount).toBe(1);
    /* 只有一名阅卷人：星形关联图，宽严不可辨识（当前生产形态） */
    expect(data.fit.identifiable).toBe(false);
    expect(data.fit.judgers.map((judger) => judger.verdict)).toEqual(["unknown"]);
    expect(data.fit.judgers[0]?.observationCount).toBe(2);
  });

  it("标签恰好覆盖 observations 里的 id，姓名来自 Link 查询", async () => {
    const data = await loadGradingFairnessData(own.flowId);
    if (!data) throw new Error("本部门部长应能加载本部门流程");

    const [ownC1, ownC2, ownC3] = own.userFlowIds;
    const [ownP1, ownP2] = own.problemIds;

    /* 查询的 ID 集合 = 观测里的考生用户 + 阅卷人（去重） */
    const requestedIds = peopleLookup.mock.calls[0]?.[0] as number[];
    expect(sortedIds(requestedIds)).toEqual(
      sortedIds([OWN_CANDIDATE_1, OWN_CANDIDATE_2, OWN_JUDGER]),
    );

    expect(data.problemLabels).toEqual({
      [String(ownP1)]: { title: OWN_PROBLEM_1_TITLE, maxPoints: 100 },
      [String(ownP2)]: { title: OWN_PROBLEM_2_TITLE, maxPoints: 60 },
    });
    expect(sortedIds(Object.keys(data.candidateLabels).map(Number))).toEqual(
      sortedIds([ownC1, ownC2]),
    );
    expect(data.candidateLabels).toEqual({
      [String(ownC1)]: { name: "考生甲", studentId: "2022001" },
      [String(ownC2)]: { name: "考生乙", studentId: "2022002" },
    });
    /* 只有未归属评分行的考生不进标签 */
    expect(data.candidateLabels[String(ownC3)]).toBeUndefined();
    expect(data.judgerLabels).toEqual({ [String(OWN_JUDGER)]: "讲师甲" });
  });

  it("Link 姓名查询失败时分析照常返回，标签为 null", async () => {
    peopleLookup.mockRejectedValueOnce(new Error("Link 不可用"));

    const data = await loadGradingFairnessData(own.flowId);
    if (!data) throw new Error("Link 查询失败不应让加载整体失败");

    const [ownC1, ownC2] = own.userFlowIds;
    const [ownP1, ownP2] = own.problemIds;

    expect(data.observations).toHaveLength(2);
    expect(data.fit.observationCount).toBe(2);
    expect(data.unattributedCount).toBe(4);
    /* 题库信息来自本地表，不受 Link 影响 */
    expect(data.problemLabels).toEqual({
      [String(ownP1)]: { title: OWN_PROBLEM_1_TITLE, maxPoints: 100 },
      [String(ownP2)]: { title: OWN_PROBLEM_2_TITLE, maxPoints: 60 },
    });
    expect(data.candidateLabels).toEqual({
      [String(ownC1)]: { name: null, studentId: null },
      [String(ownC2)]: { name: null, studentId: null },
    });
    expect(data.judgerLabels).toEqual({ [String(OWN_JUDGER)]: null });

    expect(logServerError).toHaveBeenCalledWith(
      "grading-fairness:loadData",
      expect.any(Error),
      expect.objectContaining({ action: "load-people-labels", flowId: own.flowId }),
    );
  });

  it("跨部门读取同一流程返回 null 而不是抛错", async () => {
    actAsManagerOf(OTHER_DEPARTMENT);
    await expect(loadGradingFairnessData(own.flowId)).resolves.toBeNull();

    actAsManagerOf(OWN_DEPARTMENT);
    await expect(loadGradingFairnessData(other.flowId)).resolves.toBeNull();
  });

  it("is_deleted 的流程返回 null", async () => {
    await expect(loadGradingFairnessData(deleted.flowId)).resolves.toBeNull();
  });

  it("流程列表只含 scope 内有已归属评分记录的流程，口径与 fit 一致", async () => {
    const flows = await listGradingFairnessFlows();
    const listedIds = flows.map((item) => item.id);

    const loaded = await loadGradingFairnessData(own.flowId);
    if (!loaded) throw new Error("本部门部长应能加载本部门流程");

    const listed = flows.find((item) => item.id === own.flowId);
    expect(listed).toEqual({
      id: own.flowId,
      title: `${TITLE_PREFIX}本部门`,
      department: OWN_DEPARTMENT,
      /* 6 条评分行里只有 2 条记录了阅卷人：列表只算已归属行 */
      observationCount: 2,
      judgerCount: 1,
    });
    /* 与详情页同一口径（未归属行两边都不算） */
    expect(listed?.observationCount).toBe(loaded.fit.observationCount);
    expect(loaded.observations).toHaveLength(2);
    expect(loaded.unattributedCount).toBe(4);

    expect(listedIds).not.toContain(unscored.flowId);
    /* 只有未归属评分行的流程：列表口径下等同于「没有评分记录」 */
    expect(listedIds).not.toContain(unattributedOnly.flowId);
    expect(listedIds).not.toContain(other.flowId);
    expect(listedIds).not.toContain(deleted.flowId);
  });

  it("全局流程里只分析本部门考生的卷子，管理员可看到两个部门", async () => {
    const [sharedOwnCandidate, sharedOtherCandidate] = shared.userFlowIds;
    const [sharedP1] = shared.problemIds;

    const asOwnManager = await loadGradingFairnessData(shared.flowId);
    if (!asOwnManager) throw new Error("本部门有报名，全局流程应可见");

    expect(asOwnManager.flow).toEqual({
      id: shared.flowId,
      title: `${TITLE_PREFIX}全局共享`,
      department: null,
    });
    /* 其他部门考生（software）的评分行不出现 */
    expect(asOwnManager.observations).toEqual([
      {
        userFlowId: sharedOwnCandidate,
        problemId: sharedP1,
        judgerId: OWN_JUDGER,
        points: 80,
        maxPoints: 100,
      },
    ]);
    expect(asOwnManager.fit.observationCount).toBe(1);
    /* 未归属计数同样只统计本部门考生 */
    expect(asOwnManager.unattributedCount).toBe(1);
    expect(Object.keys(asOwnManager.problemLabels)).toEqual([String(sharedP1)]);
    expect(Object.keys(asOwnManager.candidateLabels)).toEqual([
      String(sharedOwnCandidate),
    ]);
    expect(asOwnManager.candidateLabels[String(sharedOwnCandidate)]).toEqual({
      name: "全局考生甲",
      studentId: "2024001",
    });
    expect(asOwnManager.judgerLabels).toEqual({ [String(OWN_JUDGER)]: "讲师甲" });

    actAsAdmin();
    const asAdmin = await loadGradingFairnessData(shared.flowId);
    if (!asAdmin) throw new Error("管理员应能加载全局流程");

    expect(
      [...asAdmin.observations].sort(
        (left, right) => left.userFlowId - right.userFlowId,
      ),
    ).toEqual([
      {
        userFlowId: sharedOwnCandidate,
        problemId: sharedP1,
        judgerId: OWN_JUDGER,
        points: 80,
        maxPoints: 100,
      },
      {
        userFlowId: sharedOtherCandidate,
        problemId: sharedP1,
        judgerId: OTHER_JUDGER,
        points: 70,
        maxPoints: 100,
      },
    ]);
    expect(asAdmin.fit.observationCount).toBe(2);
    expect(asAdmin.unattributedCount).toBe(2);
    expect(sortedIds(Object.keys(asAdmin.candidateLabels).map(Number))).toEqual(
      sortedIds([sharedOwnCandidate, sharedOtherCandidate]),
    );
  });

  it("全局流程出现在本部门列表里，只计本部门考生的已归属行", async () => {
    const flows = await listGradingFairnessFlows();
    const listed = flows.find((item) => item.id === shared.flowId);

    /* 全局流程（department 为空）因本部门有报名而可见，且只计本部门考生的已归属行 */
    expect(listed).toEqual({
      id: shared.flowId,
      title: `${TITLE_PREFIX}全局共享`,
      department: null,
      observationCount: 1,
      judgerCount: 1,
    });

    const asOwnManager = await loadGradingFairnessData(shared.flowId);
    if (!asOwnManager) throw new Error("本部门有报名，全局流程应可见");
    expect(listed?.observationCount).toBe(asOwnManager.fit.observationCount);

    actAsAdmin();
    const listedAsAdmin = (await listGradingFairnessFlows()).find(
      (item) => item.id === shared.flowId,
    );
    /* 管理员不过滤候选人部门：两个部门的已归属行都算 */
    expect(listedAsAdmin).toEqual({
      id: shared.flowId,
      title: `${TITLE_PREFIX}全局共享`,
      department: null,
      observationCount: 2,
      judgerCount: 2,
    });

    const asAdmin = await loadGradingFairnessData(shared.flowId);
    if (!asAdmin) throw new Error("管理员应能加载全局流程");
    expect(listedAsAdmin?.observationCount).toBe(asAdmin.fit.observationCount);
  });

  it("scope 为 none 时列表为空、单流程加载返回 null", async () => {
    mockSession.scope = { kind: "none" };

    await expect(listGradingFairnessFlows()).resolves.toEqual([]);
    await expect(loadGradingFairnessData(own.flowId)).resolves.toBeNull();
  });
});
