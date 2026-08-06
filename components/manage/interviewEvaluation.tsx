"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
  createEvaluation,
  approveEvaluation,
  rejectEvaluation,
} from "@/action/user-flow/evaluation";
import { InferSelectModel } from "drizzle-orm";
import { interviewEvaluation } from "@/db/schema";

type Evaluation = InferSelectModel<typeof interviewEvaluation>;

const statusLabel: Record<string, string> = {
  submitted: "待终审",
  approved: "已通过",
  rejected: "不通过",
};

export const InterviewEvaluation = ({
  userFlowId,
  evaluation,
  authorName,
  role,
}: {
  userFlowId: number;
  evaluation: Evaluation | null;
  authorName?: string | null;
  role: number;
}) => {
  const [content, setContent] = useState("");
  const [recommendation, setRecommendation] = useState<"passed" | "failed">("passed");
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!content.trim()) {
      toast.error("面评内容不能为空");
      return;
    }
    setLoading(true);
    try {
      const result = await createEvaluation(userFlowId, content, recommendation);
      if (!result.success) {
        toast.error(result.error?.message ?? "提交失败");
        return;
      }
      toast.success("面评已提交");
      setContent("");
    } catch {
      toast.error("提交失败");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!evaluation) return;
    setLoading(true);
    try {
      await approveEvaluation(evaluation.id);
      toast.success("面评已通过");
    } catch {
      toast.error("操作失败");
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!evaluation) return;
    setLoading(true);
    try {
      await rejectEvaluation(evaluation.id);
      toast.success("面评已判定不通过");
    } catch {
      toast.error("操作失败");
    } finally {
      setLoading(false);
    }
  };

  if (evaluation) {
    return (
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">面评</CardTitle>
            <Badge
              variant={
                evaluation.status === "approved"
                  ? "default"
                  : evaluation.status === "rejected"
                  ? "destructive"
                  : "secondary"
              }
            >
              {statusLabel[evaluation.status] ?? evaluation.status}
            </Badge>
          </div>
          {authorName && (
            <p className="text-xs text-muted-foreground">
              评价人：{authorName}
            </p>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap">{evaluation.content}</p>
          {evaluation.status === "submitted" && role >= 3 && (
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleApprove} loading={loading}>
                通过
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleReject}
                loading={loading}
              >
                不通过
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  if (role >= 2) {
    return (
      <Card className="mt-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">写面评</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-2 text-xs text-muted-foreground">
            面评内容必填，讲师建议不能替代面评正文。
          </p>
          <Textarea
            placeholder="请输入面评内容..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
            className="mb-3"
          />
          <div className="mb-3 grid grid-cols-2 gap-2" role="group" aria-label="讲师建议">
            <Button
              type="button"
              size="sm"
              variant={recommendation === "passed" ? "default" : "outline"}
              aria-pressed={recommendation === "passed"}
              onClick={() => setRecommendation("passed")}
            >
              建议通过
            </Button>
            <Button
              type="button"
              size="sm"
              variant={recommendation === "failed" ? "destructive" : "outline"}
              aria-pressed={recommendation === "failed"}
              onClick={() => setRecommendation("failed")}
            >
              建议不通过
            </Button>
          </div>
          <Button size="sm" onClick={handleCreate} loading={loading}>
            提交面评
          </Button>
        </CardContent>
      </Card>
    );
  }

  return null;
};
