export type CollectionInvitationEmailInput = {
  inviterName: string;
  formTitle: string;
  deadlineLabel: string | null;
  url: string;
  message?: string | null;
};

const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character,
  );

/** 收集表邀请邮件：纯函数生成主题与 HTML，便于单测。 */
export const buildCollectionInvitationEmail = ({
  inviterName,
  formTitle,
  deadlineLabel,
  url,
  message,
}: CollectionInvitationEmailInput) => {
  const safeInviter = escapeHtml(inviterName);
  const safeTitle = escapeHtml(formTitle);
  const safeUrl = escapeHtml(url);
  const safeMessage = message?.trim() ? escapeHtml(message.trim()) : null;
  const deadline = deadlineLabel
    ? `<p style="margin:0 0 8px;color:#4b5a50;font-size:14px;line-height:22px">截止时间：${escapeHtml(deadlineLabel)}</p>`
    : "";

  return {
    subject: `【SAST People】${inviterName} 邀请你填写「${formTitle}」`.replace(
      /[\r\n]+/g,
      " ",
    ),
    html: `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:0;background:#f5f7f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#18231d">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border:1px solid #e2e8df;border-radius:16px;padding:32px">
        <p style="margin:0 0 20px;color:#18A058;font-size:13px;font-weight:600;letter-spacing:.08em">SAST PEOPLE · 信息收集</p>
        <h1 style="margin:0 0 16px;font-size:22px;line-height:32px;font-weight:600">${safeInviter} 邀请你填写收集表</h1>
        <p style="margin:0 0 8px;color:#4b5a50;font-size:14px;line-height:22px">收集表：<strong style="color:#18231d">${safeTitle}</strong></p>
        ${deadline}
        ${safeMessage ? `<div style="margin:18px 0;padding:12px 14px;border-left:3px solid #18A058;background:#f5f7f3;color:#4b5a50;font-size:14px;line-height:22px">${safeMessage}</div>` : ""}
        <p style="margin:22px 0 24px">
          <a href="${safeUrl}" style="display:inline-block;background:#18A058;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px">打开收集表</a>
        </p>
        <p style="margin:0;color:#7a877f;font-size:12px;line-height:20px">如果链接无法点击，请复制到浏览器打开：<br /><span style="word-break:break-all">${safeUrl}</span></p>
        <p style="margin:16px 0 0;color:#7a877f;font-size:12px;line-height:20px">如果这不是给你的邀请，请忽略此邮件。</p>
      </div>
    </div>
  </body>
</html>`,
  };
};
