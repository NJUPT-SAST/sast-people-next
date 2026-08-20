import { readFile } from "node:fs/promises";
import {
  commentSummary,
  pullRequestCompareUrl,
  pullRequestUpdateDetails,
} from "./feishu-notification-utils.mjs";

const appId = process.env.FEISHU_APP_ID;
const appSecret = process.env.FEISHU_APP_SECRET;
const chatId = process.env.FEISHU_NOTIFY_CHAT_ID;

if (!appId && !appSecret && !chatId) {
  throw new Error(
    "Feishu notification credentials are not configured. Set FEISHU_APP_ID, FEISHU_APP_SECRET, and FEISHU_NOTIFY_CHAT_ID.",
  );
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

function line(label, value) {
  return `**${label}**：${value}`;
}

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
      buttonLabel: "查看 CI 运行",
      subtitle: "GitHub Actions",
      details: [
        line("仓库", repository),
        line("分支", run.head_branch ?? "未知"),
        line("提交", run.head_sha?.slice(0, 7) ?? "未知"),
      ],
    };
  }

  if (run.name === "Deploy") {
    const succeeded = run.conclusion === "success";
    return {
      title: succeeded ? "People 部署成功" : "People 部署失败",
      template: succeeded ? "green" : "red",
      url: run.html_url,
      buttonLabel: "查看部署运行",
      subtitle: "GitHub Actions",
      details: [
        line("仓库", repository),
        line("分支", run.head_branch ?? "未知"),
        line("提交", run.head_sha?.slice(0, 7) ?? "未知"),
      ],
    };
  }

  return null;
}

function pullRequestNotification() {
  const pullRequest = event.pull_request;
  const action = event.action;
  const summary = action === "synchronize" ? null : commentSummary(pullRequest.body);
  const isMerged = action === "closed" && pullRequest.merged;
  const labels = {
    opened: ["PR 已创建", "blue"],
    reopened: ["PR 已重新打开", "blue"],
    synchronize: ["PR 已推送更新", "blue"],
    ready_for_review: ["PR 已准备审阅", "blue"],
    converted_to_draft: ["PR 已转为草稿", "grey"],
    review_requested: ["PR 请求审阅", "orange"],
    closed: [isMerged ? "PR 已合并" : "PR 已关闭", isMerged ? "green" : "grey"],
  };
  const label = labels[action];
  const compareUrl = action === "synchronize"
    ? pullRequestCompareUrl({ serverUrl, repository, before: event.before, after: event.after })
    : null;

  if (!label) {
    return null;
  }

  return {
    title: `${label[0]} · #${pullRequest.number}`,
    template: label[1],
    url: compareUrl ?? pullRequest.html_url,
    buttonLabel: compareUrl ? "查看更新" : "查看 PR",
    subtitle: "GitHub Pull Request",
    details: action === "synchronize"
      ? pullRequestUpdateDetails({
        before: event.before,
        after: event.after,
        headSha: pullRequest.head.sha,
        senderLogin: event.sender?.login,
      }).map(([detailLabel, value]) => line(detailLabel, value))
      : [
        line("标题", pullRequest.title),
        line("发起人", pullRequest.user.login),
        line("分支", `${pullRequest.head.ref} -> ${pullRequest.base.ref}`),
        ...(["opened", "reopened", "ready_for_review"].includes(action) && summary
          ? [line("摘要", summary)]
          : []),
        ...(action === "review_requested" && (event.requested_reviewer || event.requested_team)
          ? [line("请求审阅", event.requested_reviewer?.login ?? event.requested_team.name)]
          : []),
      ],
  };
}

function issueNotification() {
  const issue = event.issue;
  const action = event.action;
  const summary = commentSummary(issue.body);
  const labels = {
    opened: ["Issue 已创建", "blue"],
    reopened: ["Issue 已重新打开", "blue"],
    closed: ["Issue 已关闭", "grey"],
    assigned: ["Issue 已分配", "orange"],
  };
  const label = labels[action];

  if (!label) {
    return null;
  }

  return {
    title: `${label[0]} · #${issue.number}`,
    template: label[1],
    url: issue.html_url,
    buttonLabel: "查看 Issue",
    subtitle: "GitHub Issue",
    details: [
      line("标题", issue.title),
      line("操作者", event.sender?.login ?? issue.user.login),
      ...(issue.assignee
        ? [line("负责人", issue.assignee.login)]
        : []),
      ...(["opened", "reopened"].includes(action) && summary
        ? [line("摘要", summary)]
        : []),
    ],
  };
}

