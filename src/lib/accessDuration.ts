// Shared phrasing for department-access duration, used anywhere a student sees what they're
// buying (CourseList's paywall) or what they already have (CourseList/CourseDetail's "access
// active" badge, PaymentHistory's per-payment summary). Keeping this in one place matters now
// that access is a yearly fee, never "lifetime" (see 20261016000000_department_access_now_yearly.sql) — a
// stale hardcoded "Lifetime" string anywhere a real expiry exists would be a false claim
// on the actual payment/study screens, not just a cosmetic slip.
import { format } from "date-fns";

// For the paywall, before purchase — describes what the CURRENT price policy grants.
export function describeAccessPolicy(accessDurationDays: number | null): string {
  if (!accessDurationDays) return "full access";
  if (accessDurationDays === 365) return "1 year of access";
  return `${accessDurationDays} days of access`;
}

// For an "access active" badge, after purchase — describes what THIS student's own grant is.
// Access is a yearly fee, so nothing in the app is ever called "lifetime": a grant with an
// expiry shows its end date; a grant without one (an older purchase) and every admin just say
// "Full access" — never a term, never a date.
export function describeAccessStatus(expiresAt: string | null, isAdmin = false): string {
  if (isAdmin || !expiresAt) return "Full access";
  return `Access until ${format(new Date(expiresAt), "MMM d, yyyy")}`;
}

// Wording for the paywall — what paying actually buys, so a yearly fee is never presented as a
// one-time payment.
export function describePaywall(
  accessDurationDays: number | null,
  departmentName: string,
): string {
  if (!accessDurationDays) {
    return `Pay to unlock every course in ${departmentName}.`;
  }
  if (accessDurationDays === 365) {
    return `Pay yearly for access to every course in ${departmentName}. Your access lasts 1 year from payment — renew it when it ends.`;
  }
  return `Pay for ${accessDurationDays} days of access to every course in ${departmentName}.`;
}

// Suffix for the price button ("₦5,000 / year").
export function describePriceTerm(accessDurationDays: number | null): string {
  if (!accessDurationDays) return "";
  if (accessDurationDays === 365) return " / year";
  return ` / ${accessDurationDays} days`;
}

// Footer line on a course page: how this student's own access was bought.
export function describePaymentTerm(expiresAt: string | null, isAdmin: boolean): string {
  if (isAdmin) return "Admin access";
  return expiresAt ? "Yearly fee" : "Paid access";
}
