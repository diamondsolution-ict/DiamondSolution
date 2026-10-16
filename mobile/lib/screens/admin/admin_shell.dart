import 'package:flutter/material.dart';
import '../../core/logo.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import '../../main.dart';
import 'admin_affiliates_screen.dart';
import 'admin_analytics_screen.dart';
import 'admin_dashboard_screen.dart';
import 'admin_notifications_screen.dart';
import 'admin_payments_screen.dart';
import 'admin_quotes_screen.dart';
import 'admin_support_screen.dart';
import 'admin_users_screen.dart';
import 'admin_withdrawals_screen.dart';
import 'admin_whatsapp_screen.dart';

class _Section {
  const _Section(this.label, this.icon, this.build, {this.adminOnly = false});
  final String label;
  final IconData icon;
  final Widget Function() build;
  final bool adminOnly;
}

/// Website AdminLayout on a phone: a header titled by the active section and a navy drawer
/// (the sidebar). Moderators only see the moderator scope; admin-only entries are filtered out
/// exactly like the web `adminOnly` flags (the backend enforces the same limit via RLS).
class AdminShell extends StatefulWidget {
  const AdminShell({super.key});
  @override
  State<AdminShell> createState() => _AdminShellState();
}

class _AdminShellState extends State<AdminShell> {
  int index = 0;

  late final _groups = <(String, List<_Section>)>[
    ('Main', [
      _Section('Dashboard', Icons.grid_view_rounded, () => AdminDashboardScreen(onOpenPayments: () => _goTo('Payments'))),
      _Section('Users', Icons.people_outline, () => const AdminUsersScreen(), adminOnly: true),
      _Section('WhatsApp Numbers', Icons.chat_bubble_outline, () => const AdminWhatsAppScreen()),
      _Section('Affiliates', Icons.link, () => const AdminAffiliatesScreen()),
      _Section('Withdrawals', Icons.account_balance_wallet_outlined, () => const AdminWithdrawalsScreen(), adminOnly: true),
    ]),
    ('Finance', [
      _Section('Payments', Icons.credit_card, () => const AdminPaymentsScreen()),
      _Section('Analytics', Icons.bar_chart_rounded, () => const AdminAnalyticsScreen()),
    ]),
    ('Content', [
      _Section('Notifications', Icons.notifications_none, () => const AdminNotificationsScreen()),
      _Section('Quotes', Icons.format_quote_rounded, () => const AdminQuotesScreen()),
      _Section('Support', Icons.chat_outlined, () => const AdminSupportScreen()),
    ]),
  ];

  void _goTo(String label) {
    final sections = _visible(AuthScope.of(context).isAdmin);
    final i = sections.indexWhere((s) => s.label == label);
    if (i >= 0) setState(() => index = i);
  }

  List<_Section> _visible(bool isAdmin) => [for (final g in _groups) for (final s in g.$2) if (isAdmin || !s.adminOnly) s];

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    final sections = _visible(auth.isAdmin);
    if (index >= sections.length) index = 0;
    final active = sections[index];
    return Scaffold(
      backgroundColor: AppColors.canvas,
      appBar: AppBar(
        titleSpacing: 0,
        automaticallyImplyLeading: false,
        title: Text(active.label),
        backgroundColor: Colors.white.withValues(alpha: 0.9),
        leading: Builder(builder: (ctx) => IconButton(icon: const Icon(Icons.menu, size: 22, color: AppColors.text2), onPressed: () => Scaffold.of(ctx).openDrawer())),
      ),
      drawer: Drawer(
        width: 288,
        backgroundColor: Colors.white,
        shape: const RoundedRectangleBorder(),
        child: SafeArea(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Padding(padding: EdgeInsets.fromLTRB(24, 24, 24, 16), child: DiamondLogo(size: 26, horizontal: true)),
            Expanded(
              child: ListView(padding: const EdgeInsets.fromLTRB(12, 0, 12, 16), children: [
                for (final g in _groups)
                  if (g.$2.any((s) => auth.isAdmin || !s.adminOnly)) ...[
                    Padding(padding: const EdgeInsets.fromLTRB(12, 0, 12, 6), child: Text(g.$1.toUpperCase(), style: body(10, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 1.5))),
                    for (final s in g.$2)
                      if (auth.isAdmin || !s.adminOnly) _navTile(s, sections),
                    const SizedBox(height: 20),
                  ],
                _navTile(_Section('User Dashboard', Icons.layers_outlined, () => const SizedBox(), adminOnly: false), sections, onTap: () {
                  Navigator.of(context).pop();
                  Navigator.of(context).pop();
                }),
              ]),
            ),
            const Divider(height: 1, color: AppColors.border),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Row(children: [
                Container(
                  width: 32,
                  height: 32,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(color: AppColors.royal, shape: BoxShape.circle),
                  child: Text((auth.user?.email ?? 'A').substring(0, 1).toUpperCase(), style: body(14, weight: FontWeight.w700, color: Colors.white)),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(auth.user?.email ?? 'Admin', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, weight: FontWeight.w600)),
                    Text(auth.isAdmin ? 'Admin' : 'Moderator', style: body(10, color: AppColors.text3)),
                  ]),
                ),
                IconButton(
                  tooltip: 'Sign out',
                  icon: const Icon(Icons.logout, size: 16, color: AppColors.text3),
                  onPressed: () {
                    Navigator.of(context).pop();
                    Navigator.of(context).pop();
                    auth.signOut();
                  },
                ),
              ]),
            ),
          ]),
        ),
      ),
      body: DiamondMesh(child: KeyedSubtree(key: ValueKey(active.label), child: active.build())),
    );
  }

  Widget _navTile(_Section s, List<_Section> sections, {VoidCallback? onTap}) {
    final selected = onTap == null && sections[index] == s;
    return InkWell(
      borderRadius: BorderRadius.circular(12),
      onTap: onTap ??
          () {
            Navigator.of(context).pop();
            setState(() => index = sections.indexOf(s));
          },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: selected ? AppColors.royalSoft : Colors.transparent, borderRadius: BorderRadius.circular(12)),
        child: Row(children: [
          Icon(s.icon, size: 16, color: selected ? AppColors.royal : AppColors.text2),
          const SizedBox(width: 10),
          Text(s.label, style: body(14, weight: FontWeight.w600, color: selected ? AppColors.royal : AppColors.text2)),
        ]),
      ),
    );
  }
}
