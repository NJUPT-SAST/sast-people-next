import { z } from "zod/v4";
import {
  COLLECTION_CATEGORIES,
  COLLECTION_DEFAULT_INSTRUCTIONS,
  COLLECTION_DEFAULT_TITLE,
  COLLECTION_EXTRA_FIELD_TYPES,
  COLLECTION_LINK_PREFILL_SOURCES,
  COLLECTION_OPTION_FIELD_TYPES,
  COLLECTION_POLITICAL_STATUSES,
  COLLECTION_RATING_MAX,
  type CollectionExtraAnswers,
  type CollectionExtraField,
} from "@/const/collection";
import { parseBeijingDateOnly, parseBeijingDateTime } from "@/lib/timezone";

const trimmedText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `请填写${label}`)
    .max(max, `${label}不能超过 ${max} 字`);

const yearSchema = (label: string) =>
  z.coerce
    .number({ message: `${label}必须是年份` })
    .int(`${label}必须是整数年份`)
    .min(1900, `${label}不早于 1900 年`)
    .max(2100, `${label}不晚于 2100 年`);

export const collectionSubmissionSchema = z
  .object({
    category: z.enum(COLLECTION_CATEGORIES, {
      message: "类别必须是表单提供的 7 个类型之一",
    }),
    name: trimmedText("姓名", 60),
    birthMonth: z
      .string()
      .trim()
      .regex(
        /^(19|20)\d{2}-(0[1-9]|1[0-2])$/,
        "出生年月请按 YYYY-MM 填写，例如 2020-10",
      ),
    politicalStatus: z.enum(COLLECTION_POLITICAL_STATUSES, {
      message: "请选择政治面貌",
    }),
    college: trimmedText("所在学院", 120),
    className: trimmedText("所在班级", 120),
    studentId: z
      .string()
      .trim()
      .min(4, "学号至少 4 位")
      .max(32, "学号不能超过 32 位")
      .regex(/^[A-Za-z0-9_-]+$/, "学号只能包含字母、数字、下划线或连字符"),
    enrollmentYear: yearSchema("入学年份"),
    graduationYear: yearSchema("预计毕业年份"),
    /* 自定义收集项的答案按字段 ID 存；具体校验依赖当前表单定义 */
    extraAnswers: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((value) => value.graduationYear > value.enrollmentYear, {
    message: "预计毕业年份应晚于入学年份",
    path: ["graduationYear"],
  });

export type CollectionSubmissionInput = z.infer<
  typeof collectionSubmissionSchema
>;

export const collectionExtraFieldSchema = z
  .object({
    id: z
      .string()
      .trim()
      .min(1, "收集项标识不能为空")
      .max(64, "收集项标识不能超过 64 字")
      .regex(/^[A-Za-z0-9_-]+$/, "收集项标识只能包含字母、数字、下划线或连字符"),
    label: z
      .string()
      .trim()
      .min(1, "请填写收集项名称")
      .max(60, "收集项名称不能超过 60 字"),
    type: z.enum(COLLECTION_EXTRA_FIELD_TYPES, {
      message: "收集项类型无效",
    }),
    required: z.boolean().default(false),
    options: z
      .array(
        z
          .string()
          .trim()
          .min(1, "选项不能为空")
          .max(60, "选项不能超过 60 字"),
      )
      .max(30, "选项数量不能超过 30 个")
      .default([]),
    description: z
      .string()
      .trim()
      .max(200, "填写提示不能超过 200 字")
      .optional(),
    prefillFrom: z.enum(COLLECTION_LINK_PREFILL_SOURCES).optional(),
  })
  .superRefine((field, ctx) => {
    if (!COLLECTION_OPTION_FIELD_TYPES[field.type]) return;
    if (field.options.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: `收集项「${field.label}」需要至少一个选项`,
      });
      return;
    }
    if (new Set(field.options).size !== field.options.length) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: `收集项「${field.label}」的选项不能重复`,
      });
    }
  });

export const collectionExtraFieldsSchema = z
  .array(collectionExtraFieldSchema)
  .max(30, "自定义收集项不能超过 30 个")
  .refine(
    (fields) => new Set(fields.map((field) => field.id)).size === fields.length,
    "收集项标识不能重复",
  );

