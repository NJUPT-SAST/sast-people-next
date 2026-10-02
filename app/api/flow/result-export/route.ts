import { NextRequest, NextResponse } from "next/server";
import { getPublishedFlowResult } from "@/action/flow/result-publication";
import { db } from "@/db/drizzle";
import { flow } from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/api-error";
import { logServerError } from "@/lib/server-error-log";
import { assertFlowEditableRecord } from "@/lib/flow-access";
import type { FlowScopedSession } from "@/action/flow/department-utils";
import { departmentLabel } from "@/const/department";
import { isOfficeInterviewFlow } from "@/const/flow";
import { eq } from "drizzle-orm";

function escapeCsv(value: unknown) {
  const raw = String(value ?? "");
  const text = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/* 办公类志愿类型：1=第一志愿、2=第二志愿 */
function choiceLabel(value: unknown) {
  return value === 1 ? "第一志愿" : value === 2 ? "第二志愿" : "";
}

export async function GET(request: NextRequest) {
  const flowId = Number(request.nextUrl.searchParams.get("flowId"));
  if (!Number.isInteger(flowId) || flowId <= 0) return NextResponse.json({ message: "缺少有效流程 ID" }, { status: 400 });

  let session: FlowScopedSession | null = null;
  let isOffice = false;
  try {
    session = await verifyManager();

    /* 结果导出属于流程数据，只有流程归属部门或管理员可以下载 */
    const [flowRow] = await db
      .select({ department: flow.department, type: flow.type })
      .from(flow)
      .where(eq(flow.id, flowId))
      .limit(1);
    if (!flowRow) return NextResponse.json({ message: "流程不存在" }, { status: 404 });
    assertFlowEditableRecord(session.scope, flowRow);
    isOffice = isOfficeInterviewFlow(flowRow.type);
  } catch (error) {
    logServerError("api:flow:result-export", error, {
      path: request.nextUrl.pathname,
      method: request.method,
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "export-flow-result",
      flowId,
    });
    return apiErrorResponse(error, "导出流程结果失败");
  }

  let publication;
  try {
    publication = await getPublishedFlowResult(flowId);
  } catch (error) {
    logServerError("api:flow:result-export:snapshot", error, {
      path: request.nextUrl.pathname,
      method: request.method,
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "read-published-flow-result",
      flowId,
    });
    return apiErrorResponse(error, "导出流程结果失败");
  }
  if (!publication) return NextResponse.json({ message: "该流程尚未发布结果" }, { status: 404 });
  const snapshot = publication.resultSnapshot as { flowTitle?: string; rows?: Array<Record<string, unknown>> };
  const rows = snapshot.rows ?? [];
  /* 办公类留档：志愿、投递部门、面试时段、两轮均分与最终去向都进导出表；其他流程保持原列 */
  const table = isOffice
    ? [
        ["姓名", "学号", "志愿", "投递部门", "面试时段", "一面均分", "二面均分", "最终去向", "结果", "结果来源记录 ID"],
        ...rows.map((row) => [
          row.name,
          row.studentId,
          choiceLabel(row.choice),
          departmentLabel((row.department as string | null) ?? null, ""),
          row.interviewSlot,
          /* 旧快照没有分轮均分字段：缺失时导出空单元格（escapeCsv 已把 null/undefined 转为空串） */
          row.round1Average,
          row.round2Average,
          departmentLabel((row.finalDepartment as string | null) ?? null, ""),
          row.status,
          row.userFlowId,
        ]),
      ]
    : [
        ["姓名", "学号", "投递组别", "结果", "结果来源记录 ID"],
        ...rows.map((row) => [row.name, row.studentId, row.applyGroup, row.status, row.userFlowId]),
      ];
  const lines = table.map((line) => line.map(escapeCsv).join(","));
  const body = `\uFEFF${lines.join("\n")}\n`;
  const filename = encodeURIComponent(`${snapshot.flowTitle ?? "流程"}-结果表.csv`);
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${filename}` } });
}
