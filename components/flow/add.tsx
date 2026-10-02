'use client';
import { useMemo, useState } from 'react';
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
import { Label } from '../ui/label';
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
import { CUSTOM_FLOW_TYPE_VALUE, FlowTypeSelect } from './flowTypeField';
import { departmentKey, departmentLabel } from '@/const/department';
import {
  flowTypeLabel,
  flowTypeOptionsForDepartment,
  isOfficeInterviewFlow,
  parseFlowTypeOptionValue,
} from '@/const/flow';
import {
  addFlowSchema,
  editFlowSchema,
  fullFlowSchema,
} from '@/lib/validation/flow';

export { addFlowSchema, editFlowSchema, fullFlowSchema };

/* 原始流程类型：只在「其他（自定义）」分支使用；展示名由「当前部门」决定，见 flowTypeLabel */
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
  /* 语义化类型候选：管理员 = 全部「部门×阶段」组合；部长 = 本部门组合；部门未知时退化为自定义 */
  const semanticOptions = useMemo(
    () =>
      canChooseDepartment
        ? flowTypeOptionsForDepartment(null)
        : departmentKey(department)
          ? flowTypeOptionsForDepartment(department)
          : [],
    [canChooseDepartment, department],
  );
  const allowCustomType = canChooseDepartment || semanticOptions.length === 0;
  /* 部长默认沿用原有的「笔试」阶段，没有该阶段时取第一项 */
  const defaultTypeOption =
    semanticOptions.find((option) => option.type === 'recruitment') ??
    semanticOptions[0] ??
    null;
  const [typeOptionValue, setTypeOptionValue] = useState(() =>
    allowCustomType || !defaultTypeOption
      ? CUSTOM_FLOW_TYPE_VALUE
      : defaultTypeOption.value,
  );
  const addFlowForm = useForm<z.infer<typeof addFlowSchema>>({
    resolver: zodResolver(addFlowSchema),
    mode: "onChange",
    defaultValues: {
      title: '',
      description: '',
      type: (defaultTypeOption?.type ?? 'recruitment') as z.infer<
        typeof addFlowSchema
      >['type'],
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
  /* 「其他（自定义）」才展示原始类型与归属部门控件 */
  const isCustomType = typeOptionValue === CUSTOM_FLOW_TYPE_VALUE;
  /* 类型名跟随归属部门：管理员取对话框所选，其他账号取会话所属部门 */
  const labelDepartment = canChooseDepartment
    ? selectedDepartment ?? null
    : department;

  /* 选中语义化组合即同时确定 type 与 department；「其他（自定义）」保持原值交给下方控件维护 */
  const handleTypeOptionChange = (value: string) => {
    setTypeOptionValue(value);
    const parsed = parseFlowTypeOptionValue(value);
    if (!parsed) return;
    addFlowForm.setValue(
      'type',
      parsed.type as z.infer<typeof addFlowSchema>['type'],
    );
    /* 部长由服务端按会话部门解析归属部门，无需也不允许在此指定 */
    if (canChooseDepartment) {
      addFlowForm.setValue('department', parsed.department);
    }
    /* 切换为非办公类流程时清空仅办公类可用的配置，避免校验报错 */
    if (!isOfficeInterviewFlow(parsed.type)) {
      addFlowForm.setValue('slotOptions', []);
    }
  };

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
                  <FormLabel htmlFor="add-flow-type">流程类型</FormLabel>
                  <FlowTypeSelect
                    idPrefix="add-flow"
                    value={typeOptionValue}
                    options={semanticOptions}
                    extraOption={
                      allowCustomType
                        ? {
                            value: CUSTOM_FLOW_TYPE_VALUE,
                            label: '其他（自定义）',
                          }
                        : undefined
                    }
                    onChange={handleTypeOptionChange}
                    disabled={isSubmitting}
                  />
                  {isCustomType && (
                    <div className="grid gap-2 rounded-lg border border-dashed border-border/70 p-3">
                      <Label htmlFor="add-flow-raw-type">自定义类型</Label>
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
                        <SelectTrigger id="add-flow-raw-type">
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
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    选中的类型已同时确定归属部门；需要全局流程或列表外的类型时选择「其他（自定义）」。
                  </p>
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
            {canChooseDepartment && isCustomType && (
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
            {canChooseDepartment && !isCustomType && (
              <div className="grid gap-2">
                <span className="text-sm font-medium leading-none">归属部门</span>
                <p className="text-sm text-muted-foreground">
                  {departmentLabel(selectedDepartment)}
                </p>
                <p className="text-xs text-muted-foreground">
                  归属部门由所选流程类型确定；需要全局流程时选择「其他（自定义）」。
                </p>
              </div>
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
