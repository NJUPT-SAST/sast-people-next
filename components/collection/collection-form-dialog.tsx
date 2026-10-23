"use client";

import { FormEvent, type ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ArrowDown, ArrowUp, ChevronRight, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createCollectionForm,
  updateCollectionForm,
} from "@/action/collection";
import {
  saveCollectionTemplate,
  deleteCollectionTemplate,
} from "@/action/collection-template";
import {
  COLLECTION_CUSTOM_DEFAULT_INSTRUCTIONS,
  COLLECTION_CUSTOM_DEFAULT_TITLE,
  COLLECTION_DEFAULT_INSTRUCTIONS,
  COLLECTION_DEFAULT_TITLE,
  COLLECTION_EXTRA_FIELD_TYPES,
  COLLECTION_EXTRA_FIELD_TYPE_LABELS,
  COLLECTION_FILL_ROLE_OPTIONS,
  COLLECTION_LINK_PREFILL_SOURCES,
  COLLECTION_MEMBER_TEMPLATE_FIELDS,
  COLLECTION_OPTION_FIELD_TYPES,
  COLLECTION_PREFILLABLE_FIELD_TYPES,
  type CollectionExtraField,
  type CollectionExtraFieldType,
  type CollectionFlowOption,
  type CollectionLinkPrefillSource,
  type CollectionTemplateOption,
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
import { DateTimeInput } from "@/components/ui/datetime-input";
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
import { cn } from "@/lib/utils";

const PREFILL_LABELS: Record<CollectionLinkPrefillSource, string> = {
  name: "姓名",
  studentId: "学号",
  college: "学院",
  major: "专业",
  email: "邮箱",
  qq: "QQ",
};

function TabPanel({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return active ? <>{children}</> : null;
}

export type CollectionFormDialogData = {
  id: number;
  title: string;
  templateName: string;
  instructions: string;
  extraFields: CollectionExtraField[];
  allowedRoles: number[];
  allowedFlowIds: number[];
  startsAt: Date | null;
  deadline: Date | null;
};

type ExtraFieldDraft = {
  id: string;
  label: string;
  type: CollectionExtraFieldType;
  required: boolean;
  optionsText: string;
  description: string;
  placeholder: string;
  fixedValue: string;
  prefillFrom: CollectionLinkPrefillSource | "none";
};

const createDraftField = (): ExtraFieldDraft => ({
  id: crypto.randomUUID(),
  label: "",
  type: "text",
  required: false,
  optionsText: "",
  description: "",
  placeholder: "",
  fixedValue: "",
  prefillFrom: "none",
});

const toDraftField = (field: CollectionExtraField): ExtraFieldDraft => ({
  id: field.id,
  label: field.label,
  type: field.type,
  required: field.required,
  optionsText: field.options.join("\n"),
  description: field.description ?? "",
  placeholder: field.placeholder ?? "",
  fixedValue: field.fixedValue ?? "",
  prefillFrom: field.prefillFrom ?? "none",
});

export function CollectionFormDialog({
  mode = "create",
  form,
  flows = [],
  templates = [],
}: {
  mode?: "create" | "edit";
  form?: CollectionFormDialogData;
  flows?: CollectionFlowOption[];
  templates?: CollectionTemplateOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"basic" | "fields" | "access">(
    "basic",
  );
  const [templateOptions, setTemplateOptions] =
    useState<CollectionTemplateOption[]>(templates);
  const [templateKey, setTemplateKey] = useState("member");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [title, setTitle] = useState(COLLECTION_DEFAULT_TITLE);
  const [instructions, setInstructions] = useState(
    COLLECTION_DEFAULT_INSTRUCTIONS,
  );
  const [extraFields, setExtraFields] = useState<ExtraFieldDraft[]>([]);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());
  const [startsAtValue, setStartsAtValue] = useState("");
  const [deadlineValue, setDeadlineValue] = useState("");
  const [unrestricted, setUnrestricted] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([1, 2, 3, 4]);
  const [selectedFlowIds, setSelectedFlowIds] = useState<number[]>([]);
  const [flowPickerOpen, setFlowPickerOpen] = useState(false);
  const [flowQuery, setFlowQuery] = useState("");

  const toggleFlow = (flowId: number, checked: boolean) => {
    setSelectedFlowIds((current) =>
      checked
        ? Array.from(new Set([...current, flowId]))
        : current.filter((value) => value !== flowId),
    );
  };
  const visibleFlows = flows.filter((flow) =>
    flow.label.toLowerCase().includes(flowQuery.trim().toLowerCase()),
  );

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

  const buildFieldPayload = () =>
    extraFields.map((field) => ({
      id: field.id,
      label: field.label.trim(),
      type: field.type,
      required: field.required,
      options:
        COLLECTION_OPTION_FIELD_TYPES[field.type]
          ? field.optionsText
              .split(/[\n,，]/)
              .map((option) => option.trim())
              .filter(Boolean)
          : [],
      ...(field.description.trim()
        ? { description: field.description.trim() }
        : {}),
      ...(field.placeholder.trim()
        ? { placeholder: field.placeholder.trim() }
        : {}),
      ...(field.fixedValue.trim() ? { fixedValue: field.fixedValue.trim() } : {}),
      ...(COLLECTION_PREFILLABLE_FIELD_TYPES[field.type] &&
      field.prefillFrom !== "none"
        ? { prefillFrom: field.prefillFrom }
        : {}),
    }));

  const toggleFieldExpanded = (id: string) => {
    setExpandedFields((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addField = () => {
    const draft = createDraftField();
    setExtraFields((current) => [...current, draft]);
    setExpandedFields((current) => new Set(current).add(draft.id));
  };

  const allFieldsExpanded =
    extraFields.length > 0 &&
    extraFields.every((field) => expandedFields.has(field.id));

  const toggleAllFields = () => {
    setExpandedFields(
      allFieldsExpanded
        ? new Set()
        : new Set(extraFields.map((field) => field.id)),
    );
  };

  const resetFromForm = () => {
    const matched = form
      ? templateOptions.find((template) => template.name === form.templateName)
      : undefined;
    const defaultTemplate =
      templateOptions.find((template) => template.key === "member") ??
      templateOptions[0];
    setTemplateKey(form ? (matched?.key ?? "__current__") : (defaultTemplate?.key ?? "member"));
    setTitle(
      form?.title ??
        (defaultTemplate?.key === "member"
          ? COLLECTION_DEFAULT_TITLE
          : COLLECTION_CUSTOM_DEFAULT_TITLE),
    );
    setInstructions(
      form?.instructions ??
        (defaultTemplate?.key === "member"
          ? COLLECTION_DEFAULT_INSTRUCTIONS
          : COLLECTION_CUSTOM_DEFAULT_INSTRUCTIONS),
    );
    setExtraFields(
      (form?.extraFields ?? defaultTemplate?.fields ?? COLLECTION_MEMBER_TEMPLATE_FIELDS).map(
        toDraftField,
      ),
    );
    setExpandedFields(new Set());
    setActiveTab("basic");
    setNewTemplateName("");
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
    setSelectedFlowIds(form ? [...form.allowedFlowIds] : []);
    setFlowPickerOpen((form?.allowedFlowIds.length ?? 0) > 0);
    setFlowQuery("");
  };

  const handleTemplateChange = (nextKey: string) => {
    const template = templateOptions.find((option) => option.key === nextKey);
    if (!template) return;
    setTemplateKey(nextKey);
    setExtraFields(template.fields.map(toDraftField));
    setExpandedFields(new Set());
    if (
      !title.trim() ||
      title.trim() === COLLECTION_DEFAULT_TITLE ||
      title.trim() === COLLECTION_CUSTOM_DEFAULT_TITLE ||
      templateOptions.some((option) => option.name === title.trim())
    ) {
      setTitle(template.name);
    }
    if (
      !instructions.trim() ||
      instructions.trim() === COLLECTION_DEFAULT_INSTRUCTIONS ||
      instructions.trim() === COLLECTION_CUSTOM_DEFAULT_INSTRUCTIONS
    ) {
      setInstructions(
        template.key === "member"
          ? COLLECTION_DEFAULT_INSTRUCTIONS
          : COLLECTION_CUSTOM_DEFAULT_INSTRUCTIONS,
      );
    }
  };

  const handleSaveTemplate = async () => {
    const name = newTemplateName.trim();
    if (!name) {
      toast.error("请填写模板名称");
      return;
    }
    setSavingTemplate(true);
    try {
      const fields = buildFieldPayload();
      const result = await saveCollectionTemplate({ name, fields });
      if (!result.success) throw new Error(result.message);
      const savedId = result.data?.id ?? null;
      const option: CollectionTemplateOption = {
        id: savedId,
        key: savedId ? `db:${savedId}` : name,
        name,
        description: "",
        fields: fields as CollectionExtraField[],
      };
      setTemplateOptions((current) => [
        ...current.filter(
          (item) => item.name !== name && (savedId === null || item.id !== savedId),
        ),
        option,
      ]);
      setTemplateKey(option.key);
      setNewTemplateName("");
      toast.success("模板已保存");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存模板失败");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async () => {
    const current = templateOptions.find((option) => option.key === templateKey);
    if (!current?.id) {
      toast.error("内置模板不能删除");
      return;
    }
    setSavingTemplate(true);
    try {
      const result = await deleteCollectionTemplate(current.id);
      if (!result.success) throw new Error(result.message);
      setTemplateOptions((items) => items.filter((item) => item.id !== current.id));
      setTemplateKey("blank");
      toast.success("模板已删除");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除模板失败");
    } finally {
      setSavingTemplate(false);
    }
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
      kind: templateKey === "member" ? ("member" as const) : ("custom" as const),
      templateName:
        templateOptions.find((option) => option.key === templateKey)?.name ??
        COLLECTION_CUSTOM_DEFAULT_TITLE,
      title,
      instructions,
      extraFields: buildFieldPayload(),
      allowedRoles: unrestricted ? [] : selectedRoles,
      allowedFlowIds: selectedFlowIds,
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
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "编辑收集表" : "新建收集表"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "可修改标题、说明、模板与全部收集项；已提交的答案按字段保留。"
              : "选择模板后可以继续修改字段，也可以把当前字段另存为新模板。"}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="flex flex-wrap gap-1 rounded-lg border border-border/70 bg-muted/30 p-1">
            {(
              [
                { key: "basic", label: "模板与标题" },
                { key: "fields", label: `收集项 (${extraFields.length})` },
                { key: "access", label: "权限与时间" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={(event) => {
                  setActiveTab(tab.key);
                  const dialog = event.currentTarget.closest('[role="dialog"]');
                  if (dialog instanceof HTMLElement) {
                    dialog.scrollTo({ top: 0 });
                  }
                }}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  activeTab === tab.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <TabPanel active={activeTab === "basic"}>
          <div className="space-y-2 rounded-lg border border-border/70 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Label htmlFor="collection-form-template">模板</Label>
                <Select value={templateKey} onValueChange={handleTemplateChange}>
                  <SelectTrigger id="collection-form-template">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {templateKey === "__current__" && form && (
                      <SelectItem value="__current__">{form.templateName}</SelectItem>
                    )}
                    {templateOptions.map((template) => (
                      <SelectItem key={template.key} value={template.key}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {templateOptions.find((option) => option.key === templateKey)?.id ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  loading={savingTemplate}
                  onClick={handleDeleteTemplate}
                >
                  <Trash2 /> 删除模板
                </Button>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {templateOptions.find((option) => option.key === templateKey)
                ?.description ??
                "切换模板会替换下面的收集项；已提交的答案按字段 ID 保留。"}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                value={newTemplateName}
                onChange={(event) => setNewTemplateName(event.target.value)}
                maxLength={60}
                placeholder="新模板名称（同名会覆盖原模板）"
                className="sm:max-w-xs"
                aria-label="新模板名称"
              />
              <Button
                type="button"
                variant="outline"
                loading={savingTemplate}
                onClick={handleSaveTemplate}
              >
                另存为模板
              </Button>
            </div>
          </div>
          </TabPanel>
          <TabPanel active={activeTab === "basic"}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-form-title">标题</Label>
            <Input
              id="collection-form-title"
              name="title"
              required
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          </TabPanel>
          <TabPanel active={activeTab === "access"}>
          <div className="flex flex-col gap-2">
            <Label>开始时间（北京时间）</Label>
            <DateTimeInput
              value={parseBeijingDateTime(startsAtValue) ?? undefined}
              onChange={(date) =>
                setStartsAtValue(
                  date ? format(toBeijingWallClockDate(date), "yyyy-MM-dd'T'HH:mm") : "",
                )
              }
              clearable
            />
            <p className="text-xs text-muted-foreground">
              留空表示立即开始；到点前填写页只显示说明，不能提交。
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label>截止时间（北京时间）</Label>
            <DateTimeInput
              value={parseBeijingDateTime(deadlineValue) ?? undefined}
              onChange={(date) =>
                setDeadlineValue(
                  date ? format(toBeijingWallClockDate(date), "yyyy-MM-dd'T'HH:mm") : "",
                )
              }
              clearable
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

          <div className="space-y-3 rounded-lg border border-border/70 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">限定流程（可选）</p>
                <p className="text-xs text-muted-foreground">
                  仅所选流程最终通过的人可以填写；不选则不限制。身份与流程条件需同时满足。
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  已选 {selectedFlowIds.length} 个
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={flows.length === 0}
                  onClick={() => setFlowPickerOpen((value) => !value)}
                >
                  {flowPickerOpen ? "收起流程" : "选择流程"}
                </Button>
              </div>
            </div>
            {flows.length === 0 ? (
              <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
                暂无可选流程。
              </p>
            ) : flowPickerOpen ? (
              <>
                <Input
                  value={flowQuery}
                  onChange={(event) => setFlowQuery(event.target.value)}
                  placeholder="搜索流程名称…"
                  aria-label="搜索限定流程"
                />
                <div
                  className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-border/60 p-2"
                  style={{ contain: "content" }}
                >
                  {visibleFlows.map((flow) => {
                    const optionId = `collection-flow-${flow.id}`;
                    return (
                      <div key={flow.id} className="flex items-start gap-2 rounded px-1 py-1 hover:bg-accent">
                        <Checkbox
                          id={optionId}
                          checked={selectedFlowIds.includes(flow.id)}
                          onCheckedChange={(checked) =>
                            toggleFlow(flow.id, checked === true)
                          }
                        />
                        <Label
                          htmlFor={optionId}
                          className="cursor-pointer font-normal leading-5"
                        >
                          {flow.label}
                        </Label>
                      </div>
                    );
                  })}
                  {visibleFlows.length === 0 && (
                    <p className="px-1 py-3 text-center text-xs text-muted-foreground">
                      没有匹配的流程。
                    </p>
                  )}
                </div>
              </>
            ) : null}
          </div>
          </TabPanel>
          <TabPanel active={activeTab === "basic"}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="collection-form-instructions">填表说明</Label>
            <Textarea
              id="collection-form-instructions"
              name="instructions"
              rows={9}
              maxLength={5000}
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
            />
          </div>
          </TabPanel>
          <TabPanel active={activeTab === "fields"}>
          <div className="space-y-3 rounded-lg border border-border/70 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">
                  收集项
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    已添加 {extraFields.length} 项
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  所有字段都可以改名称、类型、选项与必填；支持文本、数字、单选、多选、日期、年月、时间、邮箱、链接、手机号与评分。
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={toggleAllFields}
                  disabled={extraFields.length === 0}
                >
                  {allFieldsExpanded ? "全部收起" : "全部展开"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addField}
                >
                  <Plus /> 添加收集项
                </Button>
              </div>
            </div>

            {extraFields.length === 0 && (
              <div className="rounded-md border border-dashed border-border/70 px-4 py-8 text-center">
                <p className="text-sm font-medium text-foreground">还没有自定义收集项</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  收集项全部可编辑；不添加时填写页只显示说明和提交按钮。
                </p>
              </div>
            )}

            {extraFields.map((field, index) => {
              const expanded = expandedFields.has(field.id);
              return (
              <div key={field.id} className="rounded-md border border-border/60">
                <div className="flex items-center gap-1 px-3 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    onClick={() => toggleFieldExpanded(field.id)}
                    aria-expanded={expanded}
                  >
                    <ChevronRight
                      className={
                        expanded
                          ? "size-4 shrink-0 rotate-90 text-muted-foreground transition-transform"
                          : "size-4 shrink-0 text-muted-foreground transition-transform"
                      }
                    />
                    <span className="truncate text-sm font-medium">
                      {field.label || `收集项 ${index + 1}`}
                    </span>
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                      {COLLECTION_EXTRA_FIELD_TYPE_LABELS[field.type]}
                    </span>
                    {field.required && (
                      <span className="shrink-0 text-[11px] text-destructive">
                        必填
                      </span>
                    )}
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground"
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
                    className="shrink-0 text-muted-foreground"
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
                    className="shrink-0 text-muted-foreground"
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

                <div className={expanded ? "space-y-3 border-t border-border/60 p-3" : "hidden"}>
                  <div className="space-y-2">
                    <Label htmlFor={`extra-label-${field.id}`}>收集项名称</Label>
                    <Input
                      id={`extra-label-${field.id}`}
                      value={field.label}
                      maxLength={60}
                      placeholder={`第 ${index + 1} 项，例如：是否愿意参与迎新`}
                      onChange={(event) => updateField(field.id, { label: event.target.value })}
                    />
                  </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor={`extra-description-${field.id}`}>
                      填写提示（可选）
                    </Label>
                    <Input
                      id={`extra-description-${field.id}`}
                      value={field.description}
                      maxLength={200}
                      placeholder="例如：请填写完整学院名称"
                      onChange={(event) =>
                        updateField(field.id, { description: event.target.value })
                      }
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor={`extra-placeholder-${field.id}`}>
                      输入框占位提示（可选）
                    </Label>
                    <Input
                      id={`extra-placeholder-${field.id}`}
                      value={field.placeholder}
                      maxLength={200}
                      placeholder="例如 B240101"
                      onChange={(event) =>
                        updateField(field.id, { placeholder: event.target.value })
                      }
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor={`extra-fixed-${field.id}`}>
                      固定值（可选，只读展示）
                    </Label>
                    <Input
                      id={`extra-fixed-${field.id}`}
                      value={field.fixedValue}
                      maxLength={500}
                      placeholder="例如组织名称"
                      onChange={(event) =>
                        updateField(field.id, { fixedValue: event.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>类型</Label>
                    <Select
                      value={field.type}
                      onValueChange={(value) => {
                        const type = value as CollectionExtraFieldType;
                        updateField(field.id, {
                          type,
                          ...(COLLECTION_PREFILLABLE_FIELD_TYPES[type]
                            ? {}
                            : { prefillFrom: "none" as const }),
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {COLLECTION_EXTRA_FIELD_TYPES.map((type) => (
                          <SelectItem key={type} value={type}>
                            {COLLECTION_EXTRA_FIELD_TYPE_LABELS[type]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {COLLECTION_PREFILLABLE_FIELD_TYPES[field.type] && (
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
                  )}
                </div>

                {COLLECTION_OPTION_FIELD_TYPES[field.type] && (
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
              </div>
              );
            })}
          </div>
          </TabPanel>

          <DialogFooter className="border-t border-border/70 pt-3">
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
