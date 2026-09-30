"use server";
import { db } from "@/db/drizzle";
import {
  flow,
  flowSlotOptionsSchema,
  flowStep,
  userFlow,
} from "@/db/schema";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { logServerError } from "@/lib/server-error-log";
import { verifySession } from "@/lib/dal";
import { getPeopleUserByLinkId } from "@/lib/link/user-lookup";
import { isValidExternalUrl } from "@/lib/link";
import { formatBeijingDateTime } from "@/lib/timezone";
import { writeOperationAudit } from "@/lib/operation-audit";
import { resolveUserFlowDepartment } from "@/lib/flow-access";
import { flowNeedsPortfolio, OFFICE_INTERVIEW_FLOW_TYPE } from "@/const/flow";

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
  /** 面试时段（办公类部门面试招新配置时段时必填，取 flow.slot_options 的 label） */
  slot?: string;
  /** 志愿类型（仅办公类部门面试招新：1=第一志愿、2=第二志愿；每个办公部门一条流程） */
  choice?: 1 | 2;
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
    /* 首次落库记录的归属，用于审计 */
    let primaryDepartment: string | null = null;
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
          slotOptions: flow.slotOptions,
          /* 报名归属：流程归属部门 + 组别映射 */
          department: flow.department,
          groupDepartments: flow.groupDepartments,
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
      const flowDepartment = flowInfo[0].department;
      const groupDepartments = flowInfo[0].groupDepartments;
      const parsedSlotOptions = flowSlotOptionsSchema.safeParse(
        flowInfo[0].slotOptions ?? [],
      );
      const slotOptions = parsedSlotOptions.success ? parsedSlotOptions.data : [];
      const isOfficeInterview = type === OFFICE_INTERVIEW_FLOW_TYPE;
      const officeChoice = submissions[0]?.choice ?? null;

      if (isOfficeInterview) {
        /* 办公类部门面试按流程（=办公部门）报名，没有投递组别 */
        if (submissions.some((submission) => submission.group?.trim())) {
          return {
            success: false,
            error: {
              message: "办公类部门面试没有投递组别",
            },
          };
        }

        if (officeChoice !== 1 && officeChoice !== 2) {
          return {
            success: false,
            error: {
              message: "请选择志愿类型",
            },
          };
        }

        // Serialize registrations for the same user so the count check and the
        // following insert/update cannot race each other.
        await tx.execute(sql`select pg_advisory_xact_lock(${uid})`);

        /* 办公类互斥：进行中的办公类报名最多两条，且必须一条第一志愿、一条第二志愿。
           每个办公部门一条流程，候选人分别在对应流程里提交志愿。 */
        const activeOfficeChoices = await tx
          .select({ choice: userFlow.choice })
          .from(userFlow)
          .innerJoin(flow, eq(userFlow.fkFlowId, flow.id))
          .where(
            and(
              eq(userFlow.fkUserId, uid),
              inArray(userFlow.progressStatus, ["not_started", "ongoing"]),
              eq(flow.type, OFFICE_INTERVIEW_FLOW_TYPE),
              eq(flow.isDeleted, false),
              ne(userFlow.fkFlowId, flowId),
            ),
          );
        if (activeOfficeChoices.length >= 2) {
          return {
            success: false,
            error: {
              message:
                "办公类部门面试最多同时报名两个部门，且必须是一个第一志愿和一个第二志愿。",
            },
          };
        }
        if (activeOfficeChoices.some((row) => row.choice === officeChoice)) {
          return {
            success: false,
            error: {
              message:
                officeChoice === 1
                  ? "您已有进行中的第一志愿办公类报名，请选择第二志愿。"
                  : "您已有进行中的第二志愿办公类报名，请选择第一志愿。",
            },
          };
        }
      }

      if (now < startedAt) {
        return {
          success: false,
          error: {
              message: `流程"${title}"尚未开始，开始时间为 ${formatBeijingDateTime(startedAt)}`,
          },
        };
      }

      if (endedAt && now > endedAt) {
        return {
          success: false,
          error: {
              message: `流程"${title}"已结束，结束时间为 ${formatBeijingDateTime(endedAt)}`,
          },
        };
      }

      const configuredGroups = normalizeGroupOptions(groupOptions);
      const isWrittenRecruitment = type === "recruitment";
      /* 作品链接/作品简介只属于技术部门面试流程；办公类与笔试忽略提交里携带的作品字段 */
      const acceptsPortfolio = flowNeedsPortfolio(type);

      // 归一化并校验每组投递（校验失败直接返回结构化错误，避免 Server Action 吞消息）
      const normalized: Array<{
        group?: string;
        slot?: string;
        portfolioLink: string | null;
        portfolioDescription: string | null;
      }> = [];
      for (const submission of submissions) {
        const group = submission.group?.trim() || undefined;
        const slot = submission.slot?.trim() || undefined;
        /* 办公类与笔试不接受作品字段，一律落库为 null */
        const portfolioLink = acceptsPortfolio
          ? submission.portfolioLink?.trim() || null
          : null;
        const portfolioDescription = acceptsPortfolio
          ? submission.portfolioDescription?.trim() || null
          : null;
        if (isOfficeInterview) {
          if (slotOptions.length === 0) {
            if (slot) {
              return {
                success: false,
                error: {
                  message: "该流程未配置面试时段，暂不支持选择时段",
                },
              };
            }
          } else if (!slot) {
            return {
              success: false,
              error: {
                message: "请选择面试时段",
              },
            };
          } else if (!slotOptions.some((option) => option.label === slot)) {
            return {
              success: false,
              error: {
                message: `面试时段“${slot}”不在该流程的选项内`,
              },
            };
          }
        } else if (slot) {
          return {
            success: false,
            error: {
              message: "该流程不支持选择面试时段",
            },
          };
        }
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
            slot,
            portfolioLink,
            portfolioDescription,
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
            slot,
            portfolioLink,
            portfolioDescription,
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
          slot,
          portfolioLink,
          portfolioDescription,
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
      /* 办公类面试：同一个流程只能报名一次（更换志愿请先退回） */
      if (isOfficeInterview && existingFlows.some((row) => row.progressStatus !== "withdrawn")) {
        return {
          success: false,
          error: {
            message: "您已报名该流程，如需更换志愿请先退回报名。",
          },
        };
      }
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
        // 归属在报名时按「组别映射 → 流程归属」解析并固化
        const department = resolveUserFlowDepartment(
          groupDepartments,
          submission.group,
          flowDepartment,
        );
        if (createdUserFlowIds.length === 0) {
          primaryDepartment = department;
        }
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
              department,
              choice: isOfficeInterview ? officeChoice : null,
              round: isOfficeInterview ? 1 : null,
              interviewSlot: submission.slot ?? null,
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
              department,
              choice: isOfficeInterview ? officeChoice : null,
              round: isOfficeInterview ? 1 : null,
              interviewSlot: submission.slot ?? null,
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
        department: primaryDepartment,
        metadata: {
          flowId,
          targetUserId: uid,
          createdUserFlowIds,
          submissions: submissions.map((s) => ({
            group: s.group?.trim() ?? null,
            slot: s.slot?.trim() ?? null,
            choice: s.choice ?? null,
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
