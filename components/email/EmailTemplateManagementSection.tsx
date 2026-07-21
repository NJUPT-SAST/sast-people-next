"use client";

import {
  resetInterviewScheduleEmailTemplate,
  updateInterviewScheduleEmailTemplate,
} from "@/action/email/interview-template";
import { sendEmailTest } from "@/action/email/test-send";
import { updateEmailTemplateSetting } from "@/action/email/template";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import { FileText, Save, Send, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  getSettingLabel,
  emailCategoryText,
  hiddenScrollbar,
} from "./emailDashboardConstants";
import { PreviewDialog } from "./emailDashboardDialogs";
import type {
  EmailTemplateDefinition,
  InterviewSchedulePreviews,
  InterviewScheduleTemplates,
  TemplateSetting,
} from "./emailDashboardTypes";

function createValuesFromForm(form: HTMLFormElement) {
  const data = new FormData(form);
  return {
    subjectTemplate: String(data.get("subjectTemplate") ?? ""),
    memberInfoFormUrl: String(data.get("memberInfoFormUrl") ?? ""),
    feishuGroupUrl: String(data.get("feishuGroupUrl") ?? ""),
    calendarUrl: String(data.get("calendarUrl") ?? ""),
    feishuRegisterHelpUrl: String(data.get("feishuRegisterHelpUrl") ?? ""),
    contactEmail: String(data.get("contactEmail") ?? ""),
    memberFormLabel: String(data.get("memberFormLabel") ?? ""),
    feishuGroupName: String(data.get("feishuGroupName") ?? ""),
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

function TemplateDialog({ setting }: { setting: TemplateSetting }) {
  const router = useRouter();
  const isAcceptedTemplate = setting.templateKey.endsWith("accepted");

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
            {isAcceptedTemplate
              ? "邮件版式固定；这里只调整链接、飞书群和联系邮箱。"
              : "邮件版式固定；这里只调整活动日历和联系邮箱。"}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid min-w-0 gap-4 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const values = createValuesFromForm(event.currentTarget);
            toast.promise(
              updateEmailTemplateSetting(setting.templateKey, values).then((result) => {
                if (!result.ok) throw new Error(result.message);
                router.refresh();
              }),
              {
                loading: "正在保存模板",
                success: "模板已保存",
                error: (error) =>
                  error instanceof Error ? error.message : "保存失败",
              },
            );
          }}
        >
          <div className="rounded-lg border bg-muted/10 p-3 md:col-span-2">
            <p className="text-xs font-medium text-muted-foreground">邮件标题</p>
            <input
              type="hidden"
              name="subjectTemplate"
              value={setting.subjectTemplate}
            />
            <div className="mt-2 flex flex-col gap-1 rounded-md bg-background/70 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm">流程名称 + 结果通知</span>
              <span className="text-xs text-muted-foreground">自动生成</span>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border bg-muted/10 p-3 md:col-span-2 md:grid-cols-2">
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
            {isAcceptedTemplate ? (
              <>
                <TemplateField
                  id={`${setting.templateKey}-form-label`}
                  label="表单按钮文案"
                  name="memberFormLabel"
                  defaultValue={setting.memberFormLabel}
                />
                <TemplateField
                  id={`${setting.templateKey}-group-name`}
                  label="飞书群名"
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

          {isAcceptedTemplate ? (
            <div className="grid gap-3 rounded-lg border bg-muted/10 p-3 md:col-span-2">
              <TemplateField
                id={`${setting.templateKey}-form-url`}
                label="成员信息表链接"
                name="memberInfoFormUrl"
                defaultValue={setting.memberInfoFormUrl}
              />
              <TemplateField
                id={`${setting.templateKey}-group-url`}
                label="飞书群链接"
                name="feishuGroupUrl"
                defaultValue={setting.feishuGroupUrl}
              />
              <TemplateField
                id={`${setting.templateKey}-help-url`}
                label="飞书注册说明"
                name="feishuRegisterHelpUrl"
                defaultValue={setting.feishuRegisterHelpUrl}
              />
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
          <div className="flex justify-end md:col-span-2">
            <Button type="submit" className="w-full lg:w-auto">
              <Save data-icon="inline-start" />
              保存模板
            </Button>
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
  previewHtml,
}: {
  definition: EmailTemplateDefinition;
  setting: InterviewScheduleTemplates[number];
  previewHtml: string | null;
}) {
  const router = useRouter();

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
            编辑邮件开头的提示语。预约时间、地点、讲师和参会入口会自动生成在邮件信息卡片里。
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const values = createInterviewTemplateValues(event.currentTarget);
            toast.promise(
              updateInterviewScheduleEmailTemplate(setting.templateKey, values).then((result) => {
                if (!result.ok) throw new Error(result.message);
                router.refresh();
              }),
              {
                loading: "正在保存模板",
                success: "模板已保存",
                error: (error) =>
                  error instanceof Error ? error.message : "保存失败",
              },
            );
          }}
        >
          <div className="grid min-w-0 gap-3 rounded-lg border bg-muted/10 p-3">
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

          <div className="rounded-lg border bg-muted/10 p-3 text-xs leading-5 text-muted-foreground">
            <p>
              正文建议保留 <span className="font-mono text-foreground">{"{candidateName}"}</span>
              {" "}和 <span className="font-mono text-foreground">{"{flowName}"}</span>。
            </p>
            <p className="mt-1">
              时间、地点、讲师、备注、飞书会议和飞书日程按钮会自动出现在邮件信息卡片里，通常不用重复写进正文。
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              className="sm:w-auto"
              onClick={() => {
                toast.promise(
                  resetInterviewScheduleEmailTemplate(setting.templateKey).then(() => router.refresh()),
                  {
                    loading: "正在重置模板",
                    success: "模板已重置",
                    error: (error) =>
                      error instanceof Error ? error.message : "重置失败",
                  },
                );
              }}
            >
              恢复默认
            </Button>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <PreviewDialog
                title={`${definition.name}样张`}
                html={previewHtml}
                triggerLabel="预览"
                description="样张使用固定示例数据；真实发送时会替换为预约信息。"
              />
              <Button type="submit">
                <Save data-icon="inline-start" />
                保存模板
              </Button>
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

function TemplateVariableChips({
  definition,
}: {
  definition: EmailTemplateDefinition;
}) {
  const required = definition.variables.filter((item) => item.required);
  const chips = required.length > 0 ? required : definition.variables.slice(0, 3);

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {chips.length === 0 ? (
        <span className="rounded-md border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
          无变量
        </span>
      ) : (
        chips.map((item) => (
          <span
            key={item.key}
            className={cn(
              "rounded-md border px-2 py-1 font-mono text-[11px]",
              item.required
                ? "border-primary/25 bg-primary/10 text-primary"
                : "bg-muted/30 text-muted-foreground",
            )}
          >
            {`{${item.key}}`}
          </span>
        ))
      )}
      {required.length === 0 && definition.variables.length > chips.length && (
        <span className="rounded-md border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
          +{definition.variables.length - chips.length}
        </span>
      )}
    </div>
  );
}

function getTemplateEditDescription(category: EmailTemplateDefinition["category"]) {
  if (category === "result") {
    return "可调整链接、飞书群、活动日历和联系邮箱；邮件标题按流程名称自动生成。";
  }
  return "时间、地点、讲师和参会入口会自动生成到信息卡片里，模板只维护标题、开头说明和落款。";
}

export function TestEmailButton({
  flowName,
  templateDefinitions,
  defaultTemplateKey = "recruitment.result.accepted",
}: {
  flowName?: string;
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
              sendEmailTest(address, selectedTemplateKey, flowName).then((result) => {
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
  interviewScheduleTemplates,
  interviewSchedulePreviews,
  selectedFlowTitle,
  templateDefinitions,
}: {
  templateSettings: TemplateSetting[];
  interviewScheduleTemplates: InterviewScheduleTemplates;
  interviewSchedulePreviews: InterviewSchedulePreviews;
  selectedFlowTitle?: string;
  templateDefinitions: EmailTemplateDefinition[];
}) {
  const definitionMap = new Map<string, EmailTemplateDefinition>(
    templateDefinitions.map((definition) => [definition.key, definition]),
  );
  const resultTemplateKeys = new Set(templateSettings.map((setting) => setting.templateKey));
  const interviewTemplateSettingsMap = new Map(
    interviewScheduleTemplates.map((setting) => [setting.templateKey, setting]),
  );
  const interviewDefinitions = templateDefinitions.filter(
    (definition) => definition.category === "interview",
  );
  const templateCardClassName =
    "group relative flex min-h-[220px] flex-col overflow-hidden rounded-xl border bg-background/45 p-4 transition-colors hover:bg-background/70";

  const resultDefinitionsMissing = templateDefinitions.filter(
    (definition) =>
      definition.category === "result" && !resultTemplateKeys.has(definition.key),
  );
  const interviewCards = interviewDefinitions
    .map((definition) => {
      const templateKey =
        definition.key as InterviewScheduleTemplates[number]["templateKey"];
      const setting = interviewTemplateSettingsMap.get(templateKey);
      if (!setting) return null;
      return { definition, setting, templateKey };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-xl border bg-card/80 shadow-sm">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between lg:p-5">
          <div>
            <div className="flex items-center gap-2">
              <FileText className="size-5 text-primary" />
              <h2 className="text-lg font-semibold">模板管理</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              先改文案，再点「测试发送」确认效果。结果通知和面试通知分开管理。
            </p>
          </div>
          <TestEmailButton
            flowName={selectedFlowTitle}
            templateDefinitions={templateDefinitions}
          />
        </div>

        <div className="space-y-6 p-4 lg:p-5">
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold">招新结果通知</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                通过 / 不通过邮件文案。真正群发请去「发结果通知」。
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {templateSettings.map((setting) => (
                <div key={setting.templateKey} className={templateCardClassName}>
                  <div className="absolute inset-x-0 top-0 h-1 bg-primary/60" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold leading-5">
                        {getTemplateDisplayName(
                          definitionMap.get(setting.templateKey),
                          setting.templateKey,
                        )}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {emailCategoryText.result}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-primary/25 bg-primary/10 text-primary"
                    >
                      可编辑
                    </Badge>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                    {definitionMap.get(setting.templateKey)?.description ??
                      getTemplateEditDescription("result")}
                  </p>
                  {definitionMap.get(setting.templateKey) && (
                    <TemplateVariableChips
                      definition={
                        definitionMap.get(setting.templateKey) as EmailTemplateDefinition
                      }
                    />
                  )}
                  <div className="mt-auto grid grid-cols-1 gap-2 pt-4 min-[420px]:grid-cols-2">
                    <TemplateDialog setting={setting} />
                    <TestEmailButton
                      flowName={selectedFlowTitle}
                      templateDefinitions={templateDefinitions}
                      defaultTemplateKey={setting.templateKey as EmailTemplateDefinition["key"]}
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
                      <p className="mt-1 text-xs text-muted-foreground">
                        {emailCategoryText[definition.category]}
                      </p>
                    </div>
                    <Badge variant="outline">默认模板</Badge>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                    {definition.description}
                  </p>
                  <TemplateVariableChips definition={definition} />
                  <div className="mt-auto pt-4">
                    <TestEmailButton
                      flowName={selectedFlowTitle}
                      templateDefinitions={templateDefinitions}
                      defaultTemplateKey={definition.key}
                    />
                  </div>
                </div>
              ))}
              {templateSettings.length === 0 && resultDefinitionsMissing.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
                  暂无结果通知模板。
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 border-t pt-6">
            <div>
              <h3 className="text-sm font-semibold">面试通知</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                预约创建、改约、取消时自动使用；这里只改文案，不在这里触发发送。
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {interviewCards.map(({ definition, setting, templateKey }) => (
                <div key={definition.key} className={templateCardClassName}>
                  <div className="absolute inset-x-0 top-0 h-1 bg-chart-3/70" />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-sm font-semibold leading-5">
                        {definition.name}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {emailCategoryText[definition.category]}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-primary/25 bg-primary/10 text-primary"
                    >
                      可编辑
                    </Badge>
                  </div>
                  <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                    {definition.description}
                  </p>
                  <TemplateVariableChips definition={definition} />
                  <div className="mt-auto grid grid-cols-1 gap-2 pt-4 min-[420px]:grid-cols-2">
                    <InterviewTemplateDialog
                      definition={definition}
                      setting={setting}
                      previewHtml={
                        interviewSchedulePreviews[templateKey] ?? null
                      }
                    />
                    <TestEmailButton
                      flowName={selectedFlowTitle}
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


