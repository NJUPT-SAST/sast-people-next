import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Client } from "pg";
import { signInAs } from "./session";

/**
 * The row menu is opened by a tap or a click, never by a press.
 *
 * Radix opens a dropdown from its trigger's `pointerdown`, which on touch is the
 * instant a finger lands — so a swipe that merely started on the action button
 * opened the menu mid-scroll, and an open menu holds the page (Radix locks the
 * scroll and the pointer events underneath it) until it is dismissed. The menu
 * tests in evaluationTable.test.tsx stub the dropdown out, so the gesture itself
 * is only observable here.
 */

const admin = { uid: 1, role: 4, name: "管理员", department: "software" } as const;

/* 自建固定流程 + 候选人作为夹具：工作台默认展示「最新创建的面试流程」，
   依赖种子数据或其它用例的流程时，任意一条最新流程没有候选人就会失败。 */
let flowId = 0;
let database: Client | null = null;

test.beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for interview row menu E2E tests");
  }
  database = new Client({ connectionString: databaseUrl });
  await database.connect();
  const inserted = await database.query<{ id: number }>(
    `insert into flow (title, description, type, owner_id, started_at, is_deleted, department)
     values ('E2E 行操作菜单夹具', 'E2E fixture flow for the row action menu', 'woc', 1, now(), false, 'software')
     returning id`,
  );
  flowId = inserted.rows[0].id;
  await database.query(
    `insert into user_flow (progress_status, fk_flow_id, fk_user_id, department)
     values ('ongoing', $1, 11, 'software')`,
    [flowId],
  );
});

test.afterAll(async () => {
  if (!database) return;
  try {
    if (flowId) {
      await database.query("delete from user_flow where fk_flow_id = $1", [flowId]);
      await database.query("delete from flow where id = $1", [flowId]);
    }
  } finally {
    await database.end();
  }
});

const interviewsUrl = () => `/dashboard/interviews?flowId=${flowId}`;

// The route compiles on first request in a dev server, which can outlast the
// suite's default budget.
test.describe.configure({ timeout: 90_000 });

async function visibleActionTrigger(page: Page) {
  const trigger = page.locator('[data-slot="row-action-menu"]:visible').first();
  await trigger.waitFor({ state: "visible", timeout: 30_000 });
  // `touchscreen.tap` and the raw CDP touch events below do not scroll the way
  // `click()` does, and the first row can sit below the fold: without this the
  // tap lands on empty space and every assertion passes for the wrong reason.
  await trigger.scrollIntoViewIfNeeded();
  const box = await trigger.boundingBox();
  if (!box) throw new Error("the row action trigger has no box");
  return {
    trigger,
    x: Math.round(box.x + box.width / 2),
    y: Math.round(box.y + box.height / 2),
  };
}

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("a swipe that starts on the action button leaves the menu closed", async ({
    page,
    context,
  }) => {
    await signInAs(context, admin);
    await page.goto(interviewsUrl());

    const { x, y } = await visibleActionTrigger(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x, y }],
    });
    for (const dy of [14, 44, 84, 124, 164]) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x, y: y - dy }],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });

    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("a tap opens the menu, and a tap while it is open closes it", async ({
    page,
    context,
  }) => {
    await signInAs(context, admin);
    await page.goto(interviewsUrl());

    const first = await visibleActionTrigger(page);
    await page.touchscreen.tap(first.x, first.y);
    await expect(page.getByRole("menu")).toBeVisible();

    const second = await visibleActionTrigger(page);
    await page.touchscreen.tap(second.x, second.y);
    await expect(page.getByRole("menu")).toHaveCount(0);
  });
});

test.describe("with a mouse", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("clicking the action button opens the menu, and clicking it again closes it", async ({
    page,
    context,
  }) => {
    await signInAs(context, admin);
    await page.goto(interviewsUrl());

    const { trigger, x, y } = await visibleActionTrigger(page);
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();

    // While the menu is open Radix makes the page underneath unhittable, so the
    // trigger cannot be clicked through the usual actionability checks: the second
    // click has to be dispatched at the point, where Radix reads it as an outside
    // press and dismisses.
    await page.mouse.click(x, y);
    await expect(page.getByRole("menu")).toHaveCount(0);
  });
});

test.describe("from a screen reader", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test("a click with no press behind it opens the menu", async ({
    page,
    context,
  }) => {
    await signInAs(context, admin);
    await page.goto(interviewsUrl());

    const { trigger } = await visibleActionTrigger(page);
    // How a screen reader activates the button: a click with `detail` 0 and no
    // pointer events at all, which the press tracking and Radix's own pointer
    // and Enter/Space handling all miss.
    await trigger.evaluate((button) => (button as HTMLElement).click());

    await expect(page.getByRole("menu")).toBeVisible();
  });
});
