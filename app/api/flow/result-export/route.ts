import { NextRequest, NextResponse } from "next/server";
import { getPublishedFlowResult } from "@/action/flow/result-publication";
import { db } from "@/db/drizzle";
import { flow } from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import { assertFlowEditableRecord } from "@/lib/flow-access";
import type { FlowScopedSession } from "@/action/flow/department-utils";
import { eq } from "drizzle-orm";

function escapeCsv(value: unknown) {
  const raw = String(value ?? "");
  const text = /^[=+@\-\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: NextRequest) {
  const flowId = Number(request.nextUrl.searchParams.get("flowId"));
  if (!Number.isInteger(flowId) || flowId <= 0) return NextResponse.json({ message: "缺少有效流程 ID" }, { status: 400 });

  let session: FlowScopedSession | null = null;
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
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "无权导出该流程的结果" },
      { status: 403 },
    );
  }

  const publication = await getPublishedFlowResult(flowId);
  if (!publication) return NextResponse.json({ message: "该流程尚未发布结果" }, { status: 404 });
  const snapshot = publication.resultSnapshot as { flowTitle?: string; rows?: Array<Record<string, unknown>> };
  const headers = ["姓名", "学号", "投递组别", "结果", "结果来源记录 ID"];
  const lines = [headers, ...(snapshot.rows ?? []).map((row) => [row.name, row.studentId, row.applyGroup, row.status, row.userFlowId])]
    .map((line) => line.map(escapeCsv).join(","));
  const body = `\uFEFF${lines.join("\n")}\n`;
  const filename = encodeURIComponent(`${snapshot.flowTitle ?? "流程"}-结果表.csv`);
  return new NextResponse(body, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename*=UTF-8''${filename}` } });
}
