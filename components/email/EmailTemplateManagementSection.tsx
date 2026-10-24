"use client";

import {
  resetCollectionInvitationTemplate,
  updateCollectionInvitationTemplate,
} from "@/action/email/collection-template";
import { sendEmailTest } from "@/action/email/test-send";
import type { EmailStylePresetRow } from "@/action/email/style-preset";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { departmentCategory, departmentLabel } from "@/const/department";
import {
  departmentSupportsStage,
  emailTemplateFlowType,
  emailTemplateLabel,
  emailTemplateStageCategory,
  emailTemplateStageIndex,
} from "@/const/flow";
import { cn } from "@/lib/utils";
import { Save, Send, Settings2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { EmailInterviewTemplateDialog } from "./EmailInterviewTemplateDialog";
import { EmailResultTemplateDialog } from "./EmailResultTemplateDialog";
import { EmailTemplateScopeSelector } from "./EmailTemplateScopeSelector";
import type { EmailTemplateVariable } from "./email-variables";
import { emailCategoryText, hiddenScrollbar } from "./emailDashboardConstants";
import { PreviewDialog } from "./emailDashboardDialogs";
import type {
  CollectionInvitationTemplatePanel,
  EmailTemplateDefinition,
  InterviewSchedulePreviews,
  InterviewTemplateSettingsResult,
  ResultEmailPreviews,
  TemplateSettingsResult,
} from "./emailDashboardTypes";
import {
  getTemplateRowStatusLabel,
  groupTemplateRowsByKey,
  normalizeTemplateDepartment,
  type TemplateRowStatus,
} from "./emailDashboardUtils";

/** 生效内容来源的徽章：本部门/其他部门的覆盖是要人注意的例外，全局默认只是常态说明 */
function TemplateOverrideBadge({
  status,
  readOnly,
}: {
  status: TemplateRowStatus;
  readOnly: boolean;
}) {
  const tone: Record<TemplateRowStatus, string> = {
    "department-override": "border-primary/40 bg-muted/60 text-primary",
    "global-fallback": "text-muted-foreground",
    "global-default": "text-muted-foreground",
    "other-department": "border-chart-3/50 bg-chart-3/5 text-muted-foreground",
    missing: "border-dashed text-muted-foreground",
  };
  const pill = status === "department-override" || status === "other-department" || status === "missing";

  return (
    <span
      className={cn(
        "shrink-0 rounded-full text-[11px] leading-4 whitespace-nowrap",
        pill ? "border px-2 py-0.5" : "px-0.5",
        tone[status],
      )}
    >
      {getTemplateRowStatusLabel(status, { readOnly })}
    </span>
  );
}

/* 归属说明只在板块头部写一次（scopeSummary）：卡片上逐张重复同一句话纯属噪音，
   每张卡片真正需要区分的是「当前生效内容来自哪里」，那由 TemplateOverrideBadge 表达。 */

function getTargetLabel(department: string | null) {
  return department ? `「${departmentLabel(department)}」` : "全局默认";
}

/** 模板注册表里的变量 → 画布上「插入变量」菜单的条目（分组名说明这些值从哪来） */
function runtimeVariablesOf(
  definition: EmailTemplateDefinition | undefined,
): EmailTemplateVariable[] {
  if (!definition) return [];
  return definition.variables.map((variable) => ({
    key: variable.key,
    label: variable.label,
    group: "运行时数据（发送时自动填）",
    example: variable.example,
  }));
}

function createCollectionTemplateValues(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    subjectTemplate: String(data.get("subjectTemplate") ?? ""),
    titleTemplate: String(data.get("titleTemplate") ?? ""),
    bodyTemplate: String(data.get("bodyTemplate") ?? ""),
    footerText: String(data.get("footerText") ?? ""),
  };
}
/** collection 邀请模板表单里的单行字段(非受控,随表单一次性取值) */
function TemplateField({
  id,
  name,
  label,
  defaultValue,
  className,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={id} name={name} defaultValue={defaultValue} className="min-w-0" />
    </div>
  );
}

