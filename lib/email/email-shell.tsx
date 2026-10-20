import * as React from 'react';

import { type EmailBlock, type EmailBlockRow, type EmailFrameStyle } from './blocks';
import {
  anchor,
  blockStyleOverrides,
  buttonRowWrap,
  cardToneStyle,
  columnCell,
  columnCellFirst,
  container,
  content,
  divider,
  emailButtonStyle,
  eyebrow,
  footer,
  footerImage,
  footerText,
  header,
  importantText,
  innerDivider,
  logo,
  main,
  noticeCard,
  resultBadge,
  resultPanel,
  resultText,
  resultTitle,
  subtitleStyle,
  text,
  titleStyle,
  topBar,
} from './email-styles';
import { sanitizeEmailHtml, type EmailHtmlSanitizeMode } from './sanitize';
import type { EmailTheme } from './theme';
import { renderTemplateText } from './template-settings';

/**
 * 邮件外壳与区块渲染器：**所有模板共用同一套渲染**。
 *
 * - `EmailShell`：页面背景、内容卡、顶部色条、页眉（logo / 眉标 / 主副标题）与页脚，
 *   外观全部来自模板的 `bodyFrame`；
 * - `EmailBlockList`：正文区块（文本 / 卡片 / 图片 / 按钮 / 双栏 / 结果面板 / 徽章 / …）。
 *
 * 结果邮件与面试通知邮件都走这里，因此「同一套编辑器 + 同一套外观字段」对所有邮件生效。
 * 纯 React，不要在这里 import server-only。
 */

type ElementProps<T extends keyof React.JSX.IntrinsicElements> =
  React.ComponentPropsWithoutRef<T>;

const Html = ({ children }: { children: React.ReactNode }) => (
  <html>{children}</html>
);
const Body = ({ children, ...props }: ElementProps<'body'>) => (
  <body {...props}>{children}</body>
);
const Container = ({ children, ...props }: ElementProps<'div'>) => (
  <div {...props}>{children}</div>
);
const Section = ({ children, ...props }: ElementProps<'div'>) => (
  <div {...props}>{children}</div>
);
const Text = ({ children, ...props }: ElementProps<'p'>) => (
  <p {...props}>{children}</p>
);
const Hr = (props: ElementProps<'hr'>) => <hr {...props} />;
const Img = ({ alt, ...props }: ElementProps<'img'> & { alt: string }) => (
  // eslint-disable-next-line @next/next/no-img-element
  <img alt={alt} {...props} />
);
const Button = ({ children, ...props }: ElementProps<'a'>) => (
  <a {...props}>{children}</a>
);
const Preview = ({ children }: { children: React.ReactNode }) => (
  <div
    style={{
      display: 'none',
      overflow: 'hidden',
      lineHeight: '1px',
      opacity: 0,
      maxHeight: 0,
      maxWidth: 0,
    }}>
    {children}
  </div>
);

/**
 * 渲染时的变量替换顺序很关键：**先替换 `{变量}`，再按邮件白名单清洗**。
 * 变量值是管理员填的 URL / 文案，替换发生在 HTML 上下文里，
 * 只有替换之后再解析 HTML 才能挡住引号逃逸出来的属性（例如往 href 里塞 onmouseover）。
 */
export function resolveBlockHtml(
  html: string,
  variables: Record<string, string>,
  mode: EmailHtmlSanitizeMode,
) {
  return sanitizeEmailHtml(renderTemplateText(html, variables), mode);
}

/** 邮件里的链接只允许 http(s) / mailto / tel，其余（javascript:、data:）一律不输出 href */
export function resolveHref(url: string, variables: Record<string, string>) {
  const value = renderTemplateText(url, variables).trim();
  if (!value) return undefined;
  if (/^(https?:\/\/|mailto:|tel:)/i.test(value)) return value;
  return undefined;
}

/** 图片只允许 http(s)：`data:` / `cid:` 在收件箱里表现不可控 */
export function resolveImageSrc(src: string, variables: Record<string, string>) {
  const value = renderTemplateText(src, variables).trim();
  return /^https?:\/\//i.test(value) ? value : undefined;
}

