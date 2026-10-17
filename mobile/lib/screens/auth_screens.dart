import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart' show OtpType;
import '../core/i18n.dart';
import '../core/logo.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/ui.dart';
import '../main.dart';

String? validatePassword(String p) {
  if (p.length < 8) return 'Password must be at least 8 characters.';
  if (!RegExp(r'[A-Z]').hasMatch(p)) return 'Password must contain an uppercase letter.';
  if (!RegExp(r'[a-z]').hasMatch(p)) return 'Password must contain a lowercase letter.';
  if (!RegExp(r'[0-9]').hasMatch(p)) return 'Password must contain a digit.';
  if (!RegExp(r'[^A-Za-z0-9]').hasMatch(p)) return 'Password must contain a special character.';
  return null;
}

String _msg(Object e) => e.toString().replaceFirst(RegExp(r'^\w*Exception:?\s*'), '').replaceFirst(RegExp(r'^AuthApiException\(message: '), '').replaceFirst(RegExp(r', statusCode.*$'), '');

enum AuthPage { splash, login, register, forgot }

/// Splash → Sign in / Register → Forgot password, the website's pre-login funnel.
class AuthFlow extends StatefulWidget {
  const AuthFlow({super.key});
  @override
  State<AuthFlow> createState() => _AuthFlowState();
}

class _AuthFlowState extends State<AuthFlow> {
  AuthPage page = AuthPage.splash;
  String? info;

  void go(AuthPage p, {String? message}) => setState(() {
        page = p;
        info = message;
      });

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: page == AuthPage.splash,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) go(page == AuthPage.forgot ? AuthPage.login : AuthPage.splash);
        },
        child: switch (page) {
          AuthPage.splash => SplashScreen(onRegister: () => go(AuthPage.register), onSignIn: () => go(AuthPage.login)),
          AuthPage.login => LoginScreen(info: info, go: go),
          AuthPage.register => RegisterScreen(go: go),
          AuthPage.forgot => ForgotPasswordScreen(go: go),
        },
      );
}

/// Scrollable, centred, mesh-backed page — the website's `diamond-mesh flex min-h-screen items-center`.
class AuthPageFrame extends StatelessWidget {
  const AuthPageFrame({super.key, required this.child, this.maxWidth = 384});
  final Widget child;
  final double maxWidth;
  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: AppColors.canvas,
        body: DiamondMesh(
          child: SafeArea(
            child: Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 40),
                child: ConstrainedBox(constraints: BoxConstraints(maxWidth: maxWidth), child: child),
              ),
            ),
          ),
        ),
      );
}

/// Logo above a card — used by the sign-in screens and the lock/reactivation screens.
class AuthFrame extends StatelessWidget {
  const AuthFrame({super.key, required this.children, this.maxWidth = 384, this.logoSize = 56});
  final List<Widget> children;
  final double maxWidth;
  final double logoSize;
  @override
  Widget build(BuildContext context) => AuthPageFrame(
        maxWidth: maxWidth,
        child: Column(children: [
          DiamondLogo(size: logoSize, showTagline: true),
          const SizedBox(height: 32),
          CardLuxury(padding: const EdgeInsets.all(32), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: children)),
        ]),
      );
}

class _Tabs extends StatelessWidget {
  const _Tabs({required this.signin, required this.go});
  final bool signin;
  final void Function(AuthPage) go;
  @override
  Widget build(BuildContext context) {
    final t = LangScope.of(context).t;
    Widget tab(String label, bool active, AuthPage target) => Expanded(
          child: InkWell(
            onTap: () => go(target),
            child: Container(
              padding: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(border: Border(bottom: BorderSide(color: active ? AppColors.royal : Colors.transparent, width: 2))),
              child: Text(label, textAlign: TextAlign.center, style: body(14, weight: FontWeight.w600, color: active ? AppColors.royal : AppColors.text3)),
            ),
          ),
        );
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
      child: Row(children: [tab(t('authtabs.signin'), signin, AuthPage.login), tab(t('authtabs.register'), !signin, AuthPage.register)]),
    );
  }
}

class _Field extends StatelessWidget {
  const _Field({required this.label, required this.child, this.icon});
  final String label;
  final Widget child;
  final IconData? icon;
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          if (icon != null) ...[Icon(icon, size: 13, color: AppColors.text3), const SizedBox(width: 6)],
          Flexible(child: Text(label, style: body(14, weight: FontWeight.w500, color: AppColors.text2))),
        ]),
        const SizedBox(height: 4),
        child,
      ]);
}