export const collectionFormInputSchema = z.object({
  title: z
    .string()
    .trim()
    .max(120, "标题不能超过 120 字")
    .default(COLLECTION_DEFAULT_TITLE),
  instructions: z
    .string()
    .trim()
    .max(5000, "填表说明不能超过 5000 字")
    .default(COLLECTION_DEFAULT_INSTRUCTIONS),
  extraFields: collectionExtraFieldsSchema.default([]),
  /* 允许填写的身份；空数组 = 不限制 */
  allowedRoles: z
    .array(z.number().int().min(0).max(4))
    .max(5)
    .default([])
    .refine(
      (roles) => new Set(roles).size === roles.length,
      "填写身份不能重复",
    ),
  /* 限定流程：仅这些流程最终通过的人可填；空数组 = 不限制 */
  allowedFlowIds: z
    .array(z.number().int().positive())
    .max(100, "限定流程不能超过 100 个")
    .default([])
    .refine(
      (flowIds) => new Set(flowIds).size === flowIds.length,
      "限定流程不能重复",
    ),
  /* 开始时间；NULL = 立即开始 */
  startsAt: z.number().int().nullable().optional(),
  /* 截止时间（epoch 毫秒）；null = 不设截止 */
  deadline: z.number().int().nullable().optional(),
}).refine(
  (value) =>
    value.startsAt == null ||
    value.deadline == null ||
    value.startsAt < value.deadline,
  {
    message: "开始时间必须早于截止时间",
    path: ["deadline"],
  },
);

export type CollectionFormInput = z.infer<typeof collectionFormInputSchema>;

export type ExtraAnswersValidation =
  | { success: true; answers: CollectionExtraAnswers }
  | { success: false; message: string };

const validateFieldValue = (
  field: CollectionExtraField,
  value: string,
): string | null => {
  const maxLength = field.type === "textarea" ? 5000 : 500;
  if (value.length > maxLength) {
    return `${field.label}不能超过 ${maxLength} 字`;
  }

  switch (field.type) {
    case "text":
    case "textarea":
      return null;
    case "number":
      return /^-?\d+(?:\.\d+)?$/.test(value)
        ? null
        : `${field.label}必须是数字`;
    case "select":
    case "radio":
      return field.options.includes(value)
        ? null
        : `${field.label}的选项无效`;
    case "date":
      return parseBeijingDateOnly(value)
        ? null
        : `${field.label}必须是有效日期`;
    case "datetime":
      return parseBeijingDateTime(value)
        ? null
        : `${field.label}必须是有效日期时间`;
    case "time":
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
        ? null
        : `${field.label}必须是有效时间（HH:mm）`;
    case "email":
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
        ? null
        : `${field.label}必须是有效邮箱`;
    case "url":
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:"
          ? null
          : `${field.label}必须是 http(s) 链接`;
      } catch {
        return `${field.label}必须是有效链接`;
      }
    case "phone":
      return /^[0-9+\-() ]{6,20}$/.test(value)
        ? null
        : `${field.label}必须是有效手机号`;
    case "rating": {
      const rating = Number(value);
      return Number.isInteger(rating) &&
        rating >= 1 &&
        rating <= COLLECTION_RATING_MAX
        ? null
        : `${field.label}必须是 1-${COLLECTION_RATING_MAX} 分`;
    }
    case "checkbox":
      return null;
  }
};

/**
 * 按表单的定义校验自定义收集项答案：必填、长度、格式、选项。
 * 多选答案返回字符串数组；未知字段直接丢弃。
 */
export const validateExtraAnswers = (
  fields: CollectionExtraField[],
  answers: Record<string, unknown>,
): ExtraAnswersValidation => {
  const validated: CollectionExtraAnswers = {};

  for (const field of fields) {
    const raw = answers[field.id];

    if (field.type === "checkbox") {
      const values = Array.isArray(raw)
        ? raw
            .filter((value): value is string => typeof value === "string")
            .map((value) => value.trim())
            .filter(Boolean)
        : [];
      const unique = Array.from(new Set(values));

      if (unique.length === 0) {
        if (field.required) {
          return { success: false, message: `请选择${field.label}` };
        }
        continue;
      }
      if (unique.some((value) => !field.options.includes(value))) {
        return { success: false, message: `${field.label}的选项无效` };
      }
      validated[field.id] = unique;
      continue;
    }

    const value =
      typeof raw === "string" || typeof raw === "number"
        ? String(raw).trim()
        : "";
    if (!value) {
      if (field.required) {
        return { success: false, message: `请填写${field.label}` };
      }
      continue;
    }

    const error = validateFieldValue(field, value);
    if (error) return { success: false, message: error };

    validated[field.id] = value;
  }

  return { success: true, answers: validated };
};
