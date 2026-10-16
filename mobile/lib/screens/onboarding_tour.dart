import 'dart:async';
import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../core/logo.dart';
import '../core/theme.dart';
import '../core/ui.dart';
import '../main.dart';

// Mirrors src/components/OnboardingTour.tsx — five auto-advancing welcome cards. The website
// shows it once per browser session; the app shows it once per account on this phone (a tour on
// every launch would just be in the way).
const _steps = [
  ('Welcome to Diamond Solution', "You're in. Let's take a quick look at what's here before you dive into your first set of questions.", Icons.school_outlined),
  ('Practice every day', 'Pick a department, work through its courses, and build a daily streak — every attempt is tracked so you can see exactly where you\'re improving.', Icons.track_changes),
  ('Climb the leaderboard', 'Your accuracy and consistency earn you a spot on the leaderboard — see how you stack up against other scholars.', Icons.emoji_events_outlined),
  ('Refer & earn', 'Share your referral link — when someone you refer pays for a department, you earn a commission. Opt in anytime from the Refer & Earn page.', Icons.share_outlined),
  ('Stuck? Just ask', "Have a question about payments, a course, or your account? Chat with support right from the app — we'll reply there.", Icons.chat_bubble_outline),
];

class OnboardingTour extends StatefulWidget {
  const OnboardingTour({super.key});
  @override
  State<OnboardingTour> createState() => _OnboardingTourState();
}

class _OnboardingTourState extends State<OnboardingTour> {
  bool visible = false;
  int step = 0;
  Timer? auto;
  bool checked = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (checked) return;
    final auth = AuthScope.of(context);
    if (auth.profile == null) return;
    checked = true;
    _maybeShow(auth.user!.id);
  }

  String _key(String uid) => 'ds_onboarding_done_$uid';

  Future<void> _maybeShow(String uid) async {
    var done = false;
    try {
      done = (await SharedPreferences.getInstance()).getBool(_key(uid)) ?? false;
    } catch (_) {
      // storage unavailable: just show it
    }
    if (done) return;
    await Future<void>.delayed(const Duration(milliseconds: 300));
    if (!mounted) return;
    setState(() => visible = true);
    _restartTimer();
  }

  void _restartTimer() {
    auto?.cancel();
    auto = Timer.periodic(const Duration(seconds: 6), (_) {
      if (step < _steps.length - 1) setState(() => step++);
    });
  }

  @override
  void dispose() {
    auto?.cancel();
    super.dispose();
  }

  Future<void> _finish() async {
    auto?.cancel();
    setState(() => visible = false);
    try {
      final uid = AuthScope.of(context).user?.id;
      if (uid != null) await (await SharedPreferences.getInstance()).setBool(_key(uid), true);
    } catch (_) {}
  }

  void _next() {
    if (step < _steps.length - 1) {
      setState(() => step++);
      _restartTimer();
    } else {
      _finish();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!visible) return const SizedBox.shrink();
    final (title, text, icon) = _steps[step];
    final last = step == _steps.length - 1;
    return Positioned.fill(
      child: Material(
        color: Colors.transparent,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
          child: Container(
            color: AppColors.navy.withValues(alpha: 0.95),
            padding: const EdgeInsets.all(24),
            alignment: Alignment.center,
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 448),
              child: Container(
                decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(32), border: Border.all(color: AppColors.gold.withValues(alpha: 0.2)), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.4), blurRadius: 40, offset: const Offset(0, 20))]),
                clipBehavior: Clip.antiAlias,
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Stack(children: [
                    Padding(
                      padding: const EdgeInsets.fromLTRB(32, 40, 32, 32),
                      child: Column(children: [
                        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                          const LogoMark(height: 23, white: true),
                          const SizedBox(width: 8),
                          Text('DIAMOND SOLUTION', style: heading(12, color: Colors.white.withValues(alpha: 0.7), letterSpacing: 1.8)),
                        ]),
                        const SizedBox(height: 40),
                        Container(
                          width: 80,
                          height: 80,
                          decoration: BoxDecoration(gradient: diamondGradient, borderRadius: BorderRadius.circular(24), border: Border.all(color: AppColors.gold.withValues(alpha: 0.2)), boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.25), blurRadius: 12, offset: const Offset(0, 6))]),
                          child: Icon(icon, size: 32, color: AppColors.gold),
                        ),
                        const SizedBox(height: 24),
                        Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                          for (var i = 0; i < _steps.length; i++)
                            AnimatedContainer(
                              duration: const Duration(milliseconds: 500),
                              margin: const EdgeInsets.symmetric(horizontal: 3),
                              width: i == step ? 32 : 8,
                              height: 4,
                              decoration: BoxDecoration(color: i == step ? AppColors.gold : i < step ? AppColors.gold.withValues(alpha: 0.4) : Colors.white.withValues(alpha: 0.15), borderRadius: BorderRadius.circular(99)),
                            ),
                        ]),
                        const SizedBox(height: 24),
                        Text(title, textAlign: TextAlign.center, style: heading(20, color: Colors.white)),
                        const SizedBox(height: 8),
                        Text(text, textAlign: TextAlign.center, style: body(14, color: AppColors.slate300, height: 1.6)),
                      ]),
                    ),
                    Positioned(
                      top: 20,
                      right: 20,
                      child: GestureDetector(
                        onTap: _finish,
                        child: Container(width: 36, height: 36, decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.05), shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: 0.1))), child: const Icon(Icons.close, size: 16, color: AppColors.slate400)),
                      ),
                    ),
                  ]),
                  Container(
                    decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.03), border: Border(top: BorderSide(color: Colors.white.withValues(alpha: 0.1)))),
                    padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
                    child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                      GestureDetector(onTap: _finish, child: Text('Skip', style: body(12, weight: FontWeight.w600, color: AppColors.slate400))),
                      SizedBox(width: 130, child: BtnGold(label: last ? 'Get started' : 'Next', onPressed: _next)),
                    ]),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
