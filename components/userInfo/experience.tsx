'use client';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../ui/form';
import { Input } from '../ui/input';
import { Textarea } from '@/components/ui/textarea';
import { userType } from '@/types/user';
import { toast } from 'sonner';

const experienceFieldsSchema = z.object({
  github: z.string().trim().optional(),
  blog: z.string().trim().optional(),
  personalStatement: z.string().trim().optional(),
});

type ExperienceFields = z.infer<typeof experienceFieldsSchema>;
type ExperienceInfoValue = userType & Partial<ExperienceFields>;

export const experienceSchema = experienceFieldsSchema;

export const ExperienceInfo = ({
  initialInfo,
}: {
  initialInfo: ExperienceInfoValue;
}) => {
  const form = useForm<ExperienceFields>({
    resolver: zodResolver(experienceSchema),
    defaultValues: {
      github: initialInfo.github ?? '',
      blog: initialInfo.blog ?? '',
      personalStatement: initialInfo.personalStatement ?? '',
    },
  });
  const { isSubmitting } = form.formState;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>我的能力</CardTitle>
        <CardDescription>
          请与我们分享你目前的兴趣与能力，以便找到最合适的部门
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <Form {...form}>
          <div className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="github"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>GitHub 主页地址</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="请填写你的GitHub主页地址"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="blog"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>博客地址</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="请填写你的博客地址"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="personalStatement"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>自我介绍</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="请填写你的个人介绍"
                      className="min-h-48"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </Form>
      </CardContent>
      <CardFooter className="mt-auto justify-end border-t pt-4">
        <Button
          type="button"
          loading={isSubmitting}
          disabled={isSubmitting}
          onClick={form.handleSubmit(async () => {
            toast.success('个人信息保存成功');
          })}
        >
          保存
        </Button>
      </CardFooter>
    </Card>
  );
};
