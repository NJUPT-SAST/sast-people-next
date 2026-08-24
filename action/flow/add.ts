'use server';
import { verifyRole } from '@/lib/dal';
import { db } from '@/db/drizzle';
import { flow, flowStep } from '@/db/schema';
import { revalidatePath } from 'next/cache';
import { z } from 'zod/v4';
import { addFlowSchema } from '@/components/flow/add';
import { evaluationFlowSteps, isWrittenRecruitmentFlow, writtenRecruitmentSteps } from './defaultSteps';
import { logServerError } from '@/lib/server-error-log';
import { writeOperationAudit } from '@/lib/operation-audit';

export async function addFlow(values: z.infer<typeof addFlowSchema>) {
  let session: Awaited<ReturnType<typeof verifyRole>> | null = null;

  try {
    session = await verifyRole(3);

    let createdFlowId: number | null = null;

    await db.transaction(async (tx) => {
      const [newFlow] = await tx
        .insert(flow)
        .values({
          title: values.title,
          description: values.description,
          type: values.type ?? 'recruitment',
          ownerId: session!.uid,
          startedAt: values.startedAt,
          endedAt: values.endedAt,
        })
        .returning({ id: flow.id, type: flow.type });
      createdFlowId = newFlow.id;

      if (newFlow) {
        await tx
          .insert(flowStep)
          .values(
            isWrittenRecruitmentFlow(newFlow.type)
              ? writtenRecruitmentSteps(newFlow.id)
              : evaluationFlowSteps(newFlow.id),
          );
      }
    });

    if (createdFlowId !== null) {
      await writeOperationAudit({
        actorId: session.uid,
        actorRole: session.role,
        action: 'flow.create',
        resourceType: 'flow',
        resourceId: createdFlowId,
        metadata: {
          flowType: values.type ?? 'recruitment',
          title: values.title,
        },
      });
    }

    revalidatePath('/dashboard/flow');
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
