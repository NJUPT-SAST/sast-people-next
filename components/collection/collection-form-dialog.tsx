"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createCollectionForm,
  updateCollectionForm,
} from "@/action/collection";
import {
  COLLECTION_DEFAULT_INSTRUCTIONS,
  COLLECTION_DEFAULT_TITLE,
  COLLECTION_EXTRA_FIELD_TYPES,
  COLLECTION_FILL_ROLE_OPTIONS,
  COLLECTION_LINK_PREFILL_SOURCES,
  type CollectionExtraField,
  type CollectionExtraFieldType,
  type CollectionLinkPrefillSource,
} from "@/const/collection";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { parseBeijingDateTime, toBeijingWallClockDate } from "@/lib/timezone";

const EXTRA_FIELD_TYPE_LABELS: Record<CollectionExtraFieldType, string> = {
  text: "文本",
  textarea: "多行文本",
  number: "数字",
  select: "下拉单选",
};

const PREFILL_LABELS: Record<CollectionLinkPrefillSource, string> = {
  name: "姓名",
  studentId: "学号",
  college: "学院",
  major: "专业",
  email: "邮箱",
  qq: "QQ",
};

export type CollectionFormDialogData = {
  id: number;
  title: string;
  instructions: string;
  extraFields: CollectionExtraField[];
  allowedRoles: number[];
  startsAt: Date | null;
  deadline: Date | null;
};

type ExtraFieldDraft = {
  id: string;
  label: string;
  type: CollectionExtraFieldType;
  required: boolean;
  optionsText: string;
  prefillFrom: CollectionLinkPrefillSource | "none";
};

const createDraftField = (): ExtraFieldDraft => ({
  id: crypto.randomUUID(),
  label: "",
  type: "text",
  required: false,
  optionsText: "",
  prefillFrom: "none",
});

const toDraftField = (field: CollectionExtraField): ExtraFieldDraft => ({
  id: field.id,
  label: field.label,
  type: field.type,
  required: field.required,
  optionsText: field.options.join("\n"),
  prefillFrom: field.prefillFrom ?? "none",
});

