export function publicApiError(error: unknown, fallback: string): string {
  if (process.env.NODE_ENV !== 'production' && error instanceof Error) {
    return error.message;
  }
  return fallback;
}
