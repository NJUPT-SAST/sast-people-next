"use client";

import {
  resetInterviewScheduleEmailTemplate,
  updateInterviewScheduleEmailTemplate,
} from "@/action/email/interview-template";
import { sendEmailTest } from "@/action/email/test-send";
import {
  resetEmailTemplateSetting,
  updateEmailTemplateSetting,
} from "@/action/email/template";
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
import { departmentLabel } from "@/const/department";
import { cn } from "@/lib/utils";
import { Save, Send, Settings2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { EmailTemplateScopeSelector } from "./EmailTemplateScopeSelector";
import {
  getSettingLabel,
  emailCategoryText,
  hiddenScrollbar,
} from "./emailDashboardConstants";
import { PreviewDialog } from "./emailDashboardDialogs";
import type {
  EmailTemplateDefinition,
  InterviewSchedulePreviews,
  InterviewScheduleTemplate,
  InterviewTemplateSettingsResult,
  ResultEmailPreviews,
  TemplateSetting,
  TemplateSettingsResult,
} from "./emailDashboardTypes";
import {
  getTemplateRowStatusLabel,
  groupTemplateRowsByKey,
  type TemplateRowStatus,
} from "./emailDashboardUtils";

/** 生效内容来源的徽章：本部门覆盖 / 全局默认（只读）/ 其他部门覆盖 */
function TemplateOverrideBadge({
  status,
  readOnly,
}: {
  status: TemplateRowStatus;
  readOnly: boolean;
}) {
  const tone: Record<TemplateRowStatus, string> = {
    "department-override": "border-primary/40 text-primary",
    "global-fallback": "border-border text-muted-foreground",
    "global-default": "border-border text-muted-foreground",
    "other-department": "border-chart-3/50 text-muted-foreground",
    missing: "border-dashed text-muted-foreground",
  };

  return (
    <span
      className={cn(
        "shrink-0 rounded-md border px-1.5 py-0.5 text-[11px] leading-4",
        tone[status],
      )}
    >
      {getTemplateRowStatusLabel(status, { readOnly })}
    </span>
  );
}

/** 卡片提示：写到哪里、是否已有覆盖 */
function getTemplateScopeHint({
  targetDepartment,
  hasOverride,
}: {
  targetDepartment: string | null;
  hasOverride: boolean;
}) {
  if (!targetDepartment) {
    return "当前编辑全局默认，未配置覆盖的部门都会用它。";
  }
  if (hasOverride) {
    return `「${departmentLabel(targetDepartment)}」已有独立覆盖，改动不影响其他部门。`;
  }
  return `「${departmentLabel(targetDepartment)}」尚未覆盖，当前显示全局默认文案；保存会创建该部门的独立覆盖。`;
}

function getTargetLabel(department: string | null) {
  return department ? `「${departmentLabel(department)}」` : "全局默认";
}

function createValuesFromForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    subjectTemplate: String(data.get("subjectTemplate") ?? ""),
    titleTemplate: String(data.get("titleTemplate") ?? ""),
    subtitleTemplate: String(data.get("subtitleTemplate") ?? ""),
    resultBadgeTemplate: String(data.get("resultBadgeTemplate") ?? ""),
    resultTitleTemplate: String(data.get("resultTitleTemplate") ?? ""),
    resultSummaryTemplate: String(data.get("resultSummaryTemplate") ?? ""),
    bodyTemplate: String(data.get("bodyTemplate") ?? ""),
    memberInfoFormUrl: String(data.get("memberInfoFormUrl") ?? ""),
    feishuGroupUrl: String(data.get("feishuGroupUrl") ?? ""),
    calendarUrl: String(data.get("calendarUrl") ?? ""),
    feishuRegisterHelpUrl: String(data.get("feishuRegisterHelpUrl") ?? ""),
    contactEmail: String(data.get("contactEmail") ?? ""),
    memberFormLabel: String(data.get("memberFormLabel") ?? ""),
    feishuGroupName: String(data.get("feishuGroupName") ?? ""),
    groupNumber: String(data.get("groupNumber") ?? ""),
  };
}

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
      <Input
        id={id}
        name={name}
        defaultValue={defaultValue}
        className="min-w-0"
      />
    </div>
  );
}

