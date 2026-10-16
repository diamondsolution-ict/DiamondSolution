import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'core/auth_state.dart';
import 'core/i18n.dart';
import 'core/supabase.dart';
import 'core/theme.dart';
import 'screens/auth_screens.dart';
import 'screens/home_shell.dart';
import 'screens/lock_screens.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Fonts are bundled in google_fonts/ — never fetch them at runtime (works offline, no flash).
  GoogleFonts.config.allowRuntimeFetching = false;
  try {
    await initSupabase();
  } catch (e) {
    runApp(_ConfigError('$e'));
    return;
  }
  runApp(const DiamondApp());
}

class DiamondApp extends StatefulWidget {
  const DiamondApp({super.key});
  @override
  State<DiamondApp> createState() => _DiamondAppState();
}

class _DiamondAppState extends State<DiamondApp> {
  final auth = AppAuth();
  final lang = AppLang();

  @override
  void dispose() {
    auth.dispose();
    lang.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LangScope(
      lang: lang,
      child: AuthScope(
      auth: auth,
      child: MaterialApp(
        title: 'Diamond Solution',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: ListenableBuilder(
          listenable: auth,
          builder: (context, _) {
            // Adopt the language saved on the account once the profile loads.
            lang.adopt(auth.profile?['language'] as String?);
            if (auth.loading) {
              return const Scaffold(
                  body: Center(child: CircularProgressIndicator()));
            }
            if (auth.session == null) return const AuthFlow();
            if (auth.isSuspended) return const ReactivationScreen();
            if (auth.isDeviceBlocked) return const DeviceLockedScreen();
            return const HomeShell();
          },
        ),
      ),
      ),
    );
  }
}

class LangScope extends InheritedNotifier<AppLang> {
  const LangScope({super.key, required AppLang lang, required super.child}) : super(notifier: lang);
  static AppLang of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<LangScope>()!.notifier!;
}

class AuthScope extends InheritedNotifier<AppAuth> {
  const AuthScope({super.key, required AppAuth auth, required super.child})
      : super(notifier: auth);

  static AppAuth of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<AuthScope>()!.notifier!;
}

class _ConfigError extends StatelessWidget {
  const _ConfigError(this.message);
  final String message;
  @override
  Widget build(BuildContext context) => MaterialApp(
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(24),
            child: Center(child: Text(message)),
          ),
        ),
      );
}
