"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveCollectionSubmission } from "@/action/collection";
import {
  COLLECTION_CATEGORIES,
  COLLECTION_CLUB_NAME,
  COLLECTION_POLITICAL_STATUSES,
  type CollectionExtraField,
  type CollectionLinkProfile,
} from "@/const/collection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CollectionSubmissionInput } from "@/lib/validation/collection";

export type CollectionFormValues = {
  category: string;
  name: string;
  birthMonth: string;
  politicalStatus: string;
  college: string;
  className: string;
  studentId: string;
  enrollmentYear: number | null;
  graduationYear: number | null;
};

interface CollectionFormProps {
  formId: number;
  editable: boolean;
  initialValues: CollectionFormValues;
  hasSaved: boolean;
  updatedAtLabel: string | null;
  extraFields: CollectionExtraField[];
  initialExtraAnswers: Record<string, string>;
  linkProfile: CollectionLinkProfile;
  /** 身份不符合填写限制时的说明；截止时留空，走默认文案 */
  readonlyNotice?: string;
}

const CORE_FIELD_LABELS: Array<[keyof CollectionFormValues, string]> = [
  ["category", "类别"],
  ["name", "姓名"],
  ["birthMonth", "出生年月"],
  ["politicalStatus", "政治面貌"],
  ["college", "所在学院"],
  ["className", "所在班级"],
  ["studentId", "学号"],
  ["enrollmentYear", "入学年份"],
  ["graduationYear", "预计毕业年份"],
];

const EXTRA_FIELD_MAX_LENGTH: Record<CollectionExtraField["type"], number> = {
  text: 500,
  textarea: 5000,
  number: 64,
  select: 60,
};

