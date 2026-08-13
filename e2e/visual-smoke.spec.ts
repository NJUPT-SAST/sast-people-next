import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

const users = {
  admin: { uid: 1, role: 3, name: "Local Admin" },
  lecturer: { uid: 2, role: 2, name: "Demo Lecturer" },
  candidate: { uid: 8, role: 0, name: "Demo Freshman E" },
} as const;

async function expectNoHorizontalOverflow(
  page: import("@playwright/test").Page,
) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      rootOverflow: root.scrollWidth - root.clientWidth,
      bodyOverflow: body.scrollWidth - body.clientWidth,
    };
  });
  expect(
    overflow.rootOverflow,
    `documentElement horizontal overflow ${overflow.rootOverflow}px`,
  ).toBeLessThanOrEqual(1);
  expect(
    overflow.bodyOverflow,
    `body horizontal overflow ${overflow.bodyOverflow}px`,
  ).toBeLessThanOrEqual(1);
}

const keyRoutes: Array<{
  path: string;
  marker: string | RegExp;
  user: keyof typeof users;
}> = [
  {
    path: "/dashboard",
    marker: "我的资料",
    user: "admin",
  },
  {
    path: "/dashboard/user-flow",
    marker: "我的流程",
    user: "candidate",
  },
  {
    path: "/dashboard/exams",
    marker: "笔试管理",
    user: "admin",
  },
  {
    path: "/dashboard/interviews",
    marker: "面试管理",
    user: "admin",
  },
  {
    path: "/dashboard/review",
    marker: "试卷批改",
    user: "lecturer",
  },
  {
    path: "/dashboard/emails",
    marker: "统一管理系统邮件模板、发送任务和发送记录",
    user: "admin",
  },
  {
    path: "/dashboard/approvals",
    marker: "面评审批",
    user: "admin",
  },
  {
    path: "/dashboard/flow",
    marker: "管理招新、WOC/WOD、SOC/SOD 等流程",
    user: "admin",
  },
];

const viewports = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

test.describe("key page visual smoke", () => {
  for (const viewport of viewports) {
    test.describe(viewport.name, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
      });

      test("login page renders without horizontal overflow", async ({
        page,
      }) => {
        await page.goto("/login");
        await expect(page.getByAltText("SAST Logo")).toBeVisible({
          timeout: 15_000,
        });
        await expectNoHorizontalOverflow(page);
      });

      for (const route of keyRoutes) {
        test(`${route.path} renders without horizontal overflow`, async ({
          page,
          context,
        }) => {
          await signInAs(context, users[route.user]);
          await page.goto(route.path);
          await expect(page.getByText(route.marker).first()).toBeVisible({
            timeout: 20_000,
          });
          await expectNoHorizontalOverflow(page);
        });
      }
    });
  }
});
