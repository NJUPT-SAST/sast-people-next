/** @jest-environment node */

/**
 * 阅卷公平性配置（grading_fairness_profile，每个流程一行）：
 * - 本部门部长保存后能原样读回（λ 与人工权重都保留），重复保存只更新同一行；
 * - 其他部门的流程被部门越权校验拒绝，库里不落任何配置；
 * - 讲师（role 2）无权读写；
 * - λ 越界（1.5 / -0.1）、权重越界（3）、非数字键等非法入参被拒且不落库；
 * - 流程不存在时读取返回默认配置（λ 0、权重 {}），保存报错。
 */

jest.mock("@/lib/server-error-log", () => ({
  logServerError: jest.fn(),
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
  uid: 920001,
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

import { eq, inArray } from "drizzle-orm";

import { db } from "@/db/drizzle";
import { flow, gradingFairnessProfile } from "@/db/schema";
import { DepartmentAccessError } from "@/lib/authz";
import { MANAGER_ROLE } from "@/lib/link/role";
import {
  loadGradingFairnessProfile,
  saveGradingFairnessProfile,
} from "@/action/user-flow/grading-fairness/profile";
import { FairnessProfileValidationError } from "@/action/user-flow/grading-fairness/errors";

const MANAGER_ID = 920001;
const LECTURER_ID = 920002;
const OWN_DEPARTMENT = "publicity";
const OTHER_DEPARTMENT = "software";
const TITLE_PREFIX = "SMOKE-公平性配置-";
const MISSING_FLOW_ID = 999999999;

const createdFlowIds: number[] = [];

const readProfileRow = async (flowId: number) => {
  const [row] = await db
    .select()
    .from(gradingFairnessProfile)
    .where(eq(gradingFairnessProfile.fkFlowId, flowId))
    .limit(1);
  return row ?? null;
};

const countProfiles = async (flowId: number) => {
  const rows = await db
    .select({ id: gradingFairnessProfile.id })
    .from(gradingFairnessProfile)
    .where(eq(gradingFairnessProfile.fkFlowId, flowId));
  return rows.length;
};

const emptyProfile = (flowId: number) => ({
  flowId,
  lambda: 0,
  judgerWeights: {},
  note: null,
  updatedAt: null,
});

describe("阅卷公平性配置读写", () => {
  let ownFlowId = 0;
  let otherFlowId = 0;
  let untouchedFlowId = 0;

  const actAs = (uid: number, role: number, department: string) => {
    mockSession.uid = uid;
    mockSession.role = role;
    mockSession.realRole = role;
    mockSession.department = department;
    mockSession.scope = { kind: "department", department };
  };

  beforeAll(async () => {
    const rows = await db
      .insert(flow)
      .values([
        {
          title: `${TITLE_PREFIX}本部门`,
          type: "recruitment",
          department: OWN_DEPARTMENT,
          ownerId: MANAGER_ID,
        },
        {
          title: `${TITLE_PREFIX}其他部门`,
          type: "recruitment",
          department: OTHER_DEPARTMENT,
          ownerId: MANAGER_ID,
        },
        {
          title: `${TITLE_PREFIX}本部门-未配置`,
          type: "recruitment",
          department: OWN_DEPARTMENT,
          ownerId: MANAGER_ID,
        },
      ])
      .returning({ id: flow.id });

    createdFlowIds.push(...rows.map((row) => row.id));
    ownFlowId = rows[0].id;
    otherFlowId = rows[1].id;
    untouchedFlowId = rows[2].id;
  });

  afterAll(async () => {
    if (createdFlowIds.length === 0) return;

    await db
      .delete(gradingFairnessProfile)
      .where(inArray(gradingFairnessProfile.fkFlowId, createdFlowIds));
    await db.delete(flow).where(inArray(flow.id, createdFlowIds));
  });

  beforeEach(() => {
    actAs(MANAGER_ID, MANAGER_ROLE, OWN_DEPARTMENT);
  });

  it("本部门部长保存后读回一致，重复保存只更新同一行", async () => {
    const saved = await saveGradingFairnessProfile({
      flowId: ownFlowId,
      lambda: 0.35,
      judgerWeights: { "920011": 1.5, "920012": 0.5 },
      note: "讲师甲偏松，权重上调",
    });

    expect(saved).toEqual({
      flowId: ownFlowId,
      lambda: 0.35,
      judgerWeights: { "920011": 1.5, "920012": 0.5 },
      note: "讲师甲偏松，权重上调",
      updatedAt: expect.any(String),
    });

    /* 读回与保存返回值一致：λ（浮点）与人工权重都原样保留 */
    await expect(loadGradingFairnessProfile(ownFlowId)).resolves.toEqual(saved);
    expect(await readProfileRow(ownFlowId)).toMatchObject({
      fkFlowId: ownFlowId,
      lambda: 0.35,
      judgerWeights: { "920011": 1.5, "920012": 0.5 },
      updatedBy: MANAGER_ID,
    });

    /* 再次保存：同一流程仍只有一行，内容被覆盖 */
    const resaved = await saveGradingFairnessProfile({
      flowId: ownFlowId,
      lambda: 1,
      judgerWeights: { "920011": 0.5 },
      note: null,
    });

    expect(resaved.lambda).toBe(1);
    expect(resaved.judgerWeights).toEqual({ "920011": 0.5 });
    expect(resaved.note).toBeNull();
    expect(await countProfiles(ownFlowId)).toBe(1);
    expect(await readProfileRow(ownFlowId)).toMatchObject({
      lambda: 1,
      judgerWeights: { "920011": 0.5 },
      note: null,
      updatedBy: MANAGER_ID,
    });
    await expect(loadGradingFairnessProfile(ownFlowId)).resolves.toEqual(resaved);
  });

  it("其他部门的流程被部门越权校验拒绝，且不落库", async () => {
    await expect(
      saveGradingFairnessProfile({ flowId: otherFlowId, lambda: 0.5 }),
    ).rejects.toBeInstanceOf(DepartmentAccessError);

    await expect(loadGradingFairnessProfile(otherFlowId)).rejects.toBeInstanceOf(
      DepartmentAccessError,
    );
    expect(await countProfiles(otherFlowId)).toBe(0);
  });

  it("讲师（role 2）无权读写阅卷公平性配置", async () => {
    actAs(LECTURER_ID, 2, OWN_DEPARTMENT);

    await expect(
      saveGradingFairnessProfile({ flowId: untouchedFlowId, lambda: 0.5 }),
    ).rejects.toThrow("Unauthorized operation");
    await expect(loadGradingFairnessProfile(untouchedFlowId)).rejects.toThrow(
      "Unauthorized operation",
    );
    expect(await countProfiles(untouchedFlowId)).toBe(0);
  });

  it("非法 λ、非法权重与超长备注被拒绝且不落库", async () => {
    const rejected = await saveGradingFairnessProfile({
      flowId: untouchedFlowId,
      lambda: 1.5,
    }).catch((thrown: unknown) => thrown);
    expect(rejected).toBeInstanceOf(FairnessProfileValidationError);
    expect((rejected as Error).message).toBe("校正强度 λ 必须在 0 到 1 之间");

    await expect(
      saveGradingFairnessProfile({ flowId: untouchedFlowId, lambda: -0.1 }),
    ).rejects.toBeInstanceOf(FairnessProfileValidationError);
    await expect(
      saveGradingFairnessProfile({
        flowId: untouchedFlowId,
        lambda: 0.5,
        judgerWeights: { "920011": 3 },
      }),
    ).rejects.toBeInstanceOf(FairnessProfileValidationError);
    await expect(
      saveGradingFairnessProfile({
        flowId: untouchedFlowId,
        lambda: 0.5,
        judgerWeights: { 讲师甲: 1 },
      }),
    ).rejects.toBeInstanceOf(FairnessProfileValidationError);
    await expect(
      saveGradingFairnessProfile({
        flowId: untouchedFlowId,
        lambda: 0.5,
        note: "备".repeat(501),
      }),
    ).rejects.toBeInstanceOf(FairnessProfileValidationError);

    expect(await countProfiles(untouchedFlowId)).toBe(0);
    await expect(loadGradingFairnessProfile(untouchedFlowId)).resolves.toEqual(
      emptyProfile(untouchedFlowId),
    );
  });

  it("流程不存在时读取返回默认配置、保存报错", async () => {
    await expect(loadGradingFairnessProfile(MISSING_FLOW_ID)).resolves.toEqual(
      emptyProfile(MISSING_FLOW_ID),
    );
    await expect(
      saveGradingFairnessProfile({ flowId: MISSING_FLOW_ID, lambda: 0.5 }),
    ).rejects.toBeInstanceOf(FairnessProfileValidationError);
  });
});
