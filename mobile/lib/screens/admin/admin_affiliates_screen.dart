import 'package:flutter/material.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'admin_common.dart';

// Mirrors src/pages/admin/AdminAffiliates.tsx (read-only Matrix + Partner Registry). The web draws a
// strike-through on the registry money figures, which looks like a styling slip, so it is left out
// here; the CSV export has no app equivalent.
String _money(num amount, String currency) => '${const {'NGN': '₦', 'USD': '\$'}[currency] ?? ''}${groupDigits(amount)}';

class AdminAffiliatesScreen extends StatefulWidget {
  const AdminAffiliatesScreen({super.key});
  @override
  State<AdminAffiliatesScreen> createState() => _AdminAffiliatesScreenState();
}

class _AdminAffiliatesScreenState extends State<AdminAffiliatesScreen> {
  bool registry = false;
  bool loading = true;
  List<Map<String, dynamic>> commissions = [], balances = [], affiliates = [];
  Map<String, String> usernames = {}, displayNames = {}, emails = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final r = await Future.wait<dynamic>([
      db.from('commissions').select('id, referrer_user_id, referred_user_id, commission_amount, commission_currency, status, created_at').order('created_at', ascending: false).limit(500),
      db.from('affiliate_balances').select(),
      db.from('affiliate_profiles').select('user_id, referral_code, status').order('activated_at', ascending: false),
    ]);
    final c = List<Map<String, dynamic>>.from(r[0] as List);
    final a = List<Map<String, dynamic>>.from(r[2] as List);
    final ids = {for (final x in c) if (x['referrer_user_id'] is String) x['referrer_user_id'] as String, for (final x in a) x['user_id'] as String}.toList();
    if (ids.isNotEmpty) {
      final p = await Future.wait<dynamic>([
        db.from('profiles').select('user_id, display_name, username').inFilter('user_id', ids),
        db.rpc('admin_list_emails', params: {'p_user_ids': ids}),
      ]);
      displayNames = {for (final x in p[0] as List) x['user_id'] as String: (x['display_name'] as String?) ?? 'Unnamed'};
      usernames = {for (final x in p[0] as List) x['user_id'] as String: (x['username'] as String?) ?? x['user_id'] as String};
      emails = {for (final x in p[1] as List) x['user_id'] as String: x['email'] as String};
    }
    if (!mounted) return;
    setState(() {
      commissions = c;
      balances = List<Map<String, dynamic>>.from(r[1] as List);
      affiliates = a;
      loading = false;
    });
  }

  @override
  Widget build(BuildContext context) => ListView(padding: const EdgeInsets.all(20), children: [
        Container(
          decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: AppColors.border))),
          child: Row(children: [
            for (final t in const [(false, 'Matrix'), (true, 'Partner Registry')])
              Padding(
                padding: const EdgeInsets.only(right: 24),
                child: GestureDetector(
                  onTap: () => setState(() => registry = t.$1),
                  child: Container(
                    padding: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(border: Border(bottom: BorderSide(color: registry == t.$1 ? AppColors.royal : Colors.transparent, width: 2))),
                    child: Text(t.$2.toUpperCase(), style: body(12, weight: FontWeight.w700, color: registry == t.$1 ? AppColors.royal : AppColors.text3, letterSpacing: 1.8)),
                  ),
                ),
              ),
          ]),
        ),
        const SizedBox(height: 16),
        if (loading)
          Text('Loading…', style: body(14, color: AppColors.text3))
        else if (!registry)
          commissions.isEmpty
              ? const EmptyCard(icon: Icons.people_outline, message: 'No commissions yet.')
              : Column(children: [
                  for (final c in commissions)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: CardLuxury(
                        padding: const EdgeInsets.all(16),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Row(children: [
                            Expanded(child: Text(usernames[c['referrer_user_id']] ?? '${c['referrer_user_id']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, weight: FontWeight.w600))),
                            Text(_money(asNum(c['commission_amount']), c['commission_currency'] as String), style: body(14, weight: FontWeight.w700)),
                          ]),
                          const SizedBox(height: 4),
                          Text(_stamp(c['created_at'] as String), style: body(12, color: AppColors.text3)),
                        ]),
                      ),
                    ),
                ])
        else
          affiliates.isEmpty ? const EmptyCard(icon: Icons.people_outline, message: 'No partners yet.') : Column(children: [for (final a in affiliates) _partner(a)]),
        const SizedBox(height: 80),
      ]);

  Widget _partner(Map<String, dynamic> a) {
    final uid = a['user_id'] as String;
    final b = balances.where((x) => x['user_id'] == uid).toList();
    final currency = b.isEmpty ? 'NGN' : b.first['currency'] as String;
    num sum(String k) => b.fold<num>(0, (s, x) => s + asNum(x[k]));
    Widget stat(String l, num v, Color c) => Expanded(
          child: Column(children: [
            Text(l.toUpperCase(), style: body(10, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 0.5)),
            Text(_money(v, currency), style: body(14, weight: FontWeight.w700, color: c)),
          ]),
        );
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: CardLuxury(
        padding: const EdgeInsets.all(16),
        child: Column(children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(displayNames[uid] ?? uid, maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, weight: FontWeight.w700)),
                Text(emails[uid] ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, color: AppColors.text3)),
              ]),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(color: AppColors.royalSoft, border: Border.all(color: AppColors.royal.withValues(alpha: 0.3)), borderRadius: BorderRadius.circular(99)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                const Icon(Icons.link, size: 11, color: AppColors.royal),
                const SizedBox(width: 4),
                Text('${a['referral_code']}'.toUpperCase(), style: body(12, weight: FontWeight.w700, color: AppColors.royal).copyWith(fontFamily: 'monospace')),
              ]),
            ),
          ]),
          const SizedBox(height: 12),
          const Divider(height: 1, color: AppColors.border),
          const SizedBox(height: 12),
          Row(children: [stat('Earned', sum('total_earned'), AppColors.text1), stat('Paid', sum('total_withdrawn'), AppColors.emerald600), stat('Balance', sum('balance'), AppColors.royal)]),
        ]),
      ),
    );
  }

  String _stamp(String iso) {
    final d = DateTime.parse(iso).toLocal();
    String t(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${t(d.month)}-${t(d.day)} ${t(d.hour)}:${t(d.minute)}';
  }
}
