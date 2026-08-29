jest.mock("server-only", () => ({}));

import { emailTemplateDefinitions } from "@/lib/email-center/registry";

describe("email template registry", () => {
  it("keeps template keys unique", () => {
    const keys = emailTemplateDefinitions.map((definition) => definition.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it("covers the email center templates", () => {
    expect(emailTemplateDefinitions.map((definition) => definition.key)).toEqual(
      expect.arrayContaining([
        "recruitment.result.accepted",
        "recruitment.result.rejected",
        "interview.schedule.created",
        "interview.schedule.rescheduled",
        "interview.schedule.cancelled",
        "interview.application.withdrawn",
      ]),
    );
  });

  it("requires schedule details for schedule templates", () => {
    const scheduleDefinitions = emailTemplateDefinitions.filter((definition) =>
      definition.key.startsWith("interview.schedule."),
    );

    expect(scheduleDefinitions).toHaveLength(3);
    for (const definition of scheduleDefinitions) {
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

  it("requires a reason for the withdrawal notification", () => {
    const definition = emailTemplateDefinitions.find(
      (item) => item.key === "interview.application.withdrawn",
    );

    expect(definition?.variables.filter((variable) => variable.required)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "candidateName" }),
        expect.objectContaining({ key: "flowName" }),
        expect.objectContaining({ key: "reason" }),
      ]),
    );
  });
});
