'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { departmentLabel } from '@/const/department';
import {
  flowTypeLabel,
  flowTypeOptionOf,
  flowTypeOptionsForDepartment,
  isOfficeInterviewFlow,
  parseFlowTypeOptionValue,
} from '@/const/flow';
import { DepartmentSelect, GroupDepartmentMapping, pickGroupDepartments } from '@/components/flow/departmentFields';
import { SlotOptionsField } from '@/components/flow/officeInterviewFields';
import { CURRENT_FLOW_TYPE_VALUE, FlowTypeReadonly, FlowTypeSelect } from '@/components/flow/flowTypeField';
import { saveFlowWorkspace } from '@/action/flow/save-workspace';
import { displayFlow } from '@/types/flow';
import { fullStepType } from '@/types/step';
import { useFlowStepsInfoClient } from '@/hooks/useFlowStepsInfoClient';

const writtenRecruitmentSteps = (flowId: number): fullStepType[] => [
  { title: '报名', type: 'registering', order: 1, description: '新同学提交报名信息，报名后直接进入批卷环节', id: -1, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, fkFlowId: flowId },
  { title: '批卷', type: 'judging', order: 2, description: '讲师为该流程内报名同学批改试卷', id: -2, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, fkFlowId: flowId },
  { title: '录取确认', type: 'finished', order: 3, description: '按分数线筛选并确认最终通过名单', id: -3, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, fkFlowId: flowId },
];

/* 办公类部门面试招新的客户端默认步骤，必须与服务端 action/flow/defaultSteps.ts 的 officeInterviewSteps 一致 */
const officeInterviewSteps = (flowId: number): fullStepType[] => [
  { title: '报名', type: 'registering', order: 1, description: '填写个人信息，选择第一志愿与第二志愿办公部门及面试时段', id: -1, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, fkFlowId: flowId },
  { title: '一面', type: 'checking', order: 2, description: '部门部长进行一对一面试并打分', id: -2, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, fkFlowId: flowId },
  { title: '二面', type: 'checking', order: 3, description: '无领导小组面试，多位部长共同打分（一面通过后进入）', id: -3, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, fkFlowId: flowId },
  { title: '结果确认', type: 'finished', order: 4, description: '确认最终通过名单并发送结果通知', id: -4, createdAt: new Date(), updatedAt: new Date(), isDeleted: false, fkFlowId: flowId },
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
  getDraft: () => { values: z.infer<typeof editFlowSchema>; steps: fullStepType[] };
};

