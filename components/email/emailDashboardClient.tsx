"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Activity,
  ClipboardList,
  Library,
  ListChecks,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { EmailRecordsSection } from "./EmailRecordsSection";
import { EmailSendingTasksSection } from "./EmailSendingTasksSection";
import {
  EmailConfigSection,
  EmailOverviewSection,
} from "./EmailOverviewSection";
import { EmailTemplateManagementSection } from "./EmailTemplateManagementSection";
import {
  EMAIL_REFRESH_INTERVAL_MS,
  EMAIL_REFRESH_MAX_ATTEMPTS,
  emailCenterTabs,
  hiddenScrollbar,
  normalizeEmailCenterTab,
  type EmailCenterTab,
} from "./emailDashboardConstants";
import type {
  EmailBatch,
  EmailCenterConfig,
  EmailDeliveryPage,
  EmailTemplateDefinition,
  FlowTarget,
  InterviewSchedulePreviews,
  InterviewScheduleTemplates,
  TemplateSetting,
} from "./emailDashboardTypes";

const tabMeta: Record<
  EmailCenterTab,
  {
    icon: LucideIcon;
    description: string;
  }
> = {
  overview: {
    icon: Activity,
    description: "健康度与失败概览",
  },
  tasks: {
    icon: ListChecks,
    description: "结果通知批量处理",
  },
  records: {
    icon: ClipboardList,
    description: "投递、快照和重试",
  },
  templates: {
    icon: Library,
    description: "文案、预览和测试",
  },
  config: {
    icon: Settings2,
    description: "运行配置只读状态",
  },
};

