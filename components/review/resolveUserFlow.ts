export type ReviewUserFlowResult =
  | { success: true; userFlowId: number }
  | { success: false; message: string };

export async function resolveUserFlowForReview(
  studentId: string,
  flowId: number,
): Promise<ReviewUserFlowResult> {
  const response = await fetch(
    `/api/user-flow?studentId=${encodeURIComponent(studentId)}&flowId=${flowId}`,
  );
  const data = (await response.json().catch(() => null)) as {
    success?: boolean;
    userFlowId?: number | null;
    message?: string;
  } | null;

  if (response.status === 404) {
    return {
      success: false,
      message: data?.message ?? "该同学未报名当前阅卷流程",
    };
  }

  if (!response.ok || !data?.success || !data.userFlowId) {
    throw new Error(data?.message ?? "查询报名记录失败");
  }

  return { success: true, userFlowId: data.userFlowId };
}
