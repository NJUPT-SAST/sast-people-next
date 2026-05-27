"use server";
import { db } from "@/db/drizzle";
import { flow, user, userFlow } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
// import eventManager from "@/event";

export const register = async (flowId: number, uid: number) => {
  return await db.transaction(async (tx) => {
    // 检查用户是否已经报名
    const existingFlow = await db
      .select({ id: userFlow.id })
      .from(userFlow)
      .where(and(eq(userFlow.fkFlowId, flowId), eq(userFlow.fkUserId, uid)))
      .limit(1);

    if (existingFlow.length > 0) {
      return {
        success: false,
        error: {
          message: "您已经报名了这个流程"
        }
      }
    }

    // 检查流程时间限制
    const flowInfo = await db
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
          message: "流程不存在"
        }
      }
    }

    const now = new Date();
    const { startedAt, endedAt, title, type } = flowInfo[0];

    if (now < startedAt) {
      return {
        success: false,
        error: {
          message: `流程"${title}"尚未开始，开始时间为 ${startedAt.toLocaleString('zh-CN')}`
        }
      }
    }

    if (now > endedAt) {
      return {
        success: false,
        error: {
          message: `流程"${title}"已结束，结束时间为 ${endedAt.toLocaleString('zh-CN')}`
        }
      }
    }

    const userInfo = (
      await db
        .select({
          name: user.name,
          studentId: user.studentId,
          phone: user.phone,
          email: user.email,
          college: user.college,
          major: user.major,
          qq: user.qq,
        })
        .from(user)
        .where(eq(user.id, uid))
        .limit(1)
    )[0];

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
          message: `请先补全基本信息：${missingFields.map(([, label]) => label).join("、")}`
        }
      }
    }

    const [_newFlow] = await tx
      .insert(userFlow)
      .values({
        fkUserId: uid,
        fkFlowId: flowId,
        currentStepOrder: type === "recruitment" ? 2 : 2,
        status: "ongoing",
      })
      .returning();

    revalidatePath("/dashboard/user-flow");
    // TODO: eventManager.register() was called with wrong args and its body was empty - needs reimplementation
    // eventManager.register(uid, flowId, newFlow.id);

    return {
      success: true
    }
  });
};
