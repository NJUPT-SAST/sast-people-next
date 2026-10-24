/**
 * 登录后回跳地址：只接受站内绝对路径，挡住 `//evil.example`、`https://…`
 * 之类的开放重定向，同时保留 query 与 hash。
 */
export const normalizeLoginNext = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const next = value.trim();
  if (!next.startsWith("/") || next.startsWith("//")) return null;

  try {
    const base = new URL("https://people.local");
    const url = new URL(next, base);
    if (url.origin !== base.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
};
