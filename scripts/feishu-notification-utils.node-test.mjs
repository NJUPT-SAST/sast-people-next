import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMENT_SUMMARY_MAX_LENGTH,
  commentSummary,
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
