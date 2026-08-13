export const COMMENT_SUMMARY_MAX_LENGTH = 300;

const ELLIPSIS = "...";

export function commentSummary(body) {
  if (typeof body !== "string") {
    return null;
  }

  const normalized = body
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[已隐藏 GitHub 凭据]")
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[已隐藏]")
    .replace(
      /(^|[^A-Za-z0-9_])((?:"?(?:(?:[A-Za-z][A-Za-z0-9]*[_-])?(?:api[_-]?key|private[_-]?key|secret|token|password))"?)\s*[:=]\s*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/gi,
      "$1$2[已隐藏]",
    );

  if (!normalized) {
    return null;
  }

  const characters = Array.from(normalized);
  return characters.length > COMMENT_SUMMARY_MAX_LENGTH
    ? `${characters.slice(0, COMMENT_SUMMARY_MAX_LENGTH - ELLIPSIS.length).join("")}${ELLIPSIS}`
    : normalized;
}
