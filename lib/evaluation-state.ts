export type EvaluationStatus = "submitted" | "returned" | "approved" | "rejected";

export type EvaluationFlowStepType = "checking" | "finished";

const ACTIVE_STATUSES: EvaluationStatus[] = ["submitted", "returned", "approved"];

export function isActiveEvaluationStatus(
  status: string | null | undefined,
): status is "submitted" | "returned" | "approved" {
  return status === "submitted" || status === "returned" || status === "approved";
}

export function canApproveEvaluation(status: string | null | undefined) {
  return status === "submitted" || status === "rejected";
}

/** Admin may reject only pending reviews. */
export function canRejectEvaluation(status: string | null | undefined) {
  return status === "submitted" || status === "approved";
}

export function canReturnEvaluation(status: string | null | undefined) {
  return status === "submitted";
}

/**
 * 办公类面试一位候选人可能有多份面评：优先展示管理员已终审通过的那份，
 * 其次最新提交，再次被退回待重写，最后是历史不通过记录。
 */
const OFFICE_STATUS_RANK: Record<string, number> = {
  approved: 3,
  submitted: 2,
  returned: 1,
  rejected: 0,
};

/**
 * Prefer the actionable/active evaluation for a candidate list row.
 * Active statuses win over rejected history; newer ids break ties.
 *
 * `preferApproved` switches to the office-interview rule, where several authors
 * each own one evaluation: the approved one is the row's final result.
 */
export function pickPreferredEvaluationRow<
  T extends { evalId: number | null; evalStatus: string | null },
>(current: T, candidate: T, preferApproved = false): T {
  if (preferApproved) {
    const currentRank = current.evalStatus
      ? OFFICE_STATUS_RANK[current.evalStatus] ?? -1
      : -1;
    const candidateRank = candidate.evalStatus
      ? OFFICE_STATUS_RANK[candidate.evalStatus] ?? -1
      : -1;
    if (currentRank !== candidateRank) {
      return candidateRank > currentRank ? candidate : current;
    }
    const currentId = current.evalId ?? -1;
    const candidateId = candidate.evalId ?? -1;
    return candidateId > currentId ? candidate : current;
  }

  const currentActive = isActiveEvaluationStatus(current.evalStatus);
  const candidateActive = isActiveEvaluationStatus(candidate.evalStatus);

  if (currentActive !== candidateActive) {
    return candidateActive ? candidate : current;
  }

  const currentId = current.evalId ?? -1;
  const candidateId = candidate.evalId ?? -1;
  return candidateId > currentId ? candidate : current;
}

export function dedupeEvaluationCandidateRows<
  T extends {
    userFlowId: number;
    evalId: number | null;
    evalStatus: string | null;
  },
>(rows: T[], preferApproved = false): T[] {
  const preferred = new Map<number, T>();

  for (const row of rows) {
    const existing = preferred.get(row.userFlowId);
    if (!existing) {
      preferred.set(row.userFlowId, row);
      continue;
    }
    preferred.set(
      row.userFlowId,
      pickPreferredEvaluationRow(existing, row, preferApproved),
    );
  }

  return Array.from(preferred.values());
}

export function evaluationStepTypeForAction(
  _action:
    | "submit_for_review"
    | "admin_decision",
): EvaluationFlowStepType {
  return "finished";
}

export { ACTIVE_STATUSES };
