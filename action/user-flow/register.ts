"use server";
import { db } from "@/db/drizzle";
import { flow, flowStep, userFlow } from "@/db/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logServerError } from "@/lib/server-error-log";
import { verifySession } from "@/lib/dal";
import { getPeopleUserByLinkId } from "@/lib/link/user-lookup";
import { isValidExternalUrl } from "@/lib/link";
import { writeOperationAudit } from "@/lib/operation-audit";

/** 查找 flow 下指定 order 的步骤 ID */
async function findStepIdByOrder(
  flowId: number,
  order: number,
): Promise<number | null> {
  const [step] = await db
    .select({ id: flowStep.id })
    .from(flowStep)
    .where(and(eq(flowStep.fkFlowId, flowId), eq(flowStep.order, order)))
    .limit(1);
  return step?.id ?? null;
}

export const register = async (
  flowId: number,
  uid: number,
  portfolioLink?: string,
  portfolioDescription?: string,
) => {
  try {
    const session = await verifySession();
    let createdUserFlowId: number | null = null;
    if (session.uid !== uid) {
      return {
        success: false,
        error: {
          message: "只能为当前登录账号报名",
        },
      };
    }

    const userInfo = await getPeopleUserByLinkId(uid, {
      canViewSensitiveInfo: true,
    });

    if (userInfo.isDeleted) {
      return {
        success: false,
        error: {
          message: "账号已被封禁，无法报名",
        },
      };
    }

    const missingFields = [
      ["name", "姓名"],
      ["studentId", "学号"],
      ["phone", "手机号"],
      ["email", "邮箱"],
      ["college", "学院"],
      ["major", "专业"],
      ["qq", "QQ号"],
    ].filter(([key]) => !userInfo?.[key as keyof typeof userInfo]);

    if (missingFields.length > 0) {
      return {
        success: false,
        error: {
          message: `请先补全基本信息：${missingFields.map(([, label]) => label).join("、")}`,
        },
      };
    }

    const result = await db.transaction(async (tx) => {
      // 检查用户是否已经报名
      const existingFlow = await tx
        .select({ id: userFlow.id, progressStatus: userFlow.progressStatus })
        .from(userFlow)
        .where(and(eq(userFlow.fkFlowId, flowId), eq(userFlow.fkUserId, uid)))
        .limit(1);

      if (existingFlow.length > 0 && existingFlow[0].progressStatus !== "withdrawn") {
        return {
          success: false,
          error: {
            message: "您已经报名了这个流程",
          },
        };
      }

      // 检查流程时间限制
      const flowInfo = await tx
        .select({
          startedAt: flow.startedAt,
          endedAt: flow.endedAt,
          title: flow.title,
          type: flow.type,
        })
        .from(flow)
        .where(and(eq(flow.id, flowId), eq(flow.isDeleted, false)))
        .limit(1);

      if (flowInfo.length === 0) {
        return {
          success: false,
          error: {
            message: "流程不存在",
          },
        };
      }

      const now = new Date();
      const { startedAt, endedAt, title, type } = flowInfo[0];
      const interviewFlowTypes = [
        "recruitment_exemption",
        "woc",
        "soc",
      ] as const;
      if (interviewFlowTypes.includes(type as (typeof interviewFlowTypes)[number])) {
        // Serialize registrations for the same user so the mutual-exclusion
        // check and the following insert/update cannot race each other.
        await tx.execute(sql`select pg_advisory_xact_lock(${uid})`);
        const [activeInterviewFlow] = await tx
          .select({ title: flow.title })
          .from(userFlow)
          .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
          .where(
            and(
              eq(userFlow.fkUserId, uid),
              eq(userFlow.progressStatus, "ongoing"),
              inArray(flow.type, interviewFlowTypes),
              ne(userFlow.fkFlowId, flowId),
            ),
          )
          .limit(1);
        if (activeInterviewFlow) {
          return {
            success: false,
            error: {
              message: `您正在进行“${activeInterviewFlow.title}”，请先完成或退回当前面试流程。`,
            },
          };
        }
      }
      const normalizedPortfolioLink =
        type === "recruitment" ? null : portfolioLink?.trim() || null;
      const normalizedPortfolioDescription =
        type === "recruitment" ? null : portfolioDescription?.trim() || null;

      if (
        normalizedPortfolioLink &&
        !isValidExternalUrl(normalizedPortfolioLink)
      ) {
        return {
          success: false,
          error: { message: "作品链接格式不正确，请填写有效的 URL" },
        };
      }

      if (now < startedAt) {
        return {
          success: false,
          error: {
            message: `流程"${title}"尚未开始，开始时间为 ${startedAt.toLocaleString("zh-CN")}`,
          },
        };
      }

      if (endedAt && now > endedAt) {
        return {
          success: false,
          error: {
            message: `流程"${title}"已结束，结束时间为 ${endedAt.toLocaleString("zh-CN")}`,
          },
        };
      }

      const stepId = await findStepIdByOrder(flowId, 2);

      if (existingFlow[0]?.progressStatus === "withdrawn") {
        await tx
          .update(userFlow)
          .set({
            fkCurrentStepId: stepId,
            progressStatus: "ongoing",
            portfolioLink: normalizedPortfolioLink,
            portfolioDescription: normalizedPortfolioDescription,
            updatedAt: new Date(),
          })
          .where(eq(userFlow.id, existingFlow[0].id));
        createdUserFlowId = existingFlow[0].id;
      } else {
        const [newFlow] = await tx
          .insert(userFlow)
          .values({
            fkUserId: uid,
            fkFlowId: flowId,
            fkCurrentStepId: stepId,
            progressStatus: "ongoing",
            portfolioLink: normalizedPortfolioLink,
            portfolioDescription: normalizedPortfolioDescription,
          })
          .returning();
        createdUserFlowId = newFlow.id;
      }

      return {
        success: true,
      };
    });

    if (result.success && createdUserFlowId !== null) {
      await writeOperationAudit({
        actorId: session.uid,
        actorRole: session.role,
        action: "user_flow.register",
        resourceType: "user_flow",
        resourceId: createdUserFlowId,
        metadata: {
          flowId,
          targetUserId: session.uid,
          hasPortfolioLink: Boolean(portfolioLink?.trim()),
          hasPortfolioDescription: Boolean(portfolioDescription?.trim()),
        },
      });
      revalidatePath("/dashboard/user-flow");
    }

    return result;
  } catch (error) {
    logServerError("user-flow:register", error, {
      path: "/dashboard/user-flow",
      action: "register-flow",
      userId: uid,
      flowId,
    });
    throw error;
  }
};
