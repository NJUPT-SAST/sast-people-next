import { listEmailBatches } from "@/action/email/list";
import { listEmailTemplateSettings } from "@/action/email/template";
import { listEmailFlowTargets } from "@/action/email/workspace";
import { EmailDashboardClient } from "@/components/email/emailDashboardClient";
import { PageTitle } from "@/components/route";

export default async function EmailDashboardPage() {
  const [batches, flowTargets, templateSettings] = await Promise.all([
    listEmailBatches(),
    listEmailFlowTargets(),
    listEmailTemplateSettings(),
  ]);

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
        />
      </div>
    </>
  );
}
