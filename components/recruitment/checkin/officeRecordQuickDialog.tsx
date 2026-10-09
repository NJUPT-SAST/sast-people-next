"use client";

import React, { useEffect, useState } from "react";
import { toast } from "sonner";

import { createEvaluation } from "@/action/user-flow/evaluation";
import {
  getOfficeInterviewRecord,
  type OfficeInterviewRecord,
} from "@/action/user-flow/office-record";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export type OfficeRecordTarget = {
  userFlowId: number;
  queueNo: string;
  name: string;
  round: number;
};

/**
 * 现场随手写面评：部长在面试位上一句话打开，不用离开签到叫号页。
 * 与面试工作台同一套数据（`createEvaluation` / `getOfficeInterviewRecord`），
 * 办公类要求「分数 + 记录内容」，面试意见可选、只作参考。
 */
export const OfficeRecordQuickDialog = ({
  target,
  onClose,
  onSaved,
}: {
  target: OfficeRecordTarget | null;
  onClose: () => void;
  onSaved: () => void;
}) => {
  const [record, setRecord] = useState<OfficeInterviewRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [score, setScore] = useState("");
  const [content, setContent] = useState("");
  const [recommendation, setRecommendation] = useState("");

  useEffect(() => {
    if (!target) return;
    setRecord(null);
    setScore("");
    setContent("");
    setRecommendation("");
    setLoading(true);
    getOfficeInterviewRecord(target.userFlowId)
      .then(setRecord)
      .catch(() => toast.error("读取面试记录失败"))
      .finally(() => setLoading(false));
  }, [target]);

  if (!target) return null;

  const roundData = record?.rounds.find((item) => item.round === target.round) ?? null;
  const myRecord = roundData?.evaluations.find((item) => item.isMine) ?? null;
  const others = roundData?.evaluations.filter((item) => !item.isMine) ?? [];

  const submit = async () => {
    const parsedScore = Number(score);
    if (!Number.isInteger(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      toast.error("请填写 0-100 的整数分数");
      return;
    }
    setSaving(true);
    try {
      const result = await createEvaluation(
        target.userFlowId,
        content,
        recommendation === "passed" || recommendation === "failed"
          ? recommendation
          : null,
        undefined,
        parsedScore,
      );
      if (!result.success) {
        toast.error(result.error?.message ?? "保存失败");
        return;
      }
      toast.success("面试记录已保存");
      onSaved();
      onClose();
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {target.queueNo} · {target.name}
          </DialogTitle>
          <DialogDescription>
            {target.round === 2 ? "二面" : "一面"}面试记录（分数 + 记录内容）
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-center text-xs text-muted-foreground">正在读取…</p>
        ) : (
          <div className="flex flex-col gap-3">
            {roundData && roundData.evaluations.length > 0 ? (
              <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-2.5 text-xs">
                <p className="font-medium">
                  本轮已记录 {roundData.evaluations.length} 份
                  {roundData.averageScore !== null
                    ? ` · 均分 ${roundData.averageScore}`
                    : ""}
                </p>
                {roundData.evaluations.map((item) => (
                  <p key={item.id} className="text-muted-foreground">
                    {item.isMine ? "我" : item.authorName ?? "部长"}：
                    {item.score ?? "—"} 分
                    {item.recommendation
                      ? ` · ${item.recommendation === "passed" ? "建议通过" : "建议不通过"}`
                      : ""}
                  </p>
                ))}
              </div>
            ) : null}

            {myRecord ? (
              <div className="flex flex-col gap-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs">
                <p className="flex items-center gap-2 font-medium">
                  我已记录
                  <Badge variant="outline">{myRecord.score ?? "—"} 分</Badge>
                </p>
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {myRecord.content}
                </p>
                {others.length > 0 ? (
                  <p className="text-muted-foreground">
                    其他部长已记录 {others.length} 份（均分{" "}
                    {roundData?.averageScore ?? "—"}）
                  </p>
                ) : null}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">分数（0-100）</span>
                  <Input
                    inputMode="numeric"
                    value={score}
                    onChange={(event) => setScore(event.target.value)}
                    placeholder="如 85"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">记录内容</span>
                  <Textarea
                    value={content}
                    onChange={(event) => setContent(event.target.value)}
                    placeholder="记录候选人的表现、亮点与不足…"
                    rows={5}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    面试意见（可选，仅供参考）
                  </span>
                  <Select value={recommendation} onValueChange={setRecommendation}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="不填写" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="passed">建议通过</SelectItem>
                      <SelectItem value="failed">建议不通过</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            关闭
          </Button>
          {myRecord ? null : (
            <Button onClick={submit} loading={saving} disabled={loading}>
              保存记录
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OfficeRecordQuickDialog;
