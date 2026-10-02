import {
  listEmailBatches,
  listEmailDeliveryPage,
  getEmailStatusOverview,
  listResultEmailDeliveryStates,
} from "@/action/email/list";
import {
  getInterviewScheduleEmailPreviews,
  listInterviewScheduleEmailTemplates,
} from "@/action/email/interview-template";
import {
  getResultEmailPreviews,
  listEmailTemplateSettings,
} from "@/action/email/template";
import {
  listEmailFlowOptions,
  listEmailFlowTargets,
} from "@/action/email/workspace";
import { EmailDashboardClient } from "@/components/email/emailDashboardClient";
import { PageTitle } from "@/components/route";
import { getEmailCenterConfigSummary } from "@/lib/email-center/config";
import {
  normalizeEmailCenterTab,
  type EmailCenterTab,
} from "@/components/email/emailDashboardConstants";
import { emailTemplateDefinitions } from "@/lib/email-center/registry";
import { getDepartmentScope } from "@/lib/authz";
import { normalizeDepartmentKey } from "@/db/schema";
import { verifyRole } from "@/lib/dal";
import { logServerError } from "@/lib/server-error-log";
import { MailCheck } from "lucide-react";

export default async function EmailDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await verifyRole(3);
  /* 模板管理入口 = role 3 + 部门 scope：部门账号只能管理本部门覆盖，无部门归属不展示模板页 */
  const departmentScope = await getDepartmentScope();
  const canManageTemplates = departmentScope.kind !== "none";
  let data: Awaited<ReturnType<typeof loadEmailDashboardData>>;
  const awaitedSearchParams = await searchParams;
  const requestedTab = normalizeEmailCenterTab(
    getSearchParam(awaitedSearchParams, "tab"),
  );
  const requestedDepartment = normalizeDepartmentKey(
    getSearchParam(awaitedSearchParams, "department"),
  );
  /* 模板归属：管理员按 URL 切换（缺省全局默认）；部门账号缺省本部门覆盖，
     也可以通过 URL 只读浏览其他部门（写权限仍只限本部门） */
  const selectedDepartment =
    departmentScope.kind === "all"
      ? requestedDepartment
      : departmentScope.kind === "department"
        ? (requestedDepartment ?? departmentScope.department)
        : null;
  const activeTab: EmailCenterTab =
    requestedTab === "templates" && !canManageTemplates
      ? "status"
      : requestedTab;

  try {
    data = await loadEmailDashboardData(
      activeTab,
      awaitedSearchParams,
      selectedDepartment,
    );
  } catch (error) {
    logServerError("dashboard:emails", error, {
      path: "/dashboard/emails",
      action: "load-email-dashboard",
    });
    throw error;
  }

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
          {...data}
          emailCenterConfig={emailCenterConfig}
          templateDefinitions={emailTemplateDefinitions}
          activeTab={activeTab}
          canManageTemplates={canManageTemplates}
          department={selectedDepartment}
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
  activeTab: EmailCenterTab,
  searchParams: Record<string, string | string[] | undefined>,
  department: string | null,
) {
  if (activeTab === "tasks") {
    const [batches, flowTargets, resultDeliveryStates] = await Promise.all([
      listEmailBatches(),
      listEmailFlowTargets(),
      listResultEmailDeliveryStates(),
    ]);
    return { batches, flowTargets, resultDeliveryStates };
  }

  if (activeTab === "records") {
    const [recordDeliveryPage, flowOptions] = await Promise.all([
      listEmailDeliveryPage(getDeliveryListParams(searchParams)),
      listEmailFlowOptions(),
    ]);
    return { recordDeliveryPage, flowOptions };
  }

  if (activeTab === "templates") {
    const [
      flowOptions,
      templateSettings,
      resultEmailPreviews,
      interviewScheduleTemplates,
      interviewSchedulePreviews,
    ] = await Promise.all([
      listEmailFlowOptions(),
      listEmailTemplateSettings(department),
      getResultEmailPreviews(department),
      listInterviewScheduleEmailTemplates(department),
      getInterviewScheduleEmailPreviews(department),
    ]);
    return {
      flowOptions,
      templateSettings,
      resultEmailPreviews,
      interviewScheduleTemplates,
      interviewSchedulePreviews,
    };
  }

  return {
    statusOverview: await getEmailStatusOverview(),
  };
}

function getDeliveryListParams(
  searchParams: Record<string, string | string[] | undefined>,
) {
  return {
    page: getSearchParam(searchParams, "page"),
    pageSize: getSearchParam(searchParams, "pageSize"),
    category: getSearchParam(searchParams, "category"),
    status: getSearchParam(searchParams, "status"),
    templateKey: getSearchParam(searchParams, "templateKey"),
    flowId: getSearchParam(searchParams, "flowId"),
    creatorId: getSearchParam(searchParams, "creatorId"),
    from: getSearchParam(searchParams, "from"),
    to: getSearchParam(searchParams, "to"),
    query: getSearchParam(searchParams, "query"),
  };
}
