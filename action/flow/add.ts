'use server';
import { verifyManager } from '@/lib/authz';
import { db } from '@/db/drizzle';
import { flow, flowStep } from '@/db/schema';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v4';
import { addFlowSchema } from '@/lib/validation/flow';
import { stepsForFlowType } from './defaultSteps';
import { resolveFlowDepartment, resolveGroupDepartments, type FlowScopedSession } from './department-utils';
import { isOfficeInterviewFlow } from '@/const/flow';
import { logServerError } from '@/lib/server-error-log';
import { writeOperationAudit } from '@/lib/operation-audit';

export async function addFlow(values: z.infer<typeof addFlowSchema>) {
  let session: FlowScopedSession | null = null;

  try {
    session = await verifyManager();
    const parsedValues = addFlowSchema.parse(values);

    /* 部长固定写入自己的部门；管理员可指定归属部门，留空则为全局流程 */
    const flowType = parsedValues.type ?? 'recruitment';
    /* 办公类部门面试招新同样是「每个办公部门一条流程」，归属部门与其它流程一起解析 */
    const department = resolveFlowDepartment(session.scope, parsedValues.department);
    if (isOfficeInterviewFlow(flowType) && !department) {
      throw new Error('办公类部门面试招新必须归属一个办公部门');
    }
    const groupOptions =
      parsedValues.groupOptions && parsedValues.groupOptions.length > 0
        ? parsedValues.groupOptions
        : null;
    const groupDepartments = resolveGroupDepartments(
      groupOptions,
      parsedValues.groupDepartments,
    );
    const slotOptions =
      parsedValues.slotOptions && parsedValues.slotOptions.length > 0
        ? parsedValues.slotOptions
        : null;

    let createdFlowId: number | null = null;

    await db.transaction(async (tx) => {
      const [newFlow] = await tx
        .insert(flow)
        .values({
          title: parsedValues.title,
          description: parsedValues.description,
          type: parsedValues.type ?? 'recruitment',
          ownerId: session!.uid,
          startedAt: parsedValues.startedAt,
          endedAt: parsedValues.endedAt,
          department,
          groupOptions,
          groupDepartments,
          slotOptions,
        })
        .returning({ id: flow.id, type: flow.type });
      createdFlowId = newFlow.id;

      if (newFlow) {
        await tx
          .insert(flowStep)
          .values(stepsForFlowType(newFlow.type, newFlow.id));
      }
    });

    if (createdFlowId !== null) {
      await writeOperationAudit({
        actorId: session.uid,
        actorRole: session.role,
        action: 'flow.create',
        resourceType: 'flow',
        resourceId: createdFlowId,
        department,
        metadata: {
          flowType: parsedValues.type ?? 'recruitment',
          title: parsedValues.title,
          department,
        },
      });
    }

    revalidatePath('/dashboard/flow');
    return createdFlowId;
  } catch (error) {
    logServerError('flow:add', error, {
      path: '/dashboard/flow',
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: 'add-flow',
      metadata: {
        flowType: values.type ?? 'recruitment',
        title: values.title,
      },
    });
    throw error;
  }
}
