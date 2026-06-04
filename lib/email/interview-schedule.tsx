import "server-only";

import { render } from "@react-email/render";
import InterviewScheduleEmail from "@/emails/interview-schedule";

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

export function renderInterviewScheduleEmailSubject(flowName: string) {
  return `${flowName} 面试预约通知`;
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
  return render(
    <InterviewScheduleEmail
      candidateName={candidateName}
      flowName={flowName}
      organizerName={organizerName}
      startsAtText={formatDateTime(startsAt)}
      endsAtText={formatDateTime(endsAt)}
      meetingLink={meetingLink}
      note={note}
    />,
  );
}
