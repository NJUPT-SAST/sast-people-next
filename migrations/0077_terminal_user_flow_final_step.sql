-- 终态（passed / failed）必须落在流程的最后一步。
--
-- 卡片把「当前步骤」和步骤圆点画在同一行（`components/userFlow/flowCard.tsx`）：终态行若停在
-- 中间步骤，就会同时显示「已通过考核」和「当前步骤：批卷」，而它后面的圆点又已经是绿色的
-- （未通过时反过来：流程已结束，却还挂着一个「未开始」的步骤）。笔试流程的判定结果是在
-- 「批卷」页录入的，写回的是候选人当时所在的「批卷」步，所以存量行大量停在中间步骤上。
--
-- 约定：终态写在流程最后一步 —— 办公类面试的「结果确认」（`office-rounds.ts` 的 resultStepId）、
-- 免试/面评流程的「管理员审核」（`evaluation.ts` 的 findEvaluationStepIdInTx）都是这么写的；
-- 运行时 `findFinalStepId`（`action/user-flow/edit.ts`）对任何一次终态写入都写它，与候选人
-- 当时停在哪一步无关。这里把存量终态行对齐到各自流程的最后一步：
--   * 未参与（withdrawn）不动：候选人停在离开的那一步；
--   * 只动「当前步骤 ≠ 最后一步」的终态行，两个方向都动：最后一步是 finished 步，而自定义流程
--     可能在 finished 之后还挂着别的步骤，运行时照样选 finished，停在后面的存量行也得跟它一致；
--   * 当前步骤为空（步骤被删过留下的 NULL）同样对齐：卡片在步骤缺失时会回退显示第一步，
--     「已通过考核 / 当前步骤：报名」和停在中间步骤是同一类错。
WITH "final_step" AS (
  SELECT "flow_id", "step_id"
  FROM (
    SELECT
      fs."fk_flow_id" AS "flow_id",
      fs."id" AS "step_id",
      /* 与 action/user-flow/edit.ts 的 findFinalStepId 同一口径：优先 finished 步骤，其次 order 最大 */
      row_number() OVER (
        PARTITION BY fs."fk_flow_id"
        ORDER BY (fs."type" = 'finished') DESC, fs."order" DESC, fs."id" DESC
      ) AS "rank"
    FROM "flow_step" AS fs
  ) AS ranked
  WHERE ranked."rank" = 1
)
UPDATE "user_flow" AS uf
SET "fk_current_step_id" = fs."step_id"
FROM "final_step" AS fs
WHERE uf."fk_flow_id" = fs."flow_id"
  AND uf."progress_status" IN ('passed', 'failed')
  /* IS DISTINCT FROM：NULL（步骤被删过）也走这条 */
  AND uf."fk_current_step_id" IS DISTINCT FROM fs."step_id";
