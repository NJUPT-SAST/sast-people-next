/**
 * 办公类一面名单：确认一面之后，工作台不再提供「结束一面」入口，改为查看 / 导出这份名单。
 *
 * 名单由当前候选人数据推导，不额外落库：
 * - 进入二面（round=2）即一面通过（二面之后的结果不影响一面结论）；
 * - 停在 round=1 且已落选即一面不通过；
 * - 撤回/退回的候选人不在候选人列表里，自然不进名单。
 *
 * 分数取 round=1 的面评分：办公类一面是单人终评，确认后分数仍可能补录，所以按当前值展示。
 */

export type OfficeRoundOneRosterCandidate = {
  userFlowId: number;
  name: string;
  studentId: string | null;
  choice: number | null;
  round: number | null;
  status: string | null;
  evaluations: Array<{ round: number | null; score: number | null }>;
};

export type OfficeRoundOneRosterRow = {
  userFlowId: number;
  name: string;
  studentId: string | null;
  choice: number | null;
  scores: number[];
  passed: boolean;
};

/** 志愿类型：1=第一志愿、2=第二志愿（办公类之外的流程为空） */
export function officeChoiceLabel(value: unknown) {
  return value === 1 ? "第一志愿" : value === 2 ? "第二志愿" : "";
}

export const buildOfficeRoundOneRoster = (
  candidates: OfficeRoundOneRosterCandidate[],
): OfficeRoundOneRosterRow[] =>
  candidates
    .filter(
      (candidate) =>
        candidate.round === 2 ||
        (candidate.round === 1 && candidate.status === "failed"),
    )
    .map((candidate) => ({
      userFlowId: candidate.userFlowId,
      name: candidate.name,
      studentId: candidate.studentId,
      choice: candidate.choice,
      scores: candidate.evaluations
        .filter(
          (evaluation) =>
            evaluation.round === 1 && evaluation.score !== null,
        )
        .map((evaluation) => evaluation.score as number),
      passed: candidate.round === 2,
    }));

/** 一面得分：已记录分数的平均（四舍五入到一位小数）；没有分数返回 null */
export const officeRoundOneAverageScore = (scores: number[]): number | null =>
  scores.length === 0
    ? null
    : Math.round(
        (scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10,
      ) / 10;
