"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

import { EmailBatchTasksSection } from "./EmailBatchTasksSection";
import {
  RecipientsDialog,
  SendConfirmDialog,
} from "./EmailSendDialogs";
import { hiddenScrollbar } from "./emailDashboardConstants";
import { PreviewDialog } from "./emailDashboardDialogs";
import { getEmailPreflight } from "./emailDashboardUtils";
import {
  countRemainingRecipients,
  getLaneDeliveries,
} from "./emailSendingUtils";
import type {
  EmailBatch,
  FlowTarget,
} from "./emailDashboardTypes";

function remainingForFlow(flow: FlowTarget, batches: EmailBatch[]) {
  return (
    countRemainingRecipients({
      recipients: Array.isArray(flow.passed) ? flow.passed : [],
      deliveries: getLaneDeliveries({ batches, flowId: flow.id, accept: true }),
    }) +
    countRemainingRecipients({
      recipients: Array.isArray(flow.failed) ? flow.failed : [],
      deliveries: getLaneDeliveries({ batches, flowId: flow.id, accept: false }),
    })
  );
}

function SendLane({
  flow,
  accept,
  batches,
}: {
  flow: FlowTarget;
  accept: boolean;
  batches: EmailBatch[];
}) {
  const recipients = Array.isArray(accept ? flow.passed : flow.failed)
    ? accept
      ? flow.passed
      : flow.failed
    : [];
  const subject = accept ? flow.acceptedSubject : flow.rejectedSubject;
  const previewHtml = accept
    ? flow.acceptedPreviewHtml
    : flow.rejectedPreviewHtml;
  const resultLabel = accept ? "通过" : "不通过";
  const laneDeliveries = getLaneDeliveries({
    batches,
    flowId: flow.id,
    accept,
  });
  const preflight = getEmailPreflight({
    recipients,
    deliveries: laneDeliveries,
  });
  const pending = preflight.remainingRecipients.length;
  const sent = laneDeliveries.filter((d) => d.status === "sent").length;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border border-l-4 bg-card p-4",
        accept ? "border-l-primary" : "border-l-destructive",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{resultLabel}</p>
        <p className="text-xs tabular-nums text-muted-foreground">
          待发 {pending}
          {sent > 0 ? ` · 已发 ${sent}` : ""}
        </p>
      </div>
      <p className="line-clamp-1 text-xs text-muted-foreground">
        {subject || "未设置主题"}
      </p>
      <div className="mt-auto flex flex-wrap gap-2">
        <RecipientsDialog
          recipients={preflight.remainingRecipients}
          title={`${flow.title} · ${resultLabel} · 待发名单`}
          triggerLabel="名单"
        />
        <PreviewDialog
          title={`${flow.title} · ${resultLabel}`}
          html={previewHtml}
          triggerLabel="预览"
          triggerSize="sm"
        />
        <div className="min-w-[5.5rem] flex-1">
          <SendConfirmDialog
            flow={flow}
            accept={accept}
            subject={subject}
            previewHtml={previewHtml}
            recipients={recipients}
            deliveries={laneDeliveries}
          />
        </div>
      </div>
    </div>
  );
}

export function EmailSendingTasksSection({
  batches,
  filteredFlows,
  selectedFlow,
  selectedFlowId,
  flowQuery,
  setFlowQuery,
  setSelectedFlowId,
}: {
  batches: EmailBatch[];
  filteredFlows: FlowTarget[];
  selectedFlow?: FlowTarget;
  selectedFlowId?: number;
  flowQuery: string;
  setFlowQuery: (value: string) => void;
  setSelectedFlowId: (value: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4 lg:hidden">
          <select
            id="email-flow-picker"
            aria-label="招新流程"
            value={selectedFlow?.id ?? ""}
            onChange={(event) => setSelectedFlowId(Number(event.target.value))}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
            disabled={filteredFlows.length === 0}
          >
            {filteredFlows.map((flow) => {
              const n = remainingForFlow(flow, batches);
              return (
                <option key={flow.id} value={flow.id}>
                  {flow.title}
                  {n > 0 ? `（待发 ${n}）` : ""}
                </option>
              );
            })}
          </select>
        </div>

        <div className="grid lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="hidden border-r p-3 lg:block">
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={flowQuery}
                onChange={(event) => setFlowQuery(event.target.value)}
                placeholder="搜索流程"
                className="h-9 pl-9"
                aria-label="搜索流程"
              />
            </div>
            <div
              className={cn(
                "flex max-h-[360px] flex-col gap-0.5 overflow-y-auto pr-1",
                hiddenScrollbar,
              )}
            >
              {filteredFlows.map((flow) => {
                const active = selectedFlowId === flow.id;
                const pending = remainingForFlow(flow, batches);
                return (
                  <button
                    key={flow.id}
                    type="button"
                    onClick={() => setSelectedFlowId(flow.id)}
                    className={cn(
                      "rounded-md px-3 py-2 text-left transition-colors",
                      active
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <p className="truncate text-sm font-medium text-foreground">
                      {flow.title}
                    </p>
                    <p className="mt-0.5 text-xs tabular-nums">
                      {pending > 0 ? `待发 ${pending}` : "已发完"}
                    </p>
                  </button>
                );
              })}
              {filteredFlows.length === 0 && (
                <p className="p-3 text-center text-sm text-muted-foreground">
                  没有匹配的流程
                </p>
              )}
            </div>
          </aside>

          <div className="p-4 sm:p-5">
            {selectedFlow ? (
              <div className="flex flex-col gap-3">
                <h2 className="text-base font-semibold">{selectedFlow.title}</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  <SendLane flow={selectedFlow} accept batches={batches} />
                  <SendLane
                    flow={selectedFlow}
                    accept={false}
                    batches={batches}
                  />
                </div>
              </div>
            ) : (
              <div className="flex min-h-[160px] items-center justify-center text-sm text-muted-foreground">
                暂无可发送的招新流程
              </div>
            )}
          </div>
        </div>
      </section>

      <EmailBatchTasksSection batches={batches} />
    </div>
  );
}
