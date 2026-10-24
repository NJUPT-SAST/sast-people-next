/** @jest-environment node */

import {
  collectionFormInputSchema,
  collectionSubmissionSchema,
  collectionExtraFieldSchema,
  validateExtraAnswers,
} from "./collection";
import {
  COLLECTION_CUSTOM_DEFAULT_TITLE,
  COLLECTION_DEFAULT_INSTRUCTIONS,
  COLLECTION_DEFAULT_TITLE,
  COLLECTION_MEMBER_TEMPLATE_FIELDS,
} from "@/const/collection";

const validSubmission = {
  category: "注册社员",
  name: "张三",
  birthMonth: "2004-10",
  politicalStatus: "共青团员",
  college: "计算机学院",
  className: "B230601",
  studentId: "B23060101",
  enrollmentYear: "2023",
  graduationYear: "2027",
};

const validateMember = (overrides: Record<string, unknown> = {}) =>
  validateExtraAnswers(COLLECTION_MEMBER_TEMPLATE_FIELDS, {
    ...validSubmission,
    ...overrides,
  });

describe("member template answers", () => {
  it("accepts the specified member form fields", () => {
    expect(validateMember().success).toBe(true);
  });

  it("rejects categories outside the seven allowed types", () => {
    expect(validateMember({ category: "指导老师" }).success).toBe(false);
  });

  it("requires birth month in YYYY-MM form", () => {
    for (const birthMonth of ["2020-1", "2020-13", "2020/10", "20-10"]) {
      expect(validateMember({ birthMonth }).success).toBe(false);
    }
  });

  it("requires graduation year to be later than enrollment year", () => {
    expect(
      validateMember({ enrollmentYear: "2027", graduationYear: "2027" }).success,
    ).toBe(false);
    expect(
      validateMember({ enrollmentYear: "2027", graduationYear: "2026" }).success,
    ).toBe(false);
  });

  it("rejects political statuses outside the provided options", () => {
    expect(validateMember({ politicalStatus: "未知身份" }).success).toBe(false);
  });

  it("trims text fields before storing them", () => {
    const result = validateMember({ name: " 张三 " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.answers.name).toBe("张三");
  });

  it("rejects blank college/class/student id", () => {
    for (const field of ["college", "className", "studentId"] as const) {
      expect(validateMember({ [field]: "   " }).success).toBe(false);
    }
  });

  it("requires class names like B240101", () => {
    for (const className of ["B24010", "240101", "B2401011", "BAB101", "B24010A"]) {
      expect(validateMember({ className }).success).toBe(false);
    }
    const result = validateMember({ className: "b240101" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.answers.className).toBe("B240101");
  });
});

describe("collectionSubmissionSchema", () => {
  it("accepts custom answers without member fields", () => {
    const parsed = collectionSubmissionSchema.parse({
      extraAnswers: { interest: "前端" },
    });
    expect(parsed.extraAnswers).toEqual({ interest: "前端" });
  });
});

describe("collectionFormInputSchema", () => {
  it("falls back to the built-in title and instructions when omitted", () => {
    const parsed = collectionFormInputSchema.parse({});
    expect(parsed.title).toBe(COLLECTION_DEFAULT_TITLE);
    expect(parsed.instructions).toBe(COLLECTION_DEFAULT_INSTRUCTIONS);
    expect(parsed.extraFields).toEqual([]);
    expect(parsed.allowedRoles).toEqual([]);
    expect(parsed.allowedFlowIds).toEqual([]);
    expect(parsed.deadline).toBeUndefined();
  });

  it("defaults to the member template", () => {
    const parsed = collectionFormInputSchema.parse({});
    expect(parsed.kind).toBe("member");
    expect(parsed.title).toBe(COLLECTION_DEFAULT_TITLE);
  });

  it("uses the custom template defaults without member copy", () => {
    const parsed = collectionFormInputSchema.parse({ kind: "custom" });
    expect(parsed.kind).toBe("custom");
    expect(parsed.title).toBe(COLLECTION_CUSTOM_DEFAULT_TITLE);
    expect(parsed.instructions).toBe("");
  });

  it("accepts a direct identity and flow selection", () => {
    const parsed = collectionFormInputSchema.parse({
      allowedRoles: [0, 3],
      allowedFlowIds: [11, 12],
    });
    expect(parsed.allowedRoles).toEqual([0, 3]);
    expect(parsed.allowedFlowIds).toEqual([11, 12]);
  });

  it("rejects duplicate flow restrictions", () => {
    expect(
      collectionFormInputSchema.safeParse({ allowedFlowIds: [11, 11] }).success,
    ).toBe(false);
  });

  it("rejects duplicate identities", () => {
    expect(
      collectionFormInputSchema.safeParse({ allowedRoles: [1, 1] }).success,
    ).toBe(false);
  });

  it("requires the start time to be earlier than the deadline", () => {
    expect(
      collectionFormInputSchema.safeParse({
        startsAt: 2_000,
        deadline: 1_000,
      }).success,
    ).toBe(false);
    expect(
      collectionFormInputSchema.safeParse({
        startsAt: 1_000,
        deadline: 2_000,
      }).success,
    ).toBe(true);
  });

  it("rejects a title longer than 120 characters", () => {
    expect(
      collectionFormInputSchema.safeParse({
        title: "长".repeat(121),
        instructions: "",
      }).success,
    ).toBe(false);
  });

  it("accepts custom fields with select options", () => {
    const parsed = collectionFormInputSchema.parse({
      extraFields: [
        {
          id: "welcome",
          label: "是否愿意参与迎新",
          type: "select",
          required: true,
          options: ["是", "否"],
          prefillFrom: "name",
        },
      ],
    });
    expect(parsed.extraFields[0].options).toEqual(["是", "否"]);
  });
});

describe("collectionExtraFieldSchema", () => {
  it("rejects duplicate ids in one form", () => {
    expect(
      collectionFormInputSchema.safeParse({
        extraFields: [
          { id: "same", label: "A", type: "text", options: [] },
          { id: "same", label: "B", type: "text", options: [] },
        ],
      }).success,
    ).toBe(false);
  });

  it("requires options for select fields", () => {
    expect(
      collectionExtraFieldSchema.safeParse({
        id: "choice",
        label: "选择",
        type: "select",
        options: [],
      }).success,
    ).toBe(false);
  });

  it("supports date, multi-select and other survey field types", () => {
    for (const type of ["date", "datetime", "time", "email", "url", "phone", "rating"] as const) {
      expect(
        collectionExtraFieldSchema.safeParse({
          id: type,
          label: type,
          type,
          description: "填写提示",
        }).success,
      ).toBe(true);
    }
    expect(
      collectionExtraFieldSchema.safeParse({
        id: "skills",
        label: "技能",
        type: "checkbox",
        options: ["前端", "后端"],
      }).success,
    ).toBe(true);
  });

  it("requires options for radio and checkbox fields", () => {
    for (const type of ["radio", "checkbox"] as const) {
      expect(
        collectionExtraFieldSchema.safeParse({
          id: type,
          label: type,
          type,
          options: [],
        }).success,
      ).toBe(false);
    }
  });

  it("rejects unsafe field ids", () => {
    expect(
      collectionExtraFieldSchema.safeParse({
        id: "bad id",
        label: "字段",
        type: "text",
      }).success,
    ).toBe(false);
  });
});

describe("validateExtraAnswers", () => {
  const fields = [
    {
      id: "welcome",
      label: "是否愿意参与迎新",
      type: "select" as const,
      required: true,
      options: ["是", "否"],
    },
    {
      id: "note",
      label: "备注",
      type: "textarea" as const,
      required: false,
      options: [],
    },
    {
      id: "grade",
      label: "绩点",
      type: "number" as const,
      required: false,
      options: [],
    },
  ];

  it("keeps valid answers and drops unknown keys", () => {
    const result = validateExtraAnswers(fields, {
      welcome: "是",
      grade: "3.8",
      hidden: "ignored",
    });
    expect(result).toEqual({
      success: true,
      answers: { welcome: "是", grade: "3.8" },
    });
  });

  it("requires required fields and validates select values", () => {
    expect(validateExtraAnswers(fields, { welcome: "" }).success).toBe(false);
    expect(validateExtraAnswers(fields, { welcome: "也许" }).success).toBe(false);
  });

  it("rejects non-numeric number answers", () => {
    expect(
      validateExtraAnswers(fields, { welcome: "是", grade: "三点八" }).success,
    ).toBe(false);
  });
});

describe("validateExtraAnswers for survey field types", () => {
  const fields = [
    {
      id: "birthday",
      label: "生日",
      type: "date" as const,
      required: true,
      options: [],
    },
    {
      id: "email",
      label: "邮箱",
      type: "email" as const,
      required: false,
      options: [],
    },
    {
      id: "website",
      label: "主页",
      type: "url" as const,
      required: false,
      options: [],
    },
    {
      id: "phone",
      label: "手机号",
      type: "phone" as const,
      required: false,
      options: [],
    },
    {
      id: "rating",
      label: "评分",
      type: "rating" as const,
      required: false,
      options: [],
    },
    {
      id: "skills",
      label: "技能",
      type: "checkbox" as const,
      required: false,
      options: ["前端", "后端"],
    },
    {
      id: "level",
      label: "等级",
      type: "radio" as const,
      required: false,
      options: ["初级", "高级"],
    },
  ];

  it("accepts valid date, contact, rating, radio and multi-select answers", () => {
    const result = validateExtraAnswers(fields, {
      birthday: "2004-10-05",
      email: "a@example.com",
      website: "https://example.com",
      phone: "13800138000",
      rating: "5",
      skills: ["前端", "后端"],
      level: "高级",
    });
    expect(result).toEqual({
      success: true,
      answers: {
        birthday: "2004-10-05",
        email: "a@example.com",
        website: "https://example.com",
        phone: "13800138000",
        rating: "5",
        skills: ["前端", "后端"],
        level: "高级",
      },
    });
  });

  it("rejects invalid dates, emails, links, phones and ratings", () => {
    const invalid = [
      { birthday: "2024-02-30" },
      { birthday: "2004-10-05", email: "not-an-email" },
      { birthday: "2004-10-05", website: "javascript:alert(1)" },
      { birthday: "2004-10-05", phone: "abc" },
      { birthday: "2004-10-05", rating: "6" },
    ];
    for (const answers of invalid) {
      expect(validateExtraAnswers(fields, answers).success).toBe(false);
    }
  });

  it("rejects unknown multi-select options and empty required multi-selects", () => {
    expect(
      validateExtraAnswers(fields, {
        birthday: "2004-10-05",
        skills: ["设计"],
      }).success,
    ).toBe(false);

    const requiredSkills = fields.map((field) =>
      field.id === "skills" ? { ...field, required: true } : field,
    );
    expect(
      validateExtraAnswers(requiredSkills, { birthday: "2004-10-05" }).success,
    ).toBe(false);
  });
});
