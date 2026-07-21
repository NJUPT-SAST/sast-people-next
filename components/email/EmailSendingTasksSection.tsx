"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getEmailPreflight } from "@/components/email/emailDashboardUtils";
import { cn } from "@/lib/utils";
import { CheckCircle2, CircleX, MailPlus, Search } from "lucide-react";

import { EmailBatchTasksSection } from "./EmailBatchTasksSection";
import {
  RecipientsDialog,
  SendConfirmDialog,
} from "./EmailSendDialogs";
import { TestEmailButton } from "./EmailTemplateManagementSection";
import { hiddenScrollbar } from "./emailDashboardConstants";
import { PreviewDialog } from "./emailDashboardDialogs";
import {
  countRemainingRecipients,
  getLaneDeliveries,
} from "./emailSendingUtils";
import type {
  EmailBatch,
  EmailTemplateDefinition,
  FlowTarget,
} from "./emailDashboardTypes";

function CountPill({
  label,
  value,
  active,
}: {
  label: string;
  value: number;
  active?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center rounded-lg border px-2.5 py-2 md:min-w-14 md:flex-none lg:min-w-16 lg:px-3",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "bg-background/70",
      )}
    >
      <span className="text-base font-semibold tabular-nums leading-none lg:text-lg">
        {value}
      </span>
      <span className="mt-1 text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}

function FlowSummary({
  flow,
  batches,
}: {
  flow: FlowTarget;
  batches: EmailBatch[];
}) {
  const unsent =
    countRemainingRecipients({
      recipients: Array.isArray(flow.passed) ? flow.passed : [],
      deliveries: getLaneDeliveries({ batches, flowId: flow.id, accept: true }),
    }) +
    countRemainingRecipients({
      recipients: Array.isArray(flow.failed) ? flow.failed : [],
      deliveries: getLaneDeliveries({ batches, flowId: flow.id, accept: false }),
    });

  return (
    <div className="mt-2 text-xs text-muted-foreground">
      <span className={cn(unsent > 0 && "text-primary")}>
        {unsent > 0 ? `${unsent} 封待发` : "无待发邮件"}
      </span>
    </div>
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
  const previewHtml = accept ? flow.acceptedPreviewHtml : flow.rejectedPreviewHtml;
  const tone = accept ? "border-primary/25 bg-primary/5" : "border-destructive/20 bg-destructive/5";
  const resultLabel = accept ? "通过" : "不通过";
  const laneDeliveries = getLaneDeliveries({ batches, flowId: flow.id, accept });
  const preflight = getEmailPreflight({ recipients, deliveries: laneDeliveries });
  const newRecipientCount = preflight.remainingRecipients.length;
  const sentCount = laneDeliveries.filter((delivery) => delivery.status === "sent").length;
  const LaneIcon = accept ? CheckCircle2 : CircleX;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border p-4 transition-colors hover:bg-background/55 lg:min-h-[172px] lg:p-5",
        tone,
      )}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 gap-3 md:flex-1">
          <div
            className={cn(
              "mt-0.5 rounded-lg border p-2",
              accept
                ? "border-primary/25 bg-primary/10 text-primary"
                : "border-destructive/25 bg-destructive/10 text-destructive",
            )}
          >
            <LaneIcon className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">{resultLabel}邮件</p>
            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
              {subject}
            </p>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 md:w-auto md:shrink-0">
          <CountPill label="待发送" value={newRecipientCount} active={newRecipientCount > 0} />
          <CountPill label="已发送" value={sentCount} />
        </div>
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <RecipientsDialog
            recipients={preflight.remainingRecipients}
            title={`${flow.title} ${resultLabel}邮件未发名单`}
            triggerLabel="名单"
          />
          <PreviewDialog
            title={`${flow.title} ${resultLabel}邮件`}
            html={previewHtml}
            triggerLabel="样张"
            triggerClassName="w-full"
          />
        </div>
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
  );
}

