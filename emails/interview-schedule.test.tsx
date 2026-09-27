import { renderToStaticMarkup } from "react-dom/server";

import { InterviewScheduleEmail } from "./interview-schedule";

/** @react-email/render v2 needs --experimental-vm-modules; static markup is enough here. */
const render = (element: React.ReactElement) => renderToStaticMarkup(element);

const base = {
  candidateName: "张三",
  flowName: "2026 免试招新",
};

describe("InterviewScheduleEmail organiser row", () => {
  it("labels an appointment's organiser as 讲师", async () => {
    const html = render(
      <InterviewScheduleEmail
        kind="created"
        {...base}
        organizerName="李四"
      />,
    );

    expect(html).toContain("讲师");
    expect(html).toContain("李四");
  });

  it("labels a withdrawal with the role that issued it", async () => {
    // A withdrawal can come from an admin, so the same slot has to be able to
    // say 管理员 instead of hard-coding 讲师.
    const html = render(
      <InterviewScheduleEmail
        kind="withdrawn"
        {...base}
        reason="请补充作品集后重新报名。"
        organizerName="王五"
        organizerLabel="管理员"
      />,
    );

    expect(html).toContain("管理员");
    expect(html).toContain("王五");
    expect(html).not.toContain("讲师");
  });

  it("omits the row when nobody is named", async () => {
    const html = render(
      <InterviewScheduleEmail
        kind="withdrawn"
        {...base}
        reason="请补充作品集后重新报名。"
      />,
    );

    expect(html).not.toContain("讲师");
    expect(html).not.toContain("管理员");
  });
});
