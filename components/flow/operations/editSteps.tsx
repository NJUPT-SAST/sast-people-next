'use client';
// import { batchUpdate } from '@/action/user-flow/edit';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { fullFlowSchema } from '@/components/flow/add';
import { fullStepType } from '@/types/step';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import z from 'zod';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { updateFlow } from '@/action/flow/update';
import { updateFlowStep } from '@/action/flow/flow-step/update';
import { displayFlow } from '@/types/flow';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DateTimeInput } from '@/components/ui/datetime-input';
import { useFlowStepsInfoClient } from '@/hooks/useFlowStepsInfoClient';

const writtenRecruitmentSteps = (flowId: number): fullStepType[] => [
  {
    title: '报名',
    type: 'registering',
    order: 1,
    description: '新同学提交报名信息，报名后直接进入批卷环节',
    id: -1,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    fkFlowId: flowId,
  },
  {
    title: '批卷',
    type: 'judging',
    order: 2,
    description: '讲师为该流程内报名同学批改试卷',
    id: -2,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    fkFlowId: flowId,
  },
  {
    title: '录取确认',
    type: 'finished',
    order: 3,
    description: '按分数线筛选并确认最终通过名单',
    id: -3,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    fkFlowId: flowId,
  },
];

const evaluationSteps = (flowId: number): fullStepType[] => [
  {
    title: '报名',
    type: 'registering',
    order: 1,
    description: '提交报名信息',
    id: -1,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    fkFlowId: flowId,
  },
  {
    title: '讲师审核',
    type: 'checking',
    order: 2,
    description: '讲师进行面评并提交同意或不同意',
    id: -2,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    fkFlowId: flowId,
  },
  {
    title: '管理员审核',
    type: 'finished',
    order: 3,
    description: '管理员审核面评结果并确认最终通过状态',
    id: -3,
    createdAt: new Date(),
    updatedAt: new Date(),
    isDeleted: false,
    fkFlowId: flowId,
  },
];