function SelectedFlowSummary({
  flow,
  batches,
}: {
  flow: FlowTarget;
  batches: EmailBatch[];
}) {
  const passedCount = Array.isArray(flow.passed) ? flow.passed.length : 0;
  const failedCount = Array.isArray(flow.failed) ? flow.failed.length : 0;
  const acceptedSent = getLaneDeliveries({
    batches,
    flowId: flow.id,
    accept: true,
  }).filter((delivery) => delivery.status === "sent").length;
  const rejectedSent = getLaneDeliveries({
    batches,
    flowId: flow.id,
    accept: false,
  }).filter((delivery) => delivery.status === "sent").length;

  return (
    <div className="grid gap-2 rounded-lg border bg-background/35 p-3 sm:grid-cols-4">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">通过名单</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{passedCount}</p>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">不通过名单</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{failedCount}</p>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">通过已发</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-primary">
          {acceptedSent}
        </p>
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">不通过已发</p>
        <p className="mt-1 text-lg font-semibold tabular-nums text-primary">
          {rejectedSent}
        </p>
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
  templateDefinitions,
}: {
  batches: EmailBatch[];
  filteredFlows: FlowTarget[];
  selectedFlow: FlowTarget | undefined;
  selectedFlowId: number | undefined;
  flowQuery: string;
  setFlowQuery: (value: string) => void;
  setSelectedFlowId: (value: number) => void;
  templateDefinitions: EmailTemplateDefinition[];
}) {
  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
        <div className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
          <div>
            <div className="flex items-center gap-2">
              <MailPlus className="size-5 text-primary" />
              <h2 className="text-lg font-semibold">发结果通知</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              按流程给候选人发「通过 / 不通过」结果邮件。发送后可在下方历史里查看进度和失败。
            </p>
          </div>
          <div className="hidden lg:block">
            <TestEmailButton
              flowName={selectedFlow?.title}
              templateDefinitions={templateDefinitions}
            />
          </div>
        </div>

        <div className="border-b p-3 lg:hidden">
          <div className="rounded-lg border bg-background/35 p-3 shadow-xs">
            <div className="mb-2">
              <TestEmailButton
                flowName={selectedFlow?.title}
                templateDefinitions={templateDefinitions}
              />
            </div>
            <div className="mt-3">
              <Label htmlFor="email-flow-picker" className="mb-2 block text-xs text-muted-foreground">
                当前流程
              </Label>
              <select
                id="email-flow-picker"
                value={selectedFlow?.id ?? ""}
                onChange={(event) => setSelectedFlowId(Number(event.target.value))}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                disabled={filteredFlows.length === 0}
              >
                {filteredFlows.map((flow) => (
                  <option key={flow.id} value={flow.id}>
                    {flow.title}
                  </option>
                ))}
              </select>
            </div>
            {selectedFlow && <FlowSummary flow={selectedFlow} batches={batches} />}
          </div>
          <div className="mt-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={flowQuery}
                onChange={(event) => setFlowQuery(event.target.value)}
                placeholder="搜索流程"
                className="pl-9"
              />
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="hidden p-3 lg:block lg:border-r">
            <div className="mb-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">1. 选择招新流程</p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={flowQuery}
                  onChange={(event) => setFlowQuery(event.target.value)}
                  placeholder="搜索流程"
                  className="pl-9"
                />
              </div>
            </div>
            <div className={cn("flex h-[260px] flex-col gap-2 overflow-y-auto pr-1", hiddenScrollbar)}>
              {filteredFlows.map((flow) => {
                const active = selectedFlowId === flow.id;
                return (
                  <button
                    key={flow.id}
                    type="button"
                    onClick={() => setSelectedFlowId(flow.id)}
                    className={cn(
                      "rounded-lg border bg-background/35 p-3 text-left transition-colors hover:bg-background/70",
                      active && "border-primary/35 bg-primary/10 ring-1 ring-primary/15",
                    )}
                  >
                    <p className="truncate text-sm font-medium">{flow.title}</p>
                    <FlowSummary flow={flow} batches={batches} />
                  </button>
                );
              })}
              {filteredFlows.length === 0 && (
                <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                  没有匹配的流程。
                </div>
              )}
            </div>
          </div>

          <div className="p-3 sm:p-4 lg:p-5">
            {selectedFlow ? (
              <div className="flex flex-col gap-4 lg:gap-5">
                <div className="flex flex-col gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">2. 发送通过 / 不通过邮件</p>
                    <h3 className="mt-1 truncate text-lg font-semibold">{selectedFlow.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      只会给还没成功发送的人建任务；已发送的不会重复发。
                    </p>
                  </div>
                  <SelectedFlowSummary flow={selectedFlow} batches={batches} />
                </div>
                <div className="grid gap-3 xl:grid-cols-2">
                  <SendLane flow={selectedFlow} accept batches={batches} />
                  <SendLane flow={selectedFlow} accept={false} batches={batches} />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center rounded-md border border-dashed p-8 text-sm text-muted-foreground">
                暂无可发送的招新流程。
              </div>
            )}
          </div>
        </div>
      </section>

      <EmailBatchTasksSection batches={batches} />
    </div>
  );
}


