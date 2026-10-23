"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { toast } from "sonner";
import { saveCollectionSubmission } from "@/action/collection";
import {
  COLLECTION_RATING_MAX,
  deriveEnrollmentYearFromStudentId,
  deriveGraduationYear,
  deriveGraduationYearFromClassName,
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface CollectionFormProps {
  formId: number;
  fields: CollectionExtraField[];
  editable: boolean;
  hasSaved: boolean;
  updatedAtLabel: string | null;
  /** 被部长退回的时间与说明；重新提交后清空 */
  returnedAtLabel?: string | null;
  returnNote?: string | null;
  initialAnswers: CollectionExtraAnswers;
  linkProfile: CollectionLinkProfile;
  /** 身份不符合填写限制时的说明；截止时留空，走默认文案 */
  readonlyNotice?: string;
}

const normalizeInitialAnswers = (
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
    } else if (saved !== undefined && saved !== "") {
      values[field.id] = saved;
    } else if (field.fixedValue) {
      values[field.id] = field.fixedValue;
    } else if (field.prefillFrom) {
      const prefill = linkProfile[field.prefillFrom];
      const needsOption = field.type === "select" || field.type === "radio";
      if (prefill && (!needsOption || field.options.includes(prefill))) {
        values[field.id] = prefill;
      }
    }
  }

  return values;
};

/** 学号推算入学年份；班级推算毕业年份（无班级时回退到入学 + 4 年）。 */
const applyDerivedYears = (
  values: CollectionExtraAnswers,
  fields: CollectionExtraField[],
  manual: Set<string>,
): CollectionExtraAnswers => {
  const hasField = (id: string) => fields.some((field) => field.id === id);
  const next = { ...values };

  const studentId = typeof next.studentId === "string" ? next.studentId : "";
  const className = typeof next.className === "string" ? next.className : "";

  if (hasField("enrollmentYear") && !manual.has("enrollmentYear")) {
    const year = deriveEnrollmentYearFromStudentId(studentId);
    if (year !== null) next.enrollmentYear = String(year);
  }

  if (hasField("graduationYear") && !manual.has("graduationYear")) {
    const fromClass = deriveGraduationYearFromClassName(className);
    if (fromClass !== null) {
      next.graduationYear = String(fromClass);
    } else {
      const base = Number(next.enrollmentYear);
      if (Number.isInteger(base) && base >= 1900) {
        next.graduationYear = String(deriveGraduationYear(base));
      }
    }
  }

  return next;
};

