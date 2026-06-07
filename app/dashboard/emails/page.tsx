import {
  listEmailBatches,
  listEmailDeliveries,
  listEmailDeliveryPage,
} from "@/action/email/list";
import {
  getInterviewScheduleEmailPreviews,
  listInterviewScheduleEmailTemplates,
} from "@/action/email/interview-template";
import { listEmailTemplateSettings } from "@/action/email/template";
import { listEmailFlowTargets } from "@/action/email/workspace";
import { EmailDashboardClient } from "@/components/email/emailDashboardClient";
import { PageTitle } from "@/components/route";
import { getEmailCenterConfigSummary } from "@/lib/email-center/config";
import { emailTemplateDefinitions } from "@/lib/email-center/registry";
import { logServerError } from "@/lib/server-error-log";
import { MailCheck } from "lucide-react";

export default async function EmailDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  let data: Awaited<ReturnType<typeof loadEmailDashboardData>>;
  const awaitedSearchParams = await searchParams;

  try {
    data = await loadEmailDashboardData(awaitedSearchParams);
  } catch (error) {
    logServerError("dashboard:emails", error, {
      path: "/dashboard/emails",
      action: "load-email-dashboard",
    });
    throw error;
  }

  const [
    batches,
    deliveries,
    recordDeliveryPage,
    flowTargets,
    templateSettings,
    interviewScheduleTemplates,
    interviewSchedulePreviews,
  ] = data;
  const emailCenterConfig = getEmailCenterConfigSummary();

  return (
    <>
      <div className="border-b pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-1 rounded-lg border bg-primary/10 p-2 text-primary">
              <MailCheck className="size-5" />
            </div>
            <div className="min-w-0">
              <PageTitle />
              <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                统一管理系统邮件模板、发送任务和发送记录。招新结果通知、面试通知和测试邮件都从这里追踪。
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border bg-card px-2.5 py-1 text-muted-foreground">
              {emailCenterConfig.realRecipientMode ? "生产真实收件人" : "本地测试重定向"}
            </span>
            <span className="rounded-md border bg-card px-2.5 py-1 text-muted-foreground">
              SMTP {emailCenterConfig.smtpConfigured ? "已配置" : "未配置"}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <EmailDashboardClient
          batches={batches}
          deliveries={deliveries}
          recordDeliveryPage={recordDeliveryPage}
          flowTargets={flowTargets}
          templateSettings={templateSettings}
          interviewScheduleTemplates={interviewScheduleTemplates}
          interviewSchedulePreviews={interviewSchedulePreviews}
          emailCenterConfig={emailCenterConfig}
          templateDefinitions={emailTemplateDefinitions}
          activeTab={getSearchParam(awaitedSearchParams, "tab")}
        />
      </div>
    </>
  );
}

function getSearchParam(
  searchParams: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = searchParams[key];
  return Array.isArray(value) ? value[0] : value;
}

async function loadEmailDashboardData(
  searchParams: Record<string, string | string[] | undefined>,
) {
  return Promise.all([
    listEmailBatches(),
    listEmailDeliveries(),
    listEmailDeliveryPage({
      page: getSearchParam(searchParams, "page"),
      category: getSearchParam(searchParams, "category"),
      status: getSearchParam(searchParams, "status"),
      templateKey: getSearchParam(searchParams, "templateKey"),
      flowId: getSearchParam(searchParams, "flowId"),
      creatorId: getSearchParam(searchParams, "creatorId"),
      from: getSearchParam(searchParams, "from"),
      to: getSearchParam(searchParams, "to"),
      query: getSearchParam(searchParams, "query"),
    }),
    listEmailFlowTargets(),
    listEmailTemplateSettings(),
    listInterviewScheduleEmailTemplates(),
    getInterviewScheduleEmailPreviews(),
  ]);
}
