"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { saveCollectionSubmission } from "@/action/collection";
import {
  COLLECTION_CATEGORIES,
  COLLECTION_CLUB_NAME,
  COLLECTION_POLITICAL_STATUSES,
  COLLECTION_RATING_MAX,
  formatCollectionAnswer,
  type CollectionAnswer,
  type CollectionExtraAnswers,
  type CollectionExtraField,
  type CollectionLinkProfile,
} from "@/const/collection";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  initialExtraAnswers: CollectionExtraAnswers;
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

const normalizeInitialExtraAnswers = (
  fields: CollectionExtraField[],
  initial: CollectionExtraAnswers,
  linkProfile: CollectionLinkProfile,
): CollectionExtraAnswers => {
  const values: CollectionExtraAnswers = {};

  for (const field of fields) {
    const saved = initial[field.id];
    if (field.type === "checkbox") {
      values[field.id] = Array.isArray(saved)
        ? saved
        : saved
          ? [saved]
          : [];
    } else if (saved !== undefined) {
      values[field.id] = saved;
    } else if (field.prefillFrom) {
      values[field.id] = linkProfile[field.prefillFrom];
    }
  }

  return values;
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
  const [extraValues, setExtraValues] = useState<CollectionExtraAnswers>(() =>
    normalizeInitialExtraAnswers(extraFields, initialExtraAnswers, linkProfile),
  );
  const setExtraValue = (id: string, value: CollectionAnswer) => {
    setExtraValues((current) => ({ ...current, [id]: value }));
  };
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
        extraAnswers: extraValues,
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
      { label: "社团名称", value: COLLECTION_CLUB_NAME, description: undefined },
      ...CORE_FIELD_LABELS.map(([key, label]) => ({
        label,
        value: String(initialValues[key] ?? ""),
        description: undefined,
      })),
      ...extraFields.map((field) => ({
        label: field.label,
        description: field.description,
        value: (() => {
          const answer = initialExtraAnswers[field.id];
          if (field.type === "rating" && answer) {
            return `${formatCollectionAnswer(answer)} 星`;
          }
          return formatCollectionAnswer(answer);
        })(),
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
            {readonlyRows.map((row, index) => (
              <div key={`${row.label}-${index}`} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                {row.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground/80">{row.description}</p>
                )}
                <dd className="mt-1 break-words text-sm font-medium text-foreground">
                  {row.value}
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
        <div className="space-y-4 rounded-lg border border-border/70 bg-muted/20 p-4">
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">补充信息</p>
            <p className="text-xs text-muted-foreground">
              带 <span className="text-destructive">*</span> 的为必填项。
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {extraFields.map((field) => {
              const inputId = `collection-extra-${field.id}`;
              return (
                <div
                  key={field.id}
                  className={
                    field.type === "textarea"
                      ? "flex flex-col gap-2 sm:col-span-2"
                      : "flex flex-col gap-2"
                  }
                >
                  <div className="space-y-1">
                    <Label htmlFor={inputId}>
                      {field.label}
                      {field.required && (
                        <span className="text-destructive"> *</span>
                      )}
                    </Label>
                    {field.description && (
                      <p className="text-xs leading-5 text-muted-foreground">
                        {field.description}
                      </p>
                    )}
                  </div>
                  <ExtraFieldInput
                    field={field}
                    value={extraValues[field.id]}
                    onChange={(value) => setExtraValue(field.id, value)}
                  />
                  {field.prefillFrom && initialExtraAnswers[field.id] === undefined && (
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

function ExtraFieldInput({
  field,
  value,
  onChange,
}: {
  field: CollectionExtraField;
  value: CollectionAnswer | undefined;
  onChange: (value: CollectionAnswer) => void;
}) {
  const inputId = `collection-extra-${field.id}`;
  const textValue = Array.isArray(value) ? "" : (value ?? "");
  const arrayValue = Array.isArray(value) ? value : value ? [value] : [];

  switch (field.type) {
    case "textarea":
      return (
        <Textarea
          id={inputId}
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          rows={3}
          required={field.required}
          maxLength={5000}
          placeholder={`请输入${field.label}`}
        />
      );
    case "number":
      return (
        <Input
          id={inputId}
          type="number"
          step="any"
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          placeholder={`请输入${field.label}`}
        />
      );
    case "select":
      return (
        <Select
          value={textValue || undefined}
          onValueChange={onChange}
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
      );
    case "radio":
      return (
        <div className="flex flex-wrap gap-x-5 gap-y-2" role="radiogroup" aria-label={field.label}>
          {field.options.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name={inputId}
                value={option}
                checked={textValue === option}
                onChange={() => onChange(option)}
                required={field.required}
                className="size-4 accent-primary"
              />
              {option}
            </label>
          ))}
        </div>
      );
    case "checkbox":
      return (
        <div className="flex flex-wrap gap-x-5 gap-y-2" role="group" aria-label={field.label}>
          {field.options.map((option, index) => {
            const optionId = `${inputId}-${index}`;
            return (
              <div key={option} className="flex items-center gap-2">
                <Checkbox
                  id={optionId}
                  checked={arrayValue.includes(option)}
                  onCheckedChange={(checked) =>
                    onChange(
                      checked === true
                        ? [...arrayValue, option]
                        : arrayValue.filter((item) => item !== option),
                    )
                  }
                />
                <Label htmlFor={optionId} className="cursor-pointer font-normal">
                  {option}
                </Label>
              </div>
            );
          })}
        </div>
      );
    case "date":
      return (
        <Input
          id={inputId}
          type="date"
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
        />
      );
    case "datetime":
      return (
        <Input
          id={inputId}
          type="datetime-local"
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
        />
      );
    case "time":
      return (
        <Input
          id={inputId}
          type="time"
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
        />
      );
    case "email":
      return (
        <Input
          id={inputId}
          type="email"
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          maxLength={320}
          placeholder={`请输入${field.label}`}
        />
      );
    case "url":
      return (
        <Input
          id={inputId}
          type="url"
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          maxLength={500}
          placeholder="https://"
        />
      );
    case "phone":
      return (
        <Input
          id={inputId}
          type="tel"
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          maxLength={20}
          placeholder={`请输入${field.label}`}
        />
      );
    case "rating": {
      const rating = Number(textValue) || 0;
      return (
        <div className="flex items-center gap-1">
          {Array.from({ length: COLLECTION_RATING_MAX }, (_, index) => index + 1).map(
            (score) => (
              <button
                key={score}
                type="button"
                onClick={() => onChange(String(score))}
                aria-label={`${score} 星`}
                className="rounded-md p-1 transition-colors hover:bg-accent"
              >
                <Star
                  className={
                    score <= rating
                      ? "size-5 fill-primary text-primary"
                      : "size-5 text-muted-foreground"
                  }
                />
              </button>
            ),
          )}
          {rating > 0 && (
            <span className="ml-2 text-sm text-muted-foreground">{rating} 星</span>
          )}
        </div>
      );
    }
    case "text":
    default:
      return (
        <Input
          id={inputId}
          value={textValue}
          onChange={(event) => onChange(event.target.value)}
          required={field.required}
          maxLength={500}
          placeholder={`请输入${field.label}`}
        />
      );
  }
}
