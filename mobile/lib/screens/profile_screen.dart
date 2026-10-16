import 'package:flutter/material.dart';
import '../core/theme.dart';
import '../core/ui.dart';
import '../main.dart';
import 'account_screen.dart';
import 'activity_log_screen.dart';
import 'affiliate_screen.dart';
import 'payment_history_screen.dart';

// Mirrors src/pages/Profile.tsx (the "User" tab).
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key, this.onOpenChats});
  final VoidCallback? onOpenChats;

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    final p = auth.profile;
    final name = (p?['display_name'] as String?)?.isNotEmpty == true ? p!['display_name'] as String : 'Scholar';
    void push(Widget page) => Navigator.of(context).push(MaterialPageRoute(builder: (_) => page));

    return ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 112), children: [
      CardLuxury(
        padding: const EdgeInsets.all(24),
        child: Column(children: [
          SizedBox(
            width: 68,
            height: 68,
            child: Stack(clipBehavior: Clip.none, children: [
              Container(
                width: 64,
                height: 64,
                alignment: Alignment.center,
                decoration: BoxDecoration(gradient: diamondGradient, shape: BoxShape.circle, boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.18), blurRadius: 10, offset: const Offset(0, 6))]),
                child: Text(name.characters.first.toUpperCase(), style: heading(20, weight: FontWeight.w700, color: Colors.white)),
              ),
              Positioned(
                right: -4,
                bottom: -4,
                child: Container(width: 20, height: 20, decoration: const BoxDecoration(color: AppColors.gold, shape: BoxShape.circle), child: const Icon(Icons.shield_outlined, size: 11, color: AppColors.navy)),
              ),
            ]),
          ),
          const SizedBox(height: 8),
          Text(name, style: heading(18)),
          if ((p?['username'] as String?)?.isNotEmpty == true) Text('@${p!['username']}', style: const TextStyle(fontFamily: 'monospace', fontSize: 14, color: AppColors.royal)),
          const SizedBox(height: 2),
          Text((auth.user?.email ?? '').toUpperCase(), style: body(12, color: AppColors.text3, letterSpacing: 0.5)),
          const SizedBox(height: 8),
          Badge2(auth.isAdmin ? 'Admin' : 'Student'),
        ]),
      ),
      const SizedBox(height: 16),
      CardLuxury(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('VERIFICATION', style: heading(12, color: AppColors.text3, letterSpacing: 0.6)),
          const SizedBox(height: 12),
          _info(Icons.school_outlined, 'Institution', (p?['university'] as String?)?.isNotEmpty == true ? p!['university'] as String : 'Not set'),
          const SizedBox(height: 12),
          _info(Icons.phone_outlined, 'Contact', ((p?['phone'] ?? p?['whatsapp']) as String?)?.isNotEmpty == true ? (p?['phone'] ?? p?['whatsapp']) as String : 'Not configured'),
        ]),
      ),
      _menu('Settings', [
        _item(Icons.notifications_none, 'Notifications', hint: 'Use the bell icon above'),
        _item(Icons.checklist, 'Activity Log', onTap: () => push(const ActivityLogScreen())),
        _item(Icons.receipt_long_outlined, 'Payment History', onTap: () => push(const PaymentHistoryScreen())),
        _item(Icons.manage_accounts_outlined, 'Account', onTap: () => push(const AccountScreen())),
      ]),
      _menu('Partner Program', [
        _item(Icons.card_giftcard, 'Affiliate Program', onTap: () => push(const AffiliateScreen())),
        _item(Icons.help_outline, 'Support', onTap: onOpenChats),
      ]),
      const SizedBox(height: 16),
      InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: auth.signOut,
        child: Container(
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: AppColors.rose50, border: Border.all(color: AppColors.rose200), borderRadius: BorderRadius.circular(12)),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.logout, size: 16, color: AppColors.rose700),
            const SizedBox(width: 8),
            Text('Sign Out', style: body(14, weight: FontWeight.w600, color: AppColors.rose700)),
          ]),
        ),
      ),
      const SizedBox(height: 24),
      Center(child: Text('Diamond Solution Academic v2.0', style: body(12, color: AppColors.text3))),
    ]);
  }

  Widget _info(IconData icon, String label, String value) => Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(padding: const EdgeInsets.only(top: 2), child: Icon(icon, size: 16, color: AppColors.royal)),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: body(14, color: AppColors.text3)),
            Text(value, style: body(14, weight: FontWeight.w600)),
          ]),
        ),
      ]);

  Widget _menu(String title, List<Widget> items) => Padding(
        padding: const EdgeInsets.only(top: 16),
        child: CardLuxury(
          padding: EdgeInsets.zero,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Padding(padding: const EdgeInsets.fromLTRB(20, 16, 20, 8), child: Text(title.toUpperCase(), style: heading(12, color: AppColors.text3, letterSpacing: 0.6))),
            for (var i = 0; i < items.length; i++) ...[
              if (i > 0) const Divider(height: 1, color: AppColors.border),
              items[i],
            ],
          ]),
        ),
      );

  Widget _item(IconData icon, String label, {VoidCallback? onTap, String? hint}) => InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          child: Row(children: [
            Icon(icon, size: 18, color: AppColors.royal),
            const SizedBox(width: 12),
            Expanded(child: Text(label, style: body(14, weight: FontWeight.w600))),
            if (hint != null) Text(hint, style: body(12, color: AppColors.text3)),
          ]),
        ),
      );
}
