import 'package:flutter/material.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../main.dart';

// Mirrors AdminKeyGate.tsx and StepUpModal.tsx. The code is the admin's OWN personal security
// code (4–10 digits, set on first use); verification and storage happen in the
// admin-verify-stepup-code / admin-set-stepup-code Edge Functions. Moderators never see the gate.

final Set<String> _verifiedAdmins = {};

class AdminKeyGate extends StatefulWidget {
  const AdminKeyGate({super.key, required this.child});
  final Widget child;
  @override
  State<AdminKeyGate> createState() => _AdminKeyGateState();
}

class _AdminKeyGateState extends State<AdminKeyGate> {
  bool setup = false;
  bool busy = false;
  String? error;
  final code = TextEditingController();
  final confirm = TextEditingController();

  Future<void> _verify(String uid) async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final r = await db.functions.invoke('admin-verify-stepup-code', body: {'code': code.text});
      final d = r.data as Map?;
      if (d?['success'] == true) {
        _verifiedAdmins.add(uid);
        if (mounted) setState(() => busy = false);
        return;
      }
      if (d?['not_configured'] == true) {
        setState(() {
          setup = true;
          code.clear();
          busy = false;
        });
        return;
      }
      setState(() {
        error = (d?['error'] as String?) ?? 'Incorrect security code.';
        busy = false;
      });
    } catch (e) {
      final msg = functionErrorMessage(e, 'Incorrect security code.');
      setState(() {
        error = msg;
        busy = false;
      });
    }
  }

  Future<void> _setup(String uid) async {
    if (!RegExp(r'^\d{4,10}$').hasMatch(code.text)) {
      setState(() => error = 'Your code must be 4–10 digits.');
      return;
    }
    if (code.text != confirm.text) {
      setState(() => error = "Codes don't match.");
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final r = await db.functions.invoke('admin-set-stepup-code', body: {'new_code': code.text});
      if ((r.data as Map?)?['success'] != true) throw Exception('failed');
      _verifiedAdmins.add(uid);
      if (mounted) setState(() => busy = false);
    } catch (e) {
      setState(() {
        error = functionErrorMessage(e, "Couldn't set your code.");
        busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    final uid = auth.user?.id ?? '';
    if (!auth.isAdmin || _verifiedAdmins.contains(uid)) return widget.child;
    return Scaffold(
      body: DiamondMesh(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 384),
                child: CardLuxury(
                  padding: const EdgeInsets.all(32),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    Center(child: Container(width: 48, height: 48, decoration: const BoxDecoration(gradient: diamondGradient, shape: BoxShape.circle), child: const Icon(Icons.verified_user_outlined, size: 22, color: Colors.white))),
                    const SizedBox(height: 16),
                    Text(setup ? 'Set up your admin key' : 'Admin access', textAlign: TextAlign.center, style: heading(18)),
                    const SizedBox(height: 6),
                    Text(setup ? "Choose a personal security code — you'll enter it each time you open the admin area, and before sensitive actions." : 'Enter your personal security code to continue.', textAlign: TextAlign.center, style: body(14, color: AppColors.text3)),
                    const SizedBox(height: 20),
                    _codeField(setup ? 'New code' : 'Your code', code, hint: setup ? '4–10 digits' : null),
                    if (setup) ...[const SizedBox(height: 12), _codeField('Confirm code', confirm)],
                    if (error != null) ...[const SizedBox(height: 12), Banner2(error!)],
                    const SizedBox(height: 12),
                    BtnPrimary(label: busy ? 'Checking…' : (setup ? 'Save and continue' : 'Continue'), onPressed: busy || code.text.isEmpty ? null : () => setup ? _setup(uid) : _verify(uid)),
                    const SizedBox(height: 16),
                    Center(child: GestureDetector(onTap: () => Navigator.of(context).pop(), child: Text('Back to app', style: body(12, weight: FontWeight.w600, color: AppColors.text3)))),
                    const SizedBox(height: 8),
                    Center(child: GestureDetector(onTap: () { Navigator.of(context).pop(); auth.signOut(); }, child: Row(mainAxisSize: MainAxisSize.min, children: [const Icon(Icons.logout, size: 13, color: AppColors.text3), const SizedBox(width: 6), Text('Not you? Sign out', style: body(12, weight: FontWeight.w600, color: AppColors.text3))]))),
                  ]),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _codeField(String label, TextEditingController c, {String? hint}) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [const Icon(Icons.key, size: 13, color: AppColors.text3), const SizedBox(width: 6), Text(label, style: body(14, weight: FontWeight.w500, color: AppColors.text2))]),
        const SizedBox(height: 4),
        TextField(controller: c, onChanged: (_) => setState(() {}), keyboardType: TextInputType.number, textAlign: TextAlign.center, maxLength: 10, style: body(18).copyWith(letterSpacing: 4), decoration: InputDecoration(counterText: '', hintText: hint)),
      ]);
}

/// Step-up challenge before a destructive action. Returns the verification token, or null if aborted.
Future<String?> askStepUp(BuildContext context, {required String title, String description = 'This action requires security clearance — enter the admin security code.'}) {
  final ctl = TextEditingController();
  return showDialog<String>(
    context: context,
    barrierColor: AppColors.navy.withValues(alpha: 0.5),
    builder: (ctx) {
      bool verifying = false;
      String? error;
      return StatefulBuilder(builder: (ctx, setS) {
        Future<void> go() async {
          setS(() {
            verifying = true;
            error = null;
          });
          try {
            final r = await db.functions.invoke('admin-verify-stepup-code', body: {'code': ctl.text});
            final d = r.data as Map?;
            if (d?['success'] == true) {
              if (ctx.mounted) Navigator.pop(ctx, d!['token'] as String);
              return;
            }
            setS(() => error = (d?['error'] as String?) ?? 'Incorrect security code.');
          } catch (e) {
            setS(() => error = functionErrorMessage(e, 'Incorrect security code.'));
          }
          setS(() => verifying = false);
        }

        return Dialog(
          backgroundColor: Colors.transparent,
          insetPadding: const EdgeInsets.all(16),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 384),
            child: CardLuxury(
              padding: const EdgeInsets.all(24),
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                Text('Security Clearance Required', style: heading(18)),
                const SizedBox(height: 4),
                Text(title, style: body(14, color: AppColors.text3)),
                const SizedBox(height: 8),
                Text(description, style: body(14, color: AppColors.text2)),
                const SizedBox(height: 16),
                Text('Enter the admin security code.', style: body(12, color: AppColors.text3)),
                const SizedBox(height: 8),
                TextField(controller: ctl, autofocus: true, onChanged: (_) => setS(() {}), keyboardType: TextInputType.number, maxLength: 10, textAlign: TextAlign.center, style: body(18).copyWith(letterSpacing: 8, fontFamily: 'monospace'), decoration: InputDecoration(counterText: '', hintText: 'Security code', hintStyle: body(14, color: AppColors.text3))),
                if (error != null) ...[const SizedBox(height: 12), Banner2(error!)],
                const SizedBox(height: 16),
                Row(children: [
                  Expanded(child: BtnOutline(label: 'Abort', onPressed: () => Navigator.pop(ctx))),
                  const SizedBox(width: 8),
                  Expanded(child: BtnPrimary(label: verifying ? 'Verifying…' : 'Authorize', onPressed: verifying || ctl.text.length < 4 ? null : go)),
                ]),
              ]),
            ),
          ),
        );
      });
    },
  );
}
