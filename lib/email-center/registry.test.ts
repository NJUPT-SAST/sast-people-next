jest.mock("server-only", () => ({}));

import { emailTemplateDefinitions } from "@/lib/email-center/registry";

describe("email template registry", () => {
  it("keeps template keys unique", () => {
    const keys = emailTemplateDefinitions.map((definition) => definition.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers the first-phase email center templates", () => {
    expect(emailTemplateDefinitions.map((definition) => definition.key)).toEqual(
      expect.arrayContaining([
        "recruitment.result.accepted",
        "recruitment.result.rejected",
        "interview.schedule.created",
        "interview.schedule.rescheduled",
        "interview.schedule.cancelled",
      ]),
    );
  });

  it("requires core interview variables for every interview template", () => {
    const interviewDefinitions = emailTemplateDefinitions.filter(
      (definition) => definition.category === "interview",
    );

    expect(interviewDefinitions).toHaveLength(3);
    for (const definition of interviewDefinitions) {
      const requiredKeys = definition.variables
        .filter((variable) => variable.required)
        .map((variable) => variable.key);

      expect(requiredKeys).toEqual(
        expect.arrayContaining([
          "candidateName",
          "flowName",
          "organizerName",
          "startsAt",
          "endsAt",
        ]),
      );
    }
  });
});
