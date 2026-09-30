'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { z } from 'zod/v4';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form';
import { Textarea } from '../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { toast } from 'sonner';
import { addFlow } from '@/action/flow/add';
import { DateTimeInput } from '../ui/datetime-input';
import { DepartmentSelect } from './departmentFields';
import { SlotOptionsField } from './officeInterviewFields';
import { flowTypeLabel, isOfficeInterviewFlow } from '@/const/flow';
import {
  addFlowSchema,
  editFlowSchema,
  fullFlowSchema,
} from '@/lib/validation/flow';

export { addFlowSchema, editFlowSchema, fullFlowSchema };

/* 可创建的流程类型；展示名由「当前部门」决定，见 flowTypeLabel */
const FLOW_TYPE_OPTIONS = [
  'recruitment',
  'recruitment_exemption',
  'woc',
  'soc',
  'office_interview',
] as const;

export const AddFlow = ({
  canChooseDepartment = false,
  department = null,
}: {
  canChooseDepartment?: boolean;
  /* 非管理员当前会话所属部门；管理员则在对话框内选择归属部门 */
  department?: string | null;
}) => {
  const router = useRouter();
  const addFlowForm = useForm<z.infer<typeof addFlowSchema>>({
    resolver: zodResolver(addFlowSchema),
    mode: "onChange",
    defaultValues: {
      title: '',
      description: '',
      type: 'recruitment' as const,
      startedAt: undefined,
      endedAt: undefined,
      department: canChooseDepartment ? null : undefined,
      groupOptions: [],
      groupDepartments: {},
      slotOptions: [],
    },
  });
  const { isSubmitting } = addFlowForm.formState;
  const [open, setOpen] = useState(false);
  const flowType = useWatch({ control: addFlowForm.control, name: 'type' });
  const selectedDepartment = useWatch({
    control: addFlowForm.control,
    name: 'department',
  });
  const isOfficeInterview = isOfficeInterviewFlow(flowType ?? '');
  /* 类型名跟随归属部门：管理员取对话框所选，其他账号取会话所属部门 */
  const labelDepartment = canChooseDepartment
    ? selectedDepartment ?? null
    : department;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-10 w-full sm:h-8 sm:w-auto">添加流程</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>添加流程</DialogTitle>
          <DialogDescription>
            添加新的流程类型，比如&quot;2026 校科协笔试招新&quot;
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Form {...addFlowForm}>
            <FormField
              control={addFlowForm.control}
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
              control={addFlowForm.control}
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
              control={addFlowForm.control}
              name="type"
              disabled={isSubmitting}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>流程类型</FormLabel>
                  <FormControl>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        /* 切换为非办公类流程时清空仅办公类可用的配置，避免校验报错 */
                        if (!isOfficeInterviewFlow(value)) {
                          addFlowForm.setValue('slotOptions', []);
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择流程类型" />
                      </SelectTrigger>
                      <SelectContent>
                        {FLOW_TYPE_OPTIONS.map((value) => (
                          <SelectItem key={value} value={value}>
                            {flowTypeLabel(value, labelDepartment)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isOfficeInterview && (
              <FormField
                control={addFlowForm.control}
                name="slotOptions"
                disabled={isSubmitting}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel htmlFor="add-flow-slots">面试时段</FormLabel>
                    <SlotOptionsField
                      idPrefix="add-flow"
                      disabled={isSubmitting}
                      value={field.value}
                      onChange={field.onChange}
                    />
                    <p className="text-xs text-muted-foreground">
                      候选人报名时从这里选择面谈时段；留空表示不提供集中面试时段。
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            {canChooseDepartment && (
              <FormField
                control={addFlowForm.control}
                name="department"
                disabled={isSubmitting}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>归属部门</FormLabel>
                    <FormControl>
                      <DepartmentSelect
                        allowGlobal={!isOfficeInterview}
                        disabled={isSubmitting}
                        value={field.value ?? null}
                        onChange={field.onChange}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <FormField
              control={addFlowForm.control}
              name="startedAt"
              disabled={isSubmitting}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>开始时间</FormLabel>
                    <FormControl>
                      <DateTimeInput
                        {...field}
                        native
                        value={field.value ?? undefined}
                        onChange={(date) => field.onChange(date ?? null)}
                      />
                    </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={addFlowForm.control}
              name="endedAt"
              disabled={isSubmitting}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>结束时间</FormLabel>
                    <FormControl>
                      <DateTimeInput
                        {...field}
                        native
                        value={field.value ?? undefined}
                        onChange={(date) => field.onChange(date ?? null)}
                      />
                    </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </Form>
        </div>
        <DialogFooter>
          <Button
            type="submit"
            // loading={isSubmitting}
            disabled={isSubmitting}
            onClick={addFlowForm.handleSubmit(async () => {
              const values = addFlowForm.getValues();
              const editPathForFlow = (flowId: number) => `/dashboard/flow/edit?id=${flowId}`;

              toast.promise(
                async () => {
                  await addFlow(values).then((flowId) => {
                    setOpen(false);
                    addFlowForm.reset();
                    if (flowId !== null) router.push(editPathForFlow(flowId));
                  });
                },
                {
                  loading: '正在添加',
                  success: `${values.title} 已添加成功`,
                  error: '添加的时候出现了问题，稍后重试',
                },
              );
            })}
          >
            确认添加
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
