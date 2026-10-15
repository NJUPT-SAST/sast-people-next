/**
 * 可比簇（`JudgerEstimate.clusterIndex`）的展示分组。
 *
 * 模型把「两两可比」的讲师划进同一个可比簇（簇内已各自居中），**簇与簇之间不可直接比较**，
 * 所以森林图 / 哑铃图 / 参数面板都必须按簇分组并插入分隔标签，不能把不同簇的讲师画在同一根
 * 可比较的轴上而不加说明。`fit.judgers` 已按 `clusterIndex` 排序（可判定的在前、不可判定最后），
 * 这里只负责切分与生成标签。
 */

/** `clusterIndex === -1`（不可判定：没有其他讲师与之可比）的组标签 */
export const UNIDENTIFIABLE_CLUSTER_LABEL = "不可判定 · 没有其他讲师评过同一名考生";

export type JudgerClusterGroup<T> = {
  clusterIndex: number;
  /** 组标签（已含讲师数与「仅组内可比」的限定） */
  label: string;
  rows: T[];
};

/** 组标签：`clusterIndex` 从 0 起，展示时 +1（「阅卷组 1」），避免出现「阅卷组 0」 */
export function clusterGroupLabel(clusterIndex: number, judgerCount: number): string {
  if (clusterIndex < 0) return UNIDENTIFIABLE_CLUSTER_LABEL;
  return `阅卷组 ${clusterIndex + 1} · ${judgerCount} 名讲师 · 仅组内可比`;
}

/**
 * 按 `clusterIndex` 切分（保持传入顺序），并为每组生成标签。
 * 未提供 `clusterIndex` 的行按 0 处理（单簇场景下不会插入分隔标签）。
 */
export function groupByCluster<T extends { clusterIndex?: number }>(
  rows: T[],
): JudgerClusterGroup<T>[] {
  const groups: JudgerClusterGroup<T>[] = [];
  for (const row of rows) {
    const clusterIndex = row.clusterIndex ?? 0;
    const last = groups[groups.length - 1];
    if (last !== undefined && last.clusterIndex === clusterIndex) last.rows.push(row);
    else groups.push({ clusterIndex, label: "", rows: [row] });
  }
  for (const group of groups) {
    group.label = clusterGroupLabel(group.clusterIndex, group.rows.length);
  }
  return groups;
}
