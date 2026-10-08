/**
 * API 导出的 CSV 单元格转义：引号 / 逗号 / 换行加引号包裹；
 * 公式前缀（= + @ - 制表符 回车）前加单引号，避免表格软件把内容当公式执行。
 */
export function escapeCsv(value: unknown) {
  const raw = String(value ?? "");
  const text = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
