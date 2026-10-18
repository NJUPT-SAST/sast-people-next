import {
  SEMANTIC_FLOW_TYPE_OPTIONS,
  departmentSupportsStage,
  emailTemplateFlowType,
  flowTypeLabel,
  flowTypeOptionOf,
} from "./flow";

const stageTypesOf = (department: string) =>
  SEMANTIC_FLOW_TYPE_OPTIONS.filter(
    (option) => option.department === department,
  ).map((option) => option.type);

describe("electronics semantic flow options", () => {
  it("offers exemption, written test and retention assessment but no WOC", () => {
    expect(stageTypesOf("electronics")).toEqual([
      "recruitment_exemption",
      "recruitment",
      "soc",
    ]);
    expect(flowTypeOptionOf("woc", "electronics")).toBeNull();
    expect(flowTypeLabel("soc", "electronics")).toBe("电子部留任考核");
  });

  it("keeps software and media on the WOC stage", () => {
    expect(stageTypesOf("software")).toContain("woc");
    expect(stageTypesOf("media")).toContain("woc");
  });
});

describe("departmentSupportsStage", () => {
  it("marks WOC as unsupported for electronics only", () => {
    expect(departmentSupportsStage("electronics", "woc")).toBe(false);
    expect(departmentSupportsStage("electronics", "soc")).toBe(true);
    expect(departmentSupportsStage("software", "woc")).toBe(true);
    expect(departmentSupportsStage(null, "woc")).toBe(true);
  });
});

describe("emailTemplateFlowType", () => {
  it("maps result templates to their stage and interview notices to null", () => {
    expect(emailTemplateFlowType("woc.result.accepted")).toBe("woc");
    expect(emailTemplateFlowType("soc.result.rejected")).toBe("soc");
    expect(emailTemplateFlowType("interview.schedule.created")).toBeNull();
  });
});
