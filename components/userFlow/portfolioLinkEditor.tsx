"use client";

import { useState } from "react";
import { ExternalLink, Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { updatePortfolioLink } from "@/action/user-flow/portfolio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { externalHref } from "@/lib/link";

export const PortfolioLinkEditor = ({
  userFlowId,
  initialValue,
  editable = true,
}: {
  userFlowId: number;
  initialValue: string | null;
  editable?: boolean;
}) => {
  const [value, setValue] = useState(initialValue ?? "");
  const [draft, setDraft] = useState(initialValue ?? "");
  const [editing, setEditing] = useState(editable && !initialValue);
  const [saving, setSaving] = useState(false);
  const hasLink = value.trim().length > 0;
  const href = externalHref(value);
  const canEdit = editable;

  const handleSave = async () => {
    if (!canEdit) {
      toast.error("流程已结束，作品链接不可修改");
      return;
    }
    setSaving(true);
    try {
      const result = await updatePortfolioLink(userFlowId, draft);
      if (!result.success) {
        toast.error(result.error?.message ?? "保存失败");
        return;
      }
      setValue(draft.trim());
      setEditing(false);
      toast.success("作品链接已保存");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              {canEdit ? "暂未填写" : "未填写（流程已结束）"}
            </p>
          ) : null}
          {!canEdit && (
            <p className="text-xs text-muted-foreground">
              流程已结束，作品链接已锁定
            </p>
          )}
        </div>
        {canEdit && !editing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full sm:w-auto"
            onClick={() => {
              setDraft(value);
              setEditing(true);
            }}
          >
            <Pencil className="h-4 w-4" />
            修改
          </Button>
        )}
      </div>
      {canEdit && editing && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="https://..."
            inputMode="url"
            className="min-w-0"
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
      )}
    </div>
  );
};
