"use server";
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

const statusIcons = {
  pending: CircleDashed,
  ongoing: Clock,
  accepted: CheckCircle,
  rejected: XCircle,
};

const statusName = {
  pending: "未开始",
  ongoing: "进行中",
  accepted: "已通过",
  rejected: "未通过",
};

interface FlowCardProps {
  flow: displayUserFlow;
}

export const FlowCard: React.FC<FlowCardProps> = async ({ flow }) => {
  const { currentStepOrder } = flow;

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
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{flow.title}</CardTitle>
        <Badge
          variant={
            flow.status === "ongoing" || flow.status === "pending"
              ? "secondary"
              : flow.status === "accepted"
              ? "default"
              : "destructive"
          }
        >
          {flow.status === "ongoing" || flow.status === "pending"
            ? "流程进行中"
            : flow.status === "accepted"
            ? "已通过考核"
            : "未通过考核"}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-center w-full my-4">
          {flow.steps.map((step, index) => {
            const status =
              step?.order && step.order < currentStepOrder
                ? "accepted"
                : step.order === currentStepOrder
                ? "ongoing"
                : "pending";
            const Icon =
              statusIcons[status as keyof typeof statusIcons] || AlertCircle;
            const nextStatus =
              flow.status === "accepted" || flow.status === "rejected"
                ? flow.status
                : step.order < currentStepOrder
                ? "accepted"
                : "pending";

            return (
              <React.Fragment key={`${flow.id}-${index}-step`}>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className={cn(
                        "w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-sm shrink-0 transition-colors",
                        index <= currentStepOrder - 1
                          ? `${getStatusColor(status || "")} text-white`
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      <Icon className="w-5 h-5 md:w-6 md:h-6" />
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
                {index < flow.steps.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-1",
                      getStatusColor(nextStatus || "")
                    )}
                  />
                )}
              </React.Fragment>
            );
          })}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          当前步骤：{flow.steps[currentStepOrder - 1]?.title || "（流程未开始）"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {flow.steps[currentStepOrder - 1]?.description ||
            "前面的区域以后再来探索吧"}
        </p>
      </CardContent>
    </Card>
  );
};
