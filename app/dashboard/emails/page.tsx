import {
  listEmailBatches,
  listEmailDeliveryPage,
} from "@/action/email/list";
import {
  getInterviewScheduleEmailPreviews,
  listInterviewScheduleEmailTemplates,
} from "@/action/email/interview-template";
import {
  getResultEmailPreviews,
  listEmailTemplateSettings,
} from "@/action/email/template";
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
    recordDeliveryPage,
    flowTargets,
    templateSettings,
    resultEmailPreviews,
    interviewScheduleTemplates,
    interviewSchedulePreviews,
  ] = data;
  const emailCenterConfig = getEmailCenterConfigSummary();
  const initialFlowId = parseOptionalPositiveInt(
    getSearchParam(awaitedSearchParams, "flowId"),
  );

  return (
    <>
      <div className="border-b pb-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg border bg-muted p-2 text-foreground">
              <MailCheck className="size-4" />
            </div>
            <div className="min-w-0">
              <PageTitle />
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                统一管理系统邮件模板、发送任务和发送记录
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-md border bg-card px-2 py-1 text-muted-foreground">
              {emailCenterConfig.realRecipientMode ? "正式发送" : "测试模式"}
            </span>
            {!emailCenterConfig.smtpConfigured && (
              <span className="rounded-md border border-destructive/40 px-2 py-1 text-destructive">
                发信未配置
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <EmailDashboardClient
          batches={batches}
          recordDeliveryPage={recordDeliveryPage}
          flowTargets={flowTargets}
          templateSettings={templateSettings}
          resultEmailPreviews={resultEmailPreviews}
          interviewScheduleTemplates={interviewScheduleTemplates}
          interviewSchedulePreviews={interviewSchedulePreviews}
          emailCenterConfig={emailCenterConfig}
          templateDefinitions={emailTemplateDefinitions}
          activeTab={getSearchParam(awaitedSearchParams, "tab")}
          initialFlowId={initialFlowId}
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

function parseOptionalPositiveInt(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return parsed;
}

async function loadEmailDashboardData(
  searchParams: Record<string, string | string[] | undefined>,
) {
  const activeTab = getSearchParam(searchParams, "tab");
  const isRecordsTab = activeTab === "records";

  return Promise.all([
    listEmailBatches(),
    listEmailDeliveryPage({
      page: isRecordsTab ? getSearchParam(searchParams, "page") : 1,
      pageSize: isRecordsTab ? getSearchParam(searchParams, "pageSize") : 50,
      category: isRecordsTab ? getSearchParam(searchParams, "category") : "",
      status: isRecordsTab ? getSearchParam(searchParams, "status") : "",
      templateKey: isRecordsTab
        ? getSearchParam(searchParams, "templateKey")
        : "",
      flowId: isRecordsTab ? getSearchParam(searchParams, "flowId") : "",
      creatorId: isRecordsTab ? getSearchParam(searchParams, "creatorId") : "",
      from: isRecordsTab ? getSearchParam(searchParams, "from") : "",
      to: isRecordsTab ? getSearchParam(searchParams, "to") : "",
      query: isRecordsTab ? getSearchParam(searchParams, "query") : "",
    }),
    listEmailFlowTargets(),
    listEmailTemplateSettings(),
    getResultEmailPreviews(),
    listInterviewScheduleEmailTemplates(),
    getInterviewScheduleEmailPreviews(),
  ]);
}