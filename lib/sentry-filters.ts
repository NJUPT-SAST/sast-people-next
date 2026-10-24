/**
 * Sentry 已知噪声：这些事件来自客户端主动断开 / 发版后的旧 Server Action /
 * QQ 浏览器内核桥，重试也不会变成可修复的问题，保留只会淹没真正的异常。
 */
export const sentryIgnoreErrors: (string | RegExp)[] = [
  /UnrecognizedActionError/,
  /Java bridge method invocation error/,
  /The destination stream closed early/,
  /^\s*Error: aborted\s*$/,
  /^\s*aborted\s*$/,
];
