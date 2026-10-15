import type { JudgerVerdict } from "@/lib/grading-fairness/types";

/**
 * 讲师宽严判定的展示元数据（标签 / 主题色 / 一句话解释）。
 *
 * 颜色一律取设计系统的 CSS 变量，组件里不写死色值：
 * - `lenient`（偏松）用 `--error`
 * - `strict`（偏严）用 `--warning`
 * - `fair`（无显著差异）用 `--muted-foreground`
 * - `unknown`（样本不足）用 `--muted-foreground`
 *
 * 注意：`--border` 在深色主题下是 `oklch(1 0 0 / 10%)`，画在深色背景上几乎不可见，
 * 所以「不可判定」不再用 `--border`，改用与 `fair` 同族的 `--muted-foreground`，
 * 由形状（空心虚线点、无须线）而不是颜色来区分。
 */
export const JUDGER_VERDICT_META: Record<
  JudgerVerdict,
  { label: string; color: string; description: string }
> = {
  lenient: {
    label: "偏松",
    color: "var(--error)",
    description: "打分系统性高于同题同考生的平均水平。",
  },
  strict: {
    label: "偏严",
    color: "var(--warning)",
    description: "打分系统性低于同题同考生的平均水平。",
  },
  fair: {
    label: "无显著差异",
    color: "var(--muted-foreground)",
    description: "宽严估计与全体讲师平均的差异不显著。",
  },
  unknown: {
    label: "样本不足",
    color: "var(--muted-foreground)",
    description: "观测不足或与其他讲师没有重叠，无法判定宽严。",
  },
};