export function CollectionForm({
  formId,
  fields,
  editable,
  hasSaved,
  updatedAtLabel,
  returnedAtLabel,
  returnNote,
  initialAnswers,
  linkProfile,
  readonlyNotice,
}: CollectionFormProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const initialManualYears = new Set(
    ["enrollmentYear", "graduationYear"].filter(
      (id) => initialAnswers[id] !== undefined && initialAnswers[id] !== "",
    ),
  );
  const manualYears = useRef(initialManualYears);
  const [values, setValues] = useState<CollectionExtraAnswers>(() =>
    applyDerivedYears(
      normalizeInitialAnswers(fields, initialAnswers, linkProfile),
      fields,
      initialManualYears,
    ),
  );

  const setValue = (id: string, value: CollectionAnswer) => {
    if (id === "enrollmentYear" || id === "graduationYear") {
      manualYears.current.add(id);
    }
    setValues((current) => {
      const next = { ...current, [id]: value };
      return applyDerivedYears(next, fields, manualYears.current);
    });
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable) return;

    setSubmitting(true);
    try {
      const result = await saveCollectionSubmission(formId, {
        extraAnswers: values,
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
    return (
      <div className="space-y-5">
        {returnedAtLabel && (
          <p className="rounded-md border border-amber-500/25 bg-amber-500/8 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            你的填写于 {returnedAtLabel} 被退回
            {returnNote ? `：${returnNote}` : "，请修改后重新提交"}。
          </p>
        )}
        <p className="rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {readonlyNotice ??
            (hasSaved
              ? "收集已结束，以下为你提交的内容。"
              : "收集已结束，你没有提交记录。")}
        </p>
        {hasSaved && (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {fields.map((field) => {
              const answer = initialAnswers[field.id];
              const value =
                field.fixedValue ??
                (field.type === "rating" && answer
                  ? `${formatCollectionAnswer(answer)} 星`
                  : formatCollectionAnswer(answer));
              return (
                <div key={field.id} className="min-w-0">
                  <dt className="text-xs text-muted-foreground">{field.label}</dt>
                  {field.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground/80">
                      {field.description}
                    </p>
                  )}
                  <dd className="mt-1 break-words text-sm font-medium text-foreground">
                    {value}
                  </dd>
                </div>
              );
            })}
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
      {returnedAtLabel && (
        <p className="rounded-md border border-destructive/25 bg-destructive/8 px-3 py-2 text-sm text-destructive">
          你的填写于 {returnedAtLabel} 被退回
          {returnNote ? `：${returnNote}` : ""}。请修改后重新提交。
        </p>
      )}

      {fields.length === 0 ? (
        <p className="rounded-md border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
          本表没有收集项，直接提交即可。
        </p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          {fields.map((field) => {
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
                    {field.required && !field.fixedValue && (
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
                  value={values[field.id]}
                  onChange={(value) => setValue(field.id, value)}
                />
              </div>
            );
          })}
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

function MonthInput({
  id,
  value,
  required,
  onChange,
}: {
  id: string;
  value: string;
  required: boolean;
  onChange: (value: string) => void;
}) {
  const currentYear = new Date().getFullYear();
  const [open, setOpen] = useState(false);
  const [yearPart, setYearPart] = useState(
    () => value.split("-")[0] || String(currentYear - 20),
  );
  const [monthPart, setMonthPart] = useState(() => value.split("-")[1] ?? "");

  useEffect(() => {
    if (!value) return;
    const [year, month] = value.split("-");
    if (year) setYearPart(year);
    if (month) setMonthPart(month);
  }, [value]);

  const year = Number(yearPart);
  const selectMonth = (month: string) => {
    setMonthPart(month);
    onChange(`${yearPart}-${month}`);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="w-full justify-start font-normal"
          aria-required={required}
        >
          <CalendarDays className="size-4 text-muted-foreground" />
          {yearPart && monthPart
            ? `${yearPart} 年 ${Number(monthPart)} 月`
            : "选择年月"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start">
        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="上一年"
            disabled={year <= 1900}
            onClick={() => setYearPart(String(Math.max(1900, year - 1)))}
          >
            <ChevronLeft />
          </Button>
          <span className="text-sm font-medium tabular-nums">{yearPart} 年</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="下一年"
            disabled={year >= currentYear}
            onClick={() => setYearPart(String(Math.min(currentYear, year + 1)))}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-4 gap-1">
          {Array.from({ length: 12 }, (_, index) =>
            String(index + 1).padStart(2, "0"),
          ).map((month) => (
            <Button
              key={month}
              type="button"
              size="sm"
              variant={month === monthPart ? "default" : "ghost"}
              onClick={() => selectMonth(month)}
            >
              {Number(month)} 月
            </Button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setMonthPart("");
              onChange("");
              setOpen(false);
            }}
          >
            清除
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
          >
            关闭
          </Button>
        </div>
      </PopoverContent>
    </Popover>
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
  const placeholder =
    field.placeholder ??
    (field.id === "className" ? "例如 B240101" : `请输入${field.label}`);

  if (field.fixedValue) {
    return <Input id={inputId} value={field.fixedValue} readOnly disabled />;
  }

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
          placeholder={placeholder}
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
          placeholder={placeholder}
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
    case "month":
      return (
        <MonthInput
          id={inputId}
          value={textValue}
          required={field.required}
          onChange={onChange}
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
          placeholder={placeholder}
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
          placeholder={placeholder}
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
          placeholder={placeholder}
        />
      );
  }
}