function commentNotification() {
  const issue = event.issue;
  const comment = event.comment;

  // Automated comments are useful in GitHub but too noisy for the team chat.
  if (comment.user?.type === "Bot") {
    return null;
  }

  const summary = commentSummary(comment.body);

  if (issue.pull_request) {
    return {
      title: `PR 有新讨论 · #${issue.number}`,
      template: "blue",
      url: comment.html_url ?? issue.html_url,
      buttonLabel: "查看评论",
      subtitle: "GitHub Pull Request",
      details: [
        line("标题", issue.title),
        line("评论人", comment.user?.login ?? "未知"),
        ...(summary ? [line("评论摘要", summary)] : []),
      ],
    };
  }

  return {
    title: `Issue 有新评论 · #${issue.number}`,
    template: "blue",
    url: comment.html_url ?? issue.html_url,
    buttonLabel: "查看评论",
    subtitle: "GitHub Issue",
    details: [
      line("标题", issue.title),
      line("评论人", comment.user?.login ?? "未知"),
      ...(summary ? [line("评论摘要", summary)] : []),
    ],
  };
}

function reviewCommentNotification() {
  const pullRequest = event.pull_request;
  const comment = event.comment;

  if (comment.user?.type === "Bot") {
    return null;
  }

  const summary = commentSummary(comment.body);
  const lineNumber = comment.line ?? comment.original_line;

  return {
    title: `PR 有行内评论 · #${pullRequest.number}`,
    template: "orange",
    url: comment.html_url ?? pullRequest.html_url,
    buttonLabel: "查看评论",
    subtitle: "GitHub Pull Request",
    details: [
      line("标题", pullRequest.title),
      line("评论人", comment.user?.login ?? "未知"),
      ...(comment.path ? [line("文件", comment.path)] : []),
      ...(comment.path && lineNumber ? [line("位置", `${comment.path}:${lineNumber}`)] : []),
      ...(summary ? [line("评论摘要", summary)] : []),
    ],
  };
}

function reviewNotification() {
  const review = event.review;
  const pullRequest = event.pull_request;

  if (review.user?.type === "Bot") {
    return null;
  }

  const summary = commentSummary(review.body);
  if (event.action !== "dismissed" && review.state === "commented" && !summary) {
    // The individual inline comments already have their own notifications.
    return null;
  }

  const labels = {
    approved: ["PR 已批准", "green"],
    changes_requested: ["PR 请求修改", "red"],
    commented: ["PR 审查已提交", "blue"],
  };
  const label = event.action === "dismissed"
    ? ["PR 审查已撤销", "grey"]
    : labels[review.state];

  if (!label) {
    return null;
  }

  return {
    title: `${label[0]} · #${pullRequest.number}`,
    template: label[1],
    url: pullRequest.html_url,
    buttonLabel: "查看 PR",
    subtitle: "GitHub Pull Request",
    details: [
      line("标题", pullRequest.title),
      line("审阅人", review.user.login),
      ...(summary ? [line("审查摘要", summary)] : []),
    ],
  };
}

function releaseNotification() {
  const release = event.release;
  const summary = commentSummary(release.body);

  return {
    title: `版本已发布 · ${release.tag_name}`,
    template: "green",
    url: release.html_url,
    buttonLabel: "查看 Release",
    subtitle: "GitHub Release",
    details: [
      line("版本", release.name || release.tag_name),
      line("发布人", release.author?.login ?? "未知"),
      ...(summary ? [line("发布摘要", summary)] : []),
    ],
  };
}

function notification() {
  switch (eventName) {
    case "pull_request":
    case "pull_request_target":
      return pullRequestNotification();
    case "pull_request_review":
      return reviewNotification();
    case "pull_request_review_comment":
      return reviewCommentNotification();
    case "issue_comment":
      return commentNotification();
    case "issues":
      return issueNotification();
    case "release":
      return releaseNotification();
    case "workflow_run":
      return workflowNotification();
    case "workflow_dispatch":
      return {
        title: "People 通知连通性测试",
        template: "blue",
        url: eventUrl,
        buttonLabel: "查看 GitHub Actions",
        subtitle: "SAST People GitHub",
        details: [line("仓库", repository), line("状态", "通知通道已就绪")],
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
  config: { wide_screen_mode: true },
  header: {
    title: { tag: "plain_text", content: message.title },
    template: message.template,
  },
  elements: [
    {
      tag: "div",
      text: { tag: "lark_md", content: [`**${message.subtitle}**`, ...message.details].join("\n") },
    },
    { tag: "hr" },
    {
      tag: "action",
      actions: [
        {
          tag: "button",
          type: "primary",
          text: { tag: "plain_text", content: message.buttonLabel },
          url: message.url,
        },
      ],
    },
    {
      tag: "note",
      elements: [{ tag: "plain_text", content: "由 SAST People GitHub 推送" }],
    },
  ],
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

const result = await response.json();
if (!response.ok || result.code !== 0) {
  throw new Error(
    `Feishu message request failed (HTTP ${response.status}, code ${result.code ?? "unknown"}): ${result.msg ?? "unknown error"}`,
  );
}

console.log(`Sent ${message.title}.`);
