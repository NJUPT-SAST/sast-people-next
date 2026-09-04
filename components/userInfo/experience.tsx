'use client';
import { Button } from '@/components/ui/button';
import { z } from 'zod';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '../ui/card';
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
  embedded = false,
}: {
  initialInfo: ExperienceInfoValue;
  embedded?: boolean;
}) => {
  const linkProfileUrl =
    process.env.NEXT_PUBLIC_LINK_PROFILE_URL || 'https://link.sast.fun';
  const fields = [
    ["GitHub 主页地址", initialInfo.github],
    ["博客地址", initialInfo.blog],
    ["自我介绍", initialInfo.personalStatement],
  ] as const;

  const header = (
    <div className="space-y-1">
      <h2 className="text-lg font-semibold tracking-tight">我的能力</h2>
      <p className="text-sm text-muted-foreground">能力信息来自 SAST Link</p>
    </div>
  );
  const content = (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {fields.map(([label, value], index) => (
        <div
          key={label}
          className={index === fields.length - 1 ? "space-y-1 sm:col-span-2" : "space-y-1"}
        >
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="whitespace-pre-wrap break-words text-sm font-medium text-foreground">
            {value || "未填写"}
          </dd>
        </div>
      ))}
    </dl>
  );

  if (embedded) {
    return (
      <section className="min-w-0 space-y-6 border-t p-6 sm:p-8">
        {header}
        {content}
      </section>
    );
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>我的能力</CardTitle>
        <CardDescription>能力信息来自 SAST Link</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">{content}</CardContent>
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