Widget _input(TextEditingController c, {IconData? prefix, bool obscure = false, TextInputType? type, String? hint, void Function(String)? onChanged, List<String>? autofill}) => TextField(
      controller: c,
      obscureText: obscure,
      keyboardType: type,
      onChanged: onChanged,
      autofillHints: autofill,
      style: body(14),
      decoration: InputDecoration(
        hintText: hint,
        prefixIcon: prefix == null ? null : Icon(prefix, size: 15, color: AppColors.text3),
        prefixIconConstraints: const BoxConstraints(minWidth: 40),
      ),
    );

class _Disclaimer extends StatelessWidget {
  const _Disclaimer(this.text);
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 24),
        child: Text(text, textAlign: TextAlign.center, style: body(12, color: AppColors.text3)),
      );
}

// ---------------------------------------------------------------------------------------------
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key, required this.onRegister, required this.onSignIn});
  final VoidCallback onRegister;
  final VoidCallback onSignIn;

  @override
  Widget build(BuildContext context) {
    final lang = LangScope.of(context);
    final t = lang.t;
    final stats = [('5+', 'splash.departments'), ('15,000+', 'splash.questions'), ('25%', 'splash.commission')];
    return Scaffold(
      backgroundColor: AppColors.canvas,
      body: DiamondMesh(
        child: SafeArea(
          child: Stack(children: [
            Center(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 64, 16, 32),
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 448),
                  child: CardLuxury(
                    padding: const EdgeInsets.all(32),
                    child: Column(children: [
                      const DiamondLogo(size: 80, showTagline: true),
                      const SizedBox(height: 24),
                      const Divider(height: 1, color: AppColors.border),
                      const SizedBox(height: 24),
                      Text(t('splash.tagline'), textAlign: TextAlign.center, style: body(16, style: FontStyle.italic, color: AppColors.text2, height: 1.6)),
                      const SizedBox(height: 24),
                      Container(
                        decoration: BoxDecoration(color: AppColors.royalSoft, border: Border.all(color: AppColors.royalBorder), borderRadius: BorderRadius.circular(16)),
                        child: IntrinsicHeight(
                          child: Row(children: [
                            for (var i = 0; i < stats.length; i++) ...[
                              if (i > 0) const VerticalDivider(width: 1, color: AppColors.royalBorder),
                              Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
                                  child: Column(children: [
                                    FittedBox(fit: BoxFit.scaleDown, child: Text(stats[i].$1, maxLines: 1, style: heading(18, weight: FontWeight.w900, color: AppColors.royal))),
                                    const SizedBox(height: 2),
                                    FittedBox(fit: BoxFit.scaleDown, child: Text(t(stats[i].$2).toUpperCase(), maxLines: 1, style: body(9, weight: FontWeight.w900, color: AppColors.text3, letterSpacing: 0.9))),
                                  ]),
                                ),
                              ),
                            ],
                          ]),
                        ),
                      ),
                      const SizedBox(height: 24),
                      BtnPrimary(label: '💎 ${t('splash.register').toUpperCase()}  →', big: true, onPressed: onRegister),
                      const SizedBox(height: 12),
                      BtnOutline(label: t('splash.signin').toUpperCase(), big: true, onPressed: onSignIn),
                      const SizedBox(height: 24),
                      Text(t('splash.footer').toUpperCase(), textAlign: TextAlign.center, style: body(9, weight: FontWeight.w900, color: AppColors.text3, letterSpacing: 1.8)),
                    ]),
                  ),
                ),
              ),
            ),
            Positioned(top: 16, right: 16, child: _LangPill(lang: lang)),
          ]),
        ),
      ),
    );
  }
}

class _LangPill extends StatelessWidget {
  const _LangPill({required this.lang});
  final AppLang lang;
  @override
  Widget build(BuildContext context) {
    Widget btn(String code) {
      final on = lang.language == code;
      return GestureDetector(
        onTap: () => lang.set(code),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(color: on ? AppColors.royal : Colors.transparent, borderRadius: BorderRadius.circular(99)),
          child: Text(code.toUpperCase(), style: body(10, weight: FontWeight.w900, color: on ? Colors.white : AppColors.text3, letterSpacing: 1.5)),
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(6),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(99), border: Border.all(color: AppColors.border), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.08), blurRadius: 6, offset: const Offset(0, 4))]),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        const Padding(padding: EdgeInsets.only(left: 6, right: 4), child: Icon(Icons.language, size: 14, color: AppColors.royal)),
        btn('en'),
        btn('fr'),
      ]),
    );
  }
}

