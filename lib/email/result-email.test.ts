jest.mock("server-only", () => ({}));

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  getResultEmailFlowKind,
  getResultEmailTemplateKey,
  renderResultEmailSubject,
} from "@/lib/email/result-email";
import OfferEmail from "@/emails/offer";
import {
  DEFAULT_EMAIL_FRAME,
  EMPTY_EMAIL_BLOCK_STYLE,
  type EmailBlock,
} from "@/lib/email/blocks";
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
  it("ignores the candidate name in office subjects (batch-consistent subject)", () => {
    /* 主题不再带姓名：邮件中心发送记录/卡片按批次展示，
       显示「张三办公室二轮面试结果通知」会像整批只发给某个人 */
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
    ).toBe("办公室二轮面试结果通知");
  });

  it("keeps office default subjects free of the candidate name", () => {
    for (const key of [
      "office_round1.result.accepted",
      "office_round1.result.rejected",
      "office_round2.result.accepted",
      "office_round2.result.rejected",
    ]) {
      expect(settingFor(key).subjectTemplate).not.toContain("{name}");
    }
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

  /* 自定义正文只替换散文段落：曾经一旦填了正文，重要步骤卡与日历卡整块消失 */
  it("keeps the structural cards when a custom body is provided", () => {
    const accepted = renderToStaticMarkup(
      React.createElement(OfferEmail, {
        name: "张三",
        flowName: "2026 春季招新",
        accept: true,
        flowKind: "recruitment",
        bodyTemplate: "自定义正文第一段\n自定义正文第二段",
      }),
    );
    const rejected = renderToStaticMarkup(
      React.createElement(OfferEmail, {
        name: "张三",
        flowName: "2026 春季招新",
        accept: false,
        flowKind: "recruitment",
        bodyTemplate: "自定义正文",
      }),
    );

    expect(accepted).toContain("自定义正文第一段");
    expect(accepted).toContain(resultEmailLinks.memberInfoForm);
    expect(accepted).toContain(resultEmailLinks.feishuGroup);
    expect(accepted).toContain(resultEmailLinks.calendar);
    /* 未通过者同样保留授课日历入口 */
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

  /* 办公部门的一面结果通知曾经整批带着「[同学姓名]」占位符发出：
     称呼必须用收件人的真实姓名渲染，任何路径都不允许出现占位符 */
  it("greets the candidate by their real name and never emits the placeholder token", () => {
    const html = renderToStaticMarkup(
      React.createElement(OfferEmail, {
        name: "张昊然",
        flowName: "2026 校科协办公室面试招新",
        accept: true,
        flowKind: "office_round1",
        department: "办公室",
        groupNumber: "123456789",
      }),
    );

    expect(html).toContain("亲爱的张昊然同学，");
    expect(html).not.toContain("[同学姓名]");
  });

  /* 区块是正文的唯一来源：卡片、按钮、自定义代码都由它渲染，主题色驱动整封邮件的强调色 */
  it("renders the custom block layout and the template theme colour", () => {
    const html = renderToStaticMarkup(
      React.createElement(OfferEmail, {
        name: "张三",
        flowName: "2026 春季招新",
        accept: true,
        flowKind: "recruitment",
        themeColor: "#1d4ed8",
        blocks: [
          { id: "b1", type: "text", enabled: true, html: "自定义第一段" },
          {
            id: "b2",
            type: "card",
            enabled: true,
            tone: "warning",
            title: "【自定义卡片】",
            rows: [
              { id: "b2r1", kind: "text", html: "卡片说明" },
              {
                id: "b2r2",
                kind: "button",
                label: "点我加入",
                url: "https://example.com/join",
                variant: "dark",
              },
              { id: "b2r3", kind: "divider" },
            ],
          },
        ] satisfies EmailBlock[],
      }),
    );

    expect(html).toContain("自定义第一段");
    expect(html).toContain("【自定义卡片】");
    expect(html).toContain("卡片说明");
    expect(html).toContain("https://example.com/join");
    /* 主题色进了顶部色条与结果面板 */
    expect(html).toContain("#1d4ed8");
  });

  it("skips disabled blocks", () => {
    const html = renderToStaticMarkup(
      React.createElement(OfferEmail, {
        name: "张三",
        flowName: "2026 春季招新",
        accept: true,
        flowKind: "recruitment",
        blocks: [
          { id: "b1", type: "text", enabled: true, html: "留下的段落" },
          { id: "b2", type: "text", enabled: false, html: "关掉的段落" },
        ] satisfies EmailBlock[],
      }),
    );

    expect(html).toContain("留下的段落");
    expect(html).not.toContain("关掉的段落");
  });

  /* 每个区块都能覆盖样式：留空走默认，填了就进内联 style */
  it("applies per-block style overrides", () => {
    const html = renderToStaticMarkup(
      React.createElement(OfferEmail, {
        name: "张三",
        flowName: "2026 春季招新",
        accept: true,
        flowKind: "recruitment",
        blocks: [
          {
            id: "b1",
            type: "text",
            enabled: true,
            html: "被改过样式的段落",
            style: {
              ...EMPTY_EMAIL_BLOCK_STYLE,
              backgroundColor: "#fff1d6",
              padding: "12px 16px",
              borderRadius: "10px",
              textAlign: "center",
              fontSize: "18px",
            },
          },
        ] satisfies EmailBlock[],
      }),
    );

    expect(html).toContain("被改过样式的段落");
    expect(html).toContain("background-color:#fff1d6");
    expect(html).toContain("padding:12px 16px");
    expect(html).toContain("border-radius:10px");
    expect(html).toContain("text-align:center");
    expect(html).toContain("font-size:18px");
  });

  /* 邮件外框（页眉/内容卡/页脚）也是模板自己的字段 */
  it("applies the template frame to the shell", () => {
    const html = renderToStaticMarkup(
      React.createElement(OfferEmail, {
        name: "张三",
        flowName: "2026 春季招新",
        accept: true,
        flowKind: "recruitment",
        frame: {
          ...DEFAULT_EMAIL_FRAME,
          pageBackground: "#f5f3ff",
          cardBackground: "#ffffff",
          cardWidth: "640px",
          cardRadius: "4px",
          eyebrowText: "自定义眉标",
          footerText: "自定义页脚",
        },
        blocks: [
          { id: "b1", type: "text", enabled: true, html: "正文" },
        ] satisfies EmailBlock[],
      }),
    );

    expect(html).toContain("#f5f3ff");
    expect(html).toContain("max-width:640px");
    expect(html).toContain("border-radius:4px");
    expect(html).toContain("自定义眉标");
    expect(html).toContain("自定义页脚");
  });

  it("renders the added block types and drops an unsafe image source", () => {
    const html = renderToStaticMarkup(
      React.createElement(OfferEmail, {
        name: "张三",
        flowName: "2026 春季招新",
        accept: true,
        flowKind: "recruitment",
        blocks: [
          {
            id: "b1",
            type: "badge",
            enabled: true,
            text: "面试日程",
          },
          {
            id: "b2",
            type: "image",
            enabled: true,
            src: "https://example.com/hero.png",
            alt: "配图",
            width: "320",
            href: "",
          },
          {
            id: "b3",
            type: "image",
            enabled: true,
            src: "data:image/png;base64,AAAA",
            alt: "不该出现",
            width: "",
            href: "",
          },
          {
            id: "b4",
            type: "button",
            enabled: true,
            label: "点我",
            url: "https://example.com/join",
            variant: "dark",
            align: "center",
          },
          { id: "b5", type: "spacer", enabled: true, height: "32px" },
          {
            id: "b6",
            type: "columns",
            enabled: true,
            left: { html: "左栏文字", buttonLabel: "", buttonUrl: "" },
            right: { html: "右栏文字", buttonLabel: "右侧按钮", buttonUrl: "https://example.com/r" },
          },
        ] satisfies EmailBlock[],
      }),
    );

    expect(html).toContain("面试日程");
    expect(html).toContain("https://example.com/hero.png");
    expect(html).toContain('width="320"');
    /* data: 图片与非法链接一律不渲染 */
    expect(html).not.toContain("data:image/png");
    expect(html).not.toContain("不该出现");
    expect(html).toContain("https://example.com/join");
    expect(html).toContain("height:32px");
    expect(html).toContain("左栏文字");
    expect(html).toContain("右栏文字");
    expect(html).toContain("右侧按钮");
  });

  /* 落库内容可能来自手改或历史数据：渲染前还要再清洗一次，脚本与事件属性进不了邮件 */
  it("sanitizes custom html at render time", () => {
    const html = renderToStaticMarkup(
      React.createElement(OfferEmail, {
        name: "张三",
        flowName: "2026 春季招新",
        accept: true,
        flowKind: "recruitment",
        blocks: [
          {
            id: "b1",
            type: "code",
            enabled: true,
            html: '<script>alert(1)</script><a href="javascript:alert(2)" onmouseover="x()">点我</a><div style="color:#157347">自定义代码块</div>',
          },
        ] satisfies EmailBlock[],
      }),
    );

    expect(html).not.toContain("<script");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("onmouseover");
    expect(html).toContain("自定义代码块");
    expect(html).toContain("color:#157347");
  });

  it("falls back to a neutral greeting instead of a placeholder when the name is missing", () => {
    const html = renderToStaticMarkup(
      React.createElement(OfferEmail, {
        flowName: "2026 校科协办公室面试招新",
        accept: false,
        flowKind: "office_round1",
        department: "办公室",
      }),
    );

    expect(html).toContain("亲爱的同学，");
    expect(html).not.toContain("[同学姓名]");
  });
});
