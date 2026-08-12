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
  EmailFlowOption,
  EmailStatusOverview,
  EmailTemplateDefinition,
  FlowTarget,
  InterviewSchedulePreviews,
  InterviewScheduleTemplates,
  ResultEmailPreviews,
  ResultEmailDeliveryState,
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

const emptyDeliveryPage: EmailDeliveryPage = {
  deliveries: [],
  filters: {
    page: 1,
    pageSize: 50,
    category: "",
    status: "",
    templateKey: "",
    flowId: "",
    creatorId: "",
    from: "",
    to: "",
    query: "",
  },
  totalCount: 0,
  totalPages: 0,
};

export function EmailDashboardClient({
  batches = [],
  recordDeliveryPage = emptyDeliveryPage,
  flowTargets = [],
  flowOptions = [],
  resultDeliveryStates = [],
  statusOverview,
  templateSettings = [],
  resultEmailPreviews = {} as ResultEmailPreviews,
  interviewScheduleTemplates = [],
  interviewSchedulePreviews = {} as InterviewSchedulePreviews,
  emailCenterConfig,
  templateDefinitions,
  activeTab,
  initialFlowId,
}: {
  batches?: EmailBatch[];
  recordDeliveryPage?: EmailDeliveryPage;
  flowTargets?: FlowTarget[];
  flowOptions?: EmailFlowOption[];
  resultDeliveryStates?: ResultEmailDeliveryState[];
  statusOverview?: EmailStatusOverview;
  templateSettings?: TemplateSetting[];
  resultEmailPreviews?: ResultEmailPreviews;
  interviewScheduleTemplates?: InterviewScheduleTemplates;
  interviewSchedulePreviews?: InterviewSchedulePreviews;
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
  const safeFlowOptions = useMemo(
    () => (Array.isArray(flowOptions) ? flowOptions : []),
    [flowOptions],
  );
  const safeResultDeliveryStates = useMemo(
    () =>
      Array.isArray(resultDeliveryStates) ? resultDeliveryStates : [],
    [resultDeliveryStates],
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
          batch.counts.pending > 0 ||
          batch.counts.sending > 0,
      ) ||
      safeDeliveries.some(
        (delivery) => delivery.status === "pending" || delivery.status === "sending",
      ) ||
      (statusOverview?.pendingOrSendingCount ?? 0) > 0,
    [safeBatches, safeDeliveries, statusOverview?.pendingOrSendingCount],
  );
  const activeEmailWorkKey = useMemo(() => {
    const batchKey = safeBatches
      .map((batch) =>
        `${batch.id}:${batch.status}:${batch.counts.pending}:${batch.counts.sending}`,
      )
      .join(";");
    const deliveryKey = safeDeliveries
      .map((delivery) => `${delivery.id}:${delivery.status}:${delivery.attemptCount}`)
      .join(";");
    return `${batchKey}::${deliveryKey}::${statusOverview?.pendingOrSendingCount ?? 0}`;
  }, [safeBatches, safeDeliveries, statusOverview?.pendingOrSendingCount]);
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
        flowTargets={safeFlowOptions}
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
        selectedFlowTitle={
          selectedFlow?.title ?? safeFlowOptions[0]?.title
        }
        templateDefinitions={templateDefinitions}
      />
    );
  } else if (resolvedActiveTab === "status") {
    content = (
      <div className="flex flex-col gap-5">
        {statusOverview && (
          <EmailOverviewSection
            overview={statusOverview}
            emailCenterConfig={emailCenterConfig}
          />
        )}
        <EmailConfigSection emailCenterConfig={emailCenterConfig} />
      </div>
    );
  } else {
    content = (
      <EmailSendingTasksSection
        batches={safeBatches}
        deliveryStates={safeResultDeliveryStates}
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
