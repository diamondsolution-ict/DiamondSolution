import 'package:shared_preferences/shared_preferences.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

// Supplied at build time: flutter run --dart-define-from-file=env.json
const supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');

SupabaseClient get db => Supabase.instance.client;

Future<void> initSupabase() async {
  if (supabaseUrl.isEmpty || supabaseAnonKey.isEmpty) {
    throw StateError(
      'Missing SUPABASE_URL / SUPABASE_ANON_KEY. Copy env.example.json to '
      'env.json and run with --dart-define-from-file=env.json',
    );
  }
  await Supabase.initialize(url: supabaseUrl, publishableKey: supabaseAnonKey);
}

// Per-install device id for the single-device login limit
// (see supabase/migrations/20261013210000_device_login_limits.sql).
Future<String> getDeviceId() async {
  final prefs = await SharedPreferences.getInstance();
  final existing = prefs.getString('diamond_device_id');
  if (existing != null) return existing;
  final fresh = const Uuid().v4();
  await prefs.setString('diamond_device_id', fresh);
  return fresh;
}

// Used only to build the shareable referral link; optional.
const webBaseUrl = String.fromEnvironment('WEB_BASE_URL');

// Edge Functions answer errors as {success:false, error:"..."} with a non-2xx status, which
// supabase_flutter surfaces as a FunctionException whose details hold that body.
String functionErrorMessage(Object e, [String fallback = 'Something went wrong.']) {
  if (e is FunctionException) {
    final d = e.details;
    if (d is Map && d['error'] is String) return d['error'] as String;
    if (d is String && d.isNotEmpty) return d;
  }
  return fallback;
}
