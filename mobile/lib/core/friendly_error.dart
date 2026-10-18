import 'package:supabase_flutter/supabase_flutter.dart';

/// Turns raw Supabase/Postgres/network errors into messages a person can act on.
/// Mirrors src/lib/friendlyError.ts on the website.
final _rules = <RegExp, String>{
  RegExp(r'invalid login credentials|invalid credentials', caseSensitive: false): 'Incorrect email or password. Please check your details and try again.',
  RegExp(r'email not confirmed', caseSensitive: false): 'Please confirm your email first. Check your inbox (and spam folder) for the confirmation link.',
  RegExp(r'user already registered|already been registered|already exists', caseSensitive: false): 'An account with this email already exists. Try signing in instead.',
  RegExp(r'password should be at least|password is too short|weak password', caseSensitive: false): 'That password is too weak. Use at least 8 characters with letters and numbers.',
  RegExp(r'same password|different from the old password', caseSensitive: false): 'Your new password must be different from your current one.',
  RegExp(r'rate limit|too many requests|security purposes', caseSensitive: false): 'Too many attempts. Please wait a minute and try again.',
  RegExp(r'unable to validate email|invalid email|valid email', caseSensitive: false): 'Please enter a valid email address.',
  RegExp(r'signups? not allowed|signup is disabled', caseSensitive: false): 'Sign-ups are currently closed. Please try again later.',
  RegExp(r'user not found', caseSensitive: false): "We couldn't find an account with those details.",
  RegExp(r'jwt expired|session.*(expired|missing)|not authenticated', caseSensitive: false): 'Your session has expired. Please sign in again.',
  RegExp(r'socketexception|failed host lookup|clientexception|network|timeout|timed out|connection (closed|refused|reset)', caseSensitive: false): 'Network problem. Check your internet connection and try again.',
  RegExp(r'row-level security|permission denied|not allowed|access required', caseSensitive: false): "You don't have permission to do that.",
  RegExp(r'duplicate key|unique constraint', caseSensitive: false): 'That already exists.',
  RegExp(r'violates foreign key', caseSensitive: false): "This is still linked to other records, so it can't be changed or removed yet.",
  RegExp(r'violates (check|not-null)|null value in column', caseSensitive: false): 'Some required information is missing or invalid. Please check and try again.',
};

String friendlyError(Object? error, [String fallback = 'Something went wrong. Please try again.']) {
  var raw = '';
  if (error is AuthException) {
    raw = error.message;
  } else if (error is PostgrestException) {
    raw = error.message;
  } else if (error is FunctionException) {
    final d = error.details;
    raw = d is Map && d['error'] is String ? d['error'] as String : (error.reasonPhrase ?? '');
  } else if (error != null) {
    raw = error.toString().replaceFirst(RegExp(r'^\w*Exception:?\s*'), '');
  }
  raw = raw.trim();
  if (raw.isEmpty) return fallback;
  for (final e in _rules.entries) {
    if (e.key.hasMatch(raw)) return e.value;
  }
  // Short plain-English messages raised by our own functions/triggers are fine to show as-is.
  final plain = RegExp(r'^[A-Z][^{}<>]{3,160}$').hasMatch(raw) && !RegExp(r'\b(pg|sql|relation|column|function|constraint)\b', caseSensitive: false).hasMatch(raw);
  return plain ? raw : fallback;
}
