'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod/v4';
import { zodResolver } from '@hookform/resolvers/zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateTimeInput } from '@/components/ui/datetime-input';
import { editFlowSchema } from '@/components/flow/add';
import { updateFlow } from '@/action/flow/update';
import { updateFlowStep } from '@/action/flow/flow-step/update';
import { displayFlow } from '@/types/flow';
import { fullStepType } from '@/types/step';
import { useFlowStepsInfoClient } from '@/hooks/useFlowStepsInfoClient';

const writtenRecruitmentSteps = (flowId: number): fullStepType[] => [
  { title: '报名', type: 'registering', order: 1, description: '新同学提交报名信息，报名后直接进入批卷环节', id: -1, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, fkFlowId: flowId },
  { title: '批卷', type: 'judging', order: 2, description: '讲师为该流程内报名同学批改试卷', id: -2, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, fkFlowId: flowId },
  { title: '录取确认', type: 'finished', order: 3, description: '按分数线筛选并确认最终通过名单', id: -3, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, fkFlowId: flowId },
];

const evaluationSteps = (flowId: number): fullStepType[] => [
  { title: '报名', type: 'registering', order: 1, description: '提交报名信息', id: -1, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, fkFlowId: flowId },
  { title: '讲师审核', type: 'checking', order: 2, description: '讲师进行面评并提交同意或不同意', id: -2, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, fkFlowId: flowId },
  { title: '管理员审核', type: 'finished', order: 3, description: '管理员审核面评结果并确认最终通过状态', id: -3, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, fkFlowId: flowId },
];

const stepTypeLabel: Record<string, string> = {
  registering: '报名',
  checking: '审核',
  judging: '评分',
  email: '邮件',
  finished: '完成',
};

export type FlowEditorHandle = {
  save: () => Promise<void>;
};

