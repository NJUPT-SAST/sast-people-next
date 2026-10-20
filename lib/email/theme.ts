/**
 * 结果邮件的主题色。
 *
 * 历史上顶部色条、结果面板、徽章和按钮的颜色写死在组件里，只有「通过 / 不通过」两套。
 * 现在模板可以自带一个主题色（`email_template_setting.theme_color`）：
 * 空值时沿用内置的通过绿 / 不通过橙（保证存量邮件渲染结果不变），
 * 填了 hex 就由它推导徽章底色、面板底色与描边色。
 *
 * 纯函数 + 常量，客户端（取色器）与服务端渲染共用。
 */

export type EmailTheme = {
  primary: string;
  badge: string;
  panel: string;
  border: string;
};

/** 内置语义色：与历史组件里的 acceptedTone / rejectedTone 完全一致 */
export const EMAIL_THEME_DEFAULTS: Record<"accepted" | "rejected", EmailTheme> = {
  accepted: {
    primary: "#157347",
    badge: "#e5f6ed",
    panel: "#f2fbf6",
    border: "#b7ddc8",
  },
  rejected: {
    primary: "#b45309",
    badge: "#fff1d6",
    panel: "#fffaf0",
    border: "#ecd39a",
  },
};

/** 取色器常用色：够覆盖协会现有的绿 / 蓝 / 橙 / 红几套用法，又不至于让人自由到选不出色 */
export const EMAIL_THEME_PRESETS: Array<{ label: string; color: string }> = [
  { label: "协会绿", color: "#157347" },
  { label: "深青", color: "#0f766e" },
  { label: "科技蓝", color: "#1d4ed8" },
  { label: "靛蓝", color: "#4f46e5" },
  { label: "警示橙", color: "#b45309" },
  { label: "珊瑚红", color: "#c2410c" },
  { label: "玫红", color: "#be185d" },
  { label: "墨黑", color: "#172033" },
];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isEmailThemeColor(value: string): boolean {
  return HEX_COLOR.test(value.trim());
}

/** 把主色与白色按比例混合：keep = 保留多少主色（0.1 ≈ 九成白） */
function mixWithWhite(hex: string, keep: number): string {
  const value = hex.trim().replace("#", "");
  const parts = [0, 2, 4].map((offset) => {
    const channel = Number.parseInt(value.slice(offset, offset + 2), 16);
    return Math.round(channel * keep + 255 * (1 - keep));
  });
  return `#${parts.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

/** 主题色为空 / 不合法时回落到内置语义色 */
export function resolveEmailTheme(
  themeColor: string | null | undefined,
  accept: boolean,
): EmailTheme {
  const fallback = accept ? EMAIL_THEME_DEFAULTS.accepted : EMAIL_THEME_DEFAULTS.rejected;
  const primary = (themeColor ?? "").trim();
  if (!isEmailThemeColor(primary)) return fallback;
  return {
    primary,
    badge: mixWithWhite(primary, 0.1),
    panel: mixWithWhite(primary, 0.05),
    border: mixWithWhite(primary, 0.35),
  };
}
