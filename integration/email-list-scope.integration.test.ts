import { db } from "@/db/drizzle";
import { emailBatch, emailDelivery, flow, userFlow } from "@/db/schema";
import type { DepartmentScope } from "@/lib/authz";
import {
  scopedResolvedFlowIdCondition,
  strictlyVisibleFlowPredicate,
} from "@/lib/flow-access";
import { and, eq, inArray, sql } from "drizzle-orm";
import crypto from "node:crypto";

const OWNER_ID = 900911;

const software: DepartmentScope = { kind: "department", department: "software" };
const media: DepartmentScope = { kind: "department", department: "media" };
const none: DepartmentScope = { kind: "none" };
const all: DepartmentScope = { kind: "all" };

const createdFlowIds: number[] = [];
const createdBatchIds: number[] = [];
const createdDeliveryIds: number[] = [];

const uniqueTitle = (label: string) => `邮件隔离集成测试 ${label} ${crypto.randomUUID()}`;

async function insertFlow(department: string | null) {
  const [row] = await db
    .insert(flow)
    .values({
      title: uniqueTitle(department ?? "global").slice(0, 100),
      type: "recruitment",
      ownerId: OWNER_ID,
      department,
    })
    .returning({ id: flow.id });

  createdFlowIds.push(row.id);
  return row.id;
}

async function insertBatch(flowId: number) {
  const [row] = await db
    .insert(emailBatch)
    .values({
      idempotencyKey: `integration.batch.${crypto.randomUUID()}`,
      templateKey: "recruitment.result.accepted",
      category: "result",
      name: "邮件隔离集成测试批次",
      subject: "集成测试主题",
      fkFlowId: flowId,
    })
    .returning({ id: emailBatch.id });

  createdBatchIds.push(row.id);
  return row.id;
}

async function insertDelivery(batchId: number, flowId: number | null) {
  const [row] = await db
    .insert(emailDelivery)
    .values({
      idempotencyKey: `integration.delivery.${crypto.randomUUID()}`,
      category: "result",
      templateKey: "recruitment.result.accepted",
      toAddress: "integration@example.com",
      subject: "集成测试投递",
      htmlSnapshot: "<p>集成测试</p>",
      status: "sent",
      fkEmailBatchId: batchId,
      fkFlowId: flowId,
    })
    .returning({ id: emailDelivery.id });

  createdDeliveryIds.push(row.id);
  return row.id;
}

/* 与 action/email/list.ts 相同的口径：投递未记流程时回退批次流程 */
const visibleDeliveryIds = async (scope: DepartmentScope, ids: number[]) => {
  const rows = await db
    .select({ id: emailDelivery.id })
    .from(emailDelivery)
    .leftJoin(emailBatch, eq(emailBatch.id, emailDelivery.fkEmailBatchId))
    .where(
      and(
        inArray(emailDelivery.id, ids),
        scopedResolvedFlowIdCondition(
          scope,
          sql`coalesce(${emailDelivery.fkFlowId}, ${emailBatch.fkFlowId})`,
        ),
      ),
    );

  return rows.map((row) => row.id).sort((a, b) => a - b);
};

const visibleFlowIds = async (scope: DepartmentScope, ids: number[]) => {
  const rows = await db
    .select({ id: flow.id })
    .from(flow)
    .where(and(inArray(flow.id, ids), strictlyVisibleFlowPredicate(scope)));

  return rows.map((row) => row.id).sort((a, b) => a - b);
};

describe("email batch/delivery department scoping", () => {
  afterAll(async () => {
    if (createdDeliveryIds.length > 0) {
      await db.delete(emailDelivery).where(inArray(emailDelivery.id, createdDeliveryIds));
    }
    if (createdBatchIds.length > 0) {
      await db.delete(emailBatch).where(inArray(emailBatch.id, createdBatchIds));
    }
    if (createdFlowIds.length > 0) {
      await db.delete(userFlow).where(inArray(userFlow.fkFlowId, createdFlowIds));
      await db.delete(flow).where(inArray(flow.id, createdFlowIds));
    }
    await db.$client.end();
  });

  it("hides other-department and global-flow deliveries from a department account, keeps both for admins", async () => {
    const softwareFlowId = await insertFlow("software");
    const mediaFlowId = await insertFlow("media");
    const globalFlowId = await insertFlow(null);
    /* 全局流程中已有软件部报名：宽松口径会放行，严格口径仍应隐藏 */
    await db.insert(userFlow).values({
      progressStatus: "ongoing",
      fkFlowId: globalFlowId,
      fkUserId: 900912,
      department: "software",
    });

    const softwareBatchId = await insertBatch(softwareFlowId);
    const mediaBatchId = await insertBatch(mediaFlowId);
    const globalBatchId = await insertBatch(globalFlowId);

    /* 投递自身带流程 */
    const softwareDeliveryId = await insertDelivery(softwareBatchId, softwareFlowId);
    const mediaDeliveryId = await insertDelivery(mediaBatchId, mediaFlowId);
    const globalDeliveryId = await insertDelivery(globalBatchId, globalFlowId);
    /* 老投递未记流程：只能靠批次流程回退解析归属 */
    const legacySoftwareDeliveryId = await insertDelivery(softwareBatchId, null);
    const legacyGlobalDeliveryId = await insertDelivery(globalBatchId, null);

    const deliveryIds = [
      softwareDeliveryId,
      mediaDeliveryId,
      globalDeliveryId,
      legacySoftwareDeliveryId,
      legacyGlobalDeliveryId,
    ];

    expect(await visibleDeliveryIds(software, deliveryIds)).toEqual([
      softwareDeliveryId,
      legacySoftwareDeliveryId,
    ].sort((a, b) => a - b));
    expect(await visibleDeliveryIds(media, deliveryIds)).toEqual([mediaDeliveryId]);
    expect(await visibleDeliveryIds(none, deliveryIds)).toEqual([]);
    expect(await visibleDeliveryIds(all, deliveryIds)).toEqual(
      deliveryIds.slice().sort((a, b) => a - b),
    );
  });

  it("strictly scopes flow pickers: global flows do not leak via own-department sign-ups", async () => {
    const softwareFlowId = await insertFlow("software");
    const mediaFlowId = await insertFlow("media");
    const globalFlowId = await insertFlow(null);
    await db.insert(userFlow).values({
      progressStatus: "ongoing",
      fkFlowId: globalFlowId,
      fkUserId: 900913,
      department: "software",
    });

    expect(await visibleFlowIds(software, [softwareFlowId, mediaFlowId, globalFlowId])).toEqual([softwareFlowId]);
    expect(await visibleFlowIds(media, [softwareFlowId, mediaFlowId, globalFlowId])).toEqual([mediaFlowId]);
    expect(await visibleFlowIds(none, [softwareFlowId, mediaFlowId, globalFlowId])).toEqual([]);
    expect(await visibleFlowIds(all, [softwareFlowId, mediaFlowId, globalFlowId])).toEqual(
      [softwareFlowId, mediaFlowId, globalFlowId].sort((a, b) => a - b),
    );
  });
});
