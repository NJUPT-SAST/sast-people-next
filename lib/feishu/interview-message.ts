import "server-only";

import { getPeopleUrl } from "@/lib/app-url";
import { sendFeishuCardMessage } from "@/lib/feishu/message";

const DEFAULT_TIMEZONE = "Asia/Shanghai";

const formatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: DEFAULT_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function formatDateTime(date: Date) {
  return formatter.format(date).replace(/\//g, "-");
}

function line(label: string, value?: string | null) {
  if (!value) return null;
  return `**${label}**：${value}`;
}

function compactLines(values: Array<string | null>) {
  return values.filter(Boolean).join("\n");
}

function button(
  label: string,
  url: string,
  type: "default" | "primary" = "default",
): Record<string, unknown> {
  return {
    tag: "button",
    text: {
      tag: "plain_text",
      content: label,
    },
    url,
    type,
  };
}

function createCard({
  title,
  subtitle,
  template = "green",
  lines,
  actions,
}: {
  title: string;
  subtitle?: string;
  template?: "green" | "blue" | "orange" | "red" | "grey";
  lines: Array<string | null>;
  actions?: Array<Record<string, unknown>>;
}) {
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "div",
      text: {
        tag: "lark_md",
        content: compactLines([
          subtitle ? `**${subtitle}**` : null,
          ...lines,
        ]),
      },
    },
  ];

  if (actions?.length) {
    elements.push({ tag: "hr" });
    elements.push({
      tag: "action",
      actions,
    });
  }

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      template,
      title: {
        tag: "plain_text",
        content: title,
      },
    },
    elements,
  };
}

export type InterviewScheduleCardInput = {
  openId: string;
  receiveIdType?: "open_id" | "chat_id";
  title: string;
  flowName: string;
  candidateName: string;
  candidateStudentId?: string | null;
  candidateQq?: string | null;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
  meetingLink?: string | null;
  scheduleLink?: string | null;
  userFlowId: number;
  scheduleId: number;
  uuidSuffix?: string | number;
};

export async function sendInterviewScheduleCard({
  openId,
  receiveIdType = "open_id",
  title,
  flowName,
  candidateName,
  candidateStudentId,
  candidateQq,
  startsAt,
  endsAt,
  location,
  meetingLink,
  scheduleLink,
  scheduleId,
  userFlowId,
  uuidSuffix = Date.now(),
}: InterviewScheduleCardInput) {
  const peopleUrl = getPeopleUrl("/dashboard/recruitment");
  const actions = [
    meetingLink ? button("打开留档会议", meetingLink, "primary") : null,
    scheduleLink ? button("查看日程", scheduleLink) : null,
    button("打开 People 面评", peopleUrl),
  ].filter((item): item is Record<string, unknown> => Boolean(item));

  await sendFeishuCardMessage({
    receiveId: openId,
    receiveIdType,
    uuid: `people-interview-schedule-${scheduleId}-${uuidSuffix}`,
    card: createCard({
      title,
      subtitle: "People 线下面试留档",
      lines: [
        line("流程", flowName),
        line("面试同学", candidateName),
        line("学号", candidateStudentId),
        line("QQ", candidateQq),
        line("开始", formatDateTime(startsAt)),
        line("结束", formatDateTime(endsAt)),
        line("地点", location),
        "飞书会议仅用于录制与妙记留档，候选人不通过此链接参会。",
        "面试结束后请回到 People 提交面评；飞书妙记生成后会自动同步到归档。",
      ],
      actions,
    }),
  });

  return { peopleUrl, userFlowId };
}

export async function sendInterviewCancelledCard({
  openId,
  receiveIdType = "open_id",
  title = "面试预约已取消",
  flowName,
  candidateName,
  startsAt,
  endsAt,
  location,
  scheduleId,
}: {
  openId: string;
  receiveIdType?: "open_id" | "chat_id";
  title?: string;
  flowName: string;
  candidateName: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
  scheduleId: number;
}) {
  await sendFeishuCardMessage({
    receiveId: openId,
    receiveIdType,
    uuid: `people-interview-schedule-cancel-${scheduleId}-${Date.now()}`,
    card: createCard({
      title,
      subtitle: "People 线下面试留档",
      template: "red",
      lines: [
        line("流程", flowName),
        line("面试同学", candidateName),
        line("原开始", formatDateTime(startsAt)),
        line("原结束", formatDateTime(endsAt)),
        line("原地点", location),
      ],
      actions: [button("打开 People", getPeopleUrl("/dashboard/recruitment"))],
    }),
  });
}

export async function sendInterviewMinuteCard({
  openId,
  scheduleId,
  minuteUrl,
  minuteTitle,
}: {
  openId: string;
  scheduleId: number;
  minuteUrl: string;
  minuteTitle?: string | null;
}) {
  await sendFeishuCardMessage({
    receiveId: openId,
    uuid: `people-interview-minute-${scheduleId}-${Date.now()}`,
    card: createCard({
      title: "飞书妙记已同步",
      subtitle: "People 面评提醒",
      template: "blue",
      lines: [
        line("妙记标题", minuteTitle),
        "请回到 People 补充面评内容并提交审核。",
      ],
      actions: [
        button("查看妙记", minuteUrl, "primary"),
        button("打开 People 面评", getPeopleUrl("/dashboard/recruitment")),
      ],
    }),
  });
}

export async function sendFeishuOAuthBoundCard(openId: string) {
  await sendFeishuCardMessage({
    receiveId: openId,
    uuid: `people-feishu-oauth-bound-${Date.now()}`,
    card: createCard({
      title: "People 飞书授权已完成",
      subtitle: "授权状态",
      template: "green",
      lines: [
        "现在可以由 People 发起面试会议和日程。",
        "创建、改约、取消、面试提醒和妙记同步都会通过机器人提醒你。",
      ],
      actions: [button("打开 People", getPeopleUrl("/dashboard"))],
    }),
  });
}