export const FlowEditor = forwardRef<FlowEditorHandle, { data: displayFlow; embedded?: boolean; hideSaveButton?: boolean; canChooseDepartment?: boolean }>(function FlowEditor(
  { data, embedded = false, hideSaveButton = false, canChooseDepartment = false },
  ref,
) {
  const form = useForm<z.infer<typeof editFlowSchema>>({
    resolver: zodResolver(editFlowSchema),
    defaultValues: {
      title: data.title || '',
      description: data.description || '',
      type: data.type,
      startedAt: data.startedAt,
      endedAt: data.endedAt ?? null,
      groupOptions: data.groupOptions ?? [],
      slotOptions: data.slotOptions ?? [],
      id: data.id,
    },
  });
  const { isSubmitting } = form.formState;
  const [isSaving, setIsSaving] = useState(false);
  /* 类型可被管理员改：派生字段（步骤模板、可配置项）都跟随当前选中的类型 */
  const currentType = useWatch({ control: form.control, name: 'type' }) ?? data.type;
  const isWrittenRecruitment = !currentType || currentType === 'recruitment';
  /* 办公类部门面试招新：每个办公部门一条流程，额外配置面试时段 */
  const isOfficeInterview = isOfficeInterviewFlow(currentType);
  const { data: savedSteps } = useFlowStepsInfoClient(data.id);
  const defaults = useMemo(
    () =>
      isWrittenRecruitment
        ? writtenRecruitmentSteps(data.id)
        : isOfficeInterview
          ? officeInterviewSteps(data.id)
          : evaluationSteps(data.id),
    [data.id, isWrittenRecruitment, isOfficeInterview],
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
  const [department, setDepartment] = useState<string | null>(data.department ?? null);
  /* 语义化「流程类型」：管理员可改（组合口径 = type + department）；非管理员只读 */
  const currentTypeOption = flowTypeOptionOf(currentType, department);
  const typeOptionValue = currentTypeOption?.value ?? CURRENT_FLOW_TYPE_VALUE;

  /* 改类型即同时改归属部门；选中「当前」回落项（解析失败）时不改动任何值 */
  const handleTypeOptionChange = (value: string) => {
    const parsed = parseFlowTypeOptionValue(value);
    if (!parsed) return;
    form.setValue('type', parsed.type as displayFlow['type']);
    setDepartment(parsed.department);
    /* 非办公类流程不保留仅办公类可用的面试时段，避免校验报错 */
    if (!isOfficeInterviewFlow(parsed.type)) form.setValue('slotOptions', []);
  };
  const [groupDepartments, setGroupDepartments] = useState<Record<string, string>>(
    data.groupDepartments ?? {},
  );
  const parsedGroupOptions = useMemo(
    () => groupOptionsText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).filter((line, index, lines) => lines.indexOf(line) === index),
    [groupOptionsText],
  );

  useEffect(() => setEditableSteps(fixedStepList), [fixedStepList]);

  /* 组别映射仅用于非办公类面试流程；办公类流程按归属部门隔离 */
  const groupValues = {
    groupOptions: parsedGroupOptions,
    groupDepartments: pickGroupDepartments(parsedGroupOptions, groupDepartments),
  };

  const save = async () => {
    const values = form.getValues();
    setGroupOptionsText(parsedGroupOptions.join('\n'));
    setIsSaving(true);
    try {
      await saveFlowWorkspace({
        flowId: data.id,
        values: {
          ...values,
          ...groupValues,
          department,
        },
        steps: editableSteps,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getDraft = () => ({
    values: {
      ...form.getValues(),
      ...groupValues,
      department,
    },
    steps: editableSteps,
  });

  useImperativeHandle(ref, () => ({ save, getDraft }));

  const saveWithToast = () => toast.promise(save(), {
    loading: '正在保存流程信息和步骤',
    success: '流程信息和步骤已保存',
    error: '保存流程信息时出现问题，请稍后重试',
  });

  return (
    <div className="min-w-0 space-y-5">
      {!embedded && (
        <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
          <Button asChild variant="ghost" className="h-10 px-2 sm:h-9">
            <Link href="/dashboard/flow" className="min-w-0">
              <span className="inline-flex items-center gap-2 text-lg font-semibold md:text-2xl"><ArrowLeft className="size-5 shrink-0" />编辑流程</span>
            </Link>
          </Button>
          <p className="truncate px-2 text-sm text-muted-foreground sm:max-w-[50%] sm:text-right">{data.title}</p>
        </div>
      )}

      <Form {...form}>
        <section className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-1 border-b pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <h1 className="text-lg font-semibold sm:text-xl">流程基本信息</h1>
              <p className="mt-1 text-sm text-muted-foreground">维护流程名称、说明、时间和报名配置。</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!hideSaveButton && <Button type="button" onClick={saveWithToast} disabled={isSubmitting || isSaving}>保存全部更改</Button>}
            </div>
          </div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <FormField control={form.control} name="title" disabled={isSubmitting} render={({ field }) => <FormItem><FormLabel>流程名称</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>} />
            <div className="lg:row-span-2"><FormField control={form.control} name="description" disabled={isSubmitting} render={({ field }) => <FormItem><FormLabel>流程描述</FormLabel><FormControl><Textarea className="min-h-24 resize-y" {...field} value={field.value || ''} /></FormControl><FormMessage /></FormItem>} /></div>
            <FormField control={form.control} name="startedAt" disabled={isSubmitting} render={({ field }) => <FormItem><FormLabel>开始时间</FormLabel><FormControl><DateTimeInput {...field} native value={field.value ?? undefined} onChange={(date) => field.onChange(date ?? null)} /></FormControl><FormMessage /></FormItem>} />
            <FormField control={form.control} name="endedAt" disabled={isSubmitting} render={({ field }) => <FormItem><FormLabel>结束时间</FormLabel><FormControl><DateTimeInput {...field} native value={field.value ?? undefined} onChange={(date) => field.onChange(date ?? null)} /></FormControl><FormMessage /></FormItem>} />
            {isOfficeInterview && (
              <FormField control={form.control} name="slotOptions" disabled={isSubmitting} render={({ field }) => <FormItem className="lg:col-span-2"><FormLabel htmlFor={`flow-editor-${data.id}-slots`}>面试时段</FormLabel><SlotOptionsField idPrefix={`flow-editor-${data.id}`} disabled={isSubmitting} value={field.value} onChange={field.onChange} /><FormMessage /></FormItem>} />
            )}
            {!isWrittenRecruitment && !isOfficeInterview && <FormField control={form.control} name="groupOptions" disabled={isSubmitting} render={() => <FormItem className="lg:col-span-2"><FormLabel>投递组别选项</FormLabel><FormControl><Textarea className="min-h-24 resize-y" value={groupOptionsText} onChange={(event) => setGroupOptionsText(event.target.value)} placeholder={'每行一个组别，例如：\n前端组\n后端组\n算法组'} /></FormControl><p className="text-xs text-muted-foreground">每行一个组别，留空表示不启用投递组别。</p><FormMessage /></FormItem>} />}
            <div className="grid gap-2">
              <span className="text-sm font-medium leading-none">流程类型</span>
              {canChooseDepartment ? (
                <FlowTypeSelect
                  idPrefix={`flow-editor-${data.id}`}
                  value={typeOptionValue}
                  options={flowTypeOptionsForDepartment(null)}
                  extraOption={
                    currentTypeOption
                      ? undefined
                      : {
                          value: CURRENT_FLOW_TYPE_VALUE,
                          label: `${flowTypeLabel(currentType, department)}（当前，未在标准列表）`,
                        }
                  }
                  onChange={handleTypeOptionChange}
                  disabled={isSubmitting}
                />
              ) : (
                <FlowTypeReadonly type={currentType} department={department} />
              )}
              <p className="text-xs text-muted-foreground">流程类型决定步骤模板与可配置项；仅管理员可修改，改类型会同时更新归属部门。</p>
            </div>
            <div className="grid gap-2 lg:col-span-2">
              <span className="text-sm font-medium leading-none">归属部门</span>
              {canChooseDepartment ? (
                <DepartmentSelect allowGlobal={!isOfficeInterview} disabled={isSubmitting} value={department} onChange={setDepartment} />
              ) : (
                <p className="text-sm text-muted-foreground">{departmentLabel(department)}</p>
              )}
              <p className="text-xs text-muted-foreground">部长只能维护本部门的流程；全局流程仅管理员可见可改。</p>
            </div>
            {!isOfficeInterview && (
              <div className="lg:col-span-2">
                <GroupDepartmentMapping groupOptions={parsedGroupOptions} value={groupDepartments} onChange={setGroupDepartments} disabled={isSubmitting} />
              </div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-border/80 bg-card/80 p-4 shadow-sm sm:p-6">
          <div className="flex flex-col gap-1 border-b pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div><h2 className="text-lg font-semibold sm:text-xl">流程步骤</h2><p className="mt-1 text-sm text-muted-foreground">步骤数量、类型和顺序由流程类型固定，可调整展示名称和说明。</p></div>
            {!hideSaveButton && <span className="text-xs text-muted-foreground">步骤会随上方“保存全部更改”一起保存</span>}
          </div>
          <div className="mt-5 grid gap-4 xl:grid-cols-3">
            {editableSteps.map((step, index) => (
              <fieldset key={`step-${step.order}`} className="rounded-xl border border-border/70 bg-background/40 p-4 transition-colors focus-within:border-primary/40 focus-within:bg-primary/[0.03]">
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
