import { db } from "@/db/drizzle";
import { flow, userFlow } from "@/db/schema";
import { departmentScopeFilter, type DepartmentScope } from "@/lib/authz";
import { visibleFlowPredicate } from "@/lib/flow-access";
import { and, inArray } from "drizzle-orm";
import crypto from "node:crypto";

const OWNER_ID = 900901;
const createdFlowIds: number[] = [];

const software: DepartmentScope = { kind: "department", department: "software" };
const media: DepartmentScope = { kind: "department", department: "media" };
const none: DepartmentScope = { kind: "none" };
const all: DepartmentScope = { kind: "all" };

async function insertFlow(department: string | null) {
  const [row] = await db
    .insert(flow)
    .values({
      title: `部门隔离集成测试 ${crypto.randomUUID()}`,
      type: "recruitment",
      ownerId: OWNER_ID,
      department,
    })
    .returning({ id: flow.id });

  createdFlowIds.push(row.id);
  return row.id;
}

async function insertUserFlow(
  flowId: number,
  department: string | null,
  applyGroup: string | null = null,
  userId = 900902,
) {
  await db.insert(userFlow).values({
    progressStatus: "ongoing",
    fkFlowId: flowId,
    fkUserId: userId,
    applyGroup,
    department,
  });
}

const departmentFlowIds = async (scope: DepartmentScope) => {
  const rows = await db
    .select({ id: flow.id })
    .from(flow)
    .where(and(inArray(flow.id, createdFlowIds), visibleFlowPredicate(scope)));

  return rows.map((row) => row.id).sort((a, b) => a - b);
};

const scopedUserFlowIds = async (scope: DepartmentScope, flowIds: number[]) => {
  const rows = await db
    .select({ id: userFlow.id })
    .from(userFlow)
    .where(
      and(
        inArray(userFlow.fkFlowId, flowIds),
        departmentScopeFilter(userFlow.department, scope),
      ),
    );

  return rows.map((row) => row.id);
};

describe("department scoped access", () => {
  afterAll(async () => {
    if (createdFlowIds.length > 0) {
      await db.delete(userFlow).where(inArray(userFlow.fkFlowId, createdFlowIds));
      await db.delete(flow).where(inArray(flow.id, createdFlowIds));
    }
    await db.$client.end();
  });

  it("keeps department flows, shared flows holding own candidates, and nothing else", async () => {
    const softwareFlowId = await insertFlow("software");
    const mediaFlowId = await insertFlow("media");
    const sharedFlowId = await insertFlow(null);
    const orphanFlowId = await insertFlow(null);
    await insertUserFlow(sharedFlowId, "software", "前端组", 900921);

    await expect(departmentFlowIds(software)).resolves.toEqual(
      [softwareFlowId, sharedFlowId].sort((a, b) => a - b),
    );
    await expect(departmentFlowIds(media)).resolves.toEqual([mediaFlowId]);
    await expect(departmentFlowIds(none)).resolves.toEqual([]);
    await expect(departmentFlowIds(all)).resolves.toEqual(
      createdFlowIds.slice().sort((a, b) => a - b),
    );
    expect(orphanFlowId).toBeGreaterThan(0);
  });

  it("filters candidate rows by their own department", async () => {
    const softwareFlowId = await insertFlow("software");
    const sharedFlowId = await insertFlow(null);
    await insertUserFlow(softwareFlowId, "software", "前端组", 900910);
    await insertUserFlow(sharedFlowId, "software", "前端组", 900911);
    await insertUserFlow(sharedFlowId, "media", "视频组", 900912);
    await insertUserFlow(sharedFlowId, null, null, 900913);

    const scoped = await scopedUserFlowIds(software, [
      softwareFlowId,
      sharedFlowId,
    ]);

    expect(scoped).toHaveLength(2);
    const others = await scopedUserFlowIds(media, [softwareFlowId, sharedFlowId]);
    expect(others).toHaveLength(1);
    expect(await scopedUserFlowIds(none, [softwareFlowId, sharedFlowId])).toEqual(
      [],
    );
    expect(
      await scopedUserFlowIds(all, [softwareFlowId, sharedFlowId]),
    ).toHaveLength(4);
  });
});
