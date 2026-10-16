import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../core/ui.dart';
import '../main.dart';
import 'chat_screen.dart';
import 'admin/admin_shell.dart';
import 'courses_screen.dart';
import 'dashboard_screen.dart';
import 'notifications.dart';
import 'onboarding_tour.dart';
import 'profile_screen.dart';

/// The website's Layout on a phone: white header (title, bell, sign out) and the floating navy
/// bottom bar with Home / Departments / Chats / User.
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int index = 0;

  static const _titles = [
    'Dashboard',
    'Departments',
    'Chat with Support',
    'Profile'
  ];
  static const _navKeys = [
    'nav.home',
    'nav.departments',
    'nav.chats',
    'nav.user'
  ];
  static const _icons = [
    Icons.home_outlined,
    Icons.menu_book_outlined,
    Icons.chat_bubble_outline,
    Icons.person_outline
  ];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // This device just became the active one and ended the account's other session.
    final auth = AuthScope.of(context);
    if (auth.deviceKickedNotice) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        auth.dismissDeviceKickedNotice();
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
              content: Text(
                  'Signed in here — your account was signed out on its other device.')));
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final lang = LangScope.of(context);
    final auth = AuthScope.of(context);
    final pages = [
      DashboardScreen(onOpenDepartments: () => setState(() => index = 1)),
      const CoursesScreen(),
      const ChatScreen(embedded: true),
      ProfileScreen(onOpenChats: () => setState(() => index = 2)),
    ];
    return Stack(children: [
      Scaffold(
        backgroundColor: AppColors.canvas,
        appBar: AppBar(
          automaticallyImplyLeading: false,
          titleSpacing: 16,
          title: Text(_titles[index]),
          backgroundColor: Colors.white.withValues(alpha: 0.9),
          actions: [
            const NotificationsButton(),
            IconButton(
              tooltip: lang.t('common.signOut'),
              onPressed: auth.signOut,
              icon: const Icon(Icons.logout, size: 18, color: AppColors.text3),
            ),
            const SizedBox(width: 4),
          ],
        ),
        body: DiamondMesh(child: IndexedStack(index: index, children: pages)),
        extendBody: true,
        bottomNavigationBar: SafeArea(
          child: Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Center(
              heightFactor: 1,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                decoration: BoxDecoration(
                  color: AppColors.navy,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.border),
                  boxShadow: [
                    BoxShadow(
                        color: Colors.black.withValues(alpha: 0.18),
                        blurRadius: 15,
                        offset: const Offset(0, 8))
                  ],
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  for (var i = 0; i < 4; i++)
                    GestureDetector(
                      onTap: () => setState(() => index = i),
                      behavior: HitTestBehavior.opaque,
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 150),
                        margin: const EdgeInsets.symmetric(horizontal: 1),
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                            color: index == i
                                ? Colors.white.withValues(alpha: 0.15)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(12)),
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                          Icon(_icons[i],
                              size: 17,
                              color: index == i
                                  ? Colors.white
                                  : AppColors.slate400),
                          const SizedBox(height: 2),
                          Text(lang.t(_navKeys[i]),
                              style: body(11,
                                  weight: FontWeight.w600,
                                  color: index == i
                                      ? Colors.white
                                      : AppColors.slate400)),
                        ]),
                      ),
                    ),
                  if (auth.isStaff)
                    GestureDetector(
                      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const AdminShell())),
                      behavior: HitTestBehavior.opaque,
                      child: Container(
                        margin: const EdgeInsets.symmetric(horizontal: 1),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                        child: Column(mainAxisSize: MainAxisSize.min, children: [
                          const Icon(Icons.shield_outlined, size: 17, color: AppColors.slate400),
                          const SizedBox(height: 2),
                          Text(lang.t(auth.isAdmin ? 'nav.admin' : 'nav.moderator'), style: body(11, weight: FontWeight.w600, color: AppColors.slate400)),
                        ]),
                      ),
                    ),
                ]),
              ),
            ),
          ),
        ),
      ),
      const OnboardingTour(),
    ]);
  }
}
