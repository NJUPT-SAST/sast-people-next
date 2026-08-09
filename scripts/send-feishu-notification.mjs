import { readFile } from "node:fs/promises";

const appId = process.env.FEISHU_APP_ID;
const appSecret = process.env.FEISHU_APP_SECRET;
const chatId = process.env.FEISHU_NOTIFY_CHAT_ID;

if (!appId && !appSecret && !chatId) {
  console.log("Feishu notification credentials are not configured; skipping notification.");
  process.exit(0);
}

if (!appId || !appSecret || !chatId) {
  throw new Error("FEISHU_APP_ID, FEISHU_APP_SECRET, and FEISHU_NOTIFY_CHAT_ID are all required.");
}

const eventName = process.env.GITHUB_EVENT_NAME;
const eventPath = process.env.GITHUB_EVENT_PATH;
const repository = process.env.GITHUB_REPOSITORY;
const serverUrl = process.env.GITHUB_SERVER_URL ?? "https://github.com";

if (!eventName || !eventPath || !repository) {
  throw new Error("GitHub Actions event context is incomplete.");
}

const event = JSON.parse(await readFile(eventPath, "utf8"));
const eventUrl = `${serverUrl}/${repository}/actions`;

function workflowNotification() {
  const run = event.workflow_run;

  if (run.name === "CI/CD Pipeline") {
    if (run.conclusion !== "failure") {
      return null;
    }

    return {
      title: "CI 检查失败",
      template: "red",
      url: run.html_url,
      details: [
        `仓库：${repository}`,
        `分支：${run.head_branch ?? "未知"}`,
        `提交：${run.head_sha?.slice(0, 7) ?? "未知"}`,
      ],
    };
  }

  if (run.name === "Deploy") {
    const succeeded = run.conclusion === "success";
    return {
      title: succeeded ? "People 部署成功" : "People 部署失败",
      template: succeeded ? "green" : "red",
      url: run.html_url,
      details: [
        `仓库：${repository}`,
        `分支：${run.head_branch ?? "未知"}`,
        `提交：${run.head_sha?.slice(0, 7) ?? "未知"}`,
      ],
    };
  }

  return null;
}

function pullRequestNotification() {
  const pullRequest = event.pull_request;
  const action = event.action;
  const isMerged = action === "closed" && pullRequest.merged;
  const labels = {
    opened: ["PR 已创建", "blue"],
    reopened: ["PR 已重新打开", "blue"],
    ready_for_review: ["PR 已准备审阅", "blue"],
    review_requested: ["PR 请求审阅", "orange"],
    closed: [isMerged ? "PR 已合并" : "PR 已关闭", isMerged ? "green" : "grey"],
  };
  const label = labels[action];

  if (!label) {
    return null;
  }

  return {
    title: `${label[0]} · #${pullRequest.number}`,
    template: label[1],
    url: pullRequest.html_url,
    details: [
      pullRequest.title,
      `${pullRequest.user.login} · ${pullRequest.head.ref} -> ${pullRequest.base.ref}`,
    ],
  };
}

function reviewNotification() {
  const review = event.review;
  const pullRequest = event.pull_request;
  const labels = {
    approved: ["PR 已批准", "green"],
    changes_requested: ["PR 请求修改", "red"],
  };
  const label = labels[review.state];

  if (!label) {
    return null;
  }

  return {
    title: `${label[0]} · #${pullRequest.number}`,
    template: label[1],
    url: pullRequest.html_url,
    details: [
      pullRequest.title,
      `审阅人：${review.user.login}`,
    ],
  };
}

function notification() {
  switch (eventName) {
    case "pull_request":
      return pullRequestNotification();
    case "pull_request_review":
      return reviewNotification();
    case "workflow_run":
      return workflowNotification();
    case "workflow_dispatch":
      return {
        title: "People 通知连通性测试",
        template: "blue",
        url: eventUrl,
        details: [`仓库：${repository}`, "GitHub Actions 已成功发送飞书通知。"],
      };
    default:
      return null;
  }
}

const message = notification();

if (!message) {
  console.log(`No notification required for ${eventName}.`);
  process.exit(0);
}

const card = {
  schema: "2.0",
  config: { wide_screen_mode: true },
  header: {
    title: { tag: "plain_text", content: message.title },
    template: message.template,
  },
  body: {
    elements: [
      { tag: "markdown", content: message.details.map((detail) => `- ${detail}`).join("\n") },
      {
        tag: "action",
        actions: [
          {
            tag: "button",
            type: "primary",
            text: { tag: "plain_text", content: "打开 GitHub" },
            url: message.url,
          },
        ],
      },
    ],
  },
};

const tokenResponse = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
});

if (!tokenResponse.ok) {
  throw new Error(`Feishu tenant token request failed with HTTP ${tokenResponse.status}.`);
}

const tokenResult = await tokenResponse.json();
if (tokenResult.code !== 0 || !tokenResult.tenant_access_token) {
  throw new Error(`Feishu tenant token request was rejected: ${tokenResult.msg ?? "unknown error"}`);
}

const response = await fetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id", {
  method: "POST",
  headers: {
    authorization: `Bearer ${tokenResult.tenant_access_token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    receive_id: chatId,
    msg_type: "interactive",
    content: JSON.stringify(card),
  }),
});

if (!response.ok) {
  throw new Error(`Feishu message request failed with HTTP ${response.status}.`);
}

const result = await response.json();
if (result.code !== 0) {
  throw new Error(`Feishu rejected the message: ${result.msg ?? "unknown error"}`);
}

console.log(`Sent ${message.title}.`);
