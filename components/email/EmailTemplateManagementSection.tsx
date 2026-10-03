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
import { departmentCategory, departmentLabel } from "@/const/department";
import {
  emailTemplateLabel,
  emailTemplateStageCategory,
  emailTemplateStageIndex,
} from "@/const/flow";
import { cn } from "@/lib/utils";
import { Save, Send, Settings2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
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
    "department-override": "border-primary/40 bg-primary/5 text-primary",
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
  /* 招新一族（recruitment / recruitment_exemption）共用成员注册版式，故按前缀判断 */
  const isRecruitmentTemplate = setting.templateKey.startsWith("recruitment");
  const usesInternalGroup =
    isAcceptedTemplate &&
    (isRecruitmentTemplate || setting.templateKey.startsWith("soc."));
  const targetLabel = getTargetLabel(department);
  /* 弹窗标题带部门口径；卡片标题已经写过一遍，入口按钮就不再重复整串模板名 */
  const templateTitle = getSettingLabel(setting.templateKey, { department });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-0 flex-1">
          <Settings2 data-icon="inline-start" />
          编辑模板
        </Button>
      </DialogTrigger>
      <DialogContent
        className={cn(
          "max-h-[85dvh] w-[calc(100vw-2rem)] max-w-2xl overflow-y-auto",
          hiddenScrollbar,
        )}
      >
        <DialogHeader>
          <DialogTitle>{templateTitle}</DialogTitle>
          <DialogDescription>
            {writable
              ? `当前写入目标：${targetLabel}${
                  department && !hasOverride
                    ? "（尚未覆盖，保存会创建该部门的独立文案）"
                    : ""
                }。`
              : `当前为只读浏览：${targetLabel} 属于其他部门，只能查看，不能保存。`}
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
            {/* 标题只支持这几个变量；正文支持的更多，分开写避免「填了不生效」的误解 */}
            <p className="text-xs text-muted-foreground">
              标题可用变量：{"{name}"}、{"{flowName}"}、{"{department}"}、{"{groupNumber}"}。
            </p>
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
            <p className="text-xs text-muted-foreground">
              正文可用变量：{"{name}"}、{"{flowName}"}、{"{department}"}、{"{groupNumber}"}、{"{contactEmail}"}、{"{feishuGroupName}"}、{"{feishuGroupUrl}"}、{"{memberInfoFormUrl}"}、{"{feishuRegisterHelpUrl}"}、{"{calendarUrl}"}。
            </p>
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
                {writable
                  ? department
                    ? `保存会写入${targetLabel}覆盖，未覆盖前继续回落全局默认。`
                    : "保存会写入全局默认，未覆盖的部门都会用它。"
                  : "只读浏览其他部门的覆盖，保存与恢复按钮已隐藏。"}
              </span>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <PreviewDialog
                title={`${templateTitle}样张`}
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
        <Button variant="outline" size="sm" className="min-w-0 flex-1">
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
            {writable
              ? `当前写入目标：${targetLabel}${
                  department && !hasOverride
                    ? "（尚未覆盖，保存会创建该部门的独立文案）"
                    : ""
                }。`
              : `当前为只读浏览：${targetLabel} 属于其他部门，只能查看，不能保存。`}
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
              标题与正文都可用变量：
              {" "}<span className="font-mono text-foreground">{"{candidateName}"}</span>
              {" "}、<span className="font-mono text-foreground">{"{flowName}"}</span>
              {" "}、<span className="font-mono text-foreground">{"{organizerName}"}</span>
              {isWithdrawalTemplate ? (
                <>
                  {" "}、<span className="font-mono text-foreground">{"{reason}"}</span>
                </>
              ) : (
                <>
                  {" "}、<span className="font-mono text-foreground">{"{startsAt}"}</span>
                  {" "}、<span className="font-mono text-foreground">{"{endsAt}"}</span>
                  {" "}、<span className="font-mono text-foreground">{"{location}"}</span>
                  {" "}、<span className="font-mono text-foreground">{"{requestedTimeText}"}</span>
                  {" "}、<span className="font-mono text-foreground">{"{reason}"}</span>
                </>
              )}
              。
            </p>
            <p className="mt-1">
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
                {writable
                  ? department
                    ? `保存会写入${targetLabel}覆盖，未覆盖前继续回落全局默认。`
                    : "保存会写入全局默认，未覆盖的部门都会用它。"
                  : "只读浏览其他部门的覆盖，保存与恢复按钮已隐藏。"}
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
  const [selectedTemplateKey, setSelectedTemplateKey] =
    useState<EmailTemplateDefinition["key"]>(defaultTemplateKey);
  const selectedTemplate = templateDefinitions.find(
    (definition) => definition.key === selectedTemplateKey,
  );

  /* 切换流程/部门后默认模板要跟着走，否则会把上一次选中的模板接着发出去 */
  useEffect(() => {
    setSelectedTemplateKey(defaultTemplateKey);
  }, [defaultTemplateKey]);

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
  selectedFlowTitle,
  selectedFlowType,
  templateDefinitions,
  department,
  onDepartmentChange,
}: {
  templateSettings: TemplateSettingsResult;
  resultEmailPreviews: ResultEmailPreviews;
  interviewScheduleTemplates: InterviewTemplateSettingsResult;
  interviewSchedulePreviews: InterviewSchedulePreviews;
  selectedFlowTitle?: string;
  /** 当前选中流程的类型：测试发送据此挑默认模板（办公类 ≠ 技术招新） */
  selectedFlowType?: string | null;
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
    "group relative flex min-h-0 flex-col gap-2 overflow-hidden rounded-lg border bg-card p-3.5 transition-colors hover:border-foreground/20 hover:bg-muted/40";
  /* 顶部色条区分语义：通过 = 主色（绿），不通过 = 失败色（红），避免整页绿条时看错 */
  const templateAccentClass = (templateKey: string) =>
    templateKey.endsWith(".rejected")
      ? "bg-destructive/70"
      : templateKey.endsWith(".accepted")
        ? "bg-primary/60"
        : "bg-muted-foreground/40";

  /* 部门只跑自己那套阶段：技术部门看笔试/免试/WOC/SOC，办公部门只看一面/二面。
     未知部门与全局默认不过滤，避免 Link 新增部门时模板在界面上消失。 */
  const scopeCategory = departmentCategory(
    normalizeTemplateDepartment(department),
  );
  const belongsToScope = (templateKey: string) =>
    scopeCategory === "unknown" ||
    (emailTemplateStageCategory(templateKey) ?? scopeCategory) === scopeCategory;

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
    <section className="overflow-hidden rounded-lg border bg-card">
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
            templateDefinitions={templateDefinitions}
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
                  <TemplateDialog
                    setting={group.row}
                    department={group.targetDepartment}
                    hasOverride={group.hasOverride}
                    writable={group.writable}
                    previewHtml={resultEmailPreviews[group.templateKey] ?? null}
                  />
                )}
                {group.writable && (
                  <TestEmailButton
                    compact
                    flowName={selectedFlowTitle}
                    department={department}
                    templateDefinitions={templateDefinitions}
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
                    templateDefinitions={templateDefinitions}
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
                  <InterviewTemplateDialog
                    definition={definition}
                    setting={group.row}
                    department={group.targetDepartment}
                    hasOverride={group.hasOverride}
                    writable={group.writable}
                    previewHtml={interviewSchedulePreviews[templateKey] ?? null}
                  />
                )}
                {group.writable && (
                  <TestEmailButton
                    compact
                    flowName={selectedFlowTitle}
                    department={department}
                    templateDefinitions={templateDefinitions}
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
      </div>
    </section>
  );
}
