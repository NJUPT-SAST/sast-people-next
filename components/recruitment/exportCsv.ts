export type RecruitmentScoreExportRow = {
  studentId?: string | null;
  name?: string | null;
  phoneNumber?: string | null;
  status?: string | null;
  totalScore?: string | number | null;
  problemScores?: Array<{
    title: string;
    score: number;
    points: number;
    judgerName: string | null;
  }>;
};

export const recruitmentStatusText: Record<string, string> = {
  pending: "未开始",
  ungraded: "未批卷",
  ongoing: "待确认",
  passed: "通过",
  failed: "不通过",
  accepted: "通过邮件已发",
  rejected: "不通过邮件已发",
};

export function escapeCsvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

export function buildRecruitmentScoreCsv({
  rows,
  includeSensitiveInfo,
}: {
  rows: RecruitmentScoreExportRow[];
  includeSensitiveInfo: boolean;
}) {
  const headers = ["学号", "姓名"];
  if (includeSensitiveInfo) headers.push("手机号");
  headers.push("状态", "总分");
  if (includeSensitiveInfo) headers.push("得分组成");

  const lines = [
    headers.map(escapeCsvCell).join(","),
    ...rows.map((row) => {
      const cells: unknown[] = [
        row.studentId ?? "",
        row.name ?? "",
      ];

      if (includeSensitiveInfo) cells.push(row.phoneNumber ?? "");

      cells.push(
        recruitmentStatusText[row.status ?? ""] ?? row.status ?? "",
        row.totalScore ?? "",
      );

      if (includeSensitiveInfo) {
        cells.push(
          row.problemScores
            ?.map(
              (item) =>
                `${item.title}: ${item.points}/${item.score} (${item.judgerName ?? "未记录"})`,
            )
            .join("; ") ?? "",
        );
      }

      return cells.map(escapeCsvCell).join(",");
    }),
  ];

  return `${lines.join("\r\n")}\r\n`;
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([`\uFEFF${content}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
