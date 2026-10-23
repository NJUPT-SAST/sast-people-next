import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error";
import { getCollectionFormById, listCollectionSubmissions } from "@/lib/collection";
import { canManageCollectionForm } from "@/lib/collection-access";
import { departmentLabel } from "@/const/department";
import { formatCollectionAnswer } from "@/const/collection";
import { verifySession, type VerifiedSession } from "@/lib/dal";
import { listPeopleUsersByLinkIds } from "@/lib/link/user-lookup";
import { escapeCsv, escapeCsvMonth } from "@/lib/csv";
import { writeOperationAudit } from "@/lib/operation-audit";
import { logServerError } from "@/lib/server-error-log";
import { formatBeijingDateTime } from "@/lib/timezone";

export async function GET(request: NextRequest) {
  const formId = Number(request.nextUrl.searchParams.get("formId"));
  if (!Number.isInteger(formId) || formId <= 0) {
    return NextResponse.json({ message: "缺少有效收集表 ID" }, { status: 400 });
  }

  let session: VerifiedSession | null = null;
  try {
    session = await verifySession();
    const form = await getCollectionFormById(formId);
    if (!form) {
      return NextResponse.json({ message: "收集表不存在" }, { status: 404 });
    }
    if (!canManageCollectionForm(session)) {
      return NextResponse.json({ message: "无权导出该收集表" }, { status: 403 });
    }

    const rows = await listCollectionSubmissions(formId);
    const nameField = form.extraFields.find((field) => field.id === "name");
    const submitterNames =
      rows.length > 0 && !nameField
        ? await listPeopleUsersByLinkIds(rows.map((row) => row.fkUserId))
            .then(
              (users) =>
                new Map(
                  Array.from(users, ([id, user]) => [id, user.name] as const),
                ),
            )
            .catch(() => new Map<number, string>())
        : new Map<number, string>();
    const cellValue = (
 row: (typeof rows)[number],
 field: (typeof form.extraFields)[number],
) =>
      field.fixedValue ?? formatCollectionAnswer(row.extraAnswers[field.id]);
    const displayName = (row: (typeof rows)[number]) => {
      const name = nameField
        ? formatCollectionAnswer(row.extraAnswers[nameField.id])
        : "";
      return (
        name ||
        submitterNames.get(row.fkUserId) ||
        `用户 #${row.fkUserId}`
      );
    };
    const table = [
      [
        ...(nameField ? [] : ["填写人"]),
        ...form.extraFields.map((field) => field.label),
        "填写人部门",
        "退回说明",
        "提交时间",
        "最后更新",
      ].map(escapeCsv),
      ...rows.map((row) => [
        ...(nameField ? [] : [escapeCsv(displayName(row))]),
        ...form.extraFields.map((field) => {
          const value = cellValue(row, field);
          /* 年月列强制按文本导出：否则 Excel 会补成当月 1 号并显示成 May-07 */
          return field.type === "month"
            ? escapeCsvMonth(value)
            : escapeCsv(value);
        }),
        escapeCsv(departmentLabel(row.department, "")),
        escapeCsv(row.returnNote ?? ""),
        escapeCsv(formatBeijingDateTime(row.createdAt)),
        escapeCsv(formatBeijingDateTime(row.updatedAt)),
      ]),
    ];
    const lines = table.map((line) => line.join(","));
    const body = `\uFEFF${lines.join("\n")}\n`;
    const filename = encodeURIComponent(`${form.title}-收集结果.csv`);

    await writeOperationAudit({
      actorId: session.uid,
      actorRole: session.realRole,
      action: "collection.submissions.export",
      resourceType: "collection_form",
      resourceId: form.id,
      metadata: { count: rows.length },
    });

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
      },
    });
  } catch (error) {
    logServerError("api:collection:export", error, {
      path: request.nextUrl.pathname,
      method: request.method,
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "export-collection-submissions",
    });
    return apiErrorResponse(error, "导出收集结果失败");
  }
}
