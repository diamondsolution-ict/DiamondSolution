import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show OtpType;
import '../core/supabase.dart';
import '../core/theme.dart';
import '../main.dart';

String? validatePassword(String p) {
  if (p.length < 8) return 'Password must be at least 8 characters.';
  if (!RegExp(r'[A-Z]').hasMatch(p)) return 'Password must contain an uppercase letter.';
  if (!RegExp(r'[a-z]').hasMatch(p)) return 'Password must contain a lowercase letter.';
  if (!RegExp(r'[0-9]').hasMatch(p)) return 'Password must contain a digit.';
  if (!RegExp(r'[^A-Za-z0-9]').hasMatch(p)) return 'Password must contain a special character.';
  return null;
}

class _AuthFrame extends StatelessWidget {
  const _AuthFrame({required this.children});
  final List<Widget> children;
  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(children: [
                  const Icon(Icons.diamond, size: 56, color: AppColors.navy),
                  const SizedBox(height: 8),
                  const Text('Diamond Solution',
                      style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                          color: AppColors.navy)),
                  const SizedBox(height: 24),
                  ...children,
                ]),
              ),
            ),
          ),
        ),
      );
}

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final email = TextEditingController();
  final password = TextEditingController();
  String? error;
  bool busy = false;

  Future<void> submit() async {
    setState(() {
      busy = true;
      error = null;
    });
    try {
      await db.auth.signInWithPassword(
          email: email.text.trim(), password: password.text);
      // AuthState stream swaps the home screen in.
    } catch (e) {
      setState(() => error = _msg(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    return _AuthFrame(children: [
      if (auth.deviceKickedNotice)
        const Padding(
          padding: EdgeInsets.only(bottom: 12),
          child: Text('You were signed out because your account was used on another device.'),
        ),
      if (error != null) _ErrorBox(error!),
      TextField(
        controller: email,
        keyboardType: TextInputType.emailAddress,
        decoration: const InputDecoration(
            labelText: 'Email', prefixIcon: Icon(Icons.mail_outline)),
      ),
      const SizedBox(height: 12),
      TextField(
        controller: password,
        obscureText: true,
        decoration: const InputDecoration(
            labelText: 'Password', prefixIcon: Icon(Icons.lock_outline)),
      ),
      const SizedBox(height: 16),
      FilledButton(
        onPressed: busy ? null : submit,
        child: Text(busy ? 'Signing in…' : 'Sign in'),
      ),
      TextButton(
        onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => const RegisterScreen())),
        child: const Text('Create an account'),
      ),
    ]);
  }
}

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});
  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final name = TextEditingController();
  final username = TextEditingController();
  final university = TextEditingController();
  final whatsapp = TextEditingController();
  final email = TextEditingController();
  final password = TextEditingController();
  final confirm = TextEditingController();
  final referral = TextEditingController();
  List<Map<String, dynamic>> departments = [];
  String? departmentId;
  String? error;
  String? awaitingConfirmation;
  bool busy = false;

  @override
  void initState() {
    super.initState();
    db
        .from('departments')
        .select('id, name')
        .eq('status', 'active')
        .order('name')
        .then((rows) {
      if (mounted) setState(() => departments = List<Map<String, dynamic>>.from(rows));
    });
  }

  Future<void> submit() async {
    if (password.text != confirm.text) {
      setState(() => error = 'Passwords do not match.');
      return;
    }
    final pwError = validatePassword(password.text);
    if (pwError != null) {
      setState(() => error = pwError);
      return;
    }
    setState(() {
      busy = true;
      error = null;
    });
    try {
      final wa = whatsapp.text.trim();
      // Same metadata the website sends; the handle_new_user trigger builds the profile.
      final res = await db.auth.signUp(
        email: email.text.trim(),
        password: password.text,
        data: {
          'display_name': name.text.trim(),
          'username': username.text.toLowerCase().replaceAll(RegExp(r'\s+'), ''),
          'university': university.text.trim(),
          'department_id': departmentId,
          'whatsapp': wa.isEmpty ? '' : '+234$wa',
          'phone': wa.isEmpty ? '' : '+234$wa',
          'language': 'en',
          'referral_code': referral.text.trim().isEmpty ? null : referral.text.trim(),
        },
      );
      if (!mounted) return;
      if (res.session != null) {
        Navigator.of(context).popUntil((r) => r.isFirst);
      } else {
        setState(() => awaitingConfirmation = email.text.trim());
      }
    } catch (e) {
      setState(() => error = _msg(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (awaitingConfirmation != null) {
      return _AuthFrame(children: [
        const Icon(Icons.mark_email_read_outlined, size: 48, color: AppColors.royal),
        const SizedBox(height: 12),
        Text('We sent a confirmation link to $awaitingConfirmation. Confirm your email, then sign in.',
            textAlign: TextAlign.center),
        const SizedBox(height: 16),
        OutlinedButton(
          onPressed: () => db.auth
              .resend(type: OtpType.signup, email: awaitingConfirmation!),
          child: const Text('Resend email'),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(),
          child: const Text('Back to sign in'),
        ),
      ]);
    }
    Widget field(String label, TextEditingController c,
            {bool obscure = false, TextInputType? type, String? prefix}) =>
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: TextField(
            controller: c,
            obscureText: obscure,
            keyboardType: type,
            decoration: InputDecoration(labelText: label, prefixText: prefix),
          ),
        );
    return _AuthFrame(children: [
      if (error != null) _ErrorBox(error!),
      field('Full name', name),
      field('Username', username),
      field('Institution', university),
      DropdownButtonFormField<String>(
        initialValue: departmentId,
        isExpanded: true,
        decoration: const InputDecoration(labelText: 'Department'),
        items: [
          for (final d in departments)
            DropdownMenuItem(value: d['id'] as String, child: Text(d['name'] as String)),
        ],
        onChanged: (v) => setState(() => departmentId = v),
      ),
      const SizedBox(height: 12),
      field('WhatsApp number', whatsapp, type: TextInputType.phone, prefix: '+234 '),
      field('Email', email, type: TextInputType.emailAddress),
      field('Password', password, obscure: true),
      field('Confirm password', confirm, obscure: true),
      field('Referral code (optional)', referral),
      FilledButton(
        onPressed: busy ? null : submit,
        child: Text(busy ? 'Creating account…' : 'Create account'),
      ),
      TextButton(
        onPressed: () => Navigator.of(context).pop(),
        child: const Text('I already have an account'),
      ),
    ]);
  }
}

class BlockedScreen extends StatelessWidget {
  const BlockedScreen.suspended({super.key})
      : title = 'Account suspended',
        body = 'Your account has been suspended. Please contact support.';
  const BlockedScreen.device({super.key})
      : title = 'Device limit reached',
        body = 'This account is signed in on another device. Try again later or contact support.';
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => _AuthFrame(children: [
        const Icon(Icons.lock_outline, size: 40, color: AppColors.danger),
        const SizedBox(height: 12),
        Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text(body, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        OutlinedButton(
            onPressed: AuthScope.of(context).signOut, child: const Text('Sign out')),
      ]);
}

class _ErrorBox extends StatelessWidget {
  const _ErrorBox(this.message);
  final String message;
  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFFFF1F2),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: const Color(0xFFFECDD3)),
        ),
        child: Text(message, style: const TextStyle(color: Color(0xFFBE123C))),
      );
}

String _msg(Object e) {
  final s = e.toString();
  return s.replaceFirst(RegExp(r'^\w*Exception:?\s*'), '');
}
