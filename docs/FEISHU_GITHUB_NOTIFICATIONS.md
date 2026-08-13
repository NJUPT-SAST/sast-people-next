# GitHub Development Notifications

`Development Notifications` sends selected repository events to the private
`SAST People 开发通知` group through the `SAST People GitHub` Feishu app bot. It does not send
anything to the public issue-feedback group.

## One-time Feishu setup

1. Create and publish the `SAST People GitHub` enterprise self-built app with
   the **bot** capability.
2. In the app permission settings, enable `im:message` (**获取与发送单聊、群组消息**)
   for the app identity.
3. Add the published app bot to `SAST People 开发通知` from the group's bot list.
4. From **凭证与基础信息**, copy the App ID and App Secret. Treat the secret as
   sensitive.

## GitHub repository secrets

In `Settings -> Secrets and variables -> Actions`, create these repository
secrets for `NJUPT-SAST/sast-people-next`:

| Secret | Value |
| --- | --- |
| `FEISHU_APP_ID` | The App ID of `SAST People GitHub` |
| `FEISHU_APP_SECRET` | The App Secret of `SAST People GitHub` |
| `FEISHU_NOTIFY_CHAT_ID` | The chat ID of `SAST People 开发通知` |

The workflow exits successfully without sending a message until all three
values are configured. Once any one value is present, the other two are
required.

## Notification policy

The workflow sends notifications for:

- pull request creation, reopening, ready-for-review, review request, closure,
  and merge; creation, reopening, and ready-for-review cards include the PR
  description summary, while review-request cards identify the requested
  reviewer;
- approval, requested changes, and human review comments; comment and review
  cards include a whitespace-normalized summary limited to 300 characters;
- issue creation, reopening, closure, assignment, and human discussion;
  creation and reopening cards include the Issue description summary;
- failed CI runs only;
- completed deployment runs, including success and failure;
- published releases with the release-note summary.

The summary hides common GitHub tokens, Bearer tokens, and `secret`, `token`,
or `password` key values. The GitHub link remains the source of the full
comment. Each human-authored PR/Issue discussion or inline review comment is
sent once. A submitted review that has neither a decision nor a summary is not
sent again because its inline comments were already delivered. Closure, merge,
assignment, CI, and deployment cards do not repeat the original description.
The workflow deliberately does not notify every push, successful CI run,
review-request removal, issue unassignment, or bot comment/review event, to
keep the group usable. These events do not create new work or a delivery risk;
GitHub remains the canonical activity record for them.

## Verification

After configuring all three values, open `Actions -> Development Notifications`
and run it with **Run workflow**. It sends one `People 通知连通性测试` card to the
development-notification group.
