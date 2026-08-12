function readInteger(
  value: string | undefined,
  fallback: number,
  pattern: RegExp,
) {
  if (!value || !pattern.test(value)) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

export function readPositiveIntegerEnv(name: string, fallback: number) {
  return readInteger(process.env[name], fallback, /^[1-9]\d*$/);
}

export function readNonNegativeIntegerEnv(name: string, fallback: number) {
  return readInteger(process.env[name], fallback, /^(?:0|[1-9]\d*)$/);
}
