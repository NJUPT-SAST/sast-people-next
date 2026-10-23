'use client';
import { Button } from '@/components/ui/button';
import { Sparkles } from 'lucide-react';
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
    <div className="flex items-start gap-3">
      <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-primary ring-1 ring-border/60">
        <Sparkles className="size-[18px]" />
      </span>
      <div className="space-y-1">
        <h2 className="text-base font-semibold tracking-tight sm:text-lg">我的能力</h2>
        <p className="text-sm text-muted-foreground">能力信息来自 SAST Link</p>
      </div>
    </div>
  );
  const content = (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {fields.map(([label, value], index) => (
        <div
          key={label}
          className={index === fields.length - 1 ? "min-w-0 sm:col-span-2" : "min-w-0"}
        >
          <dt className="text-xs font-medium tracking-wide text-muted-foreground">{label}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-[15px] font-medium text-foreground">
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