function TemplateDialog({
  setting,
  department,
  hasOverride,
  writable,
  previewHtml,
}: {
  setting: TemplateSetting;
  /** 写入目标：null = 全局默认 */
  department: string | null;
  hasOverride: boolean;
  writable: boolean;
  previewHtml: string | null;
}) {
  const router = useRouter();
  const isAcceptedTemplate = setting.templateKey.endsWith("accepted");
  const isRecruitmentTemplate = setting.templateKey.startsWith("recruitment.");
  const usesInternalGroup =
    isAcceptedTemplate &&
    (isRecruitmentTemplate || setting.templateKey.startsWith("soc."));
  const targetLabel = getTargetLabel(department);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full lg:w-auto">
          <Settings2 data-icon="inline-start" />
          {getSettingLabel(setting.templateKey)}
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto",
          hiddenScrollbar,
        )}
      >
        <DialogHeader>
          <DialogTitle>{getSettingLabel(setting.templateKey)}</DialogTitle>
          <DialogDescription>
            编辑邮件标题、结果卡片、正文和后续行动。当前写入目标：
            {targetLabel}
            {department && !hasOverride
              ? "（尚未覆盖，保存会创建该部门的独立文案）"
              : ""}
            。保存后请先预览，再进行测试发送。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid min-w-0 gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const values = createValuesFromForm(event.currentTarget);
            toast.promise(
              updateEmailTemplateSetting(
                setting.templateKey,
                values,
                department,
              ).then((result) => {
                if (!result.ok) throw new Error(result.message);
                router.refresh();
              }),
              {
                loading: "正在保存模板",
                success: `模板已保存到${targetLabel}`,
                error: (error) =>
                  error instanceof Error ? error.message : "保存失败",
              },
            );
          }}
        >
          <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 md:col-span-2">
            <p className="text-xs font-medium text-foreground">邮件呈现</p>
            <TemplateField
              id={`${setting.templateKey}-subject`}
              name="subjectTemplate"
              label="邮件标题"
              defaultValue={setting.subjectTemplate}
            />
          </div>

          <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 md:grid-cols-2 md:col-span-2">
            <TemplateField id={`${setting.templateKey}-title`} name="titleTemplate" label="邮件主标题" defaultValue={setting.titleTemplate} />
            <TemplateField id={`${setting.templateKey}-subtitle`} name="subtitleTemplate" label="邮件副标题" defaultValue={setting.subtitleTemplate} />
            <TemplateField id={`${setting.templateKey}-badge`} name="resultBadgeTemplate" label="结果标签" defaultValue={setting.resultBadgeTemplate} />
            <TemplateField id={`${setting.templateKey}-result-title`} name="resultTitleTemplate" label="结果标题" defaultValue={setting.resultTitleTemplate} />
            <TemplateField id={`${setting.templateKey}-summary`} name="resultSummaryTemplate" label="结果摘要" defaultValue={setting.resultSummaryTemplate} className="md:col-span-2" />
          </div>

          <div className="grid gap-1.5 rounded-lg border bg-muted/30 p-4 md:col-span-2">
            <Label htmlFor={`${setting.templateKey}-body`} className="text-xs text-muted-foreground">
              正文文案
            </Label>
            <Textarea
              id={`${setting.templateKey}-body`}
              name="bodyTemplate"
              defaultValue={setting.bodyTemplate}
              placeholder={isRecruitmentTemplate ? "招新正文使用固定版式，可按需填写自定义文案。" : "填写本流程的结果说明和后续安排。"}
              className="min-h-[180px] resize-y bg-background"
            />
            <p className="text-xs text-muted-foreground">可用变量：{"{name}"}、{"{flowName}"}、{"{department}"}、{"{groupNumber}"}、{"{contactEmail}"}、{"{feishuGroupName}"}、{"{calendarUrl}"}。</p>
          </div>

          <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 md:col-span-2 md:grid-cols-2">
            <p className="text-xs font-medium text-foreground md:col-span-2">后续行动与联系</p>
            <TemplateField
              id={`${setting.templateKey}-contact`}
              label="联系邮箱"
              name="contactEmail"
              defaultValue={setting.contactEmail}
            />
            <TemplateField
              id={`${setting.templateKey}-calendar-url`}
              label="活动日历链接"
              name="calendarUrl"
              defaultValue={setting.calendarUrl}
            />
            <TemplateField
              id={`${setting.templateKey}-group-number`}
              label="QQ 群号"
              name="groupNumber"
              defaultValue={setting.groupNumber}
            />
            {usesInternalGroup ? (
              <>
                {isRecruitmentTemplate && (
                  <TemplateField
                    id={`${setting.templateKey}-form-label`}
                    label="表单按钮文案"
                    name="memberFormLabel"
                    defaultValue={setting.memberFormLabel}
                  />
                )}
                <TemplateField
                  id={`${setting.templateKey}-group-name`}
                  label={isRecruitmentTemplate ? "飞书群名" : "内部飞书群名"}
                  name="feishuGroupName"
                  defaultValue={setting.feishuGroupName}
                />
              </>
            ) : (
              <>
                <input type="hidden" name="memberFormLabel" value={setting.memberFormLabel} />
                <input type="hidden" name="feishuGroupName" value={setting.feishuGroupName} />
              </>
            )}
          </div>

          {usesInternalGroup ? (
            <div className="grid gap-3 rounded-lg border bg-muted/40 p-3 md:col-span-2">
              {isRecruitmentTemplate && (
                <TemplateField id={`${setting.templateKey}-form-url`} label="成员信息表链接" name="memberInfoFormUrl" defaultValue={setting.memberInfoFormUrl} />
              )}
              <TemplateField
                id={`${setting.templateKey}-group-url`}
                label={isRecruitmentTemplate ? "飞书群链接" : "内部飞书群链接"}
                name="feishuGroupUrl"
                defaultValue={setting.feishuGroupUrl}
              />
              {isRecruitmentTemplate ? (
                <TemplateField id={`${setting.templateKey}-help-url`} label="飞书注册说明" name="feishuRegisterHelpUrl" defaultValue={setting.feishuRegisterHelpUrl} />
              ) : (
                <input type="hidden" name="feishuRegisterHelpUrl" value={setting.feishuRegisterHelpUrl} />
              )}
            </div>
          ) : (
            <>
              <input type="hidden" name="memberInfoFormUrl" value={setting.memberInfoFormUrl} />
              <input type="hidden" name="feishuGroupUrl" value={setting.feishuGroupUrl} />
              <input
                type="hidden"
                name="feishuRegisterHelpUrl"
                value={setting.feishuRegisterHelpUrl}
              />
            </>
          )}
          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between md:col-span-2">
            {hasOverride && writable ? (
              <Button
                type="button"
                variant="outline"
                className="sm:w-auto"
                onClick={() => {
                  toast.promise(
                    resetEmailTemplateSetting(
                      setting.templateKey,
                      department,
                    ).then((result) => {
                      if (!result.ok) throw new Error(result.message);
                      router.refresh();
                    }),
                    {
                      loading: "正在恢复",
                      success: department
                        ? `已恢复为全局默认（删除${targetLabel}覆盖）`
                        : "已恢复为内置默认文案",
                      error: (error) =>
                        error instanceof Error ? error.message : "恢复失败",
                    },
                  );
                }}
              >
                <Undo2 data-icon="inline-start" />
                {department ? "恢复为全局默认" : "恢复内置默认文案"}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {department
                  ? `保存会写入${targetLabel}覆盖，未覆盖前继续回落全局默认。`
                  : "保存会写入全局默认，未覆盖的部门都会用它。"}
              </span>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <PreviewDialog
                title={`${getSettingLabel(setting.templateKey)}样张`}
                html={previewHtml}
                triggerLabel="预览"
                description="样张使用固定示例数据；保存后刷新页面可看到最新链接与文案。"
              />
              {writable && (
                <Button type="submit" className="w-full sm:w-auto">
                  <Save data-icon="inline-start" />
                  保存到{targetLabel}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function createInterviewTemplateValues(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    subjectTemplate: String(data.get("subjectTemplate") ?? ""),
    titleTemplate: String(data.get("titleTemplate") ?? ""),
    bodyTemplate: String(data.get("bodyTemplate") ?? ""),
    footerText: String(data.get("footerText") ?? ""),
  };
}

function InterviewTemplateDialog({
  definition,
  setting,
  department,
  hasOverride,
  writable,
  previewHtml,
}: {
  definition: EmailTemplateDefinition;
  setting: InterviewScheduleTemplate;
  /** 写入目标：null = 全局默认 */
  department: string | null;
  hasOverride: boolean;
  writable: boolean;
  previewHtml: string | null;
}) {
  const router = useRouter();
  const isWithdrawalTemplate =
    setting.templateKey === "interview.application.withdrawn";
  const targetLabel = getTargetLabel(department);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full lg:w-auto">
          <Settings2 data-icon="inline-start" />
          编辑
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-3xl overflow-y-auto",
          hiddenScrollbar,
        )}
      >
        <DialogHeader className="pr-8">
          <DialogTitle>{definition.name}</DialogTitle>
          <DialogDescription>
            {isWithdrawalTemplate
              ? "编辑候选人报名被退回后的通知内容；退回理由会自动显示在邮件的信息卡片里。"
              : "编辑邮件开头的提示语。预约时间、地点和讲师会自动生成在邮件信息卡片里；候选人邮件不包含飞书会议入口。"}
            当前写入目标：{targetLabel}
            {department && !hasOverride ? "（尚未覆盖，保存会创建该部门的独立文案）" : ""}。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const values = createInterviewTemplateValues(event.currentTarget);
            toast.promise(
              updateInterviewScheduleEmailTemplate(
                setting.templateKey,
                values,
                department,
              ).then((result) => {
                if (!result.ok) throw new Error(result.message);
                router.refresh();
              }),
              {
                loading: "正在保存模板",
                success: `模板已保存到${targetLabel}`,
                error: (error) =>
                  error instanceof Error ? error.message : "保存失败",
              },
            );
          }}
        >
          <div className="grid min-w-0 gap-3 rounded-lg border bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">邮件内容</p>
            <TemplateField
              id="interview-subject-template"
              name="subjectTemplate"
              label="邮件标题"
              defaultValue={setting.subjectTemplate}
            />
            <TemplateField
              id="interview-title-template"
              name="titleTemplate"
              label="邮件主标题"
              defaultValue={setting.titleTemplate}
            />
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="interview-body-template" className="text-xs text-muted-foreground">
                开头说明
              </Label>
              <Textarea
                id="interview-body-template"
                name="bodyTemplate"
                defaultValue={setting.bodyTemplate}
                className="min-h-[132px] resize-y bg-background"
              />
            </div>
            <TemplateField
              id="interview-footer-text"
              name="footerText"
              label="落款"
              defaultValue={setting.footerText}
            />
          </div>

          <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
            <p>
              正文建议保留 <span className="font-mono text-foreground">{"{candidateName}"}</span>
              {" "}和 <span className="font-mono text-foreground">{"{flowName}"}</span>。
            </p>
            <p className="mt-1">
              {isWithdrawalTemplate
                ? "退回理由会自动显示在下方信息卡中，请不要在正文重复填写退回理由。"
                : "时间、地点、讲师、备注、飞书会议和飞书日程按钮会自动出现在邮件信息卡片里，通常不用重复写进正文。"}
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            {hasOverride && writable ? (
              <Button
                type="button"
                variant="outline"
                className="sm:w-auto"
                onClick={() => {
                  toast.promise(
                    resetInterviewScheduleEmailTemplate(
                      setting.templateKey,
                      department,
                    ).then(() => router.refresh()),
                    {
                      loading: "正在恢复",
                      success: department
                        ? `已恢复为全局默认（删除${targetLabel}覆盖）`
                        : "已恢复为内置默认文案",
                      error: (error) =>
                        error instanceof Error ? error.message : "恢复失败",
                    },
                  );
                }}
              >
                <Undo2 data-icon="inline-start" />
                {department ? "恢复为全局默认" : "恢复内置默认文案"}
              </Button>
            ) : (
              <span className="text-xs text-muted-foreground">
                {department
                  ? `保存会写入${targetLabel}覆盖，未覆盖前继续回落全局默认。`
                  : "保存会写入全局默认，未覆盖的部门都会用它。"}
              </span>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <PreviewDialog
                title={`${definition.name}样张`}
                html={previewHtml}
                triggerLabel="预览"
                description={
                  isWithdrawalTemplate
                    ? "样张使用固定示例退回理由；真实发送时会替换为讲师填写的理由。"
                    : "样张使用固定示例数据；真实发送时会替换为预约信息。"
                }
              />
              {writable && (
                <Button type="submit">
                  <Save data-icon="inline-start" />
                  保存到{targetLabel}
                </Button>
              )}
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function getTemplateDisplayName(
  definition: EmailTemplateDefinition | undefined,
  templateKey: string,
) {
  return definition?.name ?? getSettingLabel(templateKey);
}

function getTemplateVariablesSummary(definition: EmailTemplateDefinition) {
  const required = definition.variables.filter((item) => item.required);
  if (required.length === 0) return "无必填变量";
  return required.map((item) => `{${item.key}}`).join("、");
}

export function TestEmailButton({
  flowName,
  department,
  templateDefinitions,
  defaultTemplateKey = "recruitment.result.accepted",
}: {
  flowName?: string;
  /** 测试发送跟随「模板归属」：null = 全局默认 */
  department: string | null;
  templateDefinitions: EmailTemplateDefinition[];
  defaultTemplateKey?: EmailTemplateDefinition["key"];
}) {
  const [address, setAddress] = useState("");
  const [selectedTemplateKey, setSelectedTemplateKey] =
    useState<EmailTemplateDefinition["key"]>(defaultTemplateKey);
  const selectedTemplate = templateDefinitions.find(
    (definition) => definition.key === selectedTemplateKey,
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full lg:w-auto">
          <Send data-icon="inline-start" />
          测试发送
        </Button>
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
            {templateDefinitions.map((definition) => (
              <option key={definition.key} value={definition.key}>
                {definition.name}
              </option>
            ))}
          </select>
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

export function EmailTemplateManagementSection({
  templateSettings,
  resultEmailPreviews,
  interviewScheduleTemplates,
  interviewSchedulePreviews,
  selectedFlowTitle,
  templateDefinitions,
  department,
  onDepartmentChange,
}: {
  templateSettings: TemplateSettingsResult;
  resultEmailPreviews: ResultEmailPreviews;
  interviewScheduleTemplates: InterviewTemplateSettingsResult;
  interviewSchedulePreviews: InterviewSchedulePreviews;
  selectedFlowTitle?: string;
  templateDefinitions: EmailTemplateDefinition[];
  /** 当前模板归属：null = 全局默认 */
  department: string | null;
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
  const templateCardClassName =
    "group relative flex min-h-0 flex-col overflow-hidden border bg-card p-4 transition-colors hover:bg-muted";

  const resultDefinitionsMissing = templateDefinitions.filter(
    (definition) =>
      definition.category === "result" && !resultGroupKeys.has(definition.key),
  );
  const interviewCards = interviewDefinitions
    .map((definition) => {
      const templateKey = definition.key as keyof InterviewSchedulePreviews;
      const group = interviewGroupMap.get(definition.key);
      if (!group) return null;
      return { definition, group, templateKey };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-start lg:justify-between lg:p-5">
          <div className="flex min-w-0 flex-col gap-2">
            <h2 className="text-sm font-semibold">模板管理</h2>
            <EmailTemplateScopeSelector
              value={department}
              departments={templateSettings.departments}
              scope={templateSettings.scope}
              onChange={onDepartmentChange}
            />
          </div>
          <TestEmailButton
            flowName={selectedFlowTitle}
            department={department}
            templateDefinitions={templateDefinitions}
          />
        </div>

        <div className="space-y-5 p-4">
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">结果通知</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {resultGroups.map((group) => (
                <div key={group.templateKey} className={templateCardClassName}>
                  <div className="absolute inset-x-0 top-0 h-1 bg-primary/60" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold leading-5">
                        {getTemplateDisplayName(
                          definitionMap.get(group.templateKey),
                          group.templateKey,
                        )}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {getTemplateScopeHint(group)}
                      </p>
                      {group.otherDepartments.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          其他部门覆盖：
                          {group.otherDepartments
                            .map((key) => departmentLabel(key))
                            .join("、")}
                        </p>
                      )}
                    </div>
                    <TemplateOverrideBadge
                      status={group.status}
                      readOnly={group.readOnly}
                    />
                  </div>

                  <div className="mt-auto grid grid-cols-1 gap-2 pt-4 min-[420px]:grid-cols-2">
                    {group.row && (
                      <TemplateDialog
                        setting={group.row}
                        department={group.targetDepartment}
                        hasOverride={group.hasOverride}
                        writable={group.writable}
                        previewHtml={
                          resultEmailPreviews[group.templateKey] ?? null
                        }
                      />
                    )}
                    <TestEmailButton
                      flowName={selectedFlowTitle}
                      department={department}
                      templateDefinitions={templateDefinitions}
                      defaultTemplateKey={group.templateKey as EmailTemplateDefinition["key"]}
                    />
                  </div>
                </div>
              ))}
              {resultDefinitionsMissing.map((definition) => (
                <div key={definition.key} className={templateCardClassName}>
                  <div className="absolute inset-x-0 top-0 h-1 bg-muted-foreground/30" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold leading-5">
                        {definition.name}
                      </h3>
                    </div>
                  </div>
                  <div className="mt-auto pt-4">
                    <TestEmailButton
                      flowName={selectedFlowTitle}
                      department={department}
                      templateDefinitions={templateDefinitions}
                      defaultTemplateKey={definition.key}
                    />
                  </div>
                </div>
              ))}
              {resultGroups.length === 0 && resultDefinitionsMissing.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                  暂无结果通知模板。
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 border-t pt-6">
            <div>
              <h3 className="text-sm font-semibold">面试通知</h3>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {interviewCards.map(({ definition, group, templateKey }) => (
                <div key={definition.key} className={templateCardClassName}>
                  <div className="absolute inset-x-0 top-0 h-1 bg-chart-3/70" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold leading-5">
                        {definition.name}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {getTemplateScopeHint(group)}
                      </p>
                      {group.otherDepartments.length > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          其他部门覆盖：
                          {group.otherDepartments
                            .map((key) => departmentLabel(key))
                            .join("、")}
                        </p>
                      )}
                    </div>
                    <TemplateOverrideBadge
                      status={group.status}
                      readOnly={group.readOnly}
                    />
                  </div>
                  <div className="mt-auto grid grid-cols-1 gap-2 pt-4 min-[420px]:grid-cols-2">
                    {group.row && (
                      <InterviewTemplateDialog
                        definition={definition}
                        setting={group.row}
                        department={group.targetDepartment}
                        hasOverride={group.hasOverride}
                        writable={group.writable}
                        previewHtml={
                          interviewSchedulePreviews[templateKey] ?? null
                        }
                      />
                    )}
                    <TestEmailButton
                      flowName={selectedFlowTitle}
                      department={department}
                      templateDefinitions={templateDefinitions}
                      defaultTemplateKey={definition.key}
                    />
                  </div>
                </div>
              ))}
              {interviewCards.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                  暂无面试通知模板。
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
