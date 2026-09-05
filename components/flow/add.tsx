'use client';
import React, { useState } from 'react';
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
import { useForm } from 'react-hook-form';
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
  addFlowSchema,
  editFlowSchema,
  fullFlowSchema,
} from '@/lib/validation/flow';

export { addFlowSchema, editFlowSchema, fullFlowSchema };

export const AddFlow = () => {
  const addFlowForm = useForm<z.infer<typeof addFlowSchema>>({
    resolver: zodResolver(addFlowSchema),
    mode: "onChange",
    defaultValues: {
      title: '',
      description: '',
      type: 'recruitment' as const,
      startedAt: undefined,
      endedAt: undefined,
    },
  });
  const { isSubmitting } = addFlowForm.formState;
  const [open, setOpen] = useState(false);

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
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="选择流程类型" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recruitment">笔试招新</SelectItem>
                        <SelectItem value="recruitment_exemption">免试招新</SelectItem>
                        <SelectItem value="woc">WOC/WOD</SelectItem>
                        <SelectItem value="soc">SOC/SOD</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={addFlowForm.control}
              name="startedAt"
              disabled={isSubmitting}
              render={({ field }) => (
                <FormItem>
                  <FormLabel>开始时间</FormLabel>
                    <FormControl>
                      <DateTimeInput {...field} native />
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
                      <DateTimeInput {...field} native />
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
              toast.promise(
                async () => {
                  await addFlow(addFlowForm.getValues()).then(() => {
                    setOpen(false);
                    addFlowForm.reset();
                  });
                },
                {
                  loading: '正在添加',
                  success: `${addFlowForm.getValues().title} 已添加成功`,
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
