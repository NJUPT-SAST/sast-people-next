import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/drizzle";
import { feedbackReport } from "@/db/schema";
import { verifySession } from "@/lib/dal";
import { getPeopleUrl } from "@/lib/app-url";
import { sendFeishuCardMessage } from "@/lib/feishu/message";
import { logServerError } from "@/lib/server-error-log";

const feedbackSchema = z.object({
  category: z.enum(["bug", "suggestion", "content", "other"]),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().min(10).max(10000),
  studentId: z.string().trim().max(64).optional().default(""),
  contact: z.string().trim().email("请输入有效的邮箱地址").max(160),
  pageUrl: z.string().trim().max(2000).optional().default(""),
  environment: z.string().trim().max(64).optional().default(""),
  deviceName: z.string().trim().max(160).optional().default(""),
  browserInfo: z.string().trim().max(500).optional().default(""),
  viewport: z.string().trim().max(64).optional().default(""),
});

const categoryLabel = { bug: "问题反馈", suggestion: "功能建议", content: "内容纠错", other: "其他" };
const categoryTemplate = { bug: "red", suggestion: "blue", content: "orange", other: "wathet" } as const;

function cardText(value: string | null | undefined, fallback = "未提供") {
  return String(value || fallback).replace(/[\\*_`~]/g, "\\$&");
}

function browserSummary(value: string | null | undefined, fallback: string) {
  try {
    const info = JSON.parse(value || "") as Record<string, unknown>;
    return [
      `平台：${String(info.platform || "未提供")}`,
      `语言：${String(info.language || "未提供")}`,
      `时区：${String(info.timezone || "未提供")}`,
      `屏幕：${String(info.screen || "未提供")}`,
      `主题：${String(info.colorScheme || "未提供")}`,
    ].map((line) => cardText(line)).join("\n");
  } catch {
    return cardText(value || fallback);
  }
}

function buildFeedbackCard({
  id,
  data,
  session,
  userAgent,
}: {
  id: number;
  data: z.infer<typeof feedbackSchema>;
  session: { uid: number; name: string };
  userAgent: string;
}) {
  const pageAction = [{
    tag: "button",
    text: { tag: "plain_text", content: "查看反馈记录" },
    type: "primary_filled",
    size: "large",
    width: "fill",
    behaviors: [{ type: "open_url", default_url: getPeopleUrl("/dashboard/feedback") }],
  }];
  return {
    schema: "2.0",
    config: { update_multi: true, width_mode: "default", summary: { content: `SAST People ${categoryLabel[data.category]} #${id}` } },
    header: {
      title: { tag: "plain_text", content: `${categoryLabel[data.category]} #${id}` },
      subtitle: { tag: "plain_text", content: "SAST People 开发通知" },
      template: categoryTemplate[data.category],
    },
    body: {
      direction: "vertical",
      padding: "12px 12px 16px 12px",
      vertical_spacing: "12px",
      elements: [
        {
          tag: "div",
          fields: [
            { is_short: true, text: { tag: "lark_md", content: `**提交人**\n${cardText(session.name)}（UID ${session.uid}）` } },
            { is_short: true, text: { tag: "lark_md", content: `**学号**\n${cardText(data.studentId)}` } },
            { is_short: true, text: { tag: "lark_md", content: `**联系邮箱**\n${cardText(data.contact)}` } },
            { is_short: true, text: { tag: "lark_md", content: `**环境**\n${cardText(data.environment)}` } },
          ],
        },
        { tag: "hr" },
        { tag: "markdown", content: `**${cardText(data.title)}**\n\n${cardText(data.description)}` },
        { tag: "markdown", content: `**页面**\n${cardText(data.pageUrl)}\n\n**设备**\n${cardText(data.deviceName)}\n\n**视口**\n${cardText(data.viewport)}\n\n**浏览器环境**\n${browserSummary(data.browserInfo, userAgent)}` },
        ...pageAction,
      ],
    },
  };
}

export async function POST(request: NextRequest) {
  let session: Awaited<ReturnType<typeof verifySession>> | null = null;
  try {
    session = await verifySession();
    const parsed = feedbackSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ message: parsed.error.issues[0]?.message ?? "反馈内容无效" }, { status: 400 });
    }

    const data = parsed.data;
    const userAgent = request.headers.get("user-agent") ?? "";
    const referer = request.headers.get("referer") ?? "";
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? request.headers.get("x-real-ip") ?? "";
    const [record] = await db.insert(feedbackReport).values({
      fkUserId: session.uid,
      userName: session.name,
      studentId: data.studentId || null,
      category: data.category,
      title: data.title,
      description: data.description,
      contact: data.contact || null,
      pageUrl: data.pageUrl || null,
      environment: data.environment || null,
      deviceName: data.deviceName || null,
      browserInfo: data.browserInfo || null,
      viewport: data.viewport || null,
      userAgent: userAgent || null,
      referer: referer || null,
      ipAddress: ipAddress || null,
    }).returning({ id: feedbackReport.id, createdAt: feedbackReport.createdAt });

    const chatId = process.env.FEISHU_FEEDBACK_CHAT_ID?.trim();
    let notificationSent = false;
    if (chatId) {
      try {
        await sendFeishuCardMessage({
          receiveId: chatId,
          receiveIdType: "chat_id",
          card: buildFeedbackCard({ id: record.id, data, session, userAgent }),
          uuid: `people-feedback-${record.id}`,
        });
        notificationSent = true;
      } catch (error) {
        logServerError("feedback:notify", error, { path: "/api/feedback", userId: session.uid, action: "notify-feedback", metadata: { feedbackId: record.id } });
      }
    }

    return NextResponse.json({
      success: true,
      id: record.id,
      notificationSent,
    });
  } catch (error) {
    logServerError("feedback:create", error, { path: "/api/feedback", userId: session?.uid ?? null, action: "create-feedback" });
    return NextResponse.json({ message: "反馈提交失败，请稍后重试" }, { status: 500 });
  }
}
