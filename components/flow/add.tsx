'use client';
import React, { useState } from 'react';
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
import {
  DepartmentSelect,
  GroupDepartmentMapping,
  pickGroupDepartments,
} from './departmentFields';
import { SlotOptionsField } from './officeInterviewFields';
import { isOfficeInterviewFlow } from '@/const/flow';
import {
  addFlowSchema,
  editFlowSchema,
  fullFlowSchema,
} from '@/lib/validation/flow';

export { addFlowSchema, editFlowSchema, fullFlowSchema };

export const AddFlow = ({ canChooseDepartment = false }: { canChooseDepartment?: boolean }) => {
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
  const [groupOptionsText, setGroupOptionsText] = useState('');
  const flowType = useWatch({ control: addFlowForm.control, name: 'type' });
  const isOfficeInterview = isOfficeInterviewFlow(flowType ?? '');
  /* 每行一个组别（办公类流程即办公部门），去空行、去重 */
  const parsedGroupOptions = React.useMemo(
    () =>
      groupOptionsText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .filter((line, index, lines) => lines.indexOf(line) === index),
    [groupOptionsText],
  );

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
                          return;
                        }
                        /* 办公类流程是所有办公部门共用的共享流程，归属部门固定为空 */
                        addFlowForm.setValue('department', null);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="选择流程类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recruitment">笔试招新</SelectItem>
                        <SelectItem value="recruitment_exemption">免试招新</SelectItem>
                        <SelectItem value="woc">WOC/WOD</SelectItem>
                        <SelectItem value="soc">SOC/SOD</SelectItem>
                        <SelectItem value="office_interview">办公类部门面试招新</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isOfficeInterview && (
              <>
                <FormField
                  control={addFlowForm.control}
                  name="groupOptions"
                  disabled={isSubmitting}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>可投递的办公部门</FormLabel>
                      <FormControl>
                        <Textarea
                          className="min-h-24 resize-y"
                          value={groupOptionsText}
                          onChange={(event) => {
                            setGroupOptionsText(event.target.value);
                            field.onChange(
                              event.target.value
                                .split(/\r?\n/)
                                .map((line) => line.trim())
                                .filter((line) => line !== '')
                                .filter(
                                  (line, index, lines) =>
                                    lines.indexOf(line) === index,
                                ),
                            );
                          }}
                          placeholder={'每行一个办公部门，例如：\n办公室\n科宣部\n外联部\n赛事部'}
                        />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">
                        候选人报名时从这里选择第一志愿与第二志愿；留空则无法报名。
                      </p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={addFlowForm.control}
                  name="groupDepartments"
                  disabled={isSubmitting}
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <GroupDepartmentMapping
                          groupOptions={parsedGroupOptions}
                          value={field.value ?? {}}
                          onChange={(next) =>
                            field.onChange(
                              pickGroupDepartments(parsedGroupOptions, next),
                            )
                          }
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
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
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
            {canChooseDepartment && !isOfficeInterview && (
              <FormField
                control={addFlowForm.control}
                name="department"
                disabled={isSubmitting}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>归属部门</FormLabel>
                    <FormControl>
                      <DepartmentSelect
                        allowGlobal
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
                    setGroupOptionsText('');
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
