// Shared phrasing for department-access duration, used anywhere a student sees what they're
// buying (CourseList's paywall) or what they already have (CourseList/CourseDetail's "access
// active" badge, PaymentHistory's per-payment summary). Keeping this in one place matters now
// that access isn't always lifetime (see 20261016000000_department_access_now_yearly.sql) — a
// stale hardcoded "Lifetime access" string anywhere a real expiry exists would be a false claim
// on the actual payment/study screens, not just a cosmetic slip.
import { format } from "date-fns";

// For the paywall, before purchase — describes what the CURRENT price policy grants.
export function describeAccessPolicy(accessDurationDays: number | null): string {
  if (!accessDurationDays) return "lifetime access";
  if (accessDurationDays === 365) return "1 year of access";
  return `${accessDurationDays} days of access`;
}

// For an "access active" badge, after purchase — describes what THIS student's own grant
// actually is, which may differ from today's policy (an old lifetime grant stays lifetime even
// after the policy for new purchases changes to yearly).
export function describeAccessStatus(expiresAt: string | null): string {
  return expiresAt
    ? `Access until ${format(new Date(expiresAt), "MMM d, yyyy")}`
    : "Lifetime access";
}
