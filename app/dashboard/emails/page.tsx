import { listEmailBatches } from "@/action/email/list";
import {
  getInterviewScheduleEmailPreview,
  getInterviewScheduleEmailTemplate,
} from "@/action/email/interview-template";
import { listEmailTemplateSettings } from "@/action/email/template";
import { listEmailFlowTargets } from "@/action/email/workspace";
import { EmailDashboardClient } from "@/components/email/emailDashboardClient";
import { PageTitle } from "@/components/route";
import { logServerError } from "@/lib/server-error-log";

export default async function EmailDashboardPage() {
  let data: Awaited<ReturnType<typeof loadEmailDashboardData>>;

  try {
    data = await loadEmailDashboardData();
  } catch (error) {
    logServerError("dashboard:emails", error, {
      path: "/dashboard/emails",
      action: "load-email-dashboard",
    });
    throw error;
  }

  const [
    batches,
    flowTargets,
    templateSettings,
    interviewScheduleTemplate,
    interviewSchedulePreviewHtml,
  ] = data;

  return (
    <>
      <div className="flex flex-col gap-1 border-b pb-4">
        <PageTitle />
        <p className="text-sm text-muted-foreground">
          管理结果邮件草稿、确认发送、查看教育邮箱收件人和发送状态。
        </p>
      </div>

      <div className="mt-5">
        <EmailDashboardClient
          batches={batches}
          flowTargets={flowTargets}
          templateSettings={templateSettings}
          interviewScheduleTemplate={interviewScheduleTemplate}
          interviewSchedulePreviewHtml={interviewSchedulePreviewHtml}
        />
      </div>
    </>
  );
}

async function loadEmailDashboardData() {
  return Promise.all([
    listEmailBatches(),
    listEmailFlowTargets(),
    listEmailTemplateSettings(),
    getInterviewScheduleEmailTemplate(),
    getInterviewScheduleEmailPreview(),
  ]);
}
