import 'package:flutter/material.dart';
import 'dashboard_screen.dart';
import 'courses_screen.dart';
import 'leaderboard_screen.dart';
import 'profile_screen.dart';
import 'notifications.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int index = 0;
  static const _titles = ['Dashboard', 'Courses', 'Leaderboard', 'Profile'];

  @override
  Widget build(BuildContext context) {
    const pages = [
      DashboardScreen(),
      CoursesScreen(),
      LeaderboardScreen(),
      ProfileScreen(),
    ];
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[index]),
        actions: const [NotificationsButton()],
      ),
      body: IndexedStack(index: index, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => setState(() => index = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.dashboard_outlined), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.menu_book_outlined), label: 'Courses'),
          NavigationDestination(icon: Icon(Icons.emoji_events_outlined), label: 'Leaders'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: 'Profile'),
        ],
      ),
    );
  }
}
