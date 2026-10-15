import 'dart:async';
import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../main.dart';
import 'auth_screens.dart';
import 'checkout_screen.dart';

const _deviceUnlockFeeNgn = 1000;
const _lockoutHours = 24;

String _countdown(Duration d) {
  final s = d.inSeconds.clamp(0, 1 << 31);
  String two(int n) => n.toString().padLeft(2, '0');
  return '${two(s ~/ 3600)}:${two((s % 3600) ~/ 60)}:${two(s % 60)}';
}

/// Shown for an account locked after signing in from a 3rd device: only a payment made at
/// least 24 hours after the lock started lifts it (the server enforces both rules).
class DeviceLockedScreen extends StatefulWidget {
  const DeviceLockedScreen({super.key});
  @override
  State<DeviceLockedScreen> createState() => _DeviceLockedScreenState();
}

class _DeviceLockedScreenState extends State<DeviceLockedScreen> {
  Timer? ticker;
  bool paying = false;
  String? error;

  @override
  void initState() {
    super.initState();
    ticker = Timer.periodic(const Duration(seconds: 1), (_) => setState(() {}));
  }

  @override
  void dispose() {
    ticker?.cancel();
    super.dispose();
  }

  Future<void> _pay() async {
    setState(() {
      paying = true;
      error = null;
    });
    final auth = AuthScope.of(context);
    final ok = await startCheckout(context, purpose: 'device_unlock');
    if (ok == true) {
      // Profile no longer has device_block_started_at → the app swaps to the home screen.
      await auth.refreshProfile();
    } else if (ok == false && mounted) {
      setState(() => error = 'Payment was not completed.');
    }
    if (mounted) setState(() => paying = false);
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    final since = DateTime.tryParse('${auth.profile?['device_block_started_at']}')?.toLocal();
    final eligibleAt = since?.add(const Duration(hours: _lockoutHours));
    final remaining = eligibleAt == null ? Duration.zero : eligibleAt.difference(DateTime.now());
    final eligible = remaining <= Duration.zero;
    return AuthFrame(children: [
      const Icon(Icons.smartphone, size: 40, color: AppColors.danger),
      const SizedBox(height: 12),
      const Text('Account locked', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
      const SizedBox(height: 8),
      const Text(
        'This account was signed in from a 3rd device. For security, only one device at a '
        'time is allowed — your account has been locked.',
        textAlign: TextAlign.center,
      ),
      const SizedBox(height: 16),
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.canvasSoft, borderRadius: BorderRadius.circular(12)),
        child: Column(children: [
          Text(eligible ? 'Unlock fee' : 'Unlocks for payment in',
              style: const TextStyle(color: AppColors.text3, fontSize: 12)),
          Text(eligible ? '₦$_deviceUnlockFeeNgn' : _countdown(remaining),
              style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: AppColors.royal)),
          if (!eligible)
            const Padding(
              padding: EdgeInsets.only(top: 4),
              child: Text('You can pay ₦$_deviceUnlockFeeNgn to unlock once the 24-hour period has elapsed.',
                  textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: AppColors.text3)),
            ),
        ]),
      ),
      if (error != null) ...[const SizedBox(height: 12), ErrorBox(error!)],
      const SizedBox(height: 16),
      FilledButton.icon(
        onPressed: paying || !eligible ? null : _pay,
        icon: const Icon(Icons.credit_card),
        label: Text(paying
            ? 'Confirming payment…'
            : eligible
                ? 'Pay to unlock'
                : 'Available after the 24-hour lock'),
      ),
      TextButton(onPressed: auth.signOut, child: const Text('Sign out instead')),
    ]);
  }
}

/// Shown for a suspended account; the only way back is the reactivation fee.
class ReactivationScreen extends StatefulWidget {
  const ReactivationScreen({super.key});
  @override
  State<ReactivationScreen> createState() => _ReactivationScreenState();
}

class _ReactivationScreenState extends State<ReactivationScreen> {
  bool paying = false;
  String? error;

  Future<void> _pay() async {
    setState(() {
      paying = true;
      error = null;
    });
    final auth = AuthScope.of(context);
    final ok = await startCheckout(context, purpose: 'suspension_reactivation');
    if (ok == true) {
      await auth.refreshProfile();
    } else if (ok == false && mounted) {
      setState(() => error = 'Payment was not completed.');
    }
    if (mounted) setState(() => paying = false);
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    final reason = auth.profile?['suspension_reason'] as String?;
    final usd = auth.profile?['currency'] == 'USD';
    return AuthFrame(children: [
      const Icon(Icons.shield_outlined, size: 40, color: AppColors.danger),
      const SizedBox(height: 12),
      const Text('Access suspended', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
      const SizedBox(height: 8),
      Text(
        'Institutional access has been revoked due to an inactivity protocol violation.'
        '${reason == null || reason.isEmpty ? '' : ' ($reason)'}',
        textAlign: TextAlign.center,
      ),
      const SizedBox(height: 16),
      Container(
        width: double.infinity,
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.canvasSoft, borderRadius: BorderRadius.circular(12)),
        child: Column(children: [
          const Text('Reactivation fee', style: TextStyle(color: AppColors.text3, fontSize: 12)),
          Text(usd ? '\$2' : '₦1000',
              style: const TextStyle(fontSize: 26, fontWeight: FontWeight.bold, color: AppColors.royal)),
        ]),
      ),
      if (error != null) ...[const SizedBox(height: 12), ErrorBox(error!)],
      const SizedBox(height: 16),
      FilledButton.icon(
        onPressed: paying ? null : _pay,
        icon: const Icon(Icons.credit_card),
        label: Text(paying ? 'Confirming payment…' : 'Authorize reactivation'),
      ),
      TextButton(onPressed: auth.signOut, child: const Text('Sign out instead')),
    ]);
  }
}
