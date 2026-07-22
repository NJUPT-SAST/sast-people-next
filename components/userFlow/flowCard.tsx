"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Badge } from "../ui/badge";
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
};

const statusName = {
  pending: "未开始",
  ongoing: "进行中",
  passed: "结果待通知",
  failed: "结果待通知",
  accepted: "已通过",
  rejected: "未通过",
};

const flowTypeLabel: Record<string, string> = {
  recruitment: "笔试招新",
  recruitment_exemption: "免试招新",
  woc: "WOC/WOD",
  soc: "SOC/SOD",
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

  const statusLabel =
    safeFlow.status === "not_started"
      ? "流程未开始"
      : safeFlow.status === "ongoing"
        ? "流程进行中"
        : safeFlow.status === "passed"
          ? "已通过考核"
          : "未通过考核";

  return (
    <Card className="w-full">
      <CardHeader className="space-y-3 pb-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <CardTitle className="text-base font-medium leading-snug sm:text-sm">
              {safeFlow.title ?? "未命名流程"}
            </CardTitle>
            {safeFlow.flowType && (
              <Badge variant="outline" className="shrink-0 text-xs">
                {flowTypeLabel[safeFlow.flowType] ?? safeFlow.flowType}
              </Badge>
            )}
          </div>
          <Badge
            className="w-fit shrink-0"
            variant={
              safeFlow.status === "ongoing" || safeFlow.status === "not_started"
                ? "secondary"
                : safeFlow.status === "passed"
                  ? "default"
                  : "destructive"
            }
          >
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {steps.length > 0 ? (
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="flex min-w-[16rem] items-center my-4">
              {steps.map((step, index) => {
                const status =
                  safeFlow.status === "passed"
                    ? "accepted"
                    : safeFlow.status === "failed"
                      ? step.order < activeStepOrder
                        ? "accepted"
                        : step.order === activeStepOrder
                          ? "rejected"
                          : "pending"
                      : step.order < activeStepOrder
                        ? "accepted"
                        : step.order === activeStepOrder
                          ? "ongoing"
                          : "pending";
                const Icon =
                  statusIcons[status as keyof typeof statusIcons] || AlertCircle;
                const nextStatus =
                  safeFlow.status === "passed"
                    ? "accepted"
                    : safeFlow.status === "failed"
                      ? step.order < activeStepOrder
                        ? "accepted"
                        : "pending"
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
                            step.order <= activeStepOrder
                              ? `${getStatusColor(status || "")} text-white`
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
          </div>
          {typeof safeFlow.id === "number" &&
            (safeFlow.status === "not_started" ||
              safeFlow.status === "ongoing") && (
              <div className="shrink-0 self-stretch sm:self-auto">
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

