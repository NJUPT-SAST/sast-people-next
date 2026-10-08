/** @jest-environment node */

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

jest.mock("@/lib/operation-audit", () => ({
  writeOperationAudit: jest.fn(async () => undefined),
}));

jest.mock("@/lib/server-error-log", () => ({
  logServerError: jest.fn(),
}));

jest.mock("@/lib/authz", () => {
  const actual = jest.requireActual("@/lib/authz");
  const session = {
    uid: 900995,
    role: 3,
    department: "publicity",
    scope: { kind: "department", department: "publicity" },
  };
  return {
    ...actual,
    verifyManager: jest.fn(async () => session),
    verifyScopedRole: jest.fn(async () => session),
  };
});

import { db } from "@/db/drizzle";
import {
  flow,
  flowResultPublication,
  flowStep,
  userFlow,
} from "@/db/schema";
import { eq, inArray, like } from "drizzle-orm";
import {
  closeOfficeRoundOne,
  closeOfficeRoundTwo,
} from "@/action/user-flow/office-rounds";

/* 名单确认的护栏：结果一旦发布，名单与结果锁定，不能再改；
   候选人已被撤回时名单确认不能把他「复活」。 */
const OWNER_ID = 900995;
const CANDIDATE_ID = 900996;
const TITLE_PREFIX = "SMOKEGUARD-";

let flowId = 0;
let candidateA = 0;
let candidateB = 0;
let roundOneStepId = 0;

beforeAll(async () => {
  const [created] = await db
    .insert(flow)
    .values({
      title: `${TITLE_PREFIX}办公类流程-科宣部`,
      type: "office_interview",
      department: "publicity",
      ownerId: OWNER_ID,
      slotOptions: [{ label: "13:00-14:00" }],
    })
    .returning({ id: flow.id });
  flowId = created.id;

  const steps = await db
    .insert(flowStep)
    .values([
      { title: "报名", type: "registering" as const, order: 1, fkFlowId: flowId },
      { title: "一面面试", type: "checking" as const, order: 2, fkFlowId: flowId },
      { title: "二轮面试", type: "checking" as const, order: 3, fkFlowId: flowId },
      { title: "结果确认", type: "finished" as const, order: 4, fkFlowId: flowId },
    ])
    .returning({ id: flowStep.id, order: flowStep.order });
  roundOneStepId = steps.find((step) => step.order === 2)?.id ?? 0;

  const candidates = await db
    .insert(userFlow)
    .values([
      {
        fkFlowId: flowId,
        fkUserId: CANDIDATE_ID,
        fkCurrentStepId: roundOneStepId,
        progressStatus: "ongoing",
        round: 1,
        choice: 1,
        department: "publicity",
      },
      {
        fkFlowId: flowId,
        fkUserId: CANDIDATE_ID + 1,
        fkCurrentStepId: roundOneStepId,
        progressStatus: "ongoing",
        round: 1,
        choice: 1,
        department: "publicity",
      },
    ])
    .returning({ id: userFlow.id });
  candidateA = candidates[0].id;
  candidateB = candidates[1].id;
});

afterAll(async () => {
  const guardFlows = await db
    .select({ id: flow.id })
    .from(flow)
    .where(like(flow.title, `${TITLE_PREFIX}%`));
  const flowIds = guardFlows.map((row) => row.id);
  if (flowIds.length === 0) return;

  const candidates = await db
    .select({ id: userFlow.id })
    .from(userFlow)
    .where(inArray(userFlow.fkFlowId, flowIds));
  await db
    .delete(flowResultPublication)
    .where(inArray(flowResultPublication.fkFlowId, flowIds));
  await db.delete(userFlow).where(
    inArray(
      userFlow.id,
      candidates.map((row) => row.id),
    ),
  );
  await db.delete(flowStep).where(inArray(flowStep.fkFlowId, flowIds));
  await db.delete(flow).where(inArray(flow.id, flowIds));
});

const readCandidate = async (id: number) => {
  const [row] = await db
    .select({
      status: userFlow.progressStatus,
      round: userFlow.round,
    })
    .from(userFlow)
    .where(eq(userFlow.id, id))
    .limit(1);
  return row;
};

describe("办公类名单确认的护栏", () => {
  it("候选人已被撤回时拒绝确认，不会把撤回的报名复活", async () => {
    await db
      .update(userFlow)
      .set({ progressStatus: "withdrawn" })
      .where(eq(userFlow.id, candidateB));

    const result = await closeOfficeRoundOne(
      flowId,
      [
        { userFlowId: candidateA, passed: true },
        { userFlowId: candidateB, passed: true },
      ],
      [candidateA, candidateB],
      true,
    );

    expect(result.success).toBe(false);
    if (result.success) throw new Error("撤回的候选人不该被确认通过");
    expect(result.error.message).toContain("名单已变化");

    const withdrawn = await readCandidate(candidateB);
    expect(withdrawn.status).toBe("withdrawn");
    expect(withdrawn.round).toBe(1);

    /* 撤回后名单里只剩 A，确认 A 应当成功并进入二面 */
    const retried = await closeOfficeRoundOne(
      flowId,
      [{ userFlowId: candidateA, passed: true }],
      [candidateA],
      true,
    );
    if (!retried.success) throw new Error(JSON.stringify(retried));
    const passed = await readCandidate(candidateA);
    expect(passed.status).toBe("ongoing");
    expect(passed.round).toBe(2);
  });

  it("结果已发布的流程拒绝再确认二面名单，候选人状态保持冻结", async () => {
    await db.insert(flowResultPublication).values({
      fkFlowId: flowId,
      status: "published",
      resultSnapshot: { flowId, rows: [] },
      templateSnapshot: { accepted: null, rejected: null },
      publishedAt: new Date(),
    });

    const before = await readCandidate(candidateA);
    const result = await closeOfficeRoundTwo(
      flowId,
      [{ userFlowId: candidateA, passed: true }],
      [candidateA],
      true,
    );

    expect(result.success).toBe(false);
    if (result.success) throw new Error("已发布的流程不该再改名单");
    expect(result.error.message).toContain("锁定");

    expect(await readCandidate(candidateA)).toEqual(before);
  });
});