// ---------------------------------------------------------------------------------------------
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.info, required this.go});
  final String? info;
  final void Function(AuthPage, {String? message}) go;
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
      await db.auth.signInWithPassword(email: email.text.trim(), password: password.text);
      // The auth stream swaps the home screen in.
    } catch (e) {
      if (mounted) setState(() => error = _msg(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = LangScope.of(context).t;
    return AuthPageFrame(
      child: Column(children: [
        const DiamondLogo(size: 56, showTagline: true),
        const SizedBox(height: 32),
        CardLuxury(
          padding: const EdgeInsets.all(32),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            _Tabs(signin: true, go: widget.go),
            if (widget.info != null) ...[Banner2(widget.info!, success: true), const SizedBox(height: 16)],
            if (error != null) ...[Banner2(error!), const SizedBox(height: 16)],
            _Field(label: t('login.email'), child: _input(email, prefix: Icons.mail_outline, type: TextInputType.emailAddress, autofill: const [AutofillHints.email])),
            const SizedBox(height: 16),
            _Field(label: t('login.password'), child: _input(password, prefix: Icons.lock_outline, obscure: true, autofill: const [AutofillHints.password])),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => widget.go(AuthPage.forgot),
                style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(vertical: 8), minimumSize: Size.zero, tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                child: Text(t('login.forgotPassword'), style: body(12, weight: FontWeight.w600, color: AppColors.royal)),
              ),
            ),
            const SizedBox(height: 8),
            BtnPrimary(icon: Icons.login, label: busy ? t('login.signingIn') : t('login.signIn'), onPressed: busy ? null : submit),
          ]),
        ),
        _Disclaimer(t('login.disclaimer')),
      ]),
    );
  }
}

// ---------------------------------------------------------------------------------------------
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, required this.go});
  final void Function(AuthPage, {String? message}) go;
  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final email = TextEditingController();
  bool sending = false;
  bool sent = false;
  String? error;

  Future<void> submit() async {
    setState(() {
      sending = true;
      error = null;
    });
    try {
      await db.auth.resetPasswordForEmail(email.text.trim(), redirectTo: webBaseUrl.isEmpty ? null : '$webBaseUrl/reset-password');
      // Same "check your email" state whether or not the address exists — no account enumeration.
      if (mounted) setState(() => sent = true);
    } catch (e) {
      if (mounted) setState(() => error = _msg(e));
    } finally {
      if (mounted) setState(() => sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = LangScope.of(context).t;
    final back = TextButton.icon(
      onPressed: () => widget.go(AuthPage.login),
      icon: const Icon(Icons.arrow_back, size: 14),
      label: Text(t('forgotPassword.backToLogin')),
      style: TextButton.styleFrom(foregroundColor: sent ? AppColors.royal : AppColors.text3),
    );
    return AuthPageFrame(
      child: Column(children: [
        const DiamondLogo(size: 56, showTagline: true),
        const SizedBox(height: 32),
        CardLuxury(
          padding: const EdgeInsets.all(32),
          child: sent
              ? Column(children: [
                  Container(width: 48, height: 48, decoration: const BoxDecoration(color: AppColors.emerald50, shape: BoxShape.circle), child: const Icon(Icons.mark_email_read_outlined, color: AppColors.emerald600)),
                  const SizedBox(height: 16),
                  Text(t('forgotPassword.sentTitle'), style: heading(18)),
                  const SizedBox(height: 6),
                  Text(t('forgotPassword.sentBody'), textAlign: TextAlign.center, style: body(14, color: AppColors.text3)),
                  const SizedBox(height: 12),
                  back,
                ])
              : Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Text(t('forgotPassword.title'), style: heading(18)),
                  const SizedBox(height: 6),
                  Text(t('forgotPassword.subtitle'), style: body(14, color: AppColors.text3)),
                  const SizedBox(height: 20),
                  if (error != null) ...[Banner2(error!), const SizedBox(height: 16)],
                  _Field(label: t('forgotPassword.email'), child: _input(email, prefix: Icons.mail_outline, type: TextInputType.emailAddress)),
                  const SizedBox(height: 16),
                  BtnPrimary(label: sending ? t('forgotPassword.sending') : t('forgotPassword.send'), onPressed: sending ? null : submit),
                  const SizedBox(height: 12),
                  Center(child: back),
                ]),
        ),
      ]),
    );
  }
}

