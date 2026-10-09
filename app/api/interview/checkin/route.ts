import { NextRequest, NextResponse } from "next/server";
import { getVenueSnapshot } from "@/action/user-flow/checkin";
import { apiErrorResponse } from "@/lib/api-error";
import { logServerError } from "@/lib/server-error-log";

/**
 * 签到叫号轮询接口：全场快照（全部启用办公部门）。
 * 签到叫号页与大屏都用它，前端每 5s / 3s 拉一次，
 * 与仓库既有的请求/响应 + SWR 模型一致，不引入实时基础设施。
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const round = Number(searchParams.get("round") ?? "1");

    const venue = await getVenueSnapshot(round);
    return NextResponse.json({ success: true, venue });
  } catch (error) {
    const { pathname, searchParams } = new URL(request.url);
    logServerError("api:interview-checkin:get", error, {
      path: pathname,
      method: request.method,
      action: "get-checkin-venue",
      metadata: { round: Number(searchParams.get("round")) || 1 },
    });
    return apiErrorResponse(error, "查询签到队列失败");
  }
}
