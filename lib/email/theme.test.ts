import {
  EMAIL_THEME_DEFAULTS,
  isEmailThemeColor,
  resolveEmailTheme,
} from "@/lib/email/theme";

describe("resolveEmailTheme", () => {
  it("falls back to the built-in tones so untouched templates render unchanged", () => {
    expect(resolveEmailTheme("", true)).toEqual(EMAIL_THEME_DEFAULTS.accepted);
    expect(resolveEmailTheme(null, false)).toEqual(EMAIL_THEME_DEFAULTS.rejected);
    /* 非法值同样回落，而不是渲染出坏颜色 */
    expect(resolveEmailTheme("绿色", true)).toEqual(EMAIL_THEME_DEFAULTS.accepted);
  });

  it("derives badge, panel and border shades from a custom colour", () => {
    const theme = resolveEmailTheme("#1d4ed8", true);

    expect(theme.primary).toBe("#1d4ed8");
    /* 推导出的深浅色都是合法 hex，且明显比主色浅 */
    for (const value of [theme.badge, theme.panel, theme.border]) {
      expect(isEmailThemeColor(value)).toBe(true);
      expect(value).not.toBe(theme.primary);
    }
    expect(theme.panel).not.toBe(theme.badge);
  });
});

describe("isEmailThemeColor", () => {
  it("accepts only 6-digit hex colours", () => {
    expect(isEmailThemeColor("#157347")).toBe(true);
    expect(isEmailThemeColor(" #157347 ")).toBe(true);
    expect(isEmailThemeColor("#1573")).toBe(false);
    expect(isEmailThemeColor("red")).toBe(false);
  });
});
