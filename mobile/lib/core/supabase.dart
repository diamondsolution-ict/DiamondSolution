import 'package:android_id/android_id.dart';
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

// Identifies this physical phone for the single-device login limit
// (see supabase/migrations/20261013210000_device_login_limits.sql).
//
// Primary id: Android's ANDROID_ID — tied to the phone (plus this app's signing key and the
// Android user), so it survives uninstall/reinstall and clearing app data, which a stored random
// id does not. It only changes on a factory reset or when the app is signed with a different key
// (e.g. a debug build vs. the Play Store build look like different devices).
// Fallback: a random id saved on first run, used only if Android won't give us an ANDROID_ID.
String? _cachedDeviceId;

Future<String> getDeviceId() async {
  if (_cachedDeviceId != null) return _cachedDeviceId!;
  try {
    final androidId = await const AndroidId().getId();
    if (androidId != null && androidId.isNotEmpty) {
      return _cachedDeviceId = 'android:$androidId';
    }
  } catch (_) {
    // fall through to the stored id
  }
  final prefs = await SharedPreferences.getInstance();
  final existing = prefs.getString('diamond_device_id');
  if (existing != null) return _cachedDeviceId = existing;
  final fresh = const Uuid().v4();
  await prefs.setString('diamond_device_id', fresh);
  return _cachedDeviceId = fresh;
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
