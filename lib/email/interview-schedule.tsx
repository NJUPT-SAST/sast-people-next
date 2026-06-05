import "server-only";

import { render } from "@react-email/render";
import InterviewScheduleEmail from "@/emails/interview-schedule";
import {
  getInterviewScheduleTemplateSetting,
  renderInterviewScheduleTemplateText,
} from "@/lib/email/interview-template-settings";

export type InterviewScheduleEmailVariables = {
  kind?: "created" | "rescheduled" | "cancelled";
  candidateName: string;
  flowName: string;
  organizerName: string;
  startsAt: Date;
  endsAt: Date;
  meetingLink: string;
  scheduleLink?: string | null;
  note?: string;
};

const formatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
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

const subjectByKind = {
  created: "{flowName} 面试预约通知",
  rescheduled: "{flowName} 面试改约通知",
  cancelled: "{flowName} 面试取消通知",
} as const;

const titleByKind = {
  created: "面试预约已确认",
  rescheduled: "面试时间已调整",
  cancelled: "面试预约已取消",
} as const;

const bodyByKind = {
  created: "{candidateName} 同学，你已预约 {flowName} 的面试，请按时通过下方会议链接参加。",
  rescheduled: "{candidateName} 同学，你的 {flowName} 面试时间已调整，请以本邮件中的新时间为准。",
  cancelled: "{candidateName} 同学，你的 {flowName} 面试预约已取消，后续安排请关注新的通知。",
} as const;

export async function renderInterviewScheduleEmailSubject(
  flowName: string,
  kind: InterviewScheduleEmailVariables["kind"] = "created",
) {
  const setting = await getInterviewScheduleTemplateSetting();
  const subjectTemplate = kind === "created"
    ? setting.subjectTemplate
    : subjectByKind[kind];
  return renderInterviewScheduleTemplateText(subjectTemplate, {
    candidateName: "同学",
    flowName,
    organizerName: "讲师",
    startsAt: "",
    endsAt: "",
    meetingLink: "",
    scheduleLink: "",
  });
}

function getTemplateVariables({
  candidateName,
  flowName,
  organizerName,
  startsAt,
  endsAt,
  meetingLink,
  scheduleLink,
}: InterviewScheduleEmailVariables) {
  return {
    candidateName,
    flowName,
    organizerName,
    startsAt: formatDateTime(startsAt),
    endsAt: formatDateTime(endsAt),
    meetingLink,
    scheduleLink: scheduleLink ?? "",
  };
}

export async function renderInterviewScheduleEmail({
  kind = "created",
  candidateName,
  flowName,
  organizerName,
  startsAt,
  endsAt,
  meetingLink,
  scheduleLink,
  note,
}: InterviewScheduleEmailVariables) {
  const setting = await getInterviewScheduleTemplateSetting();
  const variables = getTemplateVariables({
    candidateName,
    flowName,
    organizerName,
    startsAt,
    endsAt,
    meetingLink,
    scheduleLink,
    note,
  });
  const titleTemplate = kind === "created"
    ? setting.titleTemplate
    : titleByKind[kind];
  const bodyTemplate = kind === "created"
    ? setting.bodyTemplate
    : bodyByKind[kind];

  return render(
    <InterviewScheduleEmail
      kind={kind}
      candidateName={candidateName}
      flowName={flowName}
      titleText={renderInterviewScheduleTemplateText(titleTemplate, variables)}
      bodyText={renderInterviewScheduleTemplateText(bodyTemplate, variables)}
      organizerName={organizerName}
      startsAtText={formatDateTime(startsAt)}
      endsAtText={formatDateTime(endsAt)}
      meetingLink={meetingLink}
      scheduleLink={scheduleLink ?? undefined}
      note={note}
      footerText={setting.footerText}
    />,
  );
}

export async function renderInterviewScheduleEmailPreview() {
  return renderInterviewScheduleEmail({
    kind: "created",
    candidateName: "张三",
    flowName: "2026 免试招新 Demo",
    organizerName: "Demo Lecturer",
    startsAt: new Date("2026-06-05T11:00:00+08:00"),
    endsAt: new Date("2026-06-05T11:30:00+08:00"),
    meetingLink: "https://vc.feishu.cn/j/123456789",
    scheduleLink: "https://applink.feishu.cn/client/calendar/event/detail?calendarId=primary&eventId=demo",
    note: "请提前准备作品介绍。",
  });
}
