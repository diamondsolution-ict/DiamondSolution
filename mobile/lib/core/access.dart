import 'package:intl/intl.dart';

// Mirrors src/lib/accessDuration.ts plus the server's has_department_access() rule:
// a grant counts only while expires_at is null (no expiry) or still in the future.
// The grant row itself stays in the table after it expires.
bool isGrantActive(Map<String, dynamic>? grant) {
  if (grant == null) return false;
  final exp = grant['expires_at'] as String?;
  return exp == null || DateTime.parse(exp).isAfter(DateTime.now());
}

/// Before purchase: what the CURRENT price grants.
String describeAccessPolicy(int? accessDurationDays) {
  if (accessDurationDays == null || accessDurationDays == 0) return 'full access';
  if (accessDurationDays == 365) return '1 year of access';
  return '$accessDurationDays days of access';
}

/// After purchase: what THIS student's own grant is. Access is a yearly fee, so nothing is ever
/// called "lifetime": an expiry shows its end date; no expiry (an older purchase) and admins just
/// say "Full access" — never a term, never a date.
String describeAccessStatus(String? expiresAt, {bool isAdmin = false}) =>
    isAdmin || expiresAt == null ? 'Full access' : 'Access until ${DateFormat('MMM d, yyyy').format(DateTime.parse(expiresAt).toLocal())}';

/// Paywall sentence — a yearly fee is never presented as a one-time payment.
String describePaywall(int? days, String departmentName) {
  if (days == null || days == 0) return 'Pay to unlock every course in $departmentName.';
  if (days == 365) return 'Pay yearly for access to every course in $departmentName. Your access lasts 1 year from payment — renew it when it ends.';
  return 'Pay for $days days of access to every course in $departmentName.';
}

/// Suffix for the price button ("₦5,000 / year").
String describePriceTerm(int? days) {
  if (days == null || days == 0) return '';
  return days == 365 ? ' / year' : ' / $days days';
}

/// Footer line on a course page: how this student's own access was bought.
String describePaymentTerm(String? expiresAt, bool isAdmin) {
  if (isAdmin) return 'Staff access';
  return expiresAt != null ? 'Yearly fee' : 'Paid access';
}
