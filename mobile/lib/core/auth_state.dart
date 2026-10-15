import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'supabase.dart';

class AppAuth extends ChangeNotifier {
  Session? session;
  Map<String, dynamic>? profile;
  List<String> roles = [];
  bool loading = true;
  bool deviceKickedNotice = false;
  String? _registeredFor;
  StreamSubscription<AuthState>? _sub;

  User? get user => session?.user;
  bool get isAdmin => roles.contains('admin');
  bool get isSuspended => profile?['status'] == 'suspended';
  bool get isDeviceBlocked => profile?['device_block_started_at'] != null;
  String get displayName => (profile?['display_name'] as String?) ?? 'Scholar';

  AppAuth() {
    _init();
  }

  Future<void> _init() async {
    session = db.auth.currentSession;
    if (session != null) {
      await _loadProfile(session!.user.id);
      await _registerDevice(session!.user.id);
    }
    loading = false;
    notifyListeners();

    _sub = db.auth.onAuthStateChange.listen((data) async {
      session = data.session;
      if (session != null) {
        await _loadProfile(session!.user.id);
        if (data.event == AuthChangeEvent.signedIn) {
          await _registerDevice(session!.user.id);
        }
      } else {
        profile = null;
        roles = [];
        _registeredFor = null;
      }
      notifyListeners();
    });
  }

  Future<void> _loadProfile(String userId) async {
    final results = await Future.wait<dynamic>([
      db.from('profiles').select().eq('user_id', userId).maybeSingle(),
      db.from('user_roles').select('role').eq('user_id', userId),
    ]);
    profile = results[0] as Map<String, dynamic>?;
    roles = (results[1] as List).map((r) => r['role'] as String).toList();
  }

  // Admins/moderators always get {status: 'ok'} back — a no-op for staff.
  Future<void> _registerDevice(String userId) async {
    if (_registeredFor == userId) return;
    _registeredFor = userId;
    try {
      final data = await db.rpc('register_device_login',
          params: {'p_device_id': await getDeviceId()});
      final map = data as Map?;
      final status = map?['status'];
      if (status == 'blocked') {
        profile = {
          ...?profile,
          'device_block_started_at':
              map?['blocked_since'] ?? DateTime.now().toIso8601String(),
        };
      } else if (status == 'ok_kicked_other') {
        deviceKickedNotice = true;
        await db.auth.signOut(scope: SignOutScope.others);
      }
    } catch (e) {
      debugPrint('register_device_login failed: $e');
    }
  }

  Future<void> refreshProfile() async {
    if (user == null) return;
    await _loadProfile(user!.id);
    notifyListeners();
  }

  void dismissDeviceKickedNotice() {
    deviceKickedNotice = false;
    notifyListeners();
  }

  Future<void> signOut() => db.auth.signOut();

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }
}
