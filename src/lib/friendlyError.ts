// Turns raw Supabase/Postgres/network error text into something a student can act on.
// Supabase's own wording ("Invalid login credentials", "duplicate key value violates ...") is
// written for developers, so every place that shows an error to a person goes through here.
const RULES: Array<[RegExp, string]> = [
  [/invalid login credentials|invalid credentials/i, "Incorrect email or password. Please check your details and try again."],
  [/email not confirmed/i, "Please confirm your email first. Check your inbox (and spam folder) for the confirmation link."],
  [/user already registered|already been registered|already exists/i, "An account with this email already exists. Try signing in instead."],
  [/password should be at least|password is too short|weak password/i, "That password is too weak. Use at least 8 characters with letters and numbers."],
  [/same password|different from the old password/i, "Your new password must be different from your current one."],
  [/rate limit|too many requests|over_email_send_rate_limit|security purposes/i, "Too many attempts. Please wait a minute and try again."],
  [/unable to validate email|invalid email|valid email/i, "Please enter a valid email address."],
  [/signups? not allowed|signup is disabled/i, "Sign-ups are currently closed. Please try again later."],
  [/user not found/i, "We couldn't find an account with those details."],
  [/jwt expired|session.*(expired|missing)|not authenticated|auth session missing/i, "Your session has expired. Please sign in again."],
  [/failed to fetch|networkerror|network request failed|load failed|timeout|timed out/i, "Network problem. Check your internet connection and try again."],
  [/row-level security|permission denied|not allowed|access required/i, "You don't have permission to do that."],
  [/duplicate key|unique constraint/i, "That already exists."],
  [/violates foreign key/i, "This is still linked to other records, so it can't be changed or removed yet."],
  [/violates (check|not-null)|null value in column/i, "Some required information is missing or invalid. Please check and try again."],
];

export function friendlyError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  const raw =
    typeof error === "string"
      ? error
      : error && typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : "";
  if (!raw) return fallback;
  for (const [pattern, message] of RULES) if (pattern.test(raw)) return message;
  // Short plain-English messages that our own functions/triggers raise are already fine to show.
  return /^[A-Z][^{}<>]{3,160}$/.test(raw) && !/\b(pg|sql|relation|column|function|constraint)\b/i.test(raw) ? raw : fallback;
}
