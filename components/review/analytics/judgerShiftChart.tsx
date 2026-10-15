import type React from "react";

import { cn } from "@/lib/utils";

import { groupByCluster } from "./judgerClusters";

export type JudgerShiftChartRow = {
  judgerId: number;
  name: string;
  /** 原始平均得分率 0..1 */
  rawMeanRatio: number;
  /** 校正后平均得分率 0..1 */
  adjustedMeanRatio: number;
  observationCount: number;
  /** 可比簇序号（≥0；-1 = 不可判定）；不同簇之间不可比较，渲染时插入分隔标签 */
  clusterIndex?: number;
};

/** 放进 1/3 宽的列后按 w-full 缩放，窄画布才能保住字号 */
const WIDTH = 420;
const ROW_HEIGHT = 26;
/** 名称区 8..96，绘图区 96..372，右侧 372..420 放差值 */
const NAME_END_X = 90;
const PLOT_LEFT = 96;
const PLOT_RIGHT = 372;
const DELTA_X = PLOT_RIGHT + 4;
const TOP_PAD = 24;
/** 绘图区下方：刻度（中心 +9）与 x 轴说明（中心 +22） */
const BOTTOM_PAD = 30;
/** 轴文字 */
const AXIS_FONT_SIZE = 10;
/** 行标签与数值列 */
const FONT_SIZE = 11;
const MAX_NAME_CHARS = 6;
const RAW_POINT_RADIUS = 4.5;
const ADJUSTED_POINT_RADIUS = 3.5;
/** 定义域两侧留白（占数据跨度比例），避免端点贴边 */
const DOMAIN_PADDING = 0.02;
const TICKS = [0, 0.25, 0.5, 0.75, 1];
const GRID_COLOR = "var(--border)";
const GRID_DASH = "3 3";
/** 可比簇分隔标签行的高度与字号 */
const GROUP_HEADER_HEIGHT = 24;
const GROUP_LABEL_FONT_SIZE = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function truncateChars(text: string, maxChars: number): string {
  const chars = Array.from(text);
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join("")}…` : text;
}

type ShiftLayoutItem =
  | { kind: "group"; clusterIndex: number; label: string; y: number }
  | { kind: "row"; row: JudgerShiftChartRow; y: number };

/**
 * 行布局：按可比簇切分，簇边界插入一行分隔标签（只有一个簇时不插）。
 * 不同簇的讲师之间不可比较，必须让分隔可见。`y` 是各元素的垂直中心。
 */
function buildLayout(rows: JudgerShiftChartRow[]): {
  items: ShiftLayoutItem[];
  plotBottom: number;
} {
  const groups = groupByCluster(rows);
  const showGroupLabels = groups.length > 1;
  const items: ShiftLayoutItem[] = [];
  let cursor = TOP_PAD;
  for (const group of groups) {
    if (showGroupLabels) {
      items.push({
        kind: "group",
        clusterIndex: group.clusterIndex,
        label: group.label,
        y: cursor + GROUP_HEADER_HEIGHT / 2,
      });
      cursor += GROUP_HEADER_HEIGHT;
    }
    for (const row of group.rows) {
      items.push({ kind: "row", row, y: cursor + ROW_HEIGHT / 2 });
      cursor += ROW_HEIGHT;
    }
  }
  return { items, plotBottom: cursor };
}

export function JudgerShiftChart({
  rows,
  className,
}: {
  rows: JudgerShiftChartRow[];
  className?: string;
}): React.ReactElement {
  const svgClassName = cn("w-full h-auto", className);

  if (rows.length === 0) {
    return (
      <svg
        className={svgClassName}
        viewBox="0 0 320 80"
        role="img"
        aria-label="讲师校正前后得分率对比图：暂无数据"
      >
        <text
          x={160}
          y={44}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fill="var(--muted-foreground)"
        >
          暂无数据
        </text>
      </svg>
    );
  }

  const ratios = rows
    .flatMap((row) => [row.rawMeanRatio, row.adjustedMeanRatio])
    .filter((ratio) => Number.isFinite(ratio));
  /* 定义域始终覆盖 0..1，数据越界时再自适应放宽 */
  const dataMin = Math.min(0, ...ratios);
  const dataMax = Math.max(1, ...ratios);
  const span = dataMax - dataMin;
  const domainMin = dataMin - span * DOMAIN_PADDING;
  const domainMax = dataMax + span * DOMAIN_PADDING;
  const plotWidth = PLOT_RIGHT - PLOT_LEFT;
  const { items, plotBottom } = buildLayout(rows);
  const height = plotBottom + BOTTOM_PAD;

  /** 得分率 0..1 → 画布 x 坐标 */
  const scaleX = (ratio: number) =>
    PLOT_LEFT +
    ((clamp(ratio, domainMin, domainMax) - domainMin) / (domainMax - domainMin)) * plotWidth;

  return (
    <svg
      className={svgClassName}
      viewBox={`0 0 ${WIDTH} ${height}`}
      role="img"
      aria-label={`讲师校正前后得分率对比图：共 ${rows.length} 名讲师，空心环为原始得分率，实心点为校正后得分率`}
    >
      {TICKS.filter((tick) => tick >= domainMin && tick <= domainMax).map((tick) => (
        <g key={`tick-${tick}`} data-part="tick">
          <line
            data-part="grid-line"
            x1={scaleX(tick)}
            x2={scaleX(tick)}
            y1={TOP_PAD}
            y2={plotBottom}
            stroke={GRID_COLOR}
            strokeWidth={1}
            strokeDasharray={GRID_DASH}
            opacity={0.6}
          />
          <line
            data-part="tick-mark"
            x1={scaleX(tick)}
            x2={scaleX(tick)}
            y1={plotBottom}
            y2={plotBottom + 3}
            stroke={GRID_COLOR}
            strokeWidth={1}
          />
          <text
            data-part="tick-label"
            x={scaleX(tick)}
            y={plotBottom + 9}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={AXIS_FONT_SIZE}
            fill="var(--muted-foreground)"
          >
            {`${Math.round(tick * 100)}%`}
          </text>
        </g>
      ))}

      <line
        data-part="axis-line"
        x1={PLOT_LEFT}
        x2={PLOT_RIGHT}
        y1={plotBottom}
        y2={plotBottom}
        stroke={GRID_COLOR}
        strokeWidth={1}
      />

      <text
        data-part="axis-caption"
        x={(PLOT_LEFT + PLOT_RIGHT) / 2}
        y={plotBottom + 22}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={AXIS_FONT_SIZE}
        fill="var(--muted-foreground)"
      >
        平均得分率
      </text>

      {items.map((item, index) => {
        if (item.kind === "group") {
          return (
            <g
              key={`cluster-${item.clusterIndex}`}
              data-part="cluster-header"
              data-cluster-index={item.clusterIndex}
            >
              <title>{item.label}</title>
              <text
                data-part="cluster-label"
                data-cluster-index={item.clusterIndex}
                x={8}
                y={item.y - 3}
                textAnchor="start"
                dominantBaseline="middle"
                fontSize={GROUP_LABEL_FONT_SIZE}
                fill="var(--muted-foreground)"
              >
                {item.label}
              </text>
              <line
                data-part="cluster-divider"
                data-cluster-index={item.clusterIndex}
                x1={8}
                x2={PLOT_RIGHT}
                y1={item.y + 9}
                y2={item.y + 9}
                stroke={GRID_COLOR}
                strokeWidth={1}
              />
            </g>
          );
        }

        const { row } = item;
        const y = item.y;
        const rawX = scaleX(row.rawMeanRatio);
        const adjustedX = scaleX(row.adjustedMeanRatio);
        const deltaPercent = (row.adjustedMeanRatio - row.rawMeanRatio) * 100;
        const deltaLabel = `${deltaPercent > 0 ? "+" : deltaPercent < 0 ? "−" : ""}${Math.abs(deltaPercent).toFixed(1)}pp`;
        return (
          <g key={`${row.judgerId}-${index}`} data-part="row" data-judger-id={row.judgerId}>
            <title>
              {`${row.name}：原始 ${(row.rawMeanRatio * 100).toFixed(1)}% → 校正后 ${(row.adjustedMeanRatio * 100).toFixed(1)}%（${deltaLabel}，n=${row.observationCount}）`}
            </title>

            <text
              data-part="row-label"
              data-judger-id={row.judgerId}
              x={NAME_END_X}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={FONT_SIZE}
              fill="var(--foreground)"
            >
              {truncateChars(row.name, MAX_NAME_CHARS)}
            </text>

            <line
              data-part="connector"
              data-judger-id={row.judgerId}
              x1={rawX}
              x2={adjustedX}
              y1={y}
              y2={y}
              stroke={GRID_COLOR}
              strokeWidth={2}
              strokeLinecap="round"
            />

            <circle
              data-part="raw-point"
              data-judger-id={row.judgerId}
              cx={rawX}
              cy={y}
              r={RAW_POINT_RADIUS}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeWidth={2}
            />
            <circle
              data-part="adjusted-point"
              data-judger-id={row.judgerId}
              cx={adjustedX}
              cy={y}
              r={ADJUSTED_POINT_RADIUS}
              fill="var(--primary)"
              stroke="var(--primary)"
              strokeWidth={1}
            />

            <text
              data-part="delta"
              data-judger-id={row.judgerId}
              x={DELTA_X}
              y={y}
              textAnchor="start"
              dominantBaseline="middle"
              fontSize={FONT_SIZE}
              fill="var(--muted-foreground)"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {deltaLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
