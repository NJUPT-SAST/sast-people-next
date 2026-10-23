/**
 * API 导出的 CSV 单元格转义：引号 / 逗号 / 换行加引号包裹；
 * 公式前缀（= + @ - 制表符 回车）前加单引号，避免表格软件把内容当公式执行。
 */
export function escapeCsv(value: unknown) {
  const raw = String(value ?? "");
  const text = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const MONTH_CELL_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * 导出年月（`YYYY-MM`）专用：Excel / WPS 打开 CSV 时会把 `2007-05`
 * 当成日期补成当月 1 号，并把列显示成 `May-07`。这里用文本公式锁定原始值，
 * 只对严格合法的年月生效；其余内容仍走 `escapeCsv` 的公式注入防护。
 */
export function escapeCsvMonth(value: unknown) {
  const raw = String(value ?? "");
  if (!MONTH_CELL_PATTERN.test(raw)) return escapeCsv(raw);
  return `"=""${raw}"""`;
}