export function CollectionForm({
  formId,
  editable,
  initialValues,
  hasSaved,
  updatedAtLabel,
  extraFields,
  initialExtraAnswers,
  linkProfile,
  readonlyNotice,
}: CollectionFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [birthYear, setBirthYear] = useState(
    () => initialValues.birthMonth.split("-")[0] ?? "",
  );
  const [birthMonthPart, setBirthMonthPart] = useState(
    () => initialValues.birthMonth.split("-")[1] ?? "",
  );
  const currentYear = new Date().getFullYear();
  const birthYears = Array.from(
    { length: currentYear - 1950 + 1 },
    (_, index) => String(currentYear - index),
  );
  const birthMonths = Array.from({ length: 12 }, (_, index) =>
    String(index + 1).padStart(2, "0"),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable) return;

    const form = new FormData(event.currentTarget);
    const extraAnswers = Object.fromEntries(
      extraFields.map((field) => [
        field.id,
        String(form.get(`extra_${field.id}`) ?? ""),
      ]),
    );
    setSubmitting(true);
    try {
      const result = await saveCollectionSubmission(formId, {
        category: String(form.get("category") ?? "") as CollectionSubmissionInput["category"],
        name: String(form.get("name") ?? ""),
        birthMonth:
          birthYear && birthMonthPart ? `${birthYear}-${birthMonthPart}` : "",
        politicalStatus: String(form.get("politicalStatus") ?? "") as CollectionSubmissionInput["politicalStatus"],
        college: String(form.get("college") ?? ""),
        className: String(form.get("className") ?? ""),
        studentId: String(form.get("studentId") ?? ""),
        enrollmentYear: Number(form.get("enrollmentYear")),
        graduationYear: Number(form.get("graduationYear")),
        extraAnswers,
      });
      if (!result.success) throw new Error(result.message);
      toast.success(hasSaved ? "已保存修改" : "已提交");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提交失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  if (!editable) {
    const readonlyRows = [
      { label: "社团名称", value: COLLECTION_CLUB_NAME },
      ...CORE_FIELD_LABELS.map(([key, label]) => ({
        label,
        value: String(initialValues[key] ?? ""),
      })),
      ...extraFields.map((field) => ({
        label: field.label,
        value: initialExtraAnswers[field.id] ?? "",
      })),
    ];

    return (
      <div className="space-y-5">
        <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {readonlyNotice ??
            (hasSaved
              ? "收集已结束，以下为你提交的内容。"
              : "收集已结束，你没有提交记录。")}
        </p>
        {hasSaved && (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {readonlyRows.map(({ label, value }) => (
              <div key={label} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-1 break-words text-sm font-medium text-foreground">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}
        {updatedAtLabel && (
          <p className="text-xs text-muted-foreground">最后更新：{updatedAtLabel}</p>
        )}
      </div>
    );
  }

  return (
    <form className="space-y-5" onSubmit={submit}>
      {hasSaved && (
        <p className="rounded-md border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          你已经提交过；再次提交会更新原记录。
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="collection-club-name">社团名称</Label>
          <Input
            id="collection-club-name"
            value={COLLECTION_CLUB_NAME}
            readOnly
            disabled
          />
          <p className="text-xs text-muted-foreground">社团名称固定，无需填写。</p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="collection-category">类别</Label>
          <Select
            name="category"
            defaultValue={initialValues.category || undefined}
            required
          >
            <SelectTrigger id="collection-category">
              <SelectValue placeholder="请选择类别" />
            </SelectTrigger>
            <SelectContent>
              {COLLECTION_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="collection-name">姓名</Label>
          <Input
            id="collection-name"
            name="name"
            required
            maxLength={60}
            defaultValue={initialValues.name || linkProfile.name}
            placeholder="请输入姓名"
          />
          {!initialValues.name && linkProfile.name && (
            <p className="text-xs text-muted-foreground">已自动带入 SAST Link 资料，可修改。</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label>出生年月</Label>
          <div className="grid grid-cols-2 gap-3">
            <Select value={birthYear || undefined} onValueChange={setBirthYear} required>
              <SelectTrigger aria-label="出生年份">
                <SelectValue placeholder="年份" />
              </SelectTrigger>
              <SelectContent>
                {birthYears.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year} 年
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={birthMonthPart || undefined}
              onValueChange={setBirthMonthPart}
              required
            >
              <SelectTrigger aria-label="出生月份">
                <SelectValue placeholder="月份" />
              </SelectTrigger>
              <SelectContent>
                {birthMonths.map((month) => (
                  <SelectItem key={month} value={month}>
                    {month} 月
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="collection-political-status">政治面貌</Label>
          <Select
            name="politicalStatus"
            defaultValue={initialValues.politicalStatus || undefined}
            required
          >
            <SelectTrigger id="collection-political-status">
              <SelectValue placeholder="请选择政治面貌" />
            </SelectTrigger>
            <SelectContent>
              {COLLECTION_POLITICAL_STATUSES.map((statusOption) => (
                <SelectItem key={statusOption} value={statusOption}>
                  {statusOption}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="collection-college">所在学院</Label>
          <Input
            id="collection-college"
            name="college"
            required
            maxLength={120}
            defaultValue={initialValues.college || linkProfile.college}
            placeholder="请输入学院全称"
          />
          {!initialValues.college && linkProfile.college && (
            <p className="text-xs text-muted-foreground">已自动带入 SAST Link 资料，可修改。</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="collection-class-name">所在班级</Label>
          <Input
            id="collection-class-name"
            name="className"
            required
            maxLength={120}
            defaultValue={initialValues.className}
            placeholder="请输入所在班级"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="collection-student-id">学号</Label>
          <Input
            id="collection-student-id"
            name="studentId"
            required
            minLength={4}
            maxLength={32}
            defaultValue={initialValues.studentId || linkProfile.studentId}
            placeholder="请输入学号"
          />
          {!initialValues.studentId && linkProfile.studentId && (
            <p className="text-xs text-muted-foreground">已自动带入 SAST Link 资料，可修改。</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="collection-enrollment-year">入学年份</Label>
          <Input
            id="collection-enrollment-year"
            name="enrollmentYear"
            type="number"
            required
            min={1900}
            max={2100}
            step={1}
            defaultValue={initialValues.enrollmentYear ?? undefined}
            placeholder="例如 2023"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="collection-graduation-year">预计毕业年份</Label>
          <Input
            id="collection-graduation-year"
            name="graduationYear"
            type="number"
            required
            min={1900}
            max={2100}
            step={1}
            defaultValue={initialValues.graduationYear ?? undefined}
            placeholder="例如 2027"
          />
        </div>
      </div>

      {extraFields.length > 0 && (
        <div className="space-y-4 border-t border-border/70 pt-5">
          <p className="text-sm font-medium text-foreground">补充信息</p>
          <div className="grid gap-5 sm:grid-cols-2">
            {extraFields.map((field) => {
              const defaultValue =
                initialExtraAnswers[field.id] ||
                (field.prefillFrom ? linkProfile[field.prefillFrom] : "");
              const inputId = `collection-extra-${field.id}`;
              const maxLength = EXTRA_FIELD_MAX_LENGTH[field.type];

              return (
                <div
                  key={field.id}
                  className={
                    field.type === "textarea"
                      ? "flex flex-col gap-2 sm:col-span-2"
                      : "flex flex-col gap-2"
                  }
                >
                  <Label htmlFor={inputId}>{field.label}</Label>
                  {field.type === "textarea" ? (
                    <Textarea
                      id={inputId}
                      name={`extra_${field.id}`}
                      rows={3}
                      required={field.required}
                      maxLength={maxLength}
                      defaultValue={defaultValue}
                    />
                  ) : field.type === "select" ? (
                    <Select
                      name={`extra_${field.id}`}
                      defaultValue={defaultValue || undefined}
                      required={field.required}
                    >
                      <SelectTrigger id={inputId}>
                        <SelectValue placeholder={`请选择${field.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {field.options.map((option) => (
                          <SelectItem key={option} value={option}>
                            {option}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id={inputId}
                      name={`extra_${field.id}`}
                      type={field.type === "number" ? "number" : "text"}
                      step={field.type === "number" ? "any" : undefined}
                      required={field.required}
                      maxLength={field.type === "number" ? undefined : maxLength}
                      defaultValue={defaultValue}
                      placeholder={`请输入${field.label}`}
                    />
                  )}
                  {field.prefillFrom && !initialExtraAnswers[field.id] && (
                    <p className="text-xs text-muted-foreground">
                      已自动带入 SAST Link 资料，可修改。
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button type="submit" loading={submitting}>
          {hasSaved ? "保存修改" : "提交"}
        </Button>
      </div>
    </form>
  );
}