export const FlowEditor = forwardRef<FlowEditorHandle, { data: displayFlow; embedded?: boolean; hideSaveButton?: boolean; showExamLink?: boolean }>(function FlowEditor(
  { data, embedded = false, hideSaveButton = false, showExamLink = true },
  ref,
) {
  const form = useForm<z.infer<typeof editFlowSchema>>({
    resolver: zodResolver(editFlowSchema),
    defaultValues: {
      title: data.title || '',
      description: data.description || '',
      startedAt: data.startedAt,
      endedAt: data.endedAt ?? null,
      groupOptions: data.groupOptions ?? [],
      id: data.id,
    },
  });
  const { isSubmitting } = form.formState;
  const [isSaving, setIsSaving] = useState(false);
  const isWrittenRecruitment = !data.type || data.type === 'recruitment';
  const { data: savedSteps } = useFlowStepsInfoClient(data.id);
  const defaults = useMemo(
    () => (isWrittenRecruitment ? writtenRecruitmentSteps(data.id) : evaluationSteps(data.id)),
    [data.id, isWrittenRecruitment],
  );
  const fixedStepList = useMemo(
    () => defaults.map((step) => {
      const saved = savedSteps?.find((item) => item.order === step.order && item.type === step.type);
      return { ...step, id: saved?.id ?? step.id, title: saved?.title ?? step.title, description: saved?.description ?? step.description };
    }),
    [defaults, savedSteps],
  );
  const [editableSteps, setEditableSteps] = useState<fullStepType[]>(fixedStepList);
  const [groupOptionsText, setGroupOptionsText] = useState((data.groupOptions ?? []).join('\n'));

  useEffect(() => setEditableSteps(fixedStepList), [fixedStepList]);

  const save = async () => {
    const values = form.getValues();
    const parsedGroups = groupOptionsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line, index, lines) => lines.indexOf(line) === index);
    setGroupOptionsText(parsedGroups.join('\n'));
    setIsSaving(true);
    try {
      await Promise.all([
        updateFlow(values.id!, { ...values, groupOptions: parsedGroups }),
        updateFlowStep(data.id, editableSteps),
      ]);
    } finally {
      setIsSaving(false);
    }
  };

  useImperativeHandle(ref, () => ({ save }));

  const saveWithToast = () => toast.promise(save(), {
    loading: '正在保存流程信息和步骤',
    success: '流程信息和步骤已保存',
    error: '保存流程信息时出现问题，请稍后重试',
  });

  return (
    <div className="min-w-0 space-y-5">
      {!embedded && (
        <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/dashboard/flow" className="min-w-0">
            <Button variant="ghost" className="h-10 px-2 sm:h-9">
              <span className="inline-flex items-center gap-2 text-lg font-semibold md:text-2xl"><ArrowLeft className="size-5 shrink-0" />编辑流程</span>
            </Button>
          </Link>
          <p className="truncate px-2 text-sm text-muted-foreground sm:max-w-[50%] sm:text-right">{data.title}</p>
        </div>
      )}

      <Form {...form}>
        <section className="rounded-lg border bg-card p-4 sm:p-6">
          <div className="flex flex-col gap-1 border-b pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <h1 className="text-lg font-semibold sm:text-xl">流程基本信息</h1>
              <p className="mt-1 text-sm text-muted-foreground">维护流程名称、说明、时间和报名配置。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {isWrittenRecruitment && showExamLink && <Button asChild variant="outline"><Link href={`/dashboard/flow/edit-exam?id=${data.id}`}>编辑笔试题目</Link></Button>}
              {!hideSaveButton && <Button type="button" onClick={saveWithToast} disabled={isSubmitting || isSaving}>保存全部更改</Button>}
            </div>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <FormField control={form.control} name="title" disabled={isSubmitting} render={({ field }) => <FormItem><FormLabel>流程名称</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
            <div className="lg:row-span-2"><FormField control={form.control} name="description" disabled={isSubmitting} render={({ field }) => <FormItem><FormLabel>流程描述</FormLabel><FormControl><Textarea className="min-h-28" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>} /></div>
            <FormField control={form.control} name="startedAt" disabled={isSubmitting} render={({ field }) => <FormItem><FormLabel>开始时间</FormLabel><FormControl><DateTimeInput {...field} native value={field.value ?? undefined} onChange={(date) => field.onChange(date ?? null)} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="endedAt" disabled={isSubmitting} render={({ field }) => <FormItem><FormLabel>结束时间</FormLabel><FormControl><DateTimeInput {...field} native value={field.value ?? undefined} onChange={(date) => field.onChange(date ?? null)} /></FormControl><FormMessage /></FormItem>} />
            {!isWrittenRecruitment && <FormField control={form.control} name="groupOptions" disabled={isSubmitting} render={() => <FormItem className="lg:col-span-2"><FormLabel>投递组别选项</FormLabel><FormControl><Textarea className="min-h-28" value={groupOptionsText} onChange={(event) => setGroupOptionsText(event.target.value)} placeholder={'每行一个组别，例如：\n前端组\n后端组\n算法组'} /></FormControl><p className="text-xs text-muted-foreground">每行一个组别，留空表示不启用投递组别。</p><FormMessage /></FormItem>} />}
          </div>
        </section>

        <section className="rounded-lg border bg-card p-4 sm:p-6">
          <div className="flex flex-col gap-1 border-b pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div><h2 className="text-lg font-semibold sm:text-xl">流程步骤</h2><p className="mt-1 text-sm text-muted-foreground">步骤数量、类型和顺序由流程类型固定，可调整展示名称和说明。</p></div>
            {!hideSaveButton && <span className="text-xs text-muted-foreground">步骤会随上方“保存全部更改”一起保存</span>}
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {editableSteps.map((step, index) => (
              <fieldset key={`step-${step.order}`} className="rounded-lg border bg-muted/10 p-4">
                <legend className="px-1 text-sm font-medium text-muted-foreground">步骤 {index + 1}</legend>
                <div className="mt-2 grid gap-4">
                  <div className="grid gap-2"><Label htmlFor={`flow-step-type-${step.order}`}>步骤类型</Label><Select value={step.type} disabled><SelectTrigger id={`flow-step-type-${step.order}`}><SelectValue placeholder="选择步骤类型" /></SelectTrigger><SelectContent>{Object.entries(stepTypeLabel).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                  <div className="grid gap-2"><Label htmlFor={`flow-step-title-${step.order}`}>步骤名称</Label><Input id={`flow-step-title-${step.order}`} value={step.title} disabled={isSubmitting} onChange={(event) => setEditableSteps((current) => current.map((item) => item.order === step.order ? { ...item, title: event.target.value } : item))} /></div>
                  <div className="grid gap-2"><Label htmlFor={`flow-step-description-${step.order}`}>步骤描述</Label><Textarea id={`flow-step-description-${step.order}`} className="min-h-24" value={step.description || ''} disabled={isSubmitting} onChange={(event) => setEditableSteps((current) => current.map((item) => item.order === step.order ? { ...item, description: event.target.value } : item))} /></div>
                </div>
              </fieldset>
            ))}
          </div>
        </section>
      </Form>
    </div>
  );
});
