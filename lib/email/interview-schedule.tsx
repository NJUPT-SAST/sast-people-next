import "server-only";

import { render } from "@react-email/render";
import InterviewScheduleEmail from "@/emails/interview-schedule";
import {
  getInterviewScheduleTemplateSetting,
  renderInterviewScheduleTemplateText,
} from "@/lib/email/interview-template-settings";

export type InterviewScheduleEmailVariables = {
  candidateName: string;
  flowName: string;
  organizerName: string;
  startsAt: Date;
  endsAt: Date;
  meetingLink: string;
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

export async function renderInterviewScheduleEmailSubject(flowName: string) {
  const setting = await getInterviewScheduleTemplateSetting();
  return renderInterviewScheduleTemplateText(setting.subjectTemplate, {
    candidateName: "同学",
    flowName,
    organizerName: "讲师",
    startsAt: "",
    endsAt: "",
    meetingLink: "",
  });
}

function getTemplateVariables({
  candidateName,
  flowName,
  organizerName,
  startsAt,
  endsAt,
  meetingLink,
}: InterviewScheduleEmailVariables) {
  return {
    candidateName,
    flowName,
    organizerName,
    startsAt: formatDateTime(startsAt),
    endsAt: formatDateTime(endsAt),
    meetingLink,
  };
}

export async function renderInterviewScheduleEmail({
  candidateName,
  flowName,
  organizerName,
  startsAt,
  endsAt,
  meetingLink,
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
    note,
  });

  return render(
    <InterviewScheduleEmail
      candidateName={candidateName}
      flowName={flowName}
      titleText={renderInterviewScheduleTemplateText(setting.titleTemplate, variables)}
      bodyText={renderInterviewScheduleTemplateText(setting.bodyTemplate, variables)}
      organizerName={organizerName}
      startsAtText={formatDateTime(startsAt)}
      endsAtText={formatDateTime(endsAt)}
      meetingLink={meetingLink}
      note={note}
      footerText={setting.footerText}
    />,
  );
}

export async function renderInterviewScheduleEmailPreview() {
  return renderInterviewScheduleEmail({
    candidateName: "张三",
    flowName: "2026 免试招新 Demo",
    organizerName: "Demo Lecturer",
    startsAt: new Date("2026-06-05T11:00:00+08:00"),
    endsAt: new Date("2026-06-05T11:30:00+08:00"),
    meetingLink: "https://vc.feishu.cn/j/123456789",
    note: "请提前准备作品介绍。",
  });
}