function CollectionInvitationTemplateDialog({
  setting,
  previewHtml,
}: {
  setting: CollectionInvitationTemplatePanel["setting"];
  previewHtml: string;
}) {
  const router = useRouter();
  const editable = setting.editable;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-0 flex-1">
          <Settings2 data-icon="inline-start" />
          {editable ? "编辑模板" : "查看模板"}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto",
          hiddenScrollbar,
        )}
      >
        <DialogHeader>
          <DialogTitle>收集表邀请通知</DialogTitle>
          <DialogDescription>
            全局模板，邀请成员填写收集表时使用；不包含邀请人姓名。
            {editable
              ? "保存后所有新发送的邀请都会使用这里的文案。"
              : "当前为只读浏览，仅管理员可编辑全局模板。"}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const values = createCollectionTemplateValues(event.currentTarget);
            toast.promise(
              updateCollectionInvitationTemplate(values).then((result) => {
                if (!result.ok) throw new Error(result.message);
                router.refresh();
              }),
              {
                loading: "正在保存模板",
                success: "收集表邀请模板已保存",
                error: (error) =>
                  error instanceof Error ? error.message : "保存失败",
              },
            );
          }}
        >
          <fieldset disabled={!editable} className="grid gap-4">
            <div className="grid min-w-0 gap-3 rounded-lg border bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">邮件内容</p>
              <TemplateField
                id="collection-subject-template"
                name="subjectTemplate"
                label="邮件标题"
                defaultValue={setting.subjectTemplate}
              />
              <TemplateField
                id="collection-title-template"
                name="titleTemplate"
                label="邮件主标题"
                defaultValue={setting.titleTemplate}
              />
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label
                  htmlFor="collection-body-template"
                  className="text-xs text-muted-foreground"
                >
                  正文
                </Label>
                <Textarea
                  id="collection-body-template"
                  name="bodyTemplate"
                  defaultValue={setting.bodyTemplate}
                  className="min-h-[132px] resize-y bg-background"
                />
              </div>
              <TemplateField
                id="collection-footer-text"
                name="footerText"
                label="落款"
                defaultValue={setting.footerText}
              />
            </div>
          </fieldset>

          <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
            <p>
              可用变量：
              <span className="font-mono text-foreground">{"{formTitle}"}</span>
              {" "}、<span className="font-mono text-foreground">{"{deadline}"}</span>
              {" "}、<span className="font-mono text-foreground">{"{formUrl}"}</span>
              {" "}、<span className="font-mono text-foreground">{"{message}"}</span>
              。
            </p>
            <p className="mt-1">
              邀请人姓名不会写入邮件；链接按钮会自动使用收集表的分享地址。
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            {editable && setting.hasOverride ? (
              <Button
                type="button"
                variant="outline"
                className="sm:w-auto"
                onClick={() => {
                  toast.promise(
                    resetCollectionInvitationTemplate().then((result) => {
                      if (!result.ok) throw new Error(result.message);
                      router.refresh();
                    }),
                    {
                      loading: "正在恢复",
                      success: "已恢复内置默认文案",
                      error: (error) =>
                        error instanceof Error ? error.message : "恢复失败",
                    },
                  );
                }}
              >
                <Undo2 data-icon="inline-start" />
                恢复内置默认文案
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {editable
                  ? "保存会写入全局默认模板。"
                  : "只读浏览，保存与恢复按钮已隐藏。"}
              </span>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <PreviewDialog
                title="收集表邀请通知样张"
                html={previewHtml}
                triggerLabel="预览"
                description="样张使用固定的示例表单、截止时间和邀请留言。"
              />
              {editable && (
                <Button type="submit">
                  <Save data-icon="inline-start" />
                  保存模板
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 卡片与弹窗标题：招新类模板按「部门 × 阶段」读（多媒体部WOD / 办公室一面），
 * 面试通知类模板与流程无关，用模板自带的名称。
 */
function getTemplateDisplayName(
  definition: EmailTemplateDefinition | undefined,
  templateKey: string,
  department: string | null,
) {
  return (
    emailTemplateLabel(templateKey, { department }) ??
    definition?.name ??
    templateKey
  );
}

function getTemplateVariablesSummary(definition: EmailTemplateDefinition) {
  const required = definition.variables.filter((item) => item.required);
  if (required.length === 0) return "无必填变量";
  return required.map((item) => `{${item.key}}`).join("、");
}

/**
 * 「测试发送」默认模板：跟着当前流程类型走，办公类不会再默认发技术招新的通过模板。
 * 与 lib/email/result-email.tsx 的流程种类口径保持一致（办公类测试一面通过模板）。
 */
const defaultTestTemplateKeyForFlowType = (
  flowType?: string | null,
): EmailTemplateDefinition["key"] => {
  switch (flowType) {
    case "office_interview":
      return "office_round1.result.accepted";
    case "recruitment_exemption":
      return "recruitment_exemption.result.accepted";
    case "woc":
      return "woc.result.accepted";
    case "soc":
      return "soc.result.accepted";
    default:
      return "recruitment.result.accepted";
  }
};

export function TestEmailButton({
  flowName,
  department,
  templateDefinitions,
  defaultTemplateKey = "recruitment.result.accepted",
  compact = false,
}: {
  flowName?: string;
  /** 测试发送跟随「模板归属」：null = 全局默认 */
  department: string | null;
  templateDefinitions: EmailTemplateDefinition[];
  defaultTemplateKey?: EmailTemplateDefinition["key"];
  /** 卡片内使用：只留图标按钮，避免整页重复的次级按钮 */
  compact?: boolean;
}) {
  const [address, setAddress] = useState("");
  /* 调用方给的默认键必须落在可选列表里：部门阶段过滤后旧默认可能已被隐藏 */
  const resolvedDefaultKey = templateDefinitions.some(
    (definition) => definition.key === defaultTemplateKey,
  )
    ? defaultTemplateKey
    : (templateDefinitions[0]?.key ?? defaultTemplateKey);
  const [selectedTemplateKey, setSelectedTemplateKey] =
    useState<EmailTemplateDefinition["key"]>(resolvedDefaultKey);
  const selectedTemplate = templateDefinitions.find(
    (definition) => definition.key === selectedTemplateKey,
  );

  /* 切换流程/部门后默认模板要跟着走，否则会把上一次选中的模板接着发出去 */
  useEffect(() => {
    setSelectedTemplateKey(resolvedDefaultKey);
  }, [resolvedDefaultKey]);

  /* 过滤后的列表里已经没有当前选中时（例如在全局选了办公模板、再切到技术部门）
     同样回落到默认键：下拉已经把它隐藏，发送就不能再把它带出去 */
  useEffect(() => {
    setSelectedTemplateKey((current) =>
      templateDefinitions.some((definition) => definition.key === current)
        ? current
        : resolvedDefaultKey,
    );
  }, [templateDefinitions, resolvedDefaultKey]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        {compact ? (
          /* 卡片上只留图标：整串「测试发送」在 12 张卡片上就是 12 个同级按钮 */
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="测试发送"
            title="测试发送"
            className="shrink-0"
          >
            <Send />
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="w-full lg:w-auto">
            <Send data-icon="inline-start" />
            测试发送
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>测试发送</DialogTitle>
          <DialogDescription>
            选一个模板，发一封测试邮件确认效果。收件人用南邮邮箱，或直接填学号。
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="test-email-template">模板</Label>
          <select
            id="test-email-template"
            value={selectedTemplateKey}
            onChange={(event) =>
              setSelectedTemplateKey(event.target.value as EmailTemplateDefinition["key"])
            }
            className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {(["result", "interview"] as const).map((category) => (
              <optgroup key={category} label={emailCategoryText[category]}>
                {templateDefinitions
                  .filter((definition) => definition.category === category)
                  .map((definition) => (
                    <option key={definition.key} value={definition.key}>
                      {emailTemplateLabel(definition.key, { department }) ??
                        definition.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          {flowName && (
            <p className="text-xs text-muted-foreground">当前流程：{flowName}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {department
              ? `按${getTargetLabel(department)}的模板发送，该部门未覆盖时回落全局默认。`
              : "按全局默认模板发送。"}
          </p>
          {selectedTemplate && (
            <p className="text-xs text-muted-foreground">
              {emailCategoryText[selectedTemplate.category]} · 必填变量：
              {getTemplateVariablesSummary(selectedTemplate)}
            </p>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor="test-email-address">收件地址</Label>
          <Input
            id="test-email-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="学号或 njupt.edu.cn 邮箱"
            inputMode="email"
          />
        </div>
        <Button
          onClick={() => {
            toast.promise(
              sendEmailTest(
                selectedTemplateKey,
                { toAddress: address, flowName },
                department,
              ).then((result) => {
                if (!result.ok) throw new Error("测试邮件发送失败");
                return result;
              }),
              {
                loading: "正在发送测试邮件",
                success: (result) => `测试邮件已发送到 ${result.to}`,
                error: (error) =>
                  error instanceof Error ? error.message : "测试邮件发送失败",
              },
            );
          }}
        >
          <Send data-icon="inline-start" />
          发送测试邮件
        </Button>
      </DialogContent>
    </Dialog>
  );
}

/** 板块容器：标题 + 模板数 + 三列卡片网格 */
function TemplateDeck({
  title,
  count,
  className,
  children,
}: {
  title: string;
  count: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">
          {count} 个
        </span>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

export function EmailTemplateManagementSection({
  templateSettings,
  resultEmailPreviews,
  interviewScheduleTemplates,
  interviewSchedulePreviews,
  collectionInvitationTemplate,
  selectedFlowTitle,
  selectedFlowType,
  templateDefinitions,
  department,
  stylePresets = [],
  onDepartmentChange,
}: {
  templateSettings: TemplateSettingsResult;
  resultEmailPreviews: ResultEmailPreviews;
  interviewScheduleTemplates: InterviewTemplateSettingsResult;
  interviewSchedulePreviews: InterviewSchedulePreviews;
  collectionInvitationTemplate?: CollectionInvitationTemplatePanel;
  selectedFlowTitle?: string;
  /** 当前选中流程的类型：测试发送据此挑默认模板（办公类 ≠ 技术招新） */
  selectedFlowType?: string | null;
  templateDefinitions: EmailTemplateDefinition[];
  /** 当前模板归属：null = 全局默认 */
  department: string | null;
  /** 已保存的自定义样式（可插入到任意结果模板） */
  stylePresets?: EmailStylePresetRow[];
  onDepartmentChange: (department: string | null) => void;
}) {
  const definitionMap = new Map<string, EmailTemplateDefinition>(
    templateDefinitions.map((definition) => [definition.key, definition]),
  );
  const resultGroups = groupTemplateRowsByKey(templateSettings.rows, {
    department,
    scope: templateSettings.scope,
  });
  const interviewGroups = groupTemplateRowsByKey(
    interviewScheduleTemplates.rows,
    { department, scope: interviewScheduleTemplates.scope },
  );
  const resultGroupKeys = new Set(resultGroups.map((group) => group.templateKey));
  const interviewGroupMap = new Map(
    interviewGroups.map((group) => [group.templateKey, group]),
  );
  const interviewDefinitions = templateDefinitions.filter(
    (definition) => definition.category === "interview",
  );
  const collectionDefinition = templateDefinitions.find(
    (definition) => definition.key === "collection.invitation",
  );
  const templateCardClassName =
    "group relative flex min-h-0 flex-col gap-2 overflow-hidden rounded-xl border border-border/70 bg-card shadow-card p-3.5 transition-colors hover:border-foreground/20 hover:bg-muted/40";
  /* 顶部色条区分语义：通过 = 主色（绿），不通过 = 失败色（红），避免整页绿条时看错 */
  const templateAccentClass = (templateKey: string) =>
    templateKey.endsWith(".rejected")
      ? "bg-destructive/70"
      : templateKey.endsWith(".accepted")
        ? "bg-primary"
        : "bg-muted-foreground/40";

  /* 部门只跑自己那套阶段：技术部门看笔试/免试/WOC/SOC（电子部不含 WOC），办公部门只看一面/二面。
     未知部门与全局默认不过滤，避免 Link 新增部门时模板在界面上消失。 */
  const scopeDepartment = normalizeTemplateDepartment(department);
  const scopeCategory = departmentCategory(scopeDepartment);
  const belongsToScope = (templateKey: string) =>
    scopeCategory === "unknown" ||
    ((emailTemplateStageCategory(templateKey) ?? scopeCategory) ===
      scopeCategory &&
      departmentSupportsStage(
        scopeDepartment,
        emailTemplateFlowType(templateKey),
      ));

  /* 「测试发送」下拉与卡片同一口径：只列本部门实际会用到的模板，
     办公部门不再看到技术阶段的模板、技术部门不再看到一面/二面模板，避免误解 */
  const scopedTemplateDefinitions = templateDefinitions.filter((definition) =>
    belongsToScope(definition.key),
  );

  /* 没有配置行的模板定义同样按部门阶段过滤，否则办公部门会看到永远用不到的技术阶段模板 */
  const resultDefinitionsMissing = templateDefinitions.filter(
    (definition) =>
      definition.category === "result" &&
      !resultGroupKeys.has(definition.key) &&
      belongsToScope(definition.key),
  );
  const interviewCards = interviewDefinitions
    .map((definition) => {
      const templateKey = definition.key as keyof InterviewSchedulePreviews;
      const group = interviewGroupMap.get(definition.key);
      if (!group) return null;
      return { definition, group, templateKey };
    })
    /* 办公部门不显示飞书日程类通知模板（预约/改约/取消/暂不改期）：它们在这类部门用不到 */
    .filter(
      (item): item is NonNullable<typeof item> =>
        item !== null && belongsToScope(item.definition.key),
    );
  /* 只读浏览其他部门时隐藏测试发送：测试发送会按该部门写入投递记录，写权限只限本部门 */
  const scope = templateSettings.scope;
  const canSendTestEmail =
    scope.kind === "all" ||
    (scope.kind === "department" &&
      (!department ||
        normalizeTemplateDepartment(department) ===
          normalizeTemplateDepartment(scope.department)));

  /* 卡片顺序按招新阶段排，通过的排在不通过前面：和流程页签的读法保持一致 */
  const sortedResultGroups = [...resultGroups].sort(
    (a, b) =>
      emailTemplateStageIndex(a.templateKey) -
        emailTemplateStageIndex(b.templateKey) ||
      a.templateKey.localeCompare(b.templateKey),
  );
  /* 过滤后的结果通知卡片：卡片标题、数量、空状态都用它 */
  const visibleResultGroups = sortedResultGroups.filter((group) =>
    belongsToScope(group.templateKey),
  );
  /* 范围说明只写一次：原来每张卡片都重复同一句话，12 张卡片就是 12 次噪音。
     与 EmailTemplateScopeSelector 的提示分工：选择器讲「谁能写」，这里讲「正在编辑什么」。 */
  const scopeSummary = (() => {
    const target = normalizeTemplateDepartment(department);
    if (!target) {
      return "当前编辑全局默认，未配置覆盖的部门都会用它。";
    }
    const name = departmentLabel(target);
    if (scope.kind === "all") {
      return `编辑「${name}」的覆盖：只影响该部门，未覆盖的模板继续回落全局默认。`;
    }
    if (canSendTestEmail) {
      return `编辑「${name}」的覆盖：未覆盖的模板继续回落全局默认。`;
    }
    return `只读浏览「${name}」的覆盖，本部门的覆盖请切回本部门再编辑。`;
  })();

  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-card">
      <header className="flex flex-col gap-4 border-b p-4 lg:flex-row lg:items-start lg:justify-between lg:gap-6 lg:p-5">
        <div className="flex min-w-0 flex-col gap-2">
          <h2 className="text-sm font-semibold">模板管理</h2>
          <EmailTemplateScopeSelector
            value={department}
            departments={templateSettings.departments}
            scope={templateSettings.scope}
            onChange={onDepartmentChange}
          />
          <p className="max-w-3xl text-xs leading-5 text-muted-foreground">
            {scopeSummary}
          </p>
        </div>
        {canSendTestEmail && (
          <TestEmailButton
            flowName={selectedFlowTitle}
            department={department}
            templateDefinitions={scopedTemplateDefinitions}
            defaultTemplateKey={defaultTestTemplateKeyForFlowType(
              selectedFlowType,
            )}
          />
        )}
      </header>

      <div className="space-y-6 p-4 lg:p-5">
        <TemplateDeck title="结果通知" count={visibleResultGroups.length}>
          {visibleResultGroups.map((group) => (
            <article key={group.templateKey} className={templateCardClassName}>
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 top-0 h-1 ${templateAccentClass(group.templateKey)}`}
              />
              <div className="flex items-start justify-between gap-2">
                <h4 className="min-w-0 break-words text-sm font-semibold leading-5">
                  {getTemplateDisplayName(
                    definitionMap.get(group.templateKey),
                    group.templateKey,
                    department,
                  )}
                </h4>
                <TemplateOverrideBadge
                  status={group.status}
                  readOnly={group.readOnly}
                />
              </div>
              {group.otherDepartments.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  其他部门覆盖：
                  {group.otherDepartments
                    .map((key) => departmentLabel(key))
                    .join("、")}
                </p>
              )}
              <div className="mt-auto flex items-center gap-2 pt-3">
                {group.row && (
                  <EmailResultTemplateDialog
                    setting={group.row}
                    department={group.targetDepartment}
                    hasOverride={group.hasOverride}
                    writable={group.writable}
                    previewHtml={resultEmailPreviews[group.templateKey] ?? null}
                    stylePresets={stylePresets}
                    variables={runtimeVariablesOf(definitionMap.get(group.templateKey))}
                  />
                )}
                {group.writable && (
                  <TestEmailButton
                    compact
                    flowName={selectedFlowTitle}
                    department={department}
                    templateDefinitions={scopedTemplateDefinitions}
                    defaultTemplateKey={
                      group.templateKey as EmailTemplateDefinition["key"]
                    }
                  />
                )}
              </div>
            </article>
          ))}
          {resultDefinitionsMissing.map((definition) => (
            <article key={definition.key} className={templateCardClassName}>
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 top-0 h-1 ${templateAccentClass(definition.key)}`}
              />
              <h4 className="min-w-0 break-words text-sm font-semibold leading-5">
                {getTemplateDisplayName(definition, definition.key, department)}
              </h4>
              <div className="mt-auto flex items-center gap-2 pt-3">
                {canSendTestEmail && (
                  <TestEmailButton
                    compact
                    flowName={selectedFlowTitle}
                    department={department}
                    templateDefinitions={scopedTemplateDefinitions}
                    defaultTemplateKey={definition.key}
                  />
                )}
              </div>
            </article>
          ))}
          {visibleResultGroups.length === 0 &&
            resultDefinitionsMissing.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                暂无结果通知模板。
              </p>
            )}
        </TemplateDeck>

        <TemplateDeck
          title="面试通知"
          count={interviewCards.length}
          className="border-t pt-6"
        >
          {interviewCards.map(({ definition, group, templateKey }) => (
            <article key={definition.key} className={templateCardClassName}>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 bg-chart-3/70"
              />
              <div className="flex items-start justify-between gap-2">
                <h4 className="min-w-0 break-words text-sm font-semibold leading-5">
                  {definition.name}
                </h4>
                <TemplateOverrideBadge
                  status={group.status}
                  readOnly={group.readOnly}
                />
              </div>
              {group.otherDepartments.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  其他部门覆盖：
                  {group.otherDepartments
                    .map((key) => departmentLabel(key))
                    .join("、")}
                </p>
              )}
              <div className="mt-auto flex items-center gap-2 pt-3">
                {group.row && (
                  <EmailInterviewTemplateDialog
                    definitionName={definition.name}
                    setting={group.row}
                    department={group.targetDepartment}
                    hasOverride={group.hasOverride}
                    writable={group.writable}
                    previewHtml={interviewSchedulePreviews[templateKey] ?? null}
                    stylePresets={stylePresets}
                    variables={runtimeVariablesOf(definition)}
                  />
                )}
                {group.writable && (
                  <TestEmailButton
                    compact
                    flowName={selectedFlowTitle}
                    department={department}
                    templateDefinitions={scopedTemplateDefinitions}
                    defaultTemplateKey={definition.key}
                  />
                )}
              </div>
            </article>
          ))}
          {interviewCards.length === 0 && (
            <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              暂无面试通知模板。
            </p>
          )}
        </TemplateDeck>

        {collectionInvitationTemplate && collectionDefinition && (
          <TemplateDeck
            title="收集表通知"
            count={1}
            className="border-t pt-6"
          >
            <article className={templateCardClassName}>
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 bg-chart-4/70"
              />
              <div className="flex items-start justify-between gap-2">
                <h4 className="min-w-0 break-words text-sm font-semibold leading-5">
                  {collectionDefinition.name}
                </h4>
                <span className="shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground">
                  {collectionInvitationTemplate.setting.editable
                    ? "全局模板"
                    : "仅管理员可编辑"}
                </span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                {collectionDefinition.description}
              </p>
              <div className="mt-auto flex items-center gap-2 pt-3">
                <CollectionInvitationTemplateDialog
                  setting={collectionInvitationTemplate.setting}
                  previewHtml={collectionInvitationTemplate.preview}
                />
              </div>
            </article>
          </TemplateDeck>
        )}
      </div>
    </section>
  );
}
