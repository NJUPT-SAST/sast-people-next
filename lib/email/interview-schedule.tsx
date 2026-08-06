import "server-only";

import { render } from "@react-email/render";
import InterviewScheduleEmail from "@/emails/interview-schedule";
import {
  type InterviewScheduleEmailKind,
  getInterviewScheduleTemplateSetting,
  renderInterviewScheduleTemplateText,
} from "@/lib/email/interview-template-settings";

export type InterviewScheduleEmailVariables = {
  kind?: InterviewScheduleEmailKind;
  candidateName: string;
  flowName: string;
  organizerName: string;
  startsAt: Date;
  endsAt: Date;
  location?: string | null;
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

export async function renderInterviewScheduleEmailSubject(
  flowName: string,
  kind: InterviewScheduleEmailVariables["kind"] = "created",
) {
  const setting = await getInterviewScheduleTemplateSetting(kind);
  return renderInterviewScheduleTemplateText(setting.subjectTemplate, {
    candidateName: "同学",
    flowName,
    organizerName: "讲师",
    startsAt: "",
    endsAt: "",
    location: "",
  });
}

function getTemplateVariables({
  candidateName,
  flowName,
  organizerName,
  startsAt,
  endsAt,
  location,
}: InterviewScheduleEmailVariables) {
  return {
    candidateName,
    flowName,
    organizerName,
    startsAt: formatDateTime(startsAt),
    endsAt: formatDateTime(endsAt),
    location: location ?? "",
  };
}

export async function renderInterviewScheduleEmail({
  kind = "created",
  candidateName,
  flowName,
  organizerName,
  startsAt,
  endsAt,
  location,
  note,
}: InterviewScheduleEmailVariables) {
  const setting = await getInterviewScheduleTemplateSetting(kind);
  const variables = getTemplateVariables({
    candidateName,
    flowName,
    organizerName,
    startsAt,
    endsAt,
    location,
  });

  return render(
    <InterviewScheduleEmail
      kind={kind}
      candidateName={candidateName}
      flowName={flowName}
      titleText={renderInterviewScheduleTemplateText(setting.titleTemplate, variables)}
      bodyText={renderInterviewScheduleTemplateText(setting.bodyTemplate, variables)}
      organizerName={organizerName}
      startsAtText={formatDateTime(startsAt)}
      endsAtText={formatDateTime(endsAt)}
      location={location ?? undefined}
      note={note}
      footerText={setting.footerText}
    />,
  );
}

export async function renderInterviewScheduleEmailPreview(
  kind: InterviewScheduleEmailKind = "created",
) {
  return renderInterviewScheduleEmail({
    kind,
    candidateName: "张三",
    flowName: "2026 免试招新 Demo",
    organizerName: "Demo Lecturer",
    startsAt: new Date("2026-06-05T11:00:00+08:00"),
    endsAt: new Date("2026-06-05T11:30:00+08:00"),
    location: "仙林校区大学生活动中心 101",
    note: "请提前准备作品介绍。",
  });
}
