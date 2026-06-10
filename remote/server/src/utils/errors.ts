export function unauthorizedError() {
  return {
    ok: false as const,
    code: "UNAUTHORIZED",
    message: "Missing or invalid bearer token",
  };
}
