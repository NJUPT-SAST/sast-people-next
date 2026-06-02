export function createCopiedFlowTitle(title: string) {
  const suffix = " 副本";
  const maxLength = 100;
  const trimmedTitle = title.trim() || "未命名流程";

  if (trimmedTitle.endsWith(suffix)) {
    return trimmedTitle.slice(0, maxLength);
  }

  return `${trimmedTitle.slice(0, maxLength - suffix.length)}${suffix}`;
}