export function CollectionFormDialog({
  mode = "create",
  form,
}: {
  mode?: "create" | "edit";
  form?: CollectionFormDialogData;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [extraFields, setExtraFields] = useState<ExtraFieldDraft[]>([]);
  const [startsAtValue, setStartsAtValue] = useState("");
  const [deadlineValue, setDeadlineValue] = useState("");
  const [unrestricted, setUnrestricted] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([1, 2, 3, 4]);

  const toggleRole = (role: number, checked: boolean) => {
    setSelectedRoles((current) =>
      checked
        ? Array.from(new Set([...current, role])).sort((a, b) => a - b)
        : current.filter((value) => value !== role),
    );
  };

  const updateField = (id: string, patch: Partial<ExtraFieldDraft>) => {
    setExtraFields((current) =>
      current.map((field) => (field.id === id ? { ...field, ...patch } : field)),
    );
  };

  const moveField = (index: number, delta: number) => {
    setExtraFields((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const resetFromForm = () => {
    setExtraFields((form?.extraFields ?? []).map(toDraftField));
    setStartsAtValue(
      form?.startsAt
        ? format(toBeijingWallClockDate(form.startsAt), "yyyy-MM-dd'T'HH:mm")
        : "",
    );
    setDeadlineValue(
      form?.deadline
        ? format(toBeijingWallClockDate(form.deadline), "yyyy-MM-dd'T'HH:mm")
        : "",
    );
    setUnrestricted((form?.allowedRoles.length ?? 0) === 0 && Boolean(form));
    setSelectedRoles(form ? [...form.allowedRoles] : [1, 2, 3, 4]);
  };

  const handleOpenChange = (next: boolean) => {
    if (next) resetFromForm();
    setOpen(next);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const rawStartsAt = String(formData.get("startsAt") ?? "").trim();
    const rawDeadline = String(formData.get("deadline") ?? "").trim();
    const startsAt = rawStartsAt ? parseBeijingDateTime(rawStartsAt) : null;
    const deadline = rawDeadline ? parseBeijingDateTime(rawDeadline) : null;
    if (rawStartsAt && !startsAt) {
      toast.error("开始时间格式无效");
      return;
    }
    if (rawDeadline && !deadline) {
      toast.error("截止时间格式无效");
      return;
    }
    if (startsAt && deadline && startsAt >= deadline) {
      toast.error("开始时间必须早于截止时间");
      return;
    }
    if (!unrestricted && selectedRoles.length === 0) {
      toast.error("请选择至少一个身份，或勾选不限制身份");
      return;
    }

    const payload = {
      title: String(formData.get("title") ?? ""),
      instructions: String(formData.get("instructions") ?? ""),
      extraFields: extraFields.map((field) => ({
        id: field.id,
        label: field.label.trim(),
        type: field.type,
        required: field.required,
        options:
          field.type === "select"
            ? field.optionsText
                .split(/[\n,，]/)
                .map((option) => option.trim())
                .filter(Boolean)
            : [],
        ...(field.prefillFrom !== "none"
          ? { prefillFrom: field.prefillFrom }
          : {}),
      })),
      allowedRoles: unrestricted ? [] : selectedRoles,
      startsAt: startsAt ? startsAt.getTime() : null,
      deadline: deadline ? deadline.getTime() : null,
    };

    setSubmitting(true);
    try {
      if (mode === "edit") {
        if (!form) throw new Error("收集表不存在");
        const result = await updateCollectionForm(form.id, payload);
        if (!result.success) throw new Error(result.message);
        toast.success("收集表已更新");
        setOpen(false);
        router.refresh();
      } else {
        const result = await createCollectionForm(payload);
        if (!result.success) throw new Error(result.message);
        setOpen(false);
        toast.success("收集表已发起");
        router.push(`/dashboard/collection/${result.data?.id}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {mode === "edit" ? (
          <Button variant="outline">
            <Pencil /> 编辑收集表
          </Button>
        ) : (
          <Button>新建收集表</Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "编辑收集表" : "新建收集表"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "可修改标题、说明、收集项、身份与开始/截止时间；已提交的答案按收集项保留。"
              : "选择填写身份与开放时间；发起后可随时编辑。"}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-form-title">标题</Label>
            <Input
              id="collection-form-title"
              name="title"
              required
              maxLength={120}
              defaultValue={form?.title ?? COLLECTION_DEFAULT_TITLE}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-form-starts-at">开始时间（北京时间）</Label>
            <Input
              id="collection-form-starts-at"
              name="startsAt"
              type="datetime-local"
              value={startsAtValue}
              onChange={(event) => setStartsAtValue(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              留空表示立即开始；到点前填写页只显示说明，不能提交。
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-form-deadline">截止时间（北京时间）</Label>
            <Input
              id="collection-form-deadline"
              name="deadline"
              type="datetime-local"
              value={deadlineValue}
              onChange={(event) => setDeadlineValue(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              留空表示不设截止；到点后自动停止接收，延长截止时间即可恢复。
            </p>
          </div>

          <div className="space-y-3 rounded-lg border border-border/70 p-3">
            <div>
              <p className="text-sm font-medium text-foreground">填写身份</p>
              <p className="text-xs text-muted-foreground">
                直接勾选允许填写的身份；不勾选任何限制时所有登录用户都可填写。
              </p>
            </div>
            <label className="flex w-fit items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={unrestricted}
                onCheckedChange={(checked) => setUnrestricted(checked === true)}
              />
              不限制身份（所有登录用户）
            </label>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {COLLECTION_FILL_ROLE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex w-fit items-center gap-2 text-sm text-foreground"
                >
                  <Checkbox
                    checked={!unrestricted && selectedRoles.includes(option.value)}
                    disabled={unrestricted}
                    onCheckedChange={(checked) =>
                      toggleRole(option.value, checked === true)
                    }
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-form-instructions">填表说明</Label>
            <Textarea
              id="collection-form-instructions"
              name="instructions"
              rows={9}
              maxLength={5000}
              defaultValue={form?.instructions ?? COLLECTION_DEFAULT_INSTRUCTIONS}
            />
          </div>

          <div className="space-y-3 rounded-lg border border-border/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">自定义收集项</p>
                <p className="text-xs text-muted-foreground">
                  在固定成员字段之外追加，例如「是否愿意参与迎新」；可从 SAST Link 自动带入姓名、学号、学院、专业、邮箱、QQ。
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExtraFields((current) => [...current, createDraftField()])}
              >
                <Plus /> 添加收集项
              </Button>
            </div>

            {extraFields.map((field, index) => (
              <div key={field.id} className="space-y-3 rounded-md border border-border/60 p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Label htmlFor={`extra-label-${field.id}`}>收集项名称</Label>
                    <Input
                      id={`extra-label-${field.id}`}
                      value={field.label}
                      maxLength={60}
                      placeholder={`第 ${index + 1} 项，例如：是否愿意参与迎新`}
                      onChange={(event) => updateField(field.id, { label: event.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-6 shrink-0 text-muted-foreground"
                    title="上移"
                    aria-label="上移收集项"
                    disabled={index === 0}
                    onClick={() => moveField(index, -1)}
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-6 shrink-0 text-muted-foreground"
                    title="下移"
                    aria-label="下移收集项"
                    disabled={index === extraFields.length - 1}
                    onClick={() => moveField(index, 1)}
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-6 shrink-0 text-muted-foreground"
                    title="删除收集项"
                    aria-label="删除收集项"
                    onClick={() =>
                      setExtraFields((current) =>
                        current.filter((item) => item.id !== field.id),
                      )
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>类型</Label>
                    <Select
                      value={field.type}
                      onValueChange={(value) =>
                        updateField(field.id, {
                          type: value as CollectionExtraFieldType,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLLECTION_EXTRA_FIELD_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {EXTRA_FIELD_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>自动读取 SAST Link</Label>
                    <Select
                      value={field.prefillFrom}
                      onValueChange={(value) =>
                        updateField(field.id, {
                          prefillFrom: value as CollectionLinkPrefillSource | "none",
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">不自动读取</SelectItem>
                        {COLLECTION_LINK_PREFILL_SOURCES.map((source) => (
                          <SelectItem key={source} value={source}>
                            {PREFILL_LABELS[source]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {field.type === "select" && (
                  <div className="space-y-2">
                    <Label htmlFor={`extra-options-${field.id}`}>
                      选项（换行或逗号分隔）
                    </Label>
                    <Textarea
                      id={`extra-options-${field.id}`}
                      rows={3}
                      value={field.optionsText}
                      onChange={(event) =>
                        updateField(field.id, { optionsText: event.target.value })
                      }
                      placeholder={"是\n否\n不确定"}
                    />
                  </div>
                )}

                <label className="flex w-fit items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={field.required}
                    onCheckedChange={(checked) =>
                      updateField(field.id, { required: checked === true })
                    }
                  />
                  必填
                </label>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" loading={submitting}>
              {mode === "edit" ? "保存修改" : "创建收集表"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