// ---------------------------------------------------------------------------------------------
class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key, required this.go});
  final void Function(AuthPage, {String? message}) go;
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
  String departmentId = '';
  String? error;
  String? awaitingConfirmation;
  bool busy = false;
  bool resending = false;
  bool resent = false;

  @override
  void initState() {
    super.initState();
    db.from('departments').select('id, name').eq('status', 'active').order('name', ascending: true).then((rows) {
      if (mounted) setState(() => departments = List<Map<String, dynamic>>.from(rows));
    });
  }

  Future<void> submit() async {
    final t = LangScope.of(context).t;
    if (password.text != confirm.text) {
      setState(() => error = t('register.passwordMismatch'));
      return;
    }
    final pwError = validatePassword(password.text);
    if (pwError != null) {
      setState(() => error = pwError);
      return;
    }
    final lang = LangScope.of(context).language;
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
          'department_id': departmentId.isEmpty ? null : departmentId,
          'whatsapp': wa.isEmpty ? '' : '+234$wa',
          'phone': wa.isEmpty ? '' : '+234$wa',
          'language': lang,
          'referral_code': referral.text.trim().isEmpty ? null : referral.text.trim(),
        },
      );
      if (!mounted) return;
      if (res.session == null) setState(() => awaitingConfirmation = email.text.trim());
      // With a session, the auth stream swaps the home screen in.
    } catch (e) {
      if (mounted) setState(() => error = _msg(e));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  Future<void> resend() async {
    if (resending) return;
    setState(() {
      resending = true;
      resent = false;
    });
    try {
      await db.auth.resend(type: OtpType.signup, email: awaitingConfirmation!);
      if (mounted) setState(() => resent = true);
    } catch (e) {
      if (mounted) setState(() => error = _msg(e));
    } finally {
      if (mounted) setState(() => resending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = LangScope.of(context).t;
    Widget f(String key, TextEditingController c, IconData icon, {bool obscure = false, TextInputType? type, String? hint}) => Padding(
          padding: const EdgeInsets.only(bottom: 16),
          child: _Field(label: t(key), icon: icon, child: _input(c, obscure: obscure, type: type, hint: hint)),
        );

    final form = Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      _Tabs(signin: false, go: widget.go),
      if (error != null && awaitingConfirmation == null) ...[Banner2(error!), const SizedBox(height: 16)],
      f('register.fullName', name, Icons.person_outline),
      f('register.username', username, Icons.person_outline),
      f('register.institution', university, Icons.apartment, hint: t('register.institutionPlaceholder')),
      Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: _Field(
          label: t('register.department'),
          icon: Icons.school_outlined,
          child: _DepartmentCombobox(
            departments: departments,
            value: departmentId,
            onChanged: (id) => departmentId = id,
            placeholder: t('register.departmentPlaceholder'),
            noMatchLabel: t('register.departmentNoMatch'),
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: _Field(
          label: t('register.whatsapp'),
          icon: Icons.chat_bubble_outline,
          child: Row(children: [
            Container(
              height: 44,
              padding: const EdgeInsets.symmetric(horizontal: 12),
              alignment: Alignment.center,
              decoration: BoxDecoration(color: AppColors.canvasSoft, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
              child: Text('🇳🇬 +234', style: body(14, color: AppColors.text2)),
            ),
            const SizedBox(width: 8),
            Expanded(child: _input(whatsapp, type: TextInputType.phone, hint: '8011223344', onChanged: (v) {
              final digits = v.replaceAll(RegExp(r'\D'), '');
              if (digits != v) whatsapp.value = TextEditingValue(text: digits, selection: TextSelection.collapsed(offset: digits.length));
            })),
          ]),
        ),
      ),
      f('register.email', email, Icons.mail_outline, type: TextInputType.emailAddress),
      f('register.password', password, Icons.lock_outline, obscure: true),
      f('register.confirmPassword', confirm, Icons.lock_outline, obscure: true),
      Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: _Field(label: 'Referral code (optional)', icon: Icons.card_giftcard, child: _input(referral)),
      ),
      BtnPrimary(icon: Icons.person_add_alt_1, label: busy ? t('register.creating') : t('register.createAccount'), onPressed: busy ? null : submit),
    ]);

    return Stack(children: [
      AuthPageFrame(
        maxWidth: 448,
        child: Column(children: [
          const DiamondLogo(size: 48, showTagline: true),
          const SizedBox(height: 32),
          CardLuxury(padding: const EdgeInsets.all(32), child: form),
          _Disclaimer(t('register.disclaimer')),
        ]),
      ),
      if (busy)
        Positioned.fill(
          child: Container(
            color: AppColors.navy.withValues(alpha: 0.6),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              const SizedBox(width: 40, height: 40, child: CircularProgressIndicator(strokeWidth: 4, color: Colors.white)),
              const SizedBox(height: 12),
              Material(color: Colors.transparent, child: Text(t('register.creating'), style: heading(14, weight: FontWeight.w600, color: Colors.white))),
            ]),
          ),
        ),
      if (awaitingConfirmation != null)
        Positioned.fill(
          child: Container(
            color: AppColors.navy.withValues(alpha: 0.6),
            padding: const EdgeInsets.all(16),
            alignment: Alignment.center,
            child: Material(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 384),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Container(width: 48, height: 48, decoration: const BoxDecoration(color: AppColors.emerald50, shape: BoxShape.circle), child: const Icon(Icons.check_circle_outline, color: AppColors.emerald600, size: 24)),
                    const SizedBox(height: 16),
                    Text(t('register.accountCreatedTitle'), style: heading(18)),
                    const SizedBox(height: 8),
                    Text(t('register.checkEmailBody').replaceAll('{email}', awaitingConfirmation!), textAlign: TextAlign.center, style: body(14, color: AppColors.text3)),
                    if (resent) ...[const SizedBox(height: 12), Banner2(t('register.resendEmailSent'), success: true)],
                    if (error != null) ...[const SizedBox(height: 12), Banner2(error!)],
                    const SizedBox(height: 20),
                    BtnPrimary(label: t('register.goToSignIn'), onPressed: () => widget.go(AuthPage.login)),
                    const SizedBox(height: 8),
                    BtnOutline(label: resending ? t('register.resendEmailSending') : t('register.resendEmail'), onPressed: resending ? null : resend),
                  ]),
                ),
              ),
            ),
          ),
        ),
    ]);
  }
}

