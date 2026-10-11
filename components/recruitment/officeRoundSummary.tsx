"use client";

/**
 * 本轮面评一览（份数 + 均分 + 每位部长一行）。
 *
 * 签到叫号的「随手写面评」弹窗与面试工作台的「填写面试记录」弹窗共用这一块：
 * 办公类是多位部长各写一份、以均分定结果，写之前得先看清本轮已经有人打了几分；
 * 两个入口之前各画各的，工作台那侧干脆不显示，写的时候只能另开分数弹层。
 */
export type OfficeRoundSummaryEvaluation = {
  id: number;
  score: number | null;
  recommendation: "passed" | "failed" | null;
  authorName: string | null;
  isMine: boolean;
};

export const OfficeRoundSummary = ({
  count,
  averageScore,
  evaluations,
}: {
  count: number;
  averageScore: number | null;
  evaluations: OfficeRoundSummaryEvaluation[];
}) => {
  if (evaluations.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-2.5 text-xs">
      <p className="font-medium">
        本轮已记录 {count} 份
        {averageScore !== null ? ` · 均分 ${averageScore}` : ""}
      </p>
      {evaluations.map((evaluation) => (
        <p key={evaluation.id} className="text-muted-foreground">
          {evaluation.isMine ? "我" : evaluation.authorName ?? "部长"}：
          {evaluation.score ?? "—"} 分
          {evaluation.recommendation
            ? ` · ${evaluation.recommendation === "passed" ? "建议通过" : "建议不通过"}`
            : ""}
        </p>
      ))}
    </div>
  );
};

export default OfficeRoundSummary;
