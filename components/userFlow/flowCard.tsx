"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../ui/popover";
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  CircleDashed,
} from "lucide-react";
import { displayUserFlow } from "@/types/userflow";
import { cn } from "@/lib/utils";
import { CancelRegistration } from "./cancelRegistration";
import { PortfolioLinkEditor } from "./portfolioLinkEditor";

const statusIcons = {
  pending: CircleDashed,
  ongoing: Clock,
  passed: Clock,
  failed: Clock,
  accepted: CheckCircle,
  rejected: XCircle,
  withdrawn: AlertCircle,
};

const statusName = {
  pending: "未开始",
  ongoing: "进行中",
  passed: "结果待通知",
  failed: "结果待通知",
  accepted: "已通过",
  rejected: "未通过",
  withdrawn: "已退回",
};

interface FlowCardProps {
  flow: displayUserFlow;
}

export const FlowCard: React.FC<FlowCardProps> = ({ flow }) => {
  const safeFlow = flow ?? ({} as displayUserFlow);
  const steps = (Array.isArray(safeFlow.steps) ? [...safeFlow.steps] : []).sort(
    (a, b) => a.order - b.order,
  );
  const activeStep =
    steps.find((step) => step.order === safeFlow.currentStepOrder) ?? steps[0];
  const activeStepOrder = activeStep?.order ?? 0;
  const resultPublished = safeFlow.publicationStatus === "published";
  const visibleStatus = resultPublished
    ? safeFlow.status
    : safeFlow.status === "passed" || safeFlow.status === "failed"
      ? "ongoing"
      : safeFlow.status;

  const statusLabel =
    visibleStatus === "not_started"
      ? "流程未开始"
      : visibleStatus === "ongoing"
        ? "流程进行中"
        : visibleStatus === "passed"
          ? "已通过考核"
          : visibleStatus === "withdrawn"
            ? "已退回，请重新报名"
            : "未通过考核";

  const getStatusColor = (status: string) => {
    switch (status) {
      case "accepted":
        return "bg-primary";
      case "rejected":
        return "bg-destructive";
      case "ongoing":
        return "bg-blue-500";
      default:
        return "bg-muted";
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="space-y-3 pb-2">
        <div className="flex min-w-0 flex-col gap-2.5">
          <CardTitle className="min-w-0 text-base font-medium leading-snug sm:text-sm">
            {safeFlow.title ?? "未命名流程"}
          </CardTitle>
          <span className="sr-only">{statusLabel}</span>
        </div>
      </CardHeader>
      <CardContent>
        {steps.length > 0 ? (
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="flex min-w-[16rem] items-center my-4">
              {steps.map((step, index) => {
                const status =
                  visibleStatus === "passed"
                    ? "accepted"
                    : visibleStatus === "failed"
                      ? step.order < activeStepOrder
                        ? "accepted"
                        : step.order === activeStepOrder
                          ? "rejected"
                          : "pending"
                      : visibleStatus === "withdrawn"
                        ? "pending"
                      : step.order < activeStepOrder
                        ? "accepted"
                        : step.order === activeStepOrder
                          ? "ongoing"
                          : "pending";
                const Icon =
                  statusIcons[status as keyof typeof statusIcons] || AlertCircle;
                const nextStatus =
                  visibleStatus === "passed"
                    ? "accepted"
                    : visibleStatus === "failed"
                      ? step.order < activeStepOrder
                        ? "accepted"
                        : "pending"
                      : visibleStatus === "withdrawn"
                        ? "pending"
                      : step.order < activeStepOrder
                        ? "accepted"
                        : "pending";

                return (
                  <React.Fragment key={`${safeFlow.id ?? "flow"}-${index}-step`}>
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          aria-label={`${step.title}，${statusName[status as keyof typeof statusName] ?? status}。点击查看详情`}
                          className={cn(
                            "flex size-11 shrink-0 items-center justify-center rounded-full text-sm transition-colors touch-manipulation md:size-12",
                            status === "accepted" ||
                            status === "rejected" ||
                            status === "ongoing"
                              ? `${getStatusColor(status)} text-white`
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          <Icon className="size-5 md:size-6" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56">
                        <div className="space-y-2">
                          <h4 className="text-sm font-semibold">{step.title}</h4>
                          <p className="text-sm">{step.description}</p>
                          <p className="text-xs text-muted-foreground">
                            状态：{statusName[status as keyof typeof statusName]}
                          </p>
                        </div>
                      </PopoverContent>
                    </Popover>
                    {index < steps.length - 1 && (
                      <div
                        className={cn(
                          "mx-1 h-0.5 min-w-4 flex-1",
                          getStatusColor(nextStatus || ""),
                        )}
                      />
                    )}
                  </React.Fragment>
                );
              })}
            </div>
            <p className="mb-2 text-center text-[11px] text-muted-foreground sm:hidden">
              点按步骤圆点可查看详情
            </p>
          </div>
        ) : null}
        <div className="mt-2 flex flex-col gap-3 sm:mt-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              当前步骤：{activeStep?.title || "（流程未开始）"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeStep?.description || "前面的区域以后再来探索吧"}
            </p>
            {visibleStatus === "withdrawn" && safeFlow.withdrawReason && (
              <p className="mt-2 max-w-2xl whitespace-pre-wrap text-sm text-destructive">
                退回理由：{safeFlow.withdrawReason}
              </p>
            )}
          </div>
          {typeof safeFlow.id === "number" &&
            (safeFlow.status === "not_started" ||
              safeFlow.status === "ongoing") && (
              <div className="shrink-0 self-start sm:self-auto">
                <CancelRegistration userFlowId={safeFlow.id} />
              </div>
            )}
        </div>
        {typeof safeFlow.id === "number" &&
          safeFlow.flowType &&
          safeFlow.flowType !== "recruitment" && (
            <div className="mt-4">
              <PortfolioLinkEditor
                userFlowId={safeFlow.id}
                initialValue={safeFlow.portfolioLink}
                initialDescription={safeFlow.portfolioDescription}
                applyGroup={safeFlow.applyGroup}
                applyGroupOptions={safeFlow.groupOptions}
                editable={
                  safeFlow.status === "not_started" ||
                  safeFlow.status === "ongoing"
                }
              />
            </div>
          )}
      </CardContent>
    </Card>
  );
};