/// Type-to-filter department picker, like the website's DepartmentCombobox.
class _DepartmentCombobox extends StatefulWidget {
  const _DepartmentCombobox({required this.departments, required this.value, required this.onChanged, required this.placeholder, required this.noMatchLabel});
  final List<Map<String, dynamic>> departments;
  final String value;
  final void Function(String id) onChanged;
  final String placeholder;
  final String noMatchLabel;
  @override
  State<_DepartmentCombobox> createState() => _DepartmentComboboxState();
}

class _DepartmentComboboxState extends State<_DepartmentCombobox> {
  final controller = TextEditingController();
  final focus = FocusNode();

  String get selectedName => widget.departments.where((d) => d['id'] == widget.value).map((d) => d['name'] as String).firstOrNull ?? '';

  @override
  void initState() {
    super.initState();
    // Typed text that isn't a real department doesn't keep a stale selection.
    focus.addListener(() {
      if (!focus.hasFocus) controller.text = selectedName;
    });
  }

  @override
  Widget build(BuildContext context) => LayoutBuilder(
        builder: (context, box) => RawAutocomplete<Map<String, dynamic>>(
          textEditingController: controller,
          focusNode: focus,
          displayStringForOption: (d) => d['name'] as String,
          optionsBuilder: (v) {
            final q = v.text.trim().toLowerCase();
            return widget.departments.where((d) => (d['name'] as String).toLowerCase().contains(q));
          },
          onSelected: (d) => widget.onChanged(d['id'] as String),
          fieldViewBuilder: (context, c, f, _) => TextField(
            controller: c,
            focusNode: f,
            style: body(14),
            onChanged: (_) {
              if (widget.value.isNotEmpty) widget.onChanged('');
            },
            decoration: InputDecoration(hintText: widget.placeholder),
          ),
          optionsViewBuilder: (context, onSelected, options) {
            final list = options.toList();
            return Align(
              alignment: Alignment.topLeft,
              child: Material(
                elevation: 6,
                borderRadius: BorderRadius.circular(12),
                color: Colors.white,
                child: Container(
                  width: box.maxWidth,
                  constraints: const BoxConstraints(maxHeight: 224),
                  decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
                  child: list.isEmpty
                      ? Padding(padding: const EdgeInsets.all(12), child: Text(widget.noMatchLabel, style: body(14, color: AppColors.text3)))
                      : ListView.builder(
                          padding: EdgeInsets.zero,
                          shrinkWrap: true,
                          itemCount: list.length,
                          itemBuilder: (context, i) {
                            final d = list[i];
                            final sel = d['id'] == widget.value;
                            return InkWell(
                              onTap: () => onSelected(d),
                              child: Container(
                                width: double.infinity,
                                color: sel ? AppColors.royal : null,
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                child: Text(d['name'] as String, style: body(14, weight: sel ? FontWeight.w600 : FontWeight.w400, color: sel ? Colors.white : AppColors.text1)),
                              ),
                            );
                          },
                        ),
                ),
              ),
            );
          },
        ),
      );
}