/** 区块行 → JSX。文本/卡片标题走富文本（已清洗），按钮只输出白名单协议链接。 */
function EmailBlockRowView({
  row,
  variables,
  theme,
}: {
  row: EmailBlockRow;
  variables: Record<string, string>;
  theme: EmailTheme;
}) {
  if (row.kind === 'divider') return <Hr style={innerDivider} />;
  if (row.kind === 'button') {
    const href = resolveHref(row.url, variables);
    const label = renderTemplateText(row.label, variables).trim();
    if (!href || !label) return null;
    return (
      <div style={buttonRowWrap}>
        <Button style={emailButtonStyle(theme, row.variant)} href={href}>
          {label}
        </Button>
      </div>
    );
  }
  return (
    <div
      style={text}
      dangerouslySetInnerHTML={{
        __html: resolveBlockHtml(row.html, variables, 'richText'),
      }}
    />
  );
}

/** 分栏里的一格：一段富文本 + 可选按钮 */
function EmailColumnCellView({
  html,
  buttonLabel,
  buttonUrl,
  variables,
  theme,
  first,
}: {
  html: string;
  buttonLabel: string;
  buttonUrl: string;
  variables: Record<string, string>;
  theme: EmailTheme;
  first: boolean;
}) {
  const content = resolveBlockHtml(html, variables, 'richText');
  const href = resolveHref(buttonUrl, variables);
  const label = renderTemplateText(buttonLabel, variables).trim();

  return (
    <td style={first ? columnCellFirst : columnCell}>
      {content && <div style={text} dangerouslySetInnerHTML={{ __html: content }} />}
      {href && label && (
        <div style={buttonRowWrap}>
          <Button style={emailButtonStyle(theme, 'primary')} href={href}>
            {label}
          </Button>
        </div>
      )}
    </td>
  );
}

export function EmailBlockView({
  block,
  variables,
  theme,
}: {
  block: EmailBlock;
  variables: Record<string, string>;
  theme: EmailTheme;
}) {
  if (!block.enabled) return null;
  const overrides = blockStyleOverrides(block.style);

  if (block.type === 'divider') return <Hr style={{ ...divider, ...overrides }} />;

  if (block.type === 'spacer') {
    return <div style={{ height: block.height.trim() || '20px', ...overrides }} />;
  }

  if (block.type === 'text' || block.type === 'code') {
    const html = resolveBlockHtml(
      block.html,
      variables,
      block.type === 'code' ? 'codeBlock' : 'richText',
    );
    if (!html) return null;
    return (
      <div style={{ ...text, ...overrides }} dangerouslySetInnerHTML={{ __html: html }} />
    );
  }

  if (block.type === 'image') {
    const src = resolveImageSrc(block.src, variables);
    if (!src) return null;
    const href = resolveHref(block.href, variables);
    const width = block.width.trim();
    const widthAttribute = /^\d+$/.test(width) ? width : undefined;
    const image = (
      <Img
        src={src}
        alt={renderTemplateText(block.alt, variables).trim() || 'SAST'}
        width={widthAttribute}
        style={{
          display: 'block',
          maxWidth: '100%',
          height: 'auto',
          ...(width && !widthAttribute ? { width } : {}),
          ...overrides,
        }}
      />
    );
    return href ? (
      <a href={href} style={anchor}>
        {image}
      </a>
    ) : (
      image
    );
  }

  if (block.type === 'button') {
    const href = resolveHref(block.url, variables);
    const label = renderTemplateText(block.label, variables).trim();
    if (!href || !label) return null;
    return (
      <div
        style={{
          textAlign: block.align || 'left',
          margin: '0 0 14px',
          ...overrides,
        }}>
        <Button style={emailButtonStyle(theme, block.variant)} href={href}>
          {label}
        </Button>
      </div>
    );
  }

  if (block.type === 'columns') {
    return (
      <table
        role="presentation"
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{ borderCollapse: 'collapse', width: '100%', ...overrides }}>
        <tbody>
          <tr>
            <EmailColumnCellView
              first
              html={block.left.html}
              buttonLabel={block.left.buttonLabel}
              buttonUrl={block.left.buttonUrl}
              variables={variables}
              theme={theme}
            />
            <EmailColumnCellView
              first={false}
              html={block.right.html}
              buttonLabel={block.right.buttonLabel}
              buttonUrl={block.right.buttonUrl}
              variables={variables}
              theme={theme}
            />
          </tr>
        </tbody>
      </table>
    );
  }

  if (block.type === 'resultPanel') {
    const badge = resolveBlockHtml(block.badge, variables, 'inlineText');
    const title = resolveBlockHtml(block.title, variables, 'inlineText');
    const summary = resolveBlockHtml(block.summary, variables, 'inlineText');
    return (
      <Section
        style={{
          ...resultPanel,
          borderColor: theme.border,
          backgroundColor: theme.panel,
          ...overrides,
        }}>
        {badge && (
          <div
            style={{ ...resultBadge, color: theme.primary, backgroundColor: theme.badge }}
            dangerouslySetInnerHTML={{ __html: badge }}
          />
        )}
        {title && (
          <div
            style={{ ...resultTitle, color: theme.primary }}
            dangerouslySetInnerHTML={{ __html: title }}
          />
        )}
        {summary && (
          <div style={resultText} dangerouslySetInnerHTML={{ __html: summary }} />
        )}
      </Section>
    );
  }

  if (block.type === 'badge') {
    const badgeText = resolveBlockHtml(block.text, variables, 'inlineText');
    if (!badgeText) return null;
    return (
      <div style={{ margin: '0 0 12px', ...overrides }}>
        <span
          style={{ ...resultBadge, color: theme.primary, backgroundColor: theme.badge }}
          dangerouslySetInnerHTML={{ __html: badgeText }}
        />
      </div>
    );
  }

  const title = resolveBlockHtml(block.title, variables, 'inlineText');
  return (
    <Section style={{ ...noticeCard, ...cardToneStyle(theme, block.tone), ...overrides }}>
      {title && (
        <div style={importantText} dangerouslySetInnerHTML={{ __html: title }} />
      )}
      {block.rows.map((row) => (
        <EmailBlockRowView
          key={row.id}
          row={row}
          variables={variables}
          theme={theme}
        />
      ))}
    </Section>
  );
}

