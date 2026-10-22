/** @jest-environment node */

import {
  collectionFormInputSchema,
  collectionSubmissionSchema,
  collectionExtraFieldSchema,
  validateExtraAnswers,
} from "./collection";
import {
  COLLECTION_DEFAULT_INSTRUCTIONS,
  COLLECTION_DEFAULT_TITLE,
} from "@/const/collection";

const validSubmission = {
  category: "注册社员" as const,
  name: "张三",
  birthMonth: "2004-10",
  politicalStatus: "共青团员",
  college: "计算机学院",
  className: "B230601",
  studentId: "B23060101",
  enrollmentYear: 2023,
  graduationYear: 2027,
};

describe("collectionSubmissionSchema", () => {
  it("accepts the specified member form fields", () => {
    expect(collectionSubmissionSchema.safeParse(validSubmission).success).toBe(true);
  });

  it("rejects categories outside the seven allowed types", () => {
    const result = collectionSubmissionSchema.safeParse({
      ...validSubmission,
      category: "指导老师",
    });
    expect(result.success).toBe(false);
  });

  it("requires birth month in YYYY-MM form", () => {
    for (const birthMonth of ["2020-1", "2020-13", "2020/10", "20-10"]) {
      expect(
        collectionSubmissionSchema.safeParse({ ...validSubmission, birthMonth }).success,
      ).toBe(false);
    }
  });

  it("requires graduation year to be later than enrollment year", () => {
    expect(
      collectionSubmissionSchema.safeParse({
        ...validSubmission,
        enrollmentYear: 2027,
        graduationYear: 2027,
      }).success,
    ).toBe(false);
    expect(
      collectionSubmissionSchema.safeParse({
        ...validSubmission,
        enrollmentYear: 2027,
        graduationYear: 2026,
      }).success,
    ).toBe(false);
  });

  it("rejects political statuses outside the provided options", () => {
    expect(
      collectionSubmissionSchema.safeParse({
        ...validSubmission,
        politicalStatus: "未知身份",
      }).success,
    ).toBe(false);
  });

  it("trims text fields before storing them", () => {
    const parsed = collectionSubmissionSchema.parse({
      ...validSubmission,
      name: " 张三 ",
    });
    expect(parsed.name).toBe("张三");
  });

  it("rejects blank college/class/student id", () => {
    for (const field of ["college", "className", "studentId"] as const) {
      expect(
        collectionSubmissionSchema.safeParse({ ...validSubmission, [field]: "   " })
          .success,
      ).toBe(false);
    }
  });
});

describe("collectionFormInputSchema", () => {
  it("falls back to the built-in title and instructions when omitted", () => {
    const parsed = collectionFormInputSchema.parse({});
    expect(parsed.title).toBe(COLLECTION_DEFAULT_TITLE);
    expect(parsed.instructions).toBe(COLLECTION_DEFAULT_INSTRUCTIONS);
    expect(parsed.extraFields).toEqual([]);
    expect(parsed.allowedRoles).toEqual([]);
    expect(parsed.deadline).toBeUndefined();
  });

  it("accepts a direct identity selection", () => {
    const parsed = collectionFormInputSchema.parse({ allowedRoles: [0, 3] });
    expect(parsed.allowedRoles).toEqual([0, 3]);
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
