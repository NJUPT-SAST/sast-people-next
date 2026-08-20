import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMENT_SUMMARY_MAX_LENGTH,
  commentSummary,
  pullRequestCompareUrl,
  pullRequestUpdateDetails,
} from "./feishu-notification-utils.mjs";

test("masks underscored sensitive fields and quoted escaped values", () => {
  const summary = commentSummary(
    'access_token: "first\\"second" refresh_token=\'refresh-value\' client_secret: plain-value',
  );

  assert.equal(
    summary,
    "access_token: [已隐藏] refresh_token=[已隐藏] client_secret: [已隐藏]",
  );
});

test("keeps the ellipsis within the comment summary length limit", () => {
  const summary = commentSummary("测".repeat(COMMENT_SUMMARY_MAX_LENGTH + 1));

  assert.equal(Array.from(summary).length, COMMENT_SUMMARY_MAX_LENGTH);
  assert.ok(summary.endsWith("..."));
});

test("summarizes a PR update with only the pusher and commit range", () => {
  const details = pullRequestUpdateDetails({
    before: "1234567890abcdef",
    after: "abcdef1234567890",
    headSha: "unused",
    senderLogin: "contributor",
  });

  assert.deepEqual(details, [
    ["推送者", "contributor"],
    ["提交范围", "1234567 -> abcdef1"],
  ]);
});

test("creates a compare URL only for distinct commit hashes", () => {
  assert.equal(
    pullRequestCompareUrl({
      serverUrl: "https://github.com",
      repository: "SAST-2024/sast-people-next",
      before: "1234567890abcdef",
      after: "abcdef1234567890",
    }),
    "https://github.com/SAST-2024/sast-people-next/compare/1234567890abcdef...abcdef1234567890",
  );
  assert.equal(
    pullRequestCompareUrl({
      serverUrl: "https://github.com",
      repository: "SAST-2024/sast-people-next",
      before: "same",
      after: "same",
    }),
    null,
  );
});
