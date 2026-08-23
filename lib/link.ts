export const externalHref = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const href = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(href);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    return "";
  }

  return "";
};

export const isValidExternalUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return true;

  const href = externalHref(trimmed);
  if (!href) return false;

  try {
    const url = new URL(href);
    return Boolean(url.hostname);
  } catch {
    return false;
  }
};
