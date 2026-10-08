import { NextRequest, NextResponse } from "next/server";
import { getEvaluationCandidates } from "@/action/user-flow/evaluation";
import { db } from "@/db/drizzle";
import { flow } from "@/db/schema";
import { verifyManager } from "@/lib/authz";
import { apiErrorResponse } from "@/lib/api-error";
import { logServerError } from "@/lib/server-error-log";
import { assertFlowEditableRecord } from "@/lib/flow-access";
import type { FlowScopedSession } from "@/action/flow/department-utils";
import { isOfficeInterviewFlow } from "@/const/flow";
import { escapeCsv } from "@/lib/csv";
import {
  buildOfficeRoundOneRoster,
  officeChoiceLabel,
  officeRoundOneAverageScore,
  type OfficeRoundOneRosterRow,
} from "@/lib/office-round-one-roster";
import { eq } from "drizzle-orm";

/**
 * 一面名单导出（办公类）：确认一面后工作台用「导出一面名单」下载。
 * 名单与工作台的「查看一面名单」同一份推导逻辑，保证两边看到的是同一批人同一个结论。
 */
export async function GET(request: NextRequest) {
  const flowId = Number(request.nextUrl.searchParams.get("flowId"));
  if (!Number.isInteger(flowId) || flowId <= 0) {
    return NextResponse.json({ message: "缺少有效流程 ID" }, { status: 400 });
  }

  let session: FlowScopedSession | null = null;
  let flowTitle = "招新流程";
  try {
    session = await verifyManager();

    /* 名单属于流程数据：只有流程归属部门或管理员可以下载 */
    const [flowRow] = await db
      .select({ title: flow.title, department: flow.department, type: flow.type })
      .from(flow)
      .where(eq(flow.id, flowId))
      .limit(1);
    if (!flowRow) {
      return NextResponse.json({ message: "流程不存在" }, { status: 404 });
    }
    assertFlowEditableRecord(session.scope, flowRow);
    if (!isOfficeInterviewFlow(flowRow.type)) {
      return NextResponse.json(
        { message: "只有办公类部门面试有一面名单" },
        { status: 400 },
      );
    }
    flowTitle = flowRow.title;
  } catch (error) {
    logServerError("api:flow:office-round-one-export", error, {
      path: request.nextUrl.pathname,
      method: request.method,
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "export-office-round-one-roster",
      flowId,
    });
    return apiErrorResponse(error, "导出一面名单失败");
  }

  let roster: OfficeRoundOneRosterRow[];
  try {
    roster = buildOfficeRoundOneRoster(await getEvaluationCandidates(flowId));
  } catch (error) {
    logServerError("api:flow:office-round-one-export:roster", error, {
      path: request.nextUrl.pathname,
      method: request.method,
      userId: session?.uid ?? null,
      role: session?.role ?? null,
      action: "export-office-round-one-roster",
      flowId,
    });
    return apiErrorResponse(error, "导出一面名单失败");
  }

  if (roster.length === 0) {
    return NextResponse.json(
      { message: "该流程还没有一面名单（确认一面后生成）" },
      { status: 404 },
    );
  }

  const table = [
    ["姓名", "学号", "志愿", "一面得分", "结论"],
    ...roster.map((row) => [
      row.name,
      row.studentId,
      officeChoiceLabel(row.choice),
      officeRoundOneAverageScore(row.scores) ?? "",
      row.passed ? "通过" : "不通过",
    ]),
  ];
  const lines = table.map((line) => line.map(escapeCsv).join(","));
  const body = `\uFEFF${lines.join("\n")}\n`;
  const filename = encodeURIComponent(`${flowTitle}-一面名单.csv`);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
