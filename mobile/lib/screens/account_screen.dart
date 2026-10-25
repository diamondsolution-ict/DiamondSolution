import 'package:flutter/material.dart';
import '../core/friendly_error.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/ui.dart';
import '../main.dart';
import 'affiliate_screen.dart';
import 'auth_screens.dart' show validatePassword;

// Mirrors src/pages/AccountSettings.tsx: identity, language, payout credentials, password change
// (re-authenticate → emailed 6-digit code → change-password).
class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key});
  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  late final name = TextEditingController();
  late final username = TextEditingController();
  late final university = TextEditingController();
  late final whatsapp = TextEditingController();
  final current = TextEditingController();
  final newPw = TextEditingController();
  final confirmPw = TextEditingController();
  final otp = TextEditingController();

  bool seeded = false;
  bool identitySaving = false;
  String? identityError, identityInfo;

  bool otpStep = false;
  bool pwBusy = false;
  bool pwDone = false;
  String? pwError, pwInfo;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (seeded) return;
    seeded = true;
    final p = AuthScope.of(context).profile;
    name.text = (p?['display_name'] as String?) ?? '';
    username.text = (p?['username'] as String?) ?? '';
    university.text = (p?['university'] as String?) ?? '';
    whatsapp.text = (p?['whatsapp'] as String?) ?? '';
  }

  Future<void> _saveIdentity() async {
    setState(() {
      identityError = null;
      identityInfo = null;
    });
    if (username.text.trim().isEmpty) {
      setState(() => identityError = 'Username is required.');
      return;
    }
    setState(() => identitySaving = true);
    final auth = AuthScope.of(context);
    try {
      final wa = whatsapp.text.trim();
      await db.from('profiles').update({
        'display_name': name.text.trim().isEmpty ? null : name.text.trim(),
        'username': username.text.trim().toLowerCase(),
        'university': university.text.trim().isEmpty ? null : university.text.trim(),
        'whatsapp': wa.isEmpty ? null : wa,
        'phone': wa.isEmpty ? null : wa,
      }).eq('user_id', auth.user!.id);
      if (mounted) setState(() => identityInfo = 'Identity updated.');
      auth.refreshProfile();
    } catch (e) {
      if (mounted) setState(() => identityError = e is Exception ? e.toString().replaceFirst('PostgrestException(message: ', '').split(', code').first : '$e');
    }
    if (mounted) setState(() => identitySaving = false);
  }

  Future<void> _setLanguage(String code) async {
    final lang = LangScope.of(context);
    await lang.set(code);
    final uid = db.auth.currentUser?.id;
    if (uid != null) await db.from('profiles').update({'language': code}).eq('user_id', uid);
  }

  Future<void> _submitPasswordForm() async {
    final email = db.auth.currentUser?.email;
    if (email == null) return;
    setState(() {
      pwError = null;
      pwInfo = null;
    });
    if (newPw.text != confirmPw.text) {
      setState(() => pwError = "New password and confirmation don't match.");
      return;
    }
    final policy = validatePassword(newPw.text);
    if (policy != null) {
      setState(() => pwError = policy);
      return;
    }
    setState(() => pwBusy = true);
    // Re-authenticate with the current password first, as the website does.
    try {
      await db.auth.signInWithPassword(email: email, password: current.text);
    } catch (_) {
      if (mounted) {
        setState(() {
          pwBusy = false;
          pwError = 'Current password is incorrect.';
        });
      }
      return;
    }
    try {
      final res = await db.functions.invoke('request-otp', body: {'purpose': 'password_change'});
      final d = res.data as Map;
      if (d['success'] != true) throw d['error'] ?? 'unknown error';
      if (mounted) {
        setState(() {
          pwInfo = 'A 6-digit code was sent to $email.';
          otpStep = true;
        });
      }
    } catch (e) {
      if (mounted) setState(() => pwError = "Couldn't send a security code: ${functionErrorMessage(e, friendlyError(e))}");
    }
    if (mounted) setState(() => pwBusy = false);
  }

  Future<void> _submitOtp() async {
    setState(() {
      pwError = null;
      pwBusy = true;
    });
    try {
      final v = await db.functions.invoke('verify-otp', body: {'purpose': 'password_change', 'code': otp.text});
      final vd = v.data as Map;
      if (vd['success'] != true) throw vd['error'] ?? 'Invalid security code.';
      try {
        final c = await db.functions.invoke('change-password', body: {'new_password': newPw.text, 'otp_token': vd['token']});
        final cd = c.data as Map;
        if (cd['success'] != true) throw cd['error'] ?? 'unknown error';
      } catch (e) {
        if (mounted) setState(() => pwError = "Couldn't change password: ${functionErrorMessage(e, friendlyError(e))}");
        if (mounted) setState(() => pwBusy = false);
        return;
      }
      if (!mounted) return;
      setState(() {
        pwDone = true;
        pwInfo = 'Password changed.';
      });
      Future.delayed(const Duration(milliseconds: 1200), () {
        if (mounted) Navigator.of(context).maybePop();
      });
    } catch (e) {
      if (mounted) setState(() => pwError = functionErrorMessage(e, friendlyError(e)));
    }
    if (mounted) setState(() => pwBusy = false);
  }

  Future<void> _resend() async {
    setState(() {
      pwError = null;
      pwBusy = true;
    });
    try {
      await db.functions.invoke('request-otp', body: {'purpose': 'password_change'});
      if (mounted) setState(() => pwInfo = 'A new code was sent to ${db.auth.currentUser?.email}.');
    } catch (e) {
      if (mounted) setState(() => pwError = functionErrorMessage(e, "Couldn't resend the code — try again shortly."));
    }
    if (mounted) setState(() => pwBusy = false);
  }

  Widget _field(TextEditingController c, String hint, {bool obscure = false, TextInputType? type, void Function(String)? onChanged}) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextField(controller: c, obscureText: obscure, keyboardType: type, onChanged: onChanged, style: body(14), decoration: InputDecoration(hintText: hint)),
      );

  @override
  Widget build(BuildContext context) {
    final lang = LangScope.of(context);
    final email = db.auth.currentUser?.email ?? '';
    return PageShell(
      title: 'Account',
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 40), children: [
        CardLuxury(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('User Identity', style: heading(14)),
            const SizedBox(height: 12),
            _field(name, 'Display name'),
            _field(username, 'Username', onChanged: (v) {
              final clean = v.toLowerCase().replaceAll(RegExp(r'\s'), '');
              if (clean != v) username.value = TextEditingValue(text: clean, selection: TextSelection.collapsed(offset: clean.length));
            }),
            _field(university, 'University / Institution'),
            _field(whatsapp, '+2348012345678', type: TextInputType.phone),
            if (identityError != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Banner2(identityError!)),
            if (identityInfo != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Banner2(identityInfo!, success: true)),
            BtnPrimary(label: identitySaving ? 'Saving…' : 'Save identity', onPressed: identitySaving ? null : _saveIdentity),
          ]),
        ),
        const SizedBox(height: 16),
        CardLuxury(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Language', style: heading(14)),
            const SizedBox(height: 8),
            Text('Applies to the sign-in/registration pages and the main navigation.', style: body(14, color: AppColors.text3)),
            const SizedBox(height: 12),
            Row(children: [
              const Icon(Icons.language, size: 16, color: AppColors.text3),
              const SizedBox(width: 8),
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Container(
                  decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    for (final (code, label) in [('en', 'English'), ('fr', 'Français')])
                      GestureDetector(
                        onTap: () => _setLanguage(code),
                        child: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                          color: lang.language == code ? AppColors.royal : Colors.white,
                          child: Text(label, style: body(12, weight: FontWeight.w600, color: lang.language == code ? Colors.white : AppColors.text2)),
                        ),
                      ),
                  ]),
                ),
              ),
            ]),
          ]),
        ),
        const SizedBox(height: 16),
        CardLuxury(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Payout Credentials', style: heading(14)),
            const SizedBox(height: 8),
            Text('Bank details and other payout methods for affiliate withdrawals are managed from the Affiliate page.', style: body(14, color: AppColors.text3)),
            const SizedBox(height: 12),
            InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const AffiliateScreen())),
              child: Container(
                height: 46,
                alignment: Alignment.center,
                decoration: BoxDecoration(color: AppColors.royalSoft, border: Border.all(color: AppColors.royalBorder), borderRadius: BorderRadius.circular(12)),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.card_giftcard, size: 16, color: AppColors.royal),
                  const SizedBox(width: 8),
                  Text('Manage payout methods', style: body(14, weight: FontWeight.w600, color: AppColors.royal)),
                ]),
              ),
            ),
          ]),
        ),
        const SizedBox(height: 16),
        CardLuxury(
          padding: const EdgeInsets.all(20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Security Override', style: heading(14)),
            const SizedBox(height: 12),
            if (!otpStep) ...[
              _field(current, 'Current password', obscure: true),
              _field(newPw, 'New password', obscure: true),
              _field(confirmPw, 'Confirm new password', obscure: true),
              if (pwError != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Banner2(pwError!)),
              if (pwInfo != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Banner2(pwInfo!, success: true)),
              BtnPrimary(label: pwBusy ? 'Verifying…' : 'Change password', onPressed: pwBusy ? null : _submitPasswordForm),
              const SizedBox(height: 12),
              Text('Losing access to $email blocks password changes entirely — email is the only verification path.', style: body(12, color: AppColors.text3)),
            ] else ...[
              Text('Security Token Required — enter the 6-digit code sent to $email.', style: body(14, color: AppColors.text3)),
              const SizedBox(height: 12),
              TextField(
                controller: otp,
                keyboardType: TextInputType.number,
                maxLength: 6,
                textAlign: TextAlign.center,
                onChanged: (v) {
                  final digits = v.replaceAll(RegExp(r'\D'), '');
                  if (digits != v) otp.value = TextEditingValue(text: digits, selection: TextSelection.collapsed(offset: digits.length));
                  setState(() {});
                },
                style: const TextStyle(fontFamily: 'monospace', fontSize: 18, letterSpacing: 8),
                decoration: const InputDecoration(hintText: '000000', counterText: ''),
              ),
              const SizedBox(height: 12),
              if (pwError != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Banner2(pwError!)),
              if (pwInfo != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Banner2(pwInfo!, success: true)),
              BtnPrimary(label: pwBusy ? 'Confirming…' : 'Confirm code', onPressed: pwBusy || otp.text.length != 6 || pwDone ? null : _submitOtp),
              const SizedBox(height: 8),
              Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                GestureDetector(
                  onTap: () => setState(() {
                    otpStep = false;
                    otp.clear();
                    pwError = null;
                  }),
                  child: Text('Wait, go back', style: body(12, weight: FontWeight.w600, color: AppColors.text3)),
                ),
                GestureDetector(onTap: _resend, child: Text('Resend code', style: body(12, weight: FontWeight.w600, color: AppColors.royal))),
              ]),
            ],
          ]),
        ),
      ]),
    );
  }
}
