import "server-only";

const DEFAULT_PUBLIC_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://localhost:3000"
    : "https://nextpeople.sast.fun";

export function getPublicBaseUrl() {
  return (
    process.env.PEOPLE_PUBLIC_BASE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    DEFAULT_PUBLIC_BASE_URL
  ).replace(/\/$/, "");
}

export function getPeopleUrl(path: string) {
  return new URL(path, getPublicBaseUrl()).toString();
}
