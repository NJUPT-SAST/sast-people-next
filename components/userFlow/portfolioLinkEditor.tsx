"use client";

import { useState } from "react";
import { ExternalLink, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { updatePortfolioLink } from "@/action/user-flow/portfolio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { externalHref, isValidExternalUrl } from "@/lib/link";

export const PortfolioLinkEditor = ({
  userFlowId,
  initialValue,
  initialDescription,
  editable = true,
}: {
  userFlowId: number;
  initialValue: string | null;
  initialDescription?: string | null;
  editable?: boolean;
}) => {
  const [value, setValue] = useState(initialValue ?? "");
  const [description, setDescription] = useState(initialDescription ?? "");
  const [draft, setDraft] = useState(initialValue ?? "");
  const [draftDescription, setDraftDescription] = useState(initialDescription ?? "");
  const [editing, setEditing] = useState(editable && !initialValue);
  const [saving, setSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const hasLink = value.trim().length > 0;
  const href = externalHref(value);

  const handleSave = async () => {
    if (!editable) {
      toast.error("流程已结束，作品信息不可修改");
      return;
    }
    if (!isValidExternalUrl(draft)) {
      setLinkError("作品链接格式不正确，请填写有效的 URL");
      return;
    }
    setLinkError(null);
    setSaving(true);
    try {
      const result = await updatePortfolioLink(userFlowId, draft, draftDescription);
      if (!result.success) {
        toast.error(result.error?.message ?? "保存失败");
        return;
      }
      setValue(draft.trim());
      setDescription(draftDescription.trim());
      setEditing(false);
      toast.success("作品信息已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">作品链接</p>
          {!editing && hasLink && href ? (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 text-xs text-primary hover:underline"
            >
              <span className="truncate">{value}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
            </a>
          ) : !editing ? (
            <p className="text-xs text-muted-foreground">
              {editable ? "暂未填写" : "未填写（流程已结束）"}
            </p>
          ) : null}
          {!editing && description && (
            <p className="max-w-2xl whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
              {description}
            </p>
          )}
          {!editable && (
            <p className="text-xs text-muted-foreground">流程已结束，作品信息已锁定</p>
          )}
        </div>
        {editable && !editing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => {
              setDraft(value);
              setDraftDescription(description);
              setEditing(true);
            }}
          >
            <Pencil className="h-4 w-4" />
            修改
          </Button>
        )}
      </div>
      {editable && editing && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (linkError) setLinkError(null);
              }}
              placeholder="https://..."
              inputMode="url"
              className="min-w-0"
              aria-invalid={Boolean(linkError)}
            />
            <Button
              type="button"
              size="sm"
              className="w-full sm:w-auto"
              onClick={handleSave}
              loading={saving}
            >
              <Save className="h-4 w-4" />
              保存
            </Button>
          </div>
          {linkError && (
            <p role="alert" className="text-sm text-destructive">
              {linkError}
            </p>
          )}
          <Textarea
            value={draftDescription}
            onChange={(event) => setDraftDescription(event.target.value)}
            placeholder="简单介绍作品内容、你的负责部分和使用技术"
            className="min-h-24 resize-y"
            aria-label="作品简介"
          />
        </div>
      )}
    </div>
  );
};
