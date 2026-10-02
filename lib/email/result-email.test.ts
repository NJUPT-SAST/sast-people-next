jest.mock("server-only", () => ({}));

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  getResultEmailFlowKind,
  getResultEmailTemplateKey,
  renderResultEmailSubject,
} from "@/lib/email/result-email";
import OfferEmail from "@/emails/offer";
import { resultEmailLinks } from "@/lib/email/result-email-config";
import { defaultResultEmailTemplateSettings } from "@/lib/email/template-settings";

const settingFor = (templateKey: string) =>
  defaultResultEmailTemplateSettings.find(
    (item) => item.templateKey === templateKey,
  )!;

describe("result email flow kind and template key", () => {
  it("splits office interview flows by round", () => {
    expect(getResultEmailFlowKind("office_interview", 1)).toBe("office_round1");
    expect(getResultEmailFlowKind("office_interview", 2)).toBe("office_round2");
    /* 流程行还没填轮次时按一轮处理 */
    expect(getResultEmailFlowKind("office_interview", null)).toBe("office_round1");
    expect(getResultEmailFlowKind("office_interview")).toBe("office_round1");
  });

  it("keeps other flow types on their existing kinds", () => {
    expect(getResultEmailFlowKind("recruitment", 2)).toBe("recruitment");
    /* 免试不再折叠成 recruitment，按语义类型出独立模板 */
    expect(getResultEmailFlowKind("recruitment_exemption")).toBe("recruitment_exemption");
    expect(getResultEmailFlowKind("recruitment_exemption", 2)).toBe(
      "recruitment_exemption",
    );
    expect(getResultEmailFlowKind("woc")).toBe("woc");
    expect(getResultEmailFlowKind("soc")).toBe("soc");
  });

  it("resolves template keys by flow type, result and round", () => {
    expect(getResultEmailTemplateKey("office_interview", true, 1)).toBe(
      "office_round1.result.accepted",
    );
    expect(getResultEmailTemplateKey("office_interview", false, 2)).toBe(
      "office_round2.result.rejected",
    );
    expect(getResultEmailTemplateKey("recruitment", true)).toBe(
      "recruitment.result.accepted",
    );
    expect(getResultEmailTemplateKey("recruitment_exemption", true)).toBe(
      "recruitment_exemption.result.accepted",
    );
    expect(getResultEmailTemplateKey("recruitment_exemption", false)).toBe(
      "recruitment_exemption.result.rejected",
    );
    expect(getResultEmailTemplateKey("soc", false)).toBe("soc.result.rejected");
  });
});

describe("renderResultEmailSubject", () => {
  it("substitutes the full result variable map", () => {
    expect(
      renderResultEmailSubject(
        {
          name: "张三",
          flowName: "2026 办公类部门面试招新",
          department: "办公室",
          groupNumber: "123456789",
        },
        settingFor("office_round2.result.accepted"),
      ),
    ).toBe("张三办公室二轮面试结果通知");
  });

  it("renders office placeholders empty when the values are missing", () => {
    expect(
      renderResultEmailSubject(
        { flowName: "2026 办公类部门面试招新" },
        settingFor("office_round1.result.accepted"),
      ),
    ).toBe("一轮面试结果通知");
  });

  it("keeps the built-in fallback subject for other flow types", () => {
    expect(renderResultEmailSubject({ name: "李四", flowName: "2026 春季招新" })).toBe(
      "2026 春季招新 结果通知",
    );
  });

  it("uses the exemption template's own default subject", () => {
    expect(
      renderResultEmailSubject(
        { name: "李四", flowName: "2026 免试招新" },
        settingFor("recruitment_exemption.result.accepted"),
      ),
    ).toBe("2026 免试招新 结果通知");
    expect(settingFor("recruitment_exemption.result.accepted").titleTemplate).not.toBe(
      settingFor("recruitment.result.accepted").titleTemplate,
    );
  });
});

describe("OfferEmail", () => {
  /* 免试与笔试共用成员注册版式，这条断言守着 offer.tsx 的 flowKind 分支 */
  it("keeps the member onboarding blocks for exemption flows", () => {
    const accepted = renderToStaticMarkup(
      React.createElement(OfferEmail, {
        name: "张三",
        flowName: "2026 免试招新",
        accept: true,
        flowKind: "recruitment_exemption",
      }),
    );
    const rejected = renderToStaticMarkup(
      React.createElement(OfferEmail, {
        name: "张三",
        flowName: "2026 免试招新",
        accept: false,
        flowKind: "recruitment_exemption",
      }),
    );

    expect(accepted).toContain(resultEmailLinks.memberInfoForm);
    expect(accepted).toContain(resultEmailLinks.feishuGroup);
    /* 未通过者保留授课日历入口 */
    expect(rejected).toContain(resultEmailLinks.calendar);
  });

  it("renders the saved member-form button label", () => {
    /* 「表单按钮文案」是可编辑字段：曾经被写死的「点击填写信息表」顶替，改了不生效 */
    const html = renderToStaticMarkup(
      React.createElement(OfferEmail, {
        name: "张三",
        flowName: "2026 免试招新",
        accept: true,
        flowKind: "recruitment_exemption",
        memberFormLabel: "点我填写成员表",
      }),
    );

    expect(html).toContain("点我填写成员表");
    expect(html).not.toContain("点击填写信息表");
  });
});
