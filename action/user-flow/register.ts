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

export type RegisterSubmission = {
  /** 投递组别（面试流程配置组别时必填） */
  group?: string;
  portfolioLink?: string;
  portfolioDescription?: string;
};

function normalizeGroupOptions(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .map((option) => (typeof option === "string" ? option.trim() : ""))
    .filter(Boolean);
}

export const register = async (
  flowId: number,
  uid: number,
  submissions: RegisterSubmission[],
) => {
  let session: Awaited<ReturnType<typeof verifySession>> | null = null;
  try {
    session = await verifySession();
    const createdUserFlowIds: number[] = [];
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

    if (!Array.isArray(submissions) || submissions.length === 0) {
      return {
        success: false,
        error: {
          message: "请至少填写一项投递信息",
        },
      };
    }

    const result = await db.transaction(async (tx) => {
      // 检查流程时间限制与配置
      const flowInfo = await tx
        .select({
          startedAt: flow.startedAt,
          endedAt: flow.endedAt,
          title: flow.title,
          type: flow.type,
          groupOptions: flow.groupOptions,
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
      const { startedAt, endedAt, title, type, groupOptions } = flowInfo[0];
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

      const configuredGroups = normalizeGroupOptions(groupOptions);
      const isWrittenRecruitment = type === "recruitment";

      // 归一化并校验每组投递（校验失败直接返回结构化错误，避免 Server Action 吞消息）
      const normalized: Array<{
        group?: string;
        portfolioLink: string | null;
        portfolioDescription: string | null;
      }> = [];
      for (const submission of submissions) {
        const group = submission.group?.trim() || undefined;
        if (isWrittenRecruitment) {
          if (group) {
            return {
              success: false,
              error: {
                message: "笔试流程不支持投递组别，请重新填写报名信息",
              },
            };
          }
          normalized.push({
            group: undefined,
            portfolioLink: null,
            portfolioDescription: null,
          });
          continue;
        }
        if (configuredGroups.length === 0) {
          if (group) {
            return {
              success: false,
              error: {
                message: "该流程未配置投递组别，暂不支持分组投递",
              },
            };
          }
          normalized.push({
            group: undefined,
            portfolioLink: submission.portfolioLink?.trim() || null,
            portfolioDescription:
              submission.portfolioDescription?.trim() || null,
          });
          continue;
        }
        if (!group) {
          return {
            success: false,
            error: {
              message: "请选择投递组别",
            },
          };
        }
        if (!configuredGroups.includes(group)) {
          return {
            success: false,
            error: {
              message: `投递组别“${group}”不在该流程的选项内`,
            },
          };
        }
        normalized.push({
          group,
          portfolioLink: submission.portfolioLink?.trim() || null,
          portfolioDescription:
            submission.portfolioDescription?.trim() || null,
        });
      }

      const seenGroups = new Set<string>();
      let ungroupedCount = 0;
      for (const submission of normalized) {
        if (submission.group) {
          if (seenGroups.has(submission.group)) {
            return {
              success: false,
              error: {
                message: `投递组别“${submission.group}”重复，请合并后再提交`,
              },
            };
          }
          seenGroups.add(submission.group);
        } else {
          ungroupedCount += 1;
        }
      }
      // 无组别（笔试/未配置组别）的流程只允许一条投递，防止越过部分唯一索引
      if (ungroupedCount > 1) {
        return {
          success: false,
          error: {
            message: "该流程只支持提交一条报名信息",
          },
        };
      }
      if (!isWrittenRecruitment && configuredGroups.length > 0) {
        if (normalized.every((s) => !s.group)) {
          return {
            success: false,
            error: {
              message: "请至少选择一个投递组别",
            },
          };
        }
      }

      for (const submission of normalized) {
        if (
          submission.portfolioLink &&
          !isValidExternalUrl(submission.portfolioLink)
        ) {
          return {
            success: false,
            error: {
              message: submission.group
                ? `“${submission.group}”的作品链接格式不正确，请填写有效的 URL`
                : "作品链接格式不正确，请填写有效的 URL",
            },
          };
        }
      }

      const stepId = await findStepIdByOrder(flowId, 2);

      // 一次查询所有已有记录，重复检查与恢复共用一个索引
      const existingFlows = await tx
        .select({
          id: userFlow.id,
          progressStatus: userFlow.progressStatus,
          applyGroup: userFlow.applyGroup,
        })
        .from(userFlow)
        .where(
          and(eq(userFlow.fkFlowId, flowId), eq(userFlow.fkUserId, uid)),
        );
      const existingByGroup = new Map<
        string | null,
        (typeof existingFlows)[number]
      >();
      for (const existing of existingFlows) {
        existingByGroup.set(existing.applyGroup, existing);
      }

      // 检查每个投递是否已存在（先查全再写入，事务失败时不产生半成品）
      const duplicates: string[] = [];
      for (const submission of normalized) {
        const existing = existingByGroup.get(submission.group ?? null);
        if (existing && existing.progressStatus !== "withdrawn") {
          duplicates.push(submission.group ?? "未分组投递");
        }
      }
      if (duplicates.length > 0) {
        return {
          success: false,
          error: {
            message: `您已经报名了：${duplicates.join("、")}`,
          },
        };
      }

      // 逐组创建/恢复
      for (const submission of normalized) {
        const existing = existingByGroup.get(submission.group ?? null);
        if (existing) {
          await tx
            .update(userFlow)
            .set({
              fkCurrentStepId: stepId,
              progressStatus: "ongoing",
              withdrawReason: null,
              portfolioLink: submission.portfolioLink,
              portfolioDescription: submission.portfolioDescription,
              applyGroup: submission.group ?? null,
              updatedAt: new Date(),
            })
            .where(eq(userFlow.id, existing.id));
          createdUserFlowIds.push(existing.id);
        } else {
          const [newFlow] = await tx
            .insert(userFlow)
            .values({
              fkUserId: uid,
              fkFlowId: flowId,
              fkCurrentStepId: stepId,
              progressStatus: "ongoing",
              portfolioLink: submission.portfolioLink,
              portfolioDescription: submission.portfolioDescription,
              applyGroup: submission.group ?? null,
            })
            .returning();
          createdUserFlowIds.push(newFlow.id);
        }
      }

      return {
        success: true,
      };
    });

    if (result.success && createdUserFlowIds.length > 0) {
      await writeOperationAudit({
        actorId: session.uid,
        actorRole: session.role,
        action: "user_flow.register",
        resourceType: "user_flow",
        resourceId: createdUserFlowIds[0],
        metadata: {
          flowId,
          targetUserId: uid,
          createdUserFlowIds,
          submissions: submissions.map((s) => ({
            group: s.group?.trim() ?? null,
            hasPortfolioLink: Boolean(s.portfolioLink?.trim()),
          })),
        },
      });
      revalidatePath("/dashboard/user-flow");
    }

    return result;
  } catch (error) {
    logServerError("user-flow:register", error, {
      path: "/dashboard/user-flow",
      action: "register",
      userId: session?.uid ?? null,
      flowId,
      metadata: {
        uid,
        submissions: submissions.map((s) => ({
          group: s.group?.trim() ?? null,
          hasPortfolioLink: Boolean(s.portfolioLink?.trim()),
        })),
      },
    });
    throw error;
  }
};
