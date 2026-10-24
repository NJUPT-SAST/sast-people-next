import type { CSSProperties } from 'react';

import { EMAIL_BLOCK_STYLE_KEYS, type EmailBlockStyle } from './blocks';
import type { EmailTheme } from './theme';

/**
 * 邮件外观的**唯一来源**：服务端渲染（`lib/email/email-shell.tsx`）与浏览器里的
 * 所见即所得画布（`components/email/EmailCanvas.tsx`）共用这些常量，
 * 保证「画布上看到的样子」与「收件箱里渲染的样子」是同一套内联样式。
 *
 * 本模块必须保持纯数据 + 纯函数，**不要** import sanitize / server-only，
 * 否则会把 Node 依赖打进客户端包。
 */

export type EmailStyleMap = Record<string, CSSProperties>;

/**
 * 区块自定义样式 → React style：只带上用户真的填了的字段，
 * 其余留给渲染器默认值（这样「不填」与「填成默认值」表现一致）。
 */
export function blockStyleOverrides(style: EmailBlockStyle | undefined): CSSProperties {
  const overrides: Record<string, string> = {};
  if (!style) return overrides as CSSProperties;
  for (const key of EMAIL_BLOCK_STYLE_KEYS) {
    const value = style[key].trim();
    if (value) overrides[key] = value;
  }
  return overrides as CSSProperties;
}

/** 卡片配色：通过 / 提示 / 中性，颜色全部来自模板主题色 */
export function cardToneStyle(theme: EmailTheme, tone: 'success' | 'warning' | 'neutral') {
  if (tone === 'success') {
    return { backgroundColor: theme.panel, borderColor: theme.border };
  }
  if (tone === 'warning') {
    return { backgroundColor: theme.badge, borderColor: theme.border };
  }
  return { backgroundColor: '#f7faf8', borderColor: '#d7e5dc' };
}

/** 按钮样式：主题色实心 / 深色实心 / 描边 */
export function emailButtonStyle(theme: EmailTheme, variant: 'primary' | 'dark' | 'plain') {
  if (variant === 'dark') return { ...button, backgroundColor: '#172033' };
  if (variant === 'plain') {
    return {
      ...button,
      backgroundColor: '#ffffff',
      border: `1px solid ${theme.primary}`,
      color: theme.primary,
    };
  }
  return { ...button, backgroundColor: theme.primary };
}

/** 结果面板 / 徽章里的胶囊标签 */
export function badgeStyle(theme: EmailTheme) {
  return { ...resultBadge, color: theme.primary, backgroundColor: theme.badge };
}

export const main = {
  margin: '0',
  backgroundColor: '#eef3f1',
  padding: '24px 10px',
};

export const container = {
  width: '100%',
  maxWidth: '560px',
  margin: '0 auto',
  backgroundColor: '#fffdfa',
  border: '1px solid #d9e2dc',
  borderRadius: '18px',
  overflow: 'hidden',
};

export const topBar = {
  height: '8px',
  backgroundColor: '#157347',
  borderBottom: '1px solid #d7e5dc',
};

export const header = {
  padding: '28px 28px 20px',
  backgroundColor: '#fffdfa',
};

export const logo = {
  display: 'block',
  margin: '0 0 14px',
};

export const eyebrow = {
  margin: '0 0 8px',
  color: '#6f7f78',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '11px',
  fontWeight: '700',
  letterSpacing: '0.6px',
  textTransform: 'uppercase' as const,
};

export const titleStyle = {
  margin: '0',
  color: '#111827',
  fontFamily: 'Georgia, Times New Roman, serif',
  fontSize: '26px',
  fontWeight: '700',
  lineHeight: '32px',
};

export const subtitleStyle = {
  margin: '10px 0 0',
  color: '#52615a',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '14px',
  lineHeight: '22px',
};

export const content = {
  padding: '0 28px 8px',
};

export const text = {
  margin: '0 0 14px',
  color: '#172033',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '15px',
  fontWeight: '400',
  lineHeight: '26px',
};

export const importantText = {
  margin: '0 0 12px',
  color: '#111827',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '15px',
  fontWeight: '700',
  lineHeight: '24px',
};

export const noticeCard = {
  margin: '20px 0',
  padding: '18px 18px 20px',
  backgroundColor: '#f7faf8',
  border: '1px solid #d7e5dc',
  borderRadius: '12px',
};

export const resultPanel = {
  margin: '0 6px 26px',
  padding: '20px 22px',
  border: '1px solid',
  borderRadius: '12px',
};

export const resultBadge = {
  display: 'inline-block',
  margin: '0 0 10px',
  padding: '5px 10px',
  borderRadius: '999px',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '12px',
  fontWeight: '700',
  lineHeight: '16px',
};

export const resultTitle = {
  margin: '0 0 8px',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '24px',
  fontWeight: '700',
  lineHeight: '30px',
};

export const resultText = {
  margin: '0',
  color: '#5b6570',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '14px',
  lineHeight: '22px',
};

export const button = {
  borderRadius: '999px',
  color: '#ffffff',
  display: 'inline-block',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '14px',
  fontWeight: '700',
  lineHeight: '18px',
  padding: '11px 16px',
  textAlign: 'center' as const,
  textDecoration: 'none',
  whiteSpace: 'nowrap' as const,
};

export const buttonRowWrap = {
  margin: '0 0 14px',
};

export const columnCell = {
  width: '50%',
  verticalAlign: 'top' as const,
  padding: '0 0 0 10px',
};

export const columnCellFirst = {
  ...columnCell,
  padding: '0 10px 0 0',
};

export const anchor = {
  color: '#1d4ed8',
  textDecoration: 'underline',
};

export const innerDivider = {
  borderColor: '#dce7df',
  margin: '18px 0',
};

export const divider = {
  borderColor: '#edf1ef',
  margin: '22px 0 18px',
};

export const footer = {
  padding: '22px 28px 28px',
  backgroundColor: '#fffdfa',
  textAlign: 'center' as const,
};

export const footerImage = {
  display: 'block',
  margin: '0 auto 10px',
};

export const footerText = {
  margin: '0',
  color: '#65736d',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '13px',
  lineHeight: '20px',
};
