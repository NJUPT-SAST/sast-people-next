"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Activity,
  ClipboardList,
  Library,
  ListChecks,
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
  ResultEmailPreviews,
  TemplateSetting,
} from "./emailDashboardTypes";

const tabIcons: Record<EmailCenterTab, LucideIcon> = {
  tasks: ListChecks,
  records: ClipboardList,
  templates: Library,
  status: Activity,
};

function EmailCenterTabNav({ activeTab }: { activeTab: EmailCenterTab }) {
  return (
    <nav
      aria-label="邮件中心导航"
      className={cn("overflow-x-auto", hiddenScrollbar)}
    >
      <div className="inline-flex min-w-max gap-1 rounded-lg border bg-card p-1">
        {emailCenterTabs.map((tab) => {
          const Icon = tabIcons[tab.value];
          const active = activeTab === tab.value;

          return (
            <Button
              key={tab.value}
              asChild
              variant={active ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-9 px-3",
                active
                  ? "bg-muted text-foreground shadow-none hover:bg-muted"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Link href={`/dashboard/emails?tab=${tab.value}`}>
                <Icon data-icon="inline-start" />
                <span className="text-sm font-medium">{tab.label}</span>
              </Link>
            </Button>
          );
        })}
      </div>
    </nav>
  );
}

function resolveInitialFlowId(
  flowTargets: FlowTarget[],
  initialFlowId?: number,
) {
  if (
    typeof initialFlowId === "number" &&
    Number.isFinite(initialFlowId) &&
    flowTargets.some((flow) => flow.id === initialFlowId)
  ) {
    return initialFlowId;
  }
  return flowTargets[0]?.id;
}

export function EmailDashboardClient({
  batches,
  recordDeliveryPage,
  flowTargets,
  templateSettings,
  resultEmailPreviews,
  interviewScheduleTemplates,
  interviewSchedulePreviews,
  emailCenterConfig,
  templateDefinitions,
  activeTab,
  initialFlowId,
}: {
  batches: EmailBatch[];
  recordDeliveryPage: EmailDeliveryPage;
  flowTargets: FlowTarget[];
  templateSettings: TemplateSetting[];
  resultEmailPreviews: ResultEmailPreviews;
  interviewScheduleTemplates: InterviewScheduleTemplates;
  interviewSchedulePreviews: InterviewSchedulePreviews;
  emailCenterConfig: EmailCenterConfig;
  templateDefinitions: EmailTemplateDefinition[];
  activeTab?: string;
  initialFlowId?: number;
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
  const [selectedFlowId, setSelectedFlowId] = useState(() =>
    resolveInitialFlowId(safeFlowTargets, initialFlowId),
  );
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
    const next = resolveInitialFlowId(safeFlowTargets, initialFlowId);
    if (typeof next === "number") {
      setSelectedFlowId(next);
    }
  }, [initialFlowId, safeFlowTargets]);

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

  if (resolvedActiveTab === "records") {
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
        resultEmailPreviews={resultEmailPreviews}
        interviewScheduleTemplates={interviewScheduleTemplates}
        interviewSchedulePreviews={interviewSchedulePreviews}
        selectedFlowTitle={selectedFlow?.title}
        templateDefinitions={templateDefinitions}
      />
    );
  } else if (resolvedActiveTab === "status") {
    content = (
      <div className="flex flex-col gap-5">
        <EmailOverviewSection
          deliveries={safeDeliveries}
          emailCenterConfig={emailCenterConfig}
        />
        <EmailConfigSection emailCenterConfig={emailCenterConfig} />
      </div>
    );
  } else {
    content = (
      <EmailSendingTasksSection
        batches={safeBatches}
        filteredFlows={filteredFlows}
        selectedFlow={selectedFlow}
        selectedFlowId={selectedFlow?.id}
        flowQuery={flowQuery}
        setFlowQuery={setFlowQuery}
        setSelectedFlowId={setSelectedFlowId}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-[max(5rem,calc(env(safe-area-inset-bottom)+4rem))] md:pb-0">
      <EmailCenterTabNav activeTab={resolvedActiveTab} />
      {content}
    </div>
  );
}