export function EmailBlockList({
  blocks,
  variables,
  theme,
}: {
  blocks: EmailBlock[];
  variables: Record<string, string>;
  theme: EmailTheme;
}) {
  return (
    <>
      {blocks.map((block) => (
        <EmailBlockView key={block.id} block={block} variables={variables} theme={theme} />
      ))}
    </>
  );
}

/**
 * 邮件外壳：页面背景 → 内容卡（背景/描边/圆角/宽度）→ 顶部色条 → 页眉（logo/眉标/主副标题）
 * → 正文 → 页脚。所有取值都来自模板的 `bodyFrame` 与主题色。
 */
export function EmailShell({
  frame,
  theme,
  title,
  subtitle,
  previewText = 'SAST Invitation',
  children,
}: {
  frame: EmailFrameStyle;
  theme: EmailTheme;
  title: string;
  subtitle?: string;
  previewText?: string;
  children: React.ReactNode;
}) {
  const logoWidth = frame.logoWidth.trim();
  return (
    <Html>
      <Preview>{previewText}</Preview>
      <Body style={{ ...main, backgroundColor: frame.pageBackground }}>
        <Container
          style={{
            ...container,
            backgroundColor: frame.cardBackground,
            border: frame.cardBorder,
            borderRadius: frame.cardRadius,
            maxWidth: frame.cardWidth,
          }}>
          <Section style={{ ...topBar, backgroundColor: theme.primary }} />
          <Section style={{ ...header, backgroundColor: frame.cardBackground }}>
            {frame.logoUrl && (
              <Img
                src={frame.logoUrl}
                width={/^\d+$/.test(logoWidth) ? logoWidth : undefined}
                alt="SAST"
                style={logo}
              />
            )}
            {frame.eyebrowText && <Text style={eyebrow}>{frame.eyebrowText}</Text>}
            <Text style={titleStyle}>{title}</Text>
            {subtitle ? <Text style={subtitleStyle}>{subtitle}</Text> : null}
          </Section>

          <Section style={content}>{children}</Section>

          <Section style={{ ...footer, backgroundColor: frame.cardBackground }}>
            {frame.footerImageUrl && (
              <Img
                src={frame.footerImageUrl}
                width="180"
                alt="SAST - Igniting the thought"
                style={footerImage}
              />
            )}
            <Text style={footerText}>{frame.footerText}</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
