import { renderTemplateText } from "@/lib/email/template-settings";

export type CollectionInvitationTemplateValues = {
  subjectTemplate: string;
  titleTemplate: string;
  bodyTemplate: string;
  footerText: string;
};

export const collectionInvitationTemplateVariables = [
  "formTitle",
  "deadline",
  "formUrl",
  "message",
] as const;

export const defaultCollectionInvitationTemplate: CollectionInvitationTemplateValues = {
  subjectTemplate: "【SAST People】邀请你填写「{formTitle}」",
  titleTemplate: "邀请你填写收集表",
  bodyTemplate:
    "你收到一份收集表邀请：{formTitle}\n\n截止时间：{deadline}\n\n{message}",
  footerText: "南京邮电大学大学生科学技术协会",
};

export type CollectionInvitationEmailInput = {
  formTitle: string;
  deadlineLabel: string | null;
  url: string;
  message?: string | null;
  template?: Partial<CollectionInvitationTemplateValues>;
  /** 收件人已经提交过：邮件里提示可以忽略本次邀请 */
  alreadySubmitted?: boolean;
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

const renderBodyHtml = (value: string) =>
  value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map(
      (paragraph) =>
        `<p style="margin:0 0 14px;color:#4b5a50;font-size:14px;line-height:24px">${escapeHtml(
          paragraph,
        ).replace(/\n/g, "<br />")}</p>`,
    )
    .join("");

/** 收集表邀请邮件：使用模板管理里的可编辑文案生成主题与 HTML。 */
export const buildCollectionInvitationEmail = ({
  formTitle,
  deadlineLabel,
  url,
  message,
  template,
  alreadySubmitted,
}: CollectionInvitationEmailInput) => {
  const values = {
    ...defaultCollectionInvitationTemplate,
    ...template,
  };
  const variables = {
    formTitle,
    deadline: deadlineLabel ?? "不设截止",
    formUrl: url,
    message: message?.trim() ?? "",
  };
  const subject = renderTemplateText(values.subjectTemplate, variables).replace(
    /[\r\n]+/g,
    " ",
  );
  const title = escapeHtml(renderTemplateText(values.titleTemplate, variables));
  const body = renderBodyHtml(renderTemplateText(values.bodyTemplate, variables));
  const footer = escapeHtml(renderTemplateText(values.footerText, variables));
  const safeUrl = escapeHtml(url);

  return {
    subject,
    html: `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:0;background:#f5f7f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#18231d">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border:1px solid #e2e8df;border-radius:16px;padding:32px">
        <p style="margin:0 0 20px;color:#18A058;font-size:13px;font-weight:600;letter-spacing:.08em">SAST PEOPLE · 信息收集</p>
        <h1 style="margin:0 0 16px;font-size:22px;line-height:32px;font-weight:600">${title}</h1>
        ${body}
        <p style="margin:22px 0 24px">
          <a href="${safeUrl}" style="display:inline-block;background:#18A058;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px">打开收集表</a>
        </p>
        <p style="margin:0;color:#7a877f;font-size:12px;line-height:20px">如果链接无法点击，请复制到浏览器打开：<br /><span style="word-break:break-all">${safeUrl}</span></p>
        ${alreadySubmitted ? `<p style="margin:12px 0 0;color:#7a877f;font-size:12px;line-height:20px">你已经填写过这份收集表，可忽略本邮件；如需修改，可直接打开上方链接。</p>` : ""}
        <p style="margin:16px 0 0;color:#7a877f;font-size:12px;line-height:20px">如果这不是给你的邀请，请忽略此邮件。</p>
        ${footer ? `<p style="margin:18px 0 0;color:#7a877f;font-size:12px;line-height:20px">${footer}</p>` : ""}
      </div>
    </div>
  </body>
</html>`,
  };
};

export type CollectionReturnEmailInput = {
  name: string;
  formTitle: string;
  deadlineLabel: string | null;
  url: string;
  note?: string | null;
};

/** 退回填写通知：说明哪里需要修改，并附上同一份收集表的修改链接。 */
export const buildCollectionReturnEmail = ({
  name,
  formTitle,
  deadlineLabel,
  url,
  note,
}: CollectionReturnEmailInput) => {
  const safeUrl = escapeHtml(url);
  const safeName = escapeHtml(name.trim() || "同学");
  const safeTitle = escapeHtml(formTitle);
  const noteText = note?.trim();
  const subject = `【SAST People】「${formTitle}」的填写需要修改`;

  return {
    subject,
    html: `<!doctype html>
<html lang="zh-CN">
  <body style="margin:0;padding:0;background:#f5f7f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#18231d">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border:1px solid #e2e8df;border-radius:16px;padding:32px">
        <p style="margin:0 0 20px;color:#c77800;font-size:13px;font-weight:600;letter-spacing:.08em">SAST PEOPLE · 信息收集</p>
        <h1 style="margin:0 0 16px;font-size:22px;line-height:32px;font-weight:600">填写内容需要修改</h1>
        <p style="margin:0 0 14px;color:#4b5a50;font-size:14px;line-height:24px">${safeName}，你提交的「${safeTitle}」被退回，请修改后重新提交。</p>
        ${noteText ? renderBodyHtml(`退回说明：\n${noteText}`) : ""}
        <p style="margin:0 0 14px;color:#4b5a50;font-size:14px;line-height:24px">截止时间：${escapeHtml(deadlineLabel ?? "不设截止")}</p>
        <p style="margin:22px 0 24px">
          <a href="${safeUrl}" style="display:inline-block;background:#18A058;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px">打开收集表修改</a>
        </p>
        <p style="margin:0;color:#7a877f;font-size:12px;line-height:20px">如果链接无法点击，请复制到浏览器打开：<br /><span style="word-break:break-all">${safeUrl}</span></p>
        <p style="margin:16px 0 0;color:#7a877f;font-size:12px;line-height:20px">请在截止时间前完成修改并重新提交。</p>
      </div>
    </div>
  </body>
</html>`,
  };
};
