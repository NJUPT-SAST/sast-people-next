'use server';
import { verifyRole, verifySession } from '@/lib/dal';
import { db } from '@/db/drizzle';
import { flow, flowStep } from '@/db/schema';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { addFlowSchema } from '@/components/flow/add';
import { evaluationFlowSteps, isWrittenRecruitmentFlow, writtenRecruitmentSteps } from './defaultSteps';

export async function addFlow(values: z.infer<typeof addFlowSchema>) {
  const session = await verifySession();
  await verifyRole(3);

  await db.transaction(async (tx) => {
    const [newFlow] = await tx
      .insert(flow)
      .values({
        title: values.title,
        description: values.description,
        type: values.type ?? 'recruitment',
        ownerId: session.uid,
        startedAt: values.startedAt,
        endedAt: values.endedAt,
      })
      .returning({ id: flow.id, type: flow.type });

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

  revalidatePath('/dashboard/flow');
}
