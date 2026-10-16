import 'package:intl/intl.dart';

// Mirrors src/lib/accessDuration.ts plus the server's has_department_access() rule:
// a grant counts only while expires_at is null (lifetime) or still in the future.
// The grant row itself stays in the table after it expires.
bool isGrantActive(Map<String, dynamic>? grant) {
  if (grant == null) return false;
  final exp = grant['expires_at'] as String?;
  return exp == null || DateTime.parse(exp).isAfter(DateTime.now());
}

/// Before purchase: what the CURRENT price grants.
String describeAccessPolicy(int? accessDurationDays) {
  if (accessDurationDays == null || accessDurationDays == 0) return 'lifetime access';
  if (accessDurationDays == 365) return '1 year of access';
  return '$accessDurationDays days of access';
}

/// After purchase: what THIS student's own grant is (an old lifetime grant stays lifetime).
String describeAccessStatus(String? expiresAt) =>
    expiresAt == null ? 'Lifetime access' : 'Access until ${DateFormat('MMM d, yyyy').format(DateTime.parse(expiresAt).toLocal())}';
