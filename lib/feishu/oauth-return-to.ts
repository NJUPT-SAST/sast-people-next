/** Accept local dashboard destinations, checking the normalized path boundary. */
export function isDashboardReturnTo(value: string | undefined): value is string {
  if (!value || !/^\/dashboard(?:[/?#]|$)/.test(value)) return false;

  try {
    const { pathname } = new URL(value, "https://people.invalid");
    return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
  } catch {
    return false;
  }
}
