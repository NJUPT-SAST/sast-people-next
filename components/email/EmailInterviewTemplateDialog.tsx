"use client";

import {
  previewInterviewScheduleEmailTemplateDraft,
  resetInterviewScheduleEmailTemplate,
  updateInterviewScheduleEmailTemplate,
} from "@/action/email/interview-template";
import {
  deleteEmailTemplateStylePreset,
  saveEmailTemplateStylePreset,
  type EmailStylePresetRow,
} from "@/action/email/style-preset";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { departmentLabel } from "@/const/department";
import {
  DEFAULT_EMAIL_FRAME,
  cloneEmailBlocksWithNewIds,
  createEmailBlockTemplate,
  type EmailBlock,
  type EmailBlockInsertKind,
  type EmailFrameStyle,
} from "@/lib/email/blocks";
import { defaultInterviewEmailBlocks } from "@/lib/email/interview-email-blocks";
import { cn } from "@/lib/utils";
import { Eye, Layers, Paintbrush, Redo2, Save, Settings2, SlidersHorizontal, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import {
  BlockLibraryContent,
  EmailCanvas,
  PresetMenuContent,
  SaveLayoutPopover,
} from "./EmailCanvas";
import { EmailEditorHint } from "./EmailEditorHint";
import { emailDraftSignature } from "./emailDraftSignature";
import { scrollToEmailBlock } from "./emailBlockScroll";
import { EmailFrameFields, EmailThemeColorField } from "./EmailFrameFields";
import { EmailUnsavedChangesDialog } from "./EmailUnsavedChangesDialog";
import { useUndoableDraft } from "./useUndoableDraft";
import { TemplateField } from "./EmailTemplateField";
import { PreviewDialog } from "./emailDashboardDialogs";
import { EmailDevicePreview } from "./emailDevicePreview";
import type { EmailTemplateVariable } from "./email-variables";
import type { InterviewScheduleTemplate } from "./emailDashboardTypes";

const INTERVIEW_VARIABLES =
  "{candidateName}、{flowName}、{organizerName}、{startsAt}、{endsAt}、{location}、{requestedTimeText}、{reason}";

/**
 * 面试通知模板编辑器：与结果模板同一个画布。
 *
 * 画布上就是这封面试通知本身（状态徽章、开头说明、日程卡、流程/地点/讲师元信息都在上面），
 * 时间、地点、讲师这些**数据**由系统在发送时填进 `{变量}`。
 */
/** 画布草稿：撤销/重做覆盖的范围（收件箱标题这类字段不在画布上，不进历史） */
type InterviewDraft = {
  blocks: EmailBlock[];
  frame: EmailFrameStyle;
  themeColor: string;
  title: string;
};

/** 内置版式（未自定义时的种子）：恢复按钮、初始草稿与「脏」判定共用同一份 */
function buildInterviewBlocks(setting: InterviewScheduleTemplate) {
  return defaultInterviewEmailBlocks({
    templateKey: setting.templateKey,
    bodyText: setting.bodyTemplate,
  });
}

function readInterviewDraft(setting: InterviewScheduleTemplate): InterviewDraft {
  return {
    blocks: setting.bodyBlocks ?? buildInterviewBlocks(setting),
    frame: setting.bodyFrame ?? DEFAULT_EMAIL_FRAME,
    themeColor: setting.themeColor,
    title: setting.titleTemplate,
  };
}

export function EmailInterviewTemplateDialog({
  definitionName,
  setting,
  department,
  hasOverride,
  writable,
  previewHtml,
  stylePresets,
  variables = [],
}: {
  definitionName: string;
  setting: InterviewScheduleTemplate;
  /** 写入目标：null = 全局默认 */
  department: string | null;
  hasOverride: boolean;
  writable: boolean;
  previewHtml: string | null;
  stylePresets: EmailStylePresetRow[];
  /** 模板注册表里的运行时变量（姓名、时间、地点…） */
  variables?: readonly EmailTemplateVariable[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  /* 外观 / 字段改成对话框内的面板：弹层在 Radix 弹窗里滚不动（滚动锁把非弹窗层挡住了） */
  const [pane, setPane] = useState<"canvas" | "appearance" | "fields">("canvas");
  const isWithdrawalTemplate =
    setting.templateKey === "interview.application.withdrawn";
  const targetLabel = department ? `「${departmentLabel(department)}」` : "全局默认";

  const [subjectTemplate, setSubjectTemplate] = useState(setting.subjectTemplate);
  const [draftHtml, setDraftHtml] = useState<string | null>(null);

  /* 服务端给的样子：恢复内置版式 / 放弃修改时回落的目标 */
  const baseline = useMemo(() => readInterviewDraft(setting), [setting]);
  /* 画布草稿：区块 / 外观 / 主题色 / 主标题进同一份历史，⌘Z 能回退删除与移动 */
  const draft = useUndoableDraft<InterviewDraft>(() => readInterviewDraft(setting), {
    enabled: open,
  });
  /* 「上次保存的样子」用本地快照，而不是拿服务端读回的数据逐字比：落库还会清洗一遍
     （补默认内联样式、重排区块 id），跟内存里的草稿永远不逐字相等。 */
  const [savedSignature, setSavedSignature] = useState(() => ({
    draft: emailDraftSignature(baseline),
    subject: setting.subjectTemplate,
  }));
  const { blocks, frame, themeColor, title } = draft.value;
  const dirty =
    emailDraftSignature(draft.value) !== savedSignature.draft ||
    subjectTemplate !== savedSignature.subject;

  /* setting 会随 router.refresh 更新（如恢复默认删掉覆盖后）：不脏时把画布与
     主题模板同步到最新服务端样子，避免把刚删除的覆盖再保存回去；脏时保留用户编辑 */
  useEffect(() => {
    if (dirty) return;
    draft.reset(baseline);
    setSubjectTemplate(setting.subjectTemplate);
    setSavedSignature({ draft: emailDraftSignature(baseline), subject: setting.subjectTemplate });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setting]);

  const setBlocks = (next: EmailBlock[] | ((current: EmailBlock[]) => EmailBlock[])) =>
    draft.set((current) => ({
      ...current,
      blocks: typeof next === "function" ? next(current.blocks) : next,
    }));
  /* 工具栏插入是「追加到正文末尾」：插完把新块滚进视野，否则长正文下看着像没反应 */
  const appendBlock = (kind: EmailBlockInsertKind) => {
    const block = createEmailBlockTemplate(kind);
    setBlocks((current) => [...current, block]);
    scrollToEmailBlock(block.id);
  };

  const setFrame = (next: EmailFrameStyle) =>
    draft.set((current) => ({ ...current, frame: next }));
  const setThemeColor = (next: string) =>
    draft.set((current) => ({ ...current, themeColor: next }));
  const setTitle = (next: string) =>
    draft.set((current) => ({ ...current, title: next }));

  /* 成品预览：服务端渲染（与真实发送同一链路），600ms 防抖 */
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      void previewInterviewScheduleEmailTemplateDraft({
        templateKey: setting.templateKey,
        blocks,
        frame,
        themeColor,
        department,
      }).then((result) => {
        if (result.ok) setDraftHtml(result.html);
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [open, blocks, frame, themeColor, setting.templateKey, department]);

  /** 保存成功后把「上次保存的样子」推进到当前草稿 */
  const markSaved = () => {
    setSavedSignature({
      draft: emailDraftSignature(draft.value),
      subject: subjectTemplate,
    });
  };

  const save = () => {
    const pending = updateInterviewScheduleEmailTemplate(
      setting.templateKey,
      {
        subjectTemplate,
        titleTemplate: title,
        /* 正文说明已是画布区块的种子，原样带回不丢 */
        bodyTemplate: setting.bodyTemplate,
        footerText: frame.footerText,
        bodyBlocks: blocks,
        bodyFrame: frame,
        themeColor,
      },
      department,
    ).then((result) => {
      if (!result.ok) throw new Error(result.message);
      markSaved();
      router.refresh();
    });
    toast.promise(pending, {
      loading: "正在保存模板",
      success: `模板已保存到${targetLabel}`,
      error: (error) => (error instanceof Error ? error.message : "保存失败"),
    });
    return pending;
  };

  /* ⌘/Ctrl+S 保存：模板编辑里最顺手的一个键，顺手拦掉浏览器的「保存网页」 */
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    if (!open || !writable) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s") return;
      event.preventDefault();
      void saveRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, writable]);

  /* 关窗前拦一道：有未保存改动时先问，避免手滑点遮罩丢掉整版编辑 */
  const requestClose = (next: boolean) => {
    if (!next && dirty) {
      setConfirmClose(true);
      return;
    }
    setOpen(next);
  };

  const discardAndClose = () => {
    draft.reset(baseline);
    setSubjectTemplate(setting.subjectTemplate);
    setSavedSignature({ draft: emailDraftSignature(baseline), subject: setting.subjectTemplate });
    setConfirmClose(false);
    setOpen(false);
  };

  const saveAndClose = () => {
    setConfirmClose(false);
    void save()
      .then(() => setOpen(false))
      .catch(() => undefined);
  };

  const savePreset = async (name: string, presetBlocks: EmailBlock[]) => {
    const result = await saveEmailTemplateStylePreset({
      name,
      blocks: presetBlocks,
      department,
    });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`样式「${name}」已保存到${targetLabel}`);
    router.refresh();
  };

  const deletePreset = async (presetId: number) => {
    const result = await deleteEmailTemplateStylePreset(presetId);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("样式已删除");
    router.refresh();
  };

  return (
    <Dialog open={open} onOpenChange={requestClose}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="min-w-0 flex-1">
          <Settings2 data-icon="inline-start" />
          编辑
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[92dvh] w-[calc(100vw-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <div className="flex min-h-0 flex-1 flex-col">
          <DialogHeader className="gap-1.5 border-b p-4 pr-12 lg:px-5">
            <DialogTitle className="flex flex-wrap items-center gap-2">
              {definitionName}
              {dirty && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-normal text-amber-800">
                  有未保存的改动
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs leading-5">
              {isWithdrawalTemplate
                ? "退回理由由系统填进信息卡；下面就是这封邮件本身，正文与外观都能直接改。"
                : "预约时间、地点、讲师、飞书会议入口由系统填进区块里的 {变量}；下面就是这封邮件本身。"}
              {writable
                ? `当前写入目标：${targetLabel}${
                    department && !hasOverride
                      ? "（尚未覆盖，保存会创建该部门的独立文案）"
                      : ""
                  }。`
                : `当前为只读浏览：${targetLabel} 属于其他部门，只能查看，不能保存。`}
            </DialogDescription>
          </DialogHeader>

          <EmailEditorHint />

          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="撤销"
                title="撤销（⌘/Ctrl+Z）"
                disabled={!draft.canUndo}
                onClick={draft.undo}
              >
                <Undo2 />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="重做"
                title="重做（⌘/Ctrl+Shift+Z）"
                disabled={!draft.canRedo}
                onClick={draft.redo}
              >
                <Redo2 />
              </Button>
            </div>
            <span className="h-5 w-px bg-border" aria-hidden="true" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={!writable}>
                  <Layers data-icon="inline-start" />
                  插入区块
                </Button>
              </DropdownMenuTrigger>
              <BlockLibraryContent onInsert={appendBlock} />
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="sm" disabled={!writable}>
                  <Paintbrush data-icon="inline-start" />
                  插入样式
                </Button>
              </DropdownMenuTrigger>
              <PresetMenuContent
                presets={stylePresets}
                onInsert={(preset) =>
                  setBlocks((current) => [...current, ...cloneEmailBlocksWithNewIds(preset.blocks)])
                }
                onReplace={(preset) => setBlocks(cloneEmailBlocksWithNewIds(preset.blocks))}
                onDelete={deletePreset}
              />
            </DropdownMenu>

            <span className="h-5 w-px bg-border" aria-hidden="true" />
            <Button
              type="button"
              variant={pane === "appearance" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setShowPreview(false);
                setPane(pane === "appearance" ? "canvas" : "appearance");
              }}
            >
              <Paintbrush data-icon="inline-start" />
              外观与主题色
            </Button>

            <Button
              type="button"
              variant={pane === "fields" ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setShowPreview(false);
                setPane(pane === "fields" ? "canvas" : "fields");
              }}
            >
              <SlidersHorizontal data-icon="inline-start" />
              字段
            </Button>

            <SaveLayoutPopover
              onSave={(name) => savePreset(name, blocks)}
              trigger={
                <Button type="button" variant="outline" size="sm" disabled={!writable}>
                  <Save data-icon="inline-start" />
                  存为版式
                </Button>
              }
            />
            <div className="ml-auto flex items-center gap-2">
              <Button
                type="button"
                variant={showPreview ? "default" : "outline"}
                size="sm"
                onClick={() => setShowPreview((current) => !current)}
              >
                <Eye data-icon="inline-start" />
                {showPreview ? "回到画布" : "成品预览"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!writable}
                onClick={() => {
                  setBlocks(buildInterviewBlocks(setting));
                  setFrame(DEFAULT_EMAIL_FRAME);
                }}
              >
                <Undo2 data-icon="inline-start" />
                恢复内置版式
              </Button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30">
            {showPreview ? (
              <div className="p-4 lg:p-6">
                <EmailDevicePreview
                  title={definitionName}
                  html={draftHtml ?? previewHtml ?? ""}
                />
              </div>
            ) : pane === "appearance" ? (
              <div className="mx-auto grid max-w-3xl gap-3 p-4 lg:p-6">
                <EmailThemeColorField value={themeColor} onChange={setThemeColor} autoLabel="通知灰" />
                <EmailFrameFields idPrefix={setting.templateKey} frame={frame} onChange={setFrame} />
              </div>
            ) : pane === "fields" ? (
              <div className="mx-auto grid max-w-3xl gap-3 p-4 lg:p-6">
                <TemplateField
                  id={`${setting.templateKey}-subject`}
                  label="收件箱标题"
                  value={subjectTemplate}
                  onValueChange={setSubjectTemplate}
                />
                <p className="text-[11px] leading-5 text-muted-foreground">
                  标题与画布上的区块都可用变量：{INTERVIEW_VARIABLES}。
                </p>
              </div>
            ) : (
              <EmailCanvas
                blocks={blocks}
                onBlocksChange={setBlocks}
                frame={frame}
                onFrameChange={setFrame}
                themeColor={themeColor}
                title={title}
                onTitleChange={setTitle}
                presets={stylePresets}
                onSavePreset={savePreset}
                onDeletePreset={deletePreset}
                accept={false}
                editable={writable}
                variables={variables}
              />
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t p-4 sm:flex-row sm:items-center sm:justify-between">
            {hasOverride && writable ? (
              <Button
                type="button"
                variant="outline"
                className="sm:w-auto"
                onClick={() => {
                  toast.promise(
                    resetInterviewScheduleEmailTemplate(setting.templateKey, department).then(
                      () => router.refresh(),
                    ),
                    {
                      loading: "正在恢复",
                      success: department
                        ? `已恢复为全局默认（删除${targetLabel}覆盖）`
                        : "已恢复为内置默认文案",
                      error: (error) => (error instanceof Error ? error.message : "恢复失败"),
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
            <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end")}>
              {writable && (
                <span
                  className={cn(
                    "self-center text-xs",
                    dirty ? "text-amber-700" : "text-muted-foreground",
                  )}
                >
                  {dirty ? "有未保存的改动 · ⌘/Ctrl+S 保存" : "已保存"}
                </span>
              )}
              <PreviewDialog
                title={`${definitionName}样张`}
                html={previewHtml}
                triggerLabel="预览"
                description={
                  isWithdrawalTemplate
                    ? "样张使用固定示例退回理由；真实发送时会替换为讲师填写的理由。"
                    : "样张使用固定示例数据；真实发送时会替换为预约信息。"
                }
              />
              {writable && (
                <Button type="button" className="w-full sm:w-auto" onClick={save}>
                  <Save data-icon="inline-start" />
                  保存到{targetLabel}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
      <EmailUnsavedChangesDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        onDiscard={discardAndClose}
        onSave={saveAndClose}
        canSave={writable}
      />
    </Dialog>
  );
}