function EmailCenterTabNav({ activeTab }: { activeTab: EmailCenterTab }) {
  return (
    <nav
      aria-label="邮件中心导航"
      className={cn("overflow-x-auto", hiddenScrollbar)}
    >
      <div className="flex min-w-max gap-2 rounded-xl border bg-card/80 p-1.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70">
        {emailCenterTabs.map((tab) => {
          const meta = tabMeta[tab.value];
          const Icon = meta.icon;
          const active = activeTab === tab.value;

          return (
            <Button
              key={tab.value}
              asChild
              variant={active ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-auto min-w-[128px] justify-start px-3 py-2 transition-all duration-200 active:scale-[0.99]",
                active
                  ? "bg-primary/10 text-foreground shadow-none ring-1 ring-primary/25 hover:bg-primary/15"
                  : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
              )}
            >
              <Link href={`/dashboard/emails?tab=${tab.value}`}>
                <Icon data-icon="inline-start" />
                <span className="flex min-w-0 flex-col items-start gap-0.5">
                  <span className="text-sm font-semibold leading-none">
                    {tab.label}
                  </span>
                  <span className="hidden max-w-28 truncate text-xs font-normal text-muted-foreground lg:block">
                    {meta.description}
                  </span>
                </span>
              </Link>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}

export function EmailDashboardClient({
  batches,
  recordDeliveryPage,
  flowTargets,
  templateSettings,
  interviewScheduleTemplates,
  interviewSchedulePreviews,
  emailCenterConfig,
  templateDefinitions,
  activeTab,
}: {
  batches: EmailBatch[];
  recordDeliveryPage: EmailDeliveryPage;
  flowTargets: FlowTarget[];
  templateSettings: TemplateSetting[];
  interviewScheduleTemplates: InterviewScheduleTemplates;
  interviewSchedulePreviews: InterviewSchedulePreviews;
  emailCenterConfig: EmailCenterConfig;
  templateDefinitions: EmailTemplateDefinition[];
  activeTab?: string;
}) {
  const router = useRouter();
  const safeBatches = useMemo(() => (Array.isArray(batches) ? batches : []), [batches]);
  const safeDeliveries = useMemo(
    () =>
      Array.isArray(recordDeliveryPage.deliveries)
        ? recordDeliveryPage.deliveries
        : [],
    [recordDeliveryPage.deliveries],
  );
  const safeFlowTargets = useMemo(
    () => (Array.isArray(flowTargets) ? flowTargets : []),
    [flowTargets],
  );
  const safeTemplateSettings = useMemo(
    () => (Array.isArray(templateSettings) ? templateSettings : []),
    [templateSettings],
  );
  const [selectedFlowId, setSelectedFlowId] = useState(safeFlowTargets[0]?.id);
  const [flowQuery, setFlowQuery] = useState("");
  const refreshAttemptsRef = useRef(0);
  const resolvedActiveTab = normalizeEmailCenterTab(activeTab);
  const hasActiveEmailWork = useMemo(
    () =>
      safeBatches.some(
        (batch) =>
          batch.status === "draft" ||
          batch.status === "queued" ||
          (Array.isArray(batch.deliveries) ? batch.deliveries : []).some(
            (delivery) =>
              delivery.status === "pending" || delivery.status === "sending",
          ),
      ) ||
      safeDeliveries.some(
        (delivery) => delivery.status === "pending" || delivery.status === "sending",
      ),
    [safeBatches, safeDeliveries],
  );
  const activeEmailWorkKey = useMemo(() => {
    const batchKey = safeBatches
      .map((batch) => {
        const deliveryKey = Array.isArray(batch.deliveries)
          ? batch.deliveries
              .map((delivery) => `${delivery.id}:${delivery.status}:${delivery.attemptCount}`)
              .join("|")
          : "";
        return `${batch.id}:${batch.status}:${batch.counts.pending}:${batch.counts.sending}:${deliveryKey}`;
      })
      .join(";");
    const deliveryKey = safeDeliveries
      .map((delivery) => `${delivery.id}:${delivery.status}:${delivery.attemptCount}`)
      .join(";");
    return `${batchKey}::${deliveryKey}`;
  }, [safeBatches, safeDeliveries]);
  const filteredFlows = useMemo(() => {
    const query = flowQuery.trim().toLowerCase();
    if (!query) return safeFlowTargets;
    return safeFlowTargets.filter((flow) =>
      flow.title.toLowerCase().includes(query),
    );
  }, [flowQuery, safeFlowTargets]);
  const selectedFlow = useMemo(() => {
    const selected = safeFlowTargets.find((flow) => flow.id === selectedFlowId);
    if (!flowQuery.trim()) return selected ?? safeFlowTargets[0];
    if (selected && filteredFlows.some((flow) => flow.id === selected.id)) {
      return selected;
    }
    return filteredFlows[0] ?? selected ?? safeFlowTargets[0];
  }, [filteredFlows, flowQuery, safeFlowTargets, selectedFlowId]);

  useEffect(() => {
    refreshAttemptsRef.current = 0;
  }, [activeEmailWorkKey]);

  useEffect(() => {
    if (!hasActiveEmailWork) {
      refreshAttemptsRef.current = 0;
      return;
    }

    const timer = window.setInterval(() => {
      if (document.hidden) return;
      if (refreshAttemptsRef.current >= EMAIL_REFRESH_MAX_ATTEMPTS) {
        window.clearInterval(timer);
        return;
      }
      refreshAttemptsRef.current += 1;
      router.refresh();
    }, EMAIL_REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [hasActiveEmailWork, router]);

  useEffect(() => {
    if (!hasActiveEmailWork) return;

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        refreshAttemptsRef.current = 0;
        router.refresh();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [hasActiveEmailWork, router]);

  let content;

  if (resolvedActiveTab === "tasks") {
    content = (
      <EmailSendingTasksSection
        batches={safeBatches}
        filteredFlows={filteredFlows}
        selectedFlow={selectedFlow}
        selectedFlowId={selectedFlow?.id}
        flowQuery={flowQuery}
        setFlowQuery={setFlowQuery}
        setSelectedFlowId={setSelectedFlowId}
        templateDefinitions={templateDefinitions}
      />
    );
  } else if (resolvedActiveTab === "records") {
    content = (
      <EmailRecordsSection
        deliveryPage={recordDeliveryPage}
        flowTargets={safeFlowTargets}
        templateDefinitions={templateDefinitions}
      />
    );
  } else if (resolvedActiveTab === "templates") {
    content = (
      <EmailTemplateManagementSection
        templateSettings={safeTemplateSettings}
        interviewScheduleTemplates={interviewScheduleTemplates}
        interviewSchedulePreviews={interviewSchedulePreviews}
        selectedFlowTitle={selectedFlow?.title}
        templateDefinitions={templateDefinitions}
      />
    );
  } else if (resolvedActiveTab === "config") {
    content = <EmailConfigSection emailCenterConfig={emailCenterConfig} />;
  } else {
    content = (
      <EmailOverviewSection
        batches={safeBatches}
        deliveries={safeDeliveries}
        emailCenterConfig={emailCenterConfig}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-20 md:pb-0">
      <EmailCenterTabNav activeTab={resolvedActiveTab} />
      {content}
    </div>
  );
}
