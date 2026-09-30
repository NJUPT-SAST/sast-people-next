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
  /** 面试时间：技术部门为 Date（按北京时间格式化），办公类时段可直接传文本 */
  startsAt?: Date | string | null;
  endsAt?: Date | string | null;
  /** 时间标签：默认「面试时间」，办公类用「面试时段」 */
  timeLabel?: string | null;
  /** 改期申请里候选人希望改到的时间/时段 */
  requestedTimeText?: string | null;
  /** 驳回理由（改期未通过通知） */
  reason?: string | null;
  /** 日历组织者称谓：技术部门「讲师」，办公类「部长」 */
  organizerLabel?: string | null;
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

function formatDateTime(value: Date | string) {
  if (typeof value === "string") return value;
  return formatter.format(value).replace(/\//g, "-");
}

export async function renderInterviewScheduleEmailSubject(
  flowName: string,
  kind: InterviewScheduleEmailVariables["kind"] = "created",
  department?: string | null,
) {
  const setting = await getInterviewScheduleTemplateSetting(kind, department);
  return renderInterviewScheduleTemplateText(setting.subjectTemplate, {
    candidateName: "同学",
    flowName,
    organizerName: "李四",
    startsAt: "",
    endsAt: "",
    location: "",
    requestedTimeText: "",
    reason: "",
  });
}

function getTemplateVariables({
  candidateName,
  flowName,
  organizerName,
  startsAt,
  endsAt,
  requestedTimeText,
  reason,
  location,
}: InterviewScheduleEmailVariables) {
  return {
    candidateName,
    flowName,
    organizerName,
    startsAt: startsAt ? formatDateTime(startsAt) : "",
    endsAt: endsAt ? formatDateTime(endsAt) : "",
    location: location ?? "",
    requestedTimeText: requestedTimeText ?? "",
    reason: reason ?? "",
  };
}

export async function renderInterviewScheduleEmail({
  kind = "created",
  candidateName,
  flowName,
  organizerName,
  startsAt,
  endsAt,
  timeLabel,
  requestedTimeText,
  reason,
  organizerLabel,
  location,
  note,
  department,
}: InterviewScheduleEmailVariables & { department?: string | null }) {
  const setting = await getInterviewScheduleTemplateSetting(kind, department);
  const variables = getTemplateVariables({
    candidateName,
    flowName,
    organizerName,
    startsAt,
    endsAt,
    requestedTimeText,
    reason,
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
      organizerLabel={organizerLabel ?? undefined}
      startsAtText={variables.startsAt || undefined}
      endsAtText={variables.endsAt || undefined}
      timeLabel={timeLabel ?? undefined}
      requestedTimeText={requestedTimeText ?? undefined}
      location={location ?? undefined}
      note={note}
      reason={reason ?? undefined}
      footerText={setting.footerText}
    />,
  );
}

export async function renderInterviewScheduleEmailPreview(
  kind: InterviewScheduleEmailKind = "created",
  department?: string | null,
) {
  return renderInterviewScheduleEmail({
    kind,
    candidateName: "张三",
    flowName: "2026 校科协软件研发部 免试招新",
    organizerName: "李四",
    startsAt: new Date("2026-06-05T11:00:00+08:00"),
    endsAt: new Date("2026-06-05T11:30:00+08:00"),
    location: "仙林校区大学生活动中心 101",
    note: "请提前准备作品介绍。",
    department,
  });
}
