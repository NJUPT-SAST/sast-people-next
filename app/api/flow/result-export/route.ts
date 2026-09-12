import { NextRequest, NextResponse } from "next/server";
import { getPublishedFlowResult } from "@/action/flow/result-publication";

function escapeCsv(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export async function GET(request: NextRequest) {
  const flowId = Number(request.nextUrl.searchParams.get("flowId"));
  if (!Number.isInteger(flowId) || flowId <= 0) return NextResponse.json({ message: "缺少有效流程 ID" }, { status: 400 });
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
