import { NextRequest, NextResponse } from "next/server";
import { apiErrorResponse } from "@/lib/api-error";
import { getCollectionFormById, listCollectionSubmissions } from "@/lib/collection";
import { canManageCollectionForm } from "@/lib/collection-access";
import { departmentLabel } from "@/const/department";
import { verifySession, type VerifiedSession } from "@/lib/dal";
import { escapeCsv } from "@/lib/csv";
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
    const table = [
      [
        "社团名称",
        "类别",
        "姓名",
        "出生年月",
        "政治面貌",
        "所在学院",
        "所在班级",
        "学号",
        "入学年份",
        "预计毕业年份",
        ...form.extraFields.map((field) => field.label),
        "填写人部门",
        "提交时间",
        "最后更新",
      ],
      ...rows.map((row) => [
        row.clubName,
        row.category,
        row.name,
        row.birthMonth,
        row.politicalStatus,
        row.college,
        row.className,
        row.studentId,
        row.enrollmentYear,
        row.graduationYear,
        ...form.extraFields.map((field) => row.extraAnswers[field.id] ?? ""),
        departmentLabel(row.department, ""),
        formatBeijingDateTime(row.createdAt),
        formatBeijingDateTime(row.updatedAt),
      ]),
    ];
    const lines = table.map((line) => line.map(escapeCsv).join(","));
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
