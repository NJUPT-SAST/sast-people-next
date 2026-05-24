'use server';

import { db } from '@/db/drizzle';
import { problem } from '@/db/schema';
import { verifyRole } from '@/lib/dal';
import { problemType } from '@/types/problem';
import { eq, and, notInArray, inArray } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import fs from 'node:fs';

type ProblemType = typeof problem.$inferInsert;

export const updateProblems = async (
  stepId: number,
  problems: problemType,
  flowId: number,
) => {
  await verifyRole(3);

  try {
    const existingProblems = await db
      .select()
      .from(problem)
      .where(eq(problem.fkFlowStepId, stepId));

    const newProblems = Object.entries(problems).flatMap(
      ([_category, categoryProblems]) =>
        categoryProblems.map((p) => ({
          id: p.id,
          fkFlowStepId: stepId,
          title: p.title,
          score: p.score,
        })),
    );

    const problemsToUpdate = newProblems.filter((p) =>
      existingProblems.some((ep) => ep.id === p.id),
    );

    for (const p of problemsToUpdate) {
      await db
        .update(problem)
        .set({ fkFlowStepId: stepId, title: p.title, score: p.score })
        .where(eq(problem.id, p.id));
    }

    const problemsToInsert = newProblems
      .filter((p) => p.id < 0)
      .map(({ id: _id, ...rest }) => rest);

    let insertedProblems: { id: number }[] = [];
    if (problemsToInsert.length > 0) {
      insertedProblems = await db
        .insert(problem)
        .values(problemsToInsert as ProblemType[])
        .returning({ id: problem.id });
    }

    const existingProblemIds = newProblems
      .map((p) => p.id)
      .filter((id) => id > 0);
    if (existingProblemIds.length > 0) {
      await db
        .update(problem)
        .set({ fkFlowStepId: stepId })
        .where(
          and(
            inArray(problem.id, existingProblemIds),
            notInArray(problem.fkFlowStepId, [stepId]),
          ),
        );
    }

    const problemIdsToKeep = [
      ...newProblems.map((p) => p.id).filter((id) => id > 0),
      ...insertedProblems.map((p) => p.id),
    ];
    if (problemIdsToKeep.length > 0) {
      await db
        .delete(problem)
        .where(
          and(
            eq(problem.fkFlowStepId, stepId),
            notInArray(problem.id, problemIdsToKeep),
          ),
        );
    } else {
      await db
        .delete(problem)
        .where(eq(problem.fkFlowStepId, stepId));
    }

    revalidatePath(`/dashboard/flow/edit-exam?id=${flowId}`);
  } catch (err) {
    try {
      fs.appendFileSync(
        "/tmp/sast-error-log.txt",
        `[${new Date().toISOString()}] updateProblems\n` +
        `stepId: ${stepId}, flowId: ${flowId}\n` +
        `problems: ${JSON.stringify(problems)}\n` +
        `name: ${err instanceof Error ? err.name : 'Unknown'}\n` +
        `message: ${err instanceof Error ? err.message : String(err)}\n` +
        `stack: ${err instanceof Error ? err.stack : 'none'}\n` +
        `---\n`
      );
    } catch {}
    throw err;
  }
};
