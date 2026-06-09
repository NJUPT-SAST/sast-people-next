export function requirePositiveIntegerInput(value: unknown, label: string) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`${label}不正确。`);
  }

  return value;
}

export function requireBooleanInput(value: unknown, label: string) {
  if (typeof value !== "boolean") {
    throw new Error(`${label}不正确。`);
  }

  return value;
}

export function requirePositiveIntegerArrayInput(
  value: unknown,
  label: string,
) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label}不能为空。`);
  }

  const ids = value.map((item) => requirePositiveIntegerInput(item, label));
  return Array.from(new Set(ids));
}
