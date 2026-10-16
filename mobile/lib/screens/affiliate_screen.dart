import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/ui.dart';
import '../main.dart';

// Mirrors src/pages/Affiliate.tsx.

String _n(num v) => NumberFormat('#,##0.###').format(v);

class AffiliateScreen extends StatefulWidget {
  const AffiliateScreen({super.key});
  @override
  State<AffiliateScreen> createState() => _AffiliateScreenState();
}

class _AffiliateScreenState extends State<AffiliateScreen> {
  bool loading = true;
  bool activating = false;
  bool copied = false;
  String? error, info;

  Map<String, dynamic>? affiliate;
  List<Map<String, dynamic>> balances = [], commissions = [], methods = [], withdrawals = [], referrals = [];
  Map<String, String> names = {};
  double commissionRate = 0.25;
  num minWithdrawalNgn = 10000;
  String? deletingId;

  String get uid => db.auth.currentUser!.id;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    try {
      final aff = await db.from('affiliate_profiles').select('referral_code, status, activated_at').eq('user_id', uid).maybeSingle();
      final settings = await db.from('app_settings').select('commission_rate, min_withdrawal_ngn').eq('id', 1).maybeSingle();
      affiliate = aff;
      if (settings != null) {
        commissionRate = (settings['commission_rate'] as num).toDouble();
        minWithdrawalNgn = settings['min_withdrawal_ngn'] as num;
      }
      if (aff != null) {
        final r = await Future.wait<dynamic>([
          db.from('affiliate_balances').select().eq('user_id', uid),
          db.from('commissions').select('id, referred_user_id, commission_amount, commission_currency, status, created_at').eq('referrer_user_id', uid).order('created_at', ascending: false).limit(50),
          db.from('payout_methods').select('id, currency, method, bank_code, bank_name, account_number, account_name').eq('user_id', uid).order('created_at', ascending: false),
          db.from('withdrawals').select('id, amount, currency, status, requested_at').eq('user_id', uid).order('requested_at', ascending: false).limit(50),
          // Every signup attributed to this referrer, not only those that converted.
          db.from('referrals').select('referred_user_id, referred_at').eq('referrer_user_id', uid).order('referred_at', ascending: false).limit(50),
        ]);
        balances = List<Map<String, dynamic>>.from(r[0]);
        commissions = List<Map<String, dynamic>>.from(r[1]);
        methods = List<Map<String, dynamic>>.from(r[2]);
        withdrawals = List<Map<String, dynamic>>.from(r[3]);
        referrals = List<Map<String, dynamic>>.from(r[4]);
        final ids = {...commissions.map((c) => c['referred_user_id'] as String), ...referrals.map((c) => c['referred_user_id'] as String)}.toList();
        if (ids.isNotEmpty) {
          final rows = List<Map<String, dynamic>>.from(await db.rpc('public_profile_names', params: {'p_user_ids': ids}));
          names = {for (final n in rows) n['user_id'] as String: (n['display_name'] as String?) ?? ''};
        }
      }
    } catch (e) {
      error = '$e';
    }
    if (mounted) setState(() => loading = false);
  }

  String _code(String seed) {
    final base = seed.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
    final b = base.isEmpty ? 'SCHOLAR' : base.substring(0, min(8, base.length));
    return '$b${1000 + Random().nextInt(9000)}';
  }

  Future<void> _become() async {
    final auth = AuthScope.of(context);
    setState(() {
      activating = true;
      error = null;
    });
    final seed = (auth.profile?['username'] ?? auth.profile?['display_name'] ?? auth.user?.email ?? 'scholar') as String;
    for (var i = 0; i < 6; i++) {
      try {
        await db.from('affiliate_profiles').insert({'user_id': uid, 'referral_code': _code(seed), 'status': 'active', 'activated_at': DateTime.now().toUtc().toIso8601String()});
        await _load();
        if (mounted) setState(() => activating = false);
        return;
      } catch (e) {
        // 23505 = referral_code collision: retry with a fresh suffix; anything else is real.
        if (!e.toString().contains('23505')) {
          if (mounted) setState(() { error = '$e'; activating = false; });
          return;
        }
      }
    }
    if (mounted) setState(() { error = 'Could not generate a unique referral code — please try again.'; activating = false; });
  }

  num get ngnBalance => (balances.where((b) => b['currency'] == 'NGN').firstOrNull?['balance'] as num?) ?? 0;
  num get ngnEarned => (balances.where((b) => b['currency'] == 'NGN').firstOrNull?['total_earned'] as num?) ?? 0;
  int get ratePct => (commissionRate * 100).round();

  String get referralLink {
    final code = affiliate!['referral_code'] as String;
    return webBaseUrl.isEmpty ? code : '$webBaseUrl/register?ref=$code';
  }

  Future<void> _copy() async {
    await Clipboard.setData(ClipboardData(text: referralLink));
    setState(() => copied = true);
    Future.delayed(const Duration(seconds: 2), () {
      if (mounted) setState(() => copied = false);
    });
  }

  // ---- dialogs -------------------------------------------------------------------------------
  Future<void> _withdrawDialog() async {
    final amount = TextEditingController();
    String methodId = '';
    String? err;
    final ngnMethods = methods.where((m) => m['currency'] == 'NGN').toList();
    await showSheetDialog<void>(
      context,
      title: 'Place withdrawal',
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Amount (₦)', style: body(12, weight: FontWeight.w600, color: AppColors.text2)),
          const SizedBox(height: 4),
          TextField(controller: amount, keyboardType: TextInputType.number, autofocus: true, style: body(14)),
          const SizedBox(height: 12),
          Text('Payout method', style: body(12, weight: FontWeight.w600, color: AppColors.text2)),
          const SizedBox(height: 4),
          DropdownButtonFormField<String>(
            isExpanded: true,
            initialValue: methodId.isEmpty ? null : methodId,
            hint: Text('Select payout method', style: body(14, color: AppColors.text3)),
            items: [for (final m in ngnMethods) DropdownMenuItem(value: m['id'] as String, child: Text('${m['account_name']} · ${m['bank_name'] != null ? '${m['bank_name']} ' : ''}${m['account_number']}', overflow: TextOverflow.ellipsis, style: body(14)))],
            onChanged: (v) => setS(() => methodId = v ?? ''),
          ),
          const SizedBox(height: 12),
          Text('Minimum ₦${_n(minWithdrawalNgn)}', style: body(12, color: AppColors.text3)),
          if (err != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(err!, style: body(12, weight: FontWeight.w500, color: const Color(0xFFE11D48)))),
          const SizedBox(height: 16),
          BtnPrimary(
            icon: Icons.payments_outlined,
            label: 'Request withdrawal',
            onPressed: () async {
              final a = num.tryParse(amount.text);
              String? problem;
              if (a == null || a < minWithdrawalNgn) {
                problem = 'Minimum withdrawal is ₦${_n(minWithdrawalNgn)}.';
              } else if (a > ngnBalance) {
                problem = 'You only have ₦${_n(ngnBalance)} available.';
              } else if (methodId.isEmpty) {
                problem = 'Add a payout method first.';
              }
              if (problem == null) {
                try {
                  await db.from('withdrawals').insert({'user_id': uid, 'amount': a, 'currency': 'NGN', 'payout_method_id': methodId, 'status': 'pending'});
                  if (ctx.mounted) Navigator.pop(ctx);
                  if (mounted) {
                    setState(() => info = 'Withdrawal requested — an admin will process it shortly.');
                    _load();
                  }
                  return;
                } catch (e) {
                  problem = '$e';
                }
              }
              setS(() => err = problem);
            },
          ),
        ]),
      ),
    );
  }

  Future<void> _addMethodDialog() async {
    final added = await showSheetDialog<bool>(
      context,
      title: 'Initialize credentials',
      subtitle: 'Bank transfer only — payouts are sent via Paystack.',
      builder: (ctx) => const _AddMethodForm(),
    );
    if (added == true && mounted) {
      setState(() => info = 'Payout method added.');
      _load();
    }
  }

  Future<void> _deleteDialog(Map<String, dynamic> m) async {
    final ok = await showSheetDialog<bool>(
      context,
      title: 'Remove payout method?',
      builder: (ctx) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(m['account_name'] as String? ?? '', style: body(14, weight: FontWeight.w600)),
        Text('${m['bank_name'] != null ? '${m['bank_name']} · ' : ''}${m['account_number']}', style: body(14, color: AppColors.text3)),
        const SizedBox(height: 8),
        Text("You won't be able to use it for future withdrawals. This can't be undone.", style: body(14, color: AppColors.text3)),
        const SizedBox(height: 20),
        Row(children: [
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => Navigator.pop(ctx, false),
              child: Container(height: 44, alignment: Alignment.center, decoration: BoxDecoration(color: AppColors.royalSoft, border: Border.all(color: AppColors.royalBorder), borderRadius: BorderRadius.circular(12)), child: Text('Cancel', style: body(14, weight: FontWeight.w600, color: AppColors.royal))),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: InkWell(
              borderRadius: BorderRadius.circular(12),
              onTap: () => Navigator.pop(ctx, true),
              child: Container(height: 44, alignment: Alignment.center, decoration: BoxDecoration(color: const Color(0xFFE11D48), borderRadius: BorderRadius.circular(12)), child: Text('Remove', style: body(14, weight: FontWeight.w600, color: Colors.white))),
            ),
          ),
        ]),
      ]),
    );
    if (ok != true) return;
    setState(() {
      deletingId = m['id'] as String;
      error = null;
    });
    try {
      await db.from('payout_methods').delete().eq('id', m['id']);
      info = 'Payout method removed.';
    } catch (e) {
      error = e.toString().contains('23503') ? "Can't remove this payout method — it's attached to a withdrawal request on record. Contact support if you need it changed." : '$e';
    }
    deletingId = null;
    _load();
  }

  // ---- build ---------------------------------------------------------------------------------
  @override
  Widget build(BuildContext context) {
    if (loading) return PageShell(title: 'Affiliate', child: Padding(padding: const EdgeInsets.all(16), child: Text('Loading…', style: body(14, color: AppColors.text3))));
    if (affiliate == null) return PageShell(title: 'Affiliate', child: _intro());
    return PageShell(
      title: 'Affiliate',
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 40), children: [
        Text('INSTITUTIONAL GROWTH & REVENUE SHARE', style: body(11, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 1.6)),
        const SizedBox(height: 16),
        _mainCard(),
        if (info != null) ...[const SizedBox(height: 16), Banner2(info!, success: true)],
        if (error != null) ...[const SizedBox(height: 16), Banner2(error!)],
        const SizedBox(height: 16),
        _pairs([
          _statTile(Icons.group_outlined, AppColors.royalSoft, AppColors.royal, _n(referrals.length), 'Referred assets'),
          _statTile(Icons.diamond_outlined, AppColors.royalSoft, AppColors.royal, '₦${_n(ngnEarned)}', 'Total earned'),
          _statTile(Icons.bolt, AppColors.emerald50, AppColors.emerald600, '$ratePct%', 'Revenue share'),
          _statTile(Icons.account_balance_wallet_outlined, AppColors.royalSoft, AppColors.royal, '₦${_n(ngnBalance)}', 'Net balance'),
        ]),
        _archive('Commission archives', AppColors.emerald600, commissions.isEmpty, 'Awaiting your first institutional endowment', [
          for (final c in commissions)
            _row(
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(names[c['referred_user_id']]?.isNotEmpty == true ? names[c['referred_user_id']]! : 'A referral', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, weight: FontWeight.w600)),
                Text(DateFormat('MMM d, yyyy').format(DateTime.parse(c['created_at'] as String).toLocal()), style: body(12, color: AppColors.text3)),
              ]),
              Text('+${_n(c['commission_amount'] as num)} ${c['commission_currency']}', style: body(14, weight: FontWeight.w600, color: AppColors.royal)),
            ),
        ]),
        _archive('Revenue redistributions', AppColors.royal, withdrawals.isEmpty, 'No redistributed revenue found in archives', [
          for (final w in withdrawals)
            _row(
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${_n(w['amount'] as num)} ${w['currency']}', style: body(14, weight: FontWeight.w600, color: AppColors.text2)),
                Text(DateFormat('MMM d, yyyy').format(DateTime.parse(w['requested_at'] as String).toLocal()), style: body(12, color: AppColors.text3)),
              ]),
              _statusBadge(w['status'] as String),
            ),
        ]),
        _archive('Network synchronization', AppColors.text3, referrals.isEmpty, 'Awaiting network expansion…', [
          for (final r in referrals) _referralRow(r),
        ]),
      ]),
    );
  }

  Widget _intro() => ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 40), children: [
        CardLuxury(
          padding: const EdgeInsets.all(24),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(width: 48, height: 48, decoration: const BoxDecoration(gradient: diamondGradient, shape: BoxShape.circle), child: const Icon(Icons.card_giftcard, size: 22, color: Colors.white)),
            const SizedBox(height: 16),
            Text('Earn by referring friends', style: heading(18)),
            const SizedBox(height: 8),
            Text('Share your personal link. When someone you refer pays for department access, you earn a $ratePct% commission — paid out to your bank account once your balance clears the minimum withdrawal.', style: body(14, color: AppColors.text3, height: 1.45)),
            if (error != null) ...[const SizedBox(height: 12), Banner2(error!)],
            const SizedBox(height: 16),
            BtnPrimary(label: activating ? 'Activating…' : 'Become an affiliate', onPressed: activating ? null : _become),
          ]),
        ),
      ]);

  Widget _mainCard() => CardLuxury(
        padding: const EdgeInsets.all(20),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('WITHDRAWABLE ENDOWMENT', style: body(12, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 1.4)),
                const SizedBox(height: 4),
                Text('₦${_n(ngnBalance)}', maxLines: 1, overflow: TextOverflow.ellipsis, style: heading(30)),
              ]),
            ),
            const SizedBox(width: 12),
            Opacity(
              opacity: ngnBalance <= 0 || methods.isEmpty ? 0.4 : 1,
              child: Material(
                color: AppColors.navy,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: ngnBalance <= 0 || methods.isEmpty ? null : _withdrawDialog,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.payments_outlined, size: 14, color: Colors.white),
                      const SizedBox(width: 6),
                      Text('Place withdrawal', style: body(12, weight: FontWeight.w700, color: Colors.white)),
                    ]),
                  ),
                ),
              ),
            ),
          ]),
          const SizedBox(height: 16),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.royalSoft, borderRadius: BorderRadius.circular(12)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                const Icon(Icons.account_balance_outlined, size: 14, color: AppColors.royal),
                const SizedBox(width: 8),
                Text('ACCOUNT DETAILS', style: body(12, weight: FontWeight.w700, color: AppColors.royal, letterSpacing: 0.6)),
              ]),
              if (methods.isEmpty) ...[
                const SizedBox(height: 6),
                Text('Authorize your institutional bank account to enable revenue redistribution.', style: body(12, color: AppColors.text3)),
                const SizedBox(height: 8),
                GestureDetector(onTap: _addMethodDialog, child: Text('Initialize credentials →', style: body(12, weight: FontWeight.w700, color: AppColors.royal))),
              ] else ...[
                const SizedBox(height: 10),
                for (final m in methods)
                  Container(
                    margin: const EdgeInsets.only(bottom: 6),
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8)),
                    child: Row(children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(m['account_name'] as String? ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, weight: FontWeight.w600)),
                          Text('${m['bank_name'] != null ? '${m['bank_name']} · ' : ''}${m['account_number']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(11, color: AppColors.text3)),
                        ]),
                      ),
                      GestureDetector(
                        onTap: deletingId == m['id'] ? null : () => _deleteDialog(m),
                        child: const Padding(padding: EdgeInsets.all(4), child: Icon(Icons.delete_outline, size: 13, color: Color(0xFFE11D48))),
                      ),
                    ]),
                  ),
                GestureDetector(onTap: _addMethodDialog, child: Text('+ Add another', style: body(12, weight: FontWeight.w700, color: AppColors.royal))),
              ],
            ]),
          ),
          const SizedBox(height: 16),
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text('REFERRAL LINE', style: body(12, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 1.4)),
            Badge2(affiliate!['referral_code'] as String),
          ]),
          const SizedBox(height: 8),
          Row(children: [
            Expanded(
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(color: AppColors.canvasSoft, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
                child: Text(referralLink, maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, color: AppColors.text2)),
              ),
            ),
            const SizedBox(width: 8),
            Material(
              color: AppColors.navy,
              borderRadius: BorderRadius.circular(12),
              child: InkWell(borderRadius: BorderRadius.circular(12), onTap: _copy, child: SizedBox(width: 38, height: 38, child: Icon(copied ? Icons.check : Icons.copy, size: 15, color: Colors.white))),
            ),
          ]),
        ]),
      );

  Widget _pairs(List<Widget> items) => Column(children: [
        for (var i = 0; i < items.length; i += 2) ...[
          if (i > 0) const SizedBox(height: 12),
          IntrinsicHeight(child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [Expanded(child: items[i]), const SizedBox(width: 12), Expanded(child: items[i + 1])])),
        ],
      ]);

  Widget _statTile(IconData icon, Color bg, Color fg, String value, String label) => CardLuxury(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(width: 32, height: 32, decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)), child: Icon(icon, size: 15, color: fg)),
          const SizedBox(height: 8),
          Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: heading(18)),
          Text(label.toUpperCase(), style: body(10, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 0.5)),
        ]),
      );

  Widget _archive(String label, Color color, bool empty, String emptyText, List<Widget> rows) => Padding(
        padding: const EdgeInsets.only(top: 24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Row(children: [
            Text(label.toUpperCase(), style: body(11, weight: FontWeight.w700, color: color, letterSpacing: 1.6)),
            const SizedBox(width: 8),
            const Expanded(child: Divider(height: 1, color: AppColors.border)),
          ]),
          const SizedBox(height: 12),
          if (empty)
            Container(
              padding: const EdgeInsets.all(32),
              decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(16)),
              child: Column(children: [
                const Icon(Icons.schedule, size: 22, color: AppColors.text3),
                const SizedBox(height: 8),
                Text(emptyText, textAlign: TextAlign.center, style: body(12, style: FontStyle.italic, color: AppColors.text3)),
              ]),
            )
          else
            CardLuxury(padding: EdgeInsets.zero, child: Column(children: [for (var i = 0; i < rows.length; i++) ...[if (i > 0) const Divider(height: 1, color: AppColors.border), rows[i]]])),
        ]),
      );

  Widget _row(Widget left, Widget right) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Expanded(child: left), const SizedBox(width: 12), right]),
      );

  Widget _referralRow(Map<String, dynamic> r) {
    final id = r['referred_user_id'] as String;
    final name = names[id]?.isNotEmpty == true ? names[id]! : 'A referral';
    final totals = <String, num>{};
    for (final c in commissions.where((c) => c['referred_user_id'] == id)) {
      totals[c['commission_currency'] as String] = (totals[c['commission_currency']] ?? 0) + (c['commission_amount'] as num);
    }
    return _row(
      Row(children: [
        Container(width: 24, height: 24, alignment: Alignment.center, decoration: const BoxDecoration(color: AppColors.royalSoft, shape: BoxShape.circle), child: Text(name.characters.first.toUpperCase(), style: body(10, weight: FontWeight.w700, color: AppColors.royal))),
        const SizedBox(width: 8),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, color: AppColors.text2)),
            Text('Signed up ${DateFormat('MMM d, yyyy').format(DateTime.parse(r['referred_at'] as String).toLocal())}', style: body(12, color: AppColors.text3)),
          ]),
        ),
      ]),
      totals.isNotEmpty
          ? Text(totals.entries.map((e) => '+${_n(e.value)} ${e.key}').join(', '), textAlign: TextAlign.right, style: body(14, weight: FontWeight.w600, color: AppColors.royal))
          : Text('Not converted yet', style: body(12, color: AppColors.text3)),
    );
  }

  Widget _statusBadge(String status) {
    final (bg, border, fg, icon) = switch (status) {
      'success' => (AppColors.royalSoft, AppColors.royalBorder, AppColors.royal, Icons.check_circle_outline),
      'failed' => (const Color(0xFFFFE4E6), const Color(0xFFFFE4E6), AppColors.rose700, Icons.cancel_outlined),
      _ => (AppColors.goldPale, AppColors.goldBorder, AppColors.goldDark, Icons.schedule),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(color: bg, border: Border.all(color: border), borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [Icon(icon, size: 11, color: fg), const SizedBox(width: 6), Text(status, style: body(12, weight: FontWeight.w600, color: fg))]),
    );
  }
}

