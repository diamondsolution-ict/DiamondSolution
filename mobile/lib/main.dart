import 'package:flutter/material.dart';
import 'core/auth_state.dart';
import 'core/supabase.dart';
import 'core/theme.dart';
import 'screens/auth_screens.dart';
import 'screens/home_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
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

  @override
  void dispose() {
    auth.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AuthScope(
      auth: auth,
      child: MaterialApp(
        title: 'Diamond Solution',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: ListenableBuilder(
          listenable: auth,
          builder: (context, _) {
            if (auth.loading) {
              return const Scaffold(
                  body: Center(child: CircularProgressIndicator()));
            }
            if (auth.session == null) return const LoginScreen();
            if (auth.isSuspended) return const BlockedScreen.suspended();
            if (auth.isDeviceBlocked) return const BlockedScreen.device();
            return const HomeShell();
          },
        ),
      ),
    );
  }
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
