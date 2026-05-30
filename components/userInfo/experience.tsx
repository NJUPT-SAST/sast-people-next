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

const experienceFieldsSchema = z.object({
  github: z.string().trim().optional(),
  blog: z.string().trim().optional(),
  personalStatement: z.string().trim().optional(),
});

type ExperienceFields = z.infer<typeof experienceFieldsSchema>;
export type ExperienceInfoValue = userType & Partial<ExperienceFields>;

export const experienceSchema = experienceFieldsSchema;

export const ExperienceInfo = ({
  initialInfo,
}: {
  initialInfo: ExperienceInfoValue;
}) => {
  const linkProfileUrl =
    process.env.NEXT_PUBLIC_LINK_PROFILE_URL || 'https://link.sast.fun';
  const form = useForm<ExperienceFields>({
    resolver: zodResolver(experienceSchema),
    defaultValues: {
      github: initialInfo.github ?? '',
      blog: initialInfo.blog ?? '',
      personalStatement: initialInfo.personalStatement ?? '',
    },
  });

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>我的能力</CardTitle>
        <CardDescription>
          能力信息来自 SAST Link
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <Form {...form}>
          <div className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="github"
              disabled
              render={({ field }) => (
                <FormItem>
                  <FormLabel>GitHub 主页地址</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="请填写你的GitHub主页地址"
                      {...field}
                      value={field.value ?? ''}
                      disabled
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="blog"
              disabled
              render={({ field }) => (
                <FormItem>
                  <FormLabel>博客地址</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="请填写你的博客地址"
                      {...field}
                      value={field.value ?? ''}
                      disabled
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="personalStatement"
              disabled
              render={({ field }) => (
                <FormItem>
                  <FormLabel>自我介绍</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="请填写你的个人介绍"
                      className="min-h-48"
                      {...field}
                      value={field.value ?? ''}
                      disabled
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
        <Button asChild>
          <a href={linkProfileUrl} target="_blank" rel="noreferrer">
            前往 Link 修改
          </a>
        </Button>
      </CardFooter>
    </Card>
  );
};