/// Bank + account number → account name resolved by Paystack (never typed by the user).
class _AddMethodForm extends StatefulWidget {
  const _AddMethodForm();
  @override
  State<_AddMethodForm> createState() => _AddMethodFormState();
}

class _AddMethodFormState extends State<_AddMethodForm> {
  final account = TextEditingController();
  List<Map<String, dynamic>> banks = [];
  bool banksLoading = true;
  String? banksError;
  String bankCode = '';
  String? resolvedName, resolveError;
  bool resolving = false;
  bool saving = false;
  int _resolveToken = 0;

  @override
  void initState() {
    super.initState();
    _loadBanks();
  }

  Future<void> _loadBanks() async {
    try {
      final res = await db.functions.invoke('list-banks');
      final d = res.data as Map;
      if (d['success'] != true) throw d['error'] ?? "Couldn't load the bank list.";
      if (mounted) setState(() => banks = List<Map<String, dynamic>>.from(d['banks'] as List));
    } catch (e) {
      if (mounted) setState(() => banksError = functionErrorMessage(e, "Couldn't load the bank list."));
    }
    if (mounted) setState(() => banksLoading = false);
  }

  Future<void> _maybeResolve() async {
    final token = ++_resolveToken;
    setState(() {
      resolvedName = null;
      resolveError = null;
    });
    if (bankCode.isEmpty || account.text.length != 10) return;
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (token != _resolveToken || !mounted) return;
    setState(() => resolving = true);
    try {
      final res = await db.functions.invoke('resolve-bank-account', body: {'account_number': account.text, 'bank_code': bankCode});
      final d = res.data as Map;
      if (d['success'] != true) throw d['error'] ?? 'Could not resolve this account.';
      if (token == _resolveToken && mounted) setState(() => resolvedName = d['account_name'] as String);
    } catch (e) {
      if (token == _resolveToken && mounted) setState(() => resolveError = functionErrorMessage(e, 'Could not resolve this account.'));
    }
    if (mounted) setState(() => resolving = false);
  }

