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

function shortCommitSha(sha) {
  return typeof sha === "string" && sha.length > 0 ? sha.slice(0, 7) : null;
}

export function pullRequestUpdateDetails({ before, after, headSha, senderLogin }) {
  const previousCommit = shortCommitSha(before);
  const latestCommit = shortCommitSha(after) ?? shortCommitSha(headSha);

  return [
    ["推送者", typeof senderLogin === "string" && senderLogin ? senderLogin : "未知"],
    ...(previousCommit && latestCommit && previousCommit !== latestCommit
      ? [["提交范围", `${previousCommit} -> ${latestCommit}`]]
      : latestCommit
        ? [["最新提交", latestCommit]]
        : []),
  ];
}

export function pullRequestCompareUrl({ serverUrl, repository, before, after }) {
  if (
    typeof serverUrl !== "string" ||
    typeof repository !== "string" ||
    typeof before !== "string" ||
    typeof after !== "string" ||
    !before ||
    !after ||
    before === after
  ) {
    return null;
  }

  return `${serverUrl}/${repository}/compare/${encodeURIComponent(before)}...${encodeURIComponent(after)}`;
}
