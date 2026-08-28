"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateApplyGroup } from "@/action/user-flow/apply-group";
import { updatePortfolioLink } from "@/action/user-flow/portfolio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { externalHref, isValidExternalUrl } from "@/lib/link";

export const PortfolioLinkEditor = ({
  userFlowId,
  initialValue,
  initialDescription,
  applyGroup,
  applyGroupOptions,
  editable = true,
}: {
  userFlowId: number;
  initialValue: string | null;
  initialDescription?: string | null;
  applyGroup?: string | null;
  applyGroupOptions?: string[] | null;
  editable?: boolean;
}) => {
  const router = useRouter();
  const [value, setValue] = useState(initialValue ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [draft, setDraft] = useState(initialValue ?? "");
  const [draftDescription, setDraftDescription] = useState(initialDescription ?? "");
  const [group, setGroup] = useState(applyGroup ?? "");
  const [draftGroup, setDraftGroup] = useState(applyGroup ?? "");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasGroupOptions =
    Array.isArray(applyGroupOptions) && applyGroupOptions.length > 0;
  const hasLink = value.trim().length > 0;
  const href = externalHref(value);

  const startEditing = () => {
    setDraft(value);
    setDraftDescription(description);
    setDraftGroup(group);
    setError(null);
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraft(value);
    setDraftDescription(description);
    setDraftGroup(group);
    setError(null);
    setEditing(false);
  };

  const handleSave = async () => {
    if (!editable) {
      toast.error("流程已结束，报名信息不可修改");
      return;
    }
    if (!isValidExternalUrl(draft)) {
      setError("作品链接格式不正确，请填写有效的 URL");
      return;
    }
    if (hasGroupOptions && !draftGroup) {
      setError("请选择投递组别");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const normalizedDraft = draft.trim();
      const normalizedDescription = draftDescription.trim();
      const normalizedGroup = draftGroup.trim();
      const portfolioChanged =
        normalizedDraft !== value.trim() ||
        normalizedDescription !== description.trim();
      const groupChanged =
        hasGroupOptions && normalizedGroup !== group.trim();
      const operations = [];

      if (portfolioChanged) {
        operations.push(
          updatePortfolioLink(
            userFlowId,
            normalizedDraft,
            normalizedDescription,
          ),
        );
      }
      if (groupChanged) {
        operations.push(updateApplyGroup(userFlowId, normalizedGroup));
      }

      const results = await Promise.all(operations);
      const failed = results.find(
        (result) => (result as { success: boolean }).success === false,
      ) as { success: false; error?: { message?: string } } | undefined;
      if (failed) {
        setError(failed.error?.message ?? "保存失败");
        toast.error(failed.error?.message ?? "保存失败");
        return;
      }
      setValue(normalizedDraft);
      setDescription(normalizedDescription);
      setGroup(normalizedGroup);
      setEditing(false);
      toast.success("报名信息已保存");
      router.refresh();
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      {!editing ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-3">
            {hasGroupOptions && (
              <div className="space-y-1">
                <p className="text-sm font-medium">投递组别</p>
                <p className="text-xs text-muted-foreground">
                  {group || (editable ? "暂未填写" : "未填写（流程已结束）")}
                </p>
              </div>
            )}
            <div className="space-y-1">
              <p className="text-sm font-medium">作品链接</p>
              {hasLink && href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-start gap-1 break-all text-sm leading-5 text-foreground/85 underline decoration-muted-foreground/40 underline-offset-4 hover:text-primary hover:decoration-primary"
                >
                  <span>{value}</span>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </a>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {editable ? "暂未填写" : "未填写（流程已结束）"}
                </p>
              )}
              {description && (
                <p className="whitespace-pre-wrap text-sm leading-5 text-foreground/85">
                  {description}
                </p>
              )}
            </div>
            {!editable && (
              <p className="text-xs text-muted-foreground">流程已结束，报名信息已锁定</p>
            )}
          </div>
          {editable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={startEditing}
            >
              修改
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {hasGroupOptions && (
            <div className="space-y-1">
              <Label htmlFor="apply-group">投递组别</Label>
              <Select value={draftGroup} onValueChange={setDraftGroup}>
                <SelectTrigger
                  id="apply-group"
                  className="w-full text-left [&_[data-slot=select-value]]:flex-1 [&_[data-slot=select-value]]:justify-start [&_[data-slot=select-value]]:text-left"
                >
                  <SelectValue placeholder="选择投递组别" />
                </SelectTrigger>
                <SelectContent>
                  {applyGroupOptions!.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="portfolio-link">作品链接</Label>
            <Input
              id="portfolio-link"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              placeholder="https://..."
              inputMode="url"
              className="w-full"
              aria-invalid={Boolean(error)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="portfolio-description">作品简介</Label>
            <Textarea
              id="portfolio-description"
              value={draftDescription}
              onChange={(event) => setDraftDescription(event.target.value)}
              placeholder="简单介绍作品内容、你的负责部分和使用技术"
              className="min-h-24 resize-y"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              className="w-full sm:w-auto"
              disabled={saving}
              onClick={cancelEditing}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              className="w-full sm:w-auto"
              onClick={handleSave}
              loading={saving}
            >
              保存
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
