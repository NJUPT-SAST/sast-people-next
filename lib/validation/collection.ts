import { z } from "zod/v4";
import {
  COLLECTION_CLASS_NAME_PATTERN,
  COLLECTION_CUSTOM_DEFAULT_INSTRUCTIONS,
  COLLECTION_CUSTOM_DEFAULT_TITLE,
  COLLECTION_DEFAULT_INSTRUCTIONS,
  COLLECTION_DEFAULT_TITLE,
  COLLECTION_EXTRA_FIELD_TYPES,
  COLLECTION_FORM_KINDS,
  COLLECTION_LINK_PREFILL_SOURCES,
  COLLECTION_OPTION_FIELD_TYPES,
  COLLECTION_RATING_MAX,
  type CollectionExtraAnswers,
  type CollectionExtraField,
} from "@/const/collection";
import { parseBeijingDateOnly, parseBeijingDateTime } from "@/lib/timezone";

/** 所有收集表都按字段定义收答案；固定成员字段由模板提供。 */
export const collectionSubmissionSchema = z.object({
  extraAnswers: z.record(z.string(), z.unknown()).default({}),
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
    placeholder: z
      .string()
      .trim()
      .max(200, "占位提示不能超过 200 字")
      .optional(),
    fixedValue: z
      .string()
      .trim()
      .max(500, "固定值不能超过 500 字")
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

export const collectionFormInputSchema = z
  .object({
    /* member = 成员信息模板；custom = 只用自定义收集项 */
    kind: z.enum(COLLECTION_FORM_KINDS).default("member"),
    templateName: z
      .string()
      .trim()
      .max(60, "模板名称不能超过 60 字")
      .default(""),
    title: z
      .string()
      .trim()
      .max(120, "标题不能超过 120 字")
      .default(""),
    instructions: z
      .string()
      .trim()
      .max(5000, "填表说明不能超过 5000 字")
      .default(""),
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
  })
  .refine(
    (value) =>
      value.startsAt == null ||
      value.deadline == null ||
      value.startsAt < value.deadline,
    {
      message: "开始时间必须早于截止时间",
      path: ["deadline"],
    },
  )
  /* 模板决定缺省标题与说明，避免自定义表带上成员模板的文案 */
  .transform((value) => {
    const member = value.kind === "member";
    return {
      ...value,
      templateName:
        value.templateName ||
        (member ? COLLECTION_DEFAULT_TITLE : COLLECTION_CUSTOM_DEFAULT_TITLE),
      title: value.title || (member ? COLLECTION_DEFAULT_TITLE : COLLECTION_CUSTOM_DEFAULT_TITLE),
      instructions:
        value.instructions ||
        (member
          ? COLLECTION_DEFAULT_INSTRUCTIONS
          : COLLECTION_CUSTOM_DEFAULT_INSTRUCTIONS),
    };
  });

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
      if (field.id === "className" && !COLLECTION_CLASS_NAME_PATTERN.test(value)) {
        return "班级格式应为大写字母加 6 位数字，例如 B240101";
      }
      return null;
    case "number":
      if (!/^-?\d+(?:\.\d+)?$/.test(value)) {
        return `${field.label}必须是数字`;
      }
      if (field.id === "enrollmentYear" || field.id === "graduationYear") {
        const year = Number(value);
        return Number.isInteger(year) && year >= 1900 && year <= 2100
          ? null
          : `${field.label}必须是 1900-2100 之间的年份`;
      }
      return null;
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
    case "month":
      return /^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(value)
        ? null
        : `${field.label}必须是有效年月（YYYY-MM）`;
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
    /* 固定值字段只读展示，答案由定义决定 */
    if (field.fixedValue) {
      validated[field.id] = field.fixedValue;
      continue;
    }

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

    const normalized =
      field.id === "className" ? value.toUpperCase() : value;
    const error = validateFieldValue(field, normalized);
    if (error) return { success: false, message: error };

    validated[field.id] = normalized;
  }

  const enrollment = Number(validated.enrollmentYear);
  const graduation = Number(validated.graduationYear);
  if (
    Number.isInteger(enrollment) &&
    Number.isInteger(graduation) &&
    graduation <= enrollment
  ) {
    return { success: false, message: "预计毕业年份应晚于入学年份" };
  }

  return { success: true, answers: validated };
};