export const EditSteps = ({ data }: { data: displayFlow }) => {
  const editFlowForm = useForm<z.infer<typeof fullFlowSchema>>({
    resolver: zodResolver(fullFlowSchema),
    defaultValues: {
      title: data.title || '',
      description: data.description || '',
      startedAt: data.startedAt,
      endedAt: data.endedAt,
      id: data.id,
    },
  });

  const { isSubmitting } = editFlowForm.formState;
  const [openEdit, setOpenEdit] = useState(false);
  const isWrittenRecruitment = !data.type || data.type === 'recruitment';
  const { data: savedSteps } = useFlowStepsInfoClient(data.id);
  const fixedStepList = useMemo(() => {
    const defaults = isWrittenRecruitment
      ? writtenRecruitmentSteps(data.id)
      : evaluationSteps(data.id);

    return defaults.map((step) => {
      const savedStep = savedSteps?.find(
        (item) => item.order === step.order && item.type === step.type,
      );
      return {
        ...step,
        id: savedStep?.id ?? step.id,
        title: savedStep?.title ?? step.title,
        description: savedStep?.description ?? step.description,
      };
    });
  }, [data.id, isWrittenRecruitment, savedSteps]);
  const [editableSteps, setEditableSteps] = useState<fullStepType[]>(fixedStepList);

  useEffect(() => {
    setEditableSteps(fixedStepList);
  }, [fixedStepList]);

  return (
    <Sheet open={openEdit} onOpenChange={setOpenEdit}>
      <SheetTrigger asChild>
        <Button size={'sm'} variant={'ghost'} className="min-w-16">
          编辑流程
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full sm:w-3/4 sm:max-w-xl overflow-y-auto p-4 sm:p-6 flex flex-col">
        <SheetHeader className="px-1 pt-2 pb-2">
          <SheetTitle>流程编辑</SheetTitle>
          <SheetDescription>
            在下方编辑流程的基本信息与流程的步骤
          </SheetDescription>
        </SheetHeader>
        <Form {...editFlowForm}>
          <div className="grid gap-5 px-1 pb-32">
            <FormField
              control={editFlowForm.control}
              name="title"
              disabled={isSubmitting}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>流程名称</FormLabel>
                  <FormControl>
                    <Input placeholder="填写展示的流程名称" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={editFlowForm.control}
              name="description"
              disabled={isSubmitting}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>流程描述</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="填写展示的流程描述"
                      {...field}
                      value={field.value || ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={editFlowForm.control}
              name="startedAt"
              disabled={isSubmitting}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>开始时间</FormLabel>
                  <FormControl>
                    <DateTimeInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={editFlowForm.control}
              name="endedAt"
              disabled={isSubmitting}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>结束时间</FormLabel>
                  <FormControl>
                    <DateTimeInput {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 保存流程元数据按钮 */}
            <div className="flex justify-end mt-4 gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => {
                  const values = editFlowForm.getValues();
                  toast.promise(
                    updateFlow(values.id!, values),
                    {
                      loading: '正在保存流程信息',
                      success: `${values.title} 的基本信息已保存`,
                      error: '保存流程信息时出现问题，请稍后重试',
                    },
                  );
                }}
              >
                保存流程信息
              </Button>
            </div>

            <p className="text-sm text-muted-foreground">
              步骤数量、类型与顺序由流程类型固定；管理员可以调整步骤名称和描述。
            </p>
            {editableSteps.map((step, index) => {
              return (
                <fieldset
                  className="grid gap-6 rounded-lg border p-4"
                  key={`step${index}`}
                >
                  <legend className="-ml-1 px-1 text-sm font-medium text-muted-foreground">
                    步骤 {index + 1}
                  </legend>
                  <div className="grid gap-3">
                    <Label htmlFor={`step-${index}-type`}>
                      步骤类型
                    </Label>
                    <Select
                      value={step.type}
                      disabled
                    >
                      <SelectTrigger id={`step-${index}-type`}>
                        <SelectValue placeholder="选择步骤类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="registering">报名</SelectItem>
                        <SelectItem value="checking">审核</SelectItem>
                        <SelectItem value="judging">评分</SelectItem>
                        <SelectItem value="email">邮件</SelectItem>
                        <SelectItem value="finished">完成</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-3">
                    <Label htmlFor={`step-${index}-name`}>步骤名称</Label>
                    <Input
                      id={`step-${index}-name`}
                      placeholder="填写展示的步骤名称"
                      className="w-full"
                      disabled={isSubmitting}
                      value={step.title}
                      onChange={(event) => {
                        const nextSteps = [...editableSteps];
                        nextSteps[index] = {
                          ...nextSteps[index],
                          title: event.target.value,
                        };
                        setEditableSteps(nextSteps);
                      }}
                    />
                  </div>
                  <div className="grid gap-3">
                    <Label htmlFor={`step-${index}-description`}>步骤描述</Label>
                    <Textarea
                      id={`step-${index}-description`}
                      placeholder="填写展示的步骤描述"
                      className="w-full"
                      disabled={isSubmitting}
                      value={step.description || ''}
                      onChange={(event) => {
                        const nextSteps = [...editableSteps];
                        nextSteps[index] = {
                          ...nextSteps[index],
                          description: event.target.value,
                        };
                        setEditableSteps(nextSteps);
                      }}
                    />
                  </div>
                </fieldset>
              );
            })}
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => {
                  toast.promise(updateFlowStep(data.id, editableSteps), {
                    loading: '正在保存步骤',
                    success: '步骤名称和描述已保存',
                    error: '保存步骤时出现问题，请稍后重试',
                  });
                }}
              >
                保存步骤
              </Button>
            </div>
          </div>
          <SheetFooter />
        </Form>
      </SheetContent>
    </Sheet>
  );
};
