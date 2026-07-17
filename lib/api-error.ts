/** Parse JSON error body from a failed fetch Response. */
export async function readApiError(
  res: Response,
  fallback = "Action failed — try again",
): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data?.error && typeof data.error === "string") return data.error;
  } catch {
    /* ignore */
  }
  if (res.status === 401) return "Session expired — sign in again";
  if (res.status === 403) return "You don’t have permission for that";
  if (res.status >= 500) return "Server error — try again";
  return fallback;
}