  Future<void> _save() async {
    setState(() => saving = true);
    final bankName = banks.where((b) => b['code'] == bankCode).map((b) => b['name'] as String).firstOrNull ?? '';
    try {
      await db.from('payout_methods').insert({
        'user_id': db.auth.currentUser!.id,
        'currency': 'NGN',
        'method': 'bank_transfer',
        'bank_code': bankCode,
        'bank_name': bankName,
        'account_number': account.text,
        'account_name': resolvedName,
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) setState(() { saving = false; resolveError = '$e'; });
    }
  }

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Financial institution', style: body(12, weight: FontWeight.w600, color: AppColors.text2)),
        const SizedBox(height: 4),
        DropdownButtonFormField<String>(
          isExpanded: true,
          initialValue: bankCode.isEmpty ? null : bankCode,
          hint: Text(banksLoading ? 'Loading banks…' : 'Select your bank', style: body(14, color: AppColors.text3)),
          items: [for (final b in banks) DropdownMenuItem(value: b['code'] as String, child: Text(b['name'] as String, overflow: TextOverflow.ellipsis, style: body(14)))],
          onChanged: banksLoading || banksError != null ? null : (v) {
            bankCode = v ?? '';
            _maybeResolve();
          },
        ),
        if (banksError != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(banksError!, style: body(12, weight: FontWeight.w500, color: const Color(0xFFE11D48)))),
        const SizedBox(height: 12),
        Text('Account number', style: body(12, weight: FontWeight.w600, color: AppColors.text2)),
        const SizedBox(height: 4),
        TextField(
          controller: account,
          keyboardType: TextInputType.number,
          maxLength: 10,
          style: body(14),
          decoration: const InputDecoration(counterText: ''),
          onChanged: (v) {
            final digits = v.replaceAll(RegExp(r'\D'), '');
            if (digits != v) account.value = TextEditingValue(text: digits, selection: TextSelection.collapsed(offset: digits.length));
            _maybeResolve();
          },
        ),
        if (resolving || resolvedName != null || resolveError != null) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: resolveError != null ? AppColors.rose50 : resolvedName != null ? AppColors.emerald50 : AppColors.canvasSoft,
              border: Border.all(color: resolveError != null ? AppColors.rose200 : resolvedName != null ? const Color(0xFFA7F3D0) : AppColors.border),
              borderRadius: BorderRadius.circular(12),
            ),
            child: resolving
                ? Text('Resolving account name…', style: body(14, color: AppColors.text3))
                : resolvedName != null
                    ? Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text('ACCOUNT NAME', style: body(12, weight: FontWeight.w600, color: AppColors.emerald600, letterSpacing: 0.5)),
                        Text(resolvedName!, style: body(14, color: const Color(0xFF065F46))),
                      ])
                    : Text(resolveError!, style: body(14, color: AppColors.rose700)),
          ),
        ],
        const SizedBox(height: 16),
        BtnPrimary(icon: Icons.account_balance_outlined, label: saving ? 'Adding…' : 'Add payout method', onPressed: resolvedName == null || saving ? null : _save),
      ]);
}
