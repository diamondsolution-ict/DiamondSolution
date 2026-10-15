import 'dart:math';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../main.dart';

class AffiliateScreen extends StatefulWidget {
  const AffiliateScreen({super.key});
  @override
  State<AffiliateScreen> createState() => _AffiliateScreenState();
}

class _AffiliateScreenState extends State<AffiliateScreen> {
  late Future<Map<String, dynamic>> future = _load();
  String? message;
  bool busy = false;

  String get uid => db.auth.currentUser!.id;

  Future<Map<String, dynamic>> _load() async {
    final aff = await db.from('affiliate_profiles').select('referral_code, status').eq('user_id', uid).maybeSingle();
    final settings = await db.from('app_settings').select('commission_rate, min_withdrawal_ngn').eq('id', 1).maybeSingle();
    if (aff == null) return {'aff': null, 'settings': settings};
    final r = await Future.wait<dynamic>([
      db.from('affiliate_balances').select().eq('user_id', uid),
      db
          .from('commissions')
          .select('id, commission_amount, commission_currency, status, created_at')
          .eq('referrer_user_id', uid)
          .order('created_at', ascending: false)
          .limit(50),
      db
          .from('payout_methods')
          .select('id, bank_name, account_number, account_name')
          .eq('user_id', uid)
          .order('created_at', ascending: false),
      db
          .from('withdrawals')
          .select('id, amount, currency, status, requested_at')
          .eq('user_id', uid)
          .order('requested_at', ascending: false)
          .limit(50),
      db.from('referrals').select('referred_user_id').eq('referrer_user_id', uid),
    ]);
    return {
      'aff': aff,
      'settings': settings,
      'balances': r[0],
      'commissions': r[1],
      'methods': r[2],
      'withdrawals': r[3],
      'referralCount': (r[4] as List).length,
    };
  }

  void _reload() => setState(() => future = _load());

  String _code(String seed) {
    final base = seed.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');
    final b = base.isEmpty ? 'SCHOLAR' : base.substring(0, min(8, base.length));
    return '$b${1000 + Random().nextInt(9000)}';
  }

  Future<void> _become() async {
    final auth = AuthScope.of(context);
    setState(() => busy = true);
    final seed = (auth.profile?['username'] ?? auth.profile?['display_name'] ?? auth.user?.email ?? 'scholar') as String;
    for (var i = 0; i < 6; i++) {
      try {
        await db.from('affiliate_profiles').insert({
          'user_id': uid,
          'referral_code': _code(seed),
          'status': 'active',
          'activated_at': DateTime.now().toUtc().toIso8601String(),
        });
        break;
      } catch (e) {
        // 23505 = referral_code collision: retry with a new suffix; anything else is real.
        if (!e.toString().contains('23505') || i == 5) {
          message = '$e';
          break;
        }
      }
    }
    busy = false;
    _reload();
  }

  Future<void> _addMethod() async {
    final added = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => const _AddPayoutMethodSheet(),
    );
    if (added == true) {
      message = 'Payout method added.';
      _reload();
    }
  }

  Future<void> _deleteMethod(String id) async {
    try {
      await db.from('payout_methods').delete().eq('id', id);
      message = 'Payout method removed.';
    } catch (e) {
      message = e.toString().contains('23503')
          ? "Can't remove this payout method — it's attached to a withdrawal on record."
          : '$e';
    }
    _reload();
  }

  Future<void> _withdraw(List methods, num balance, num min) async {
    final amountCtl = TextEditingController();
    String? methodId = methods.isNotEmpty ? methods.first['id'] as String : null;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          title: const Text('Request withdrawal'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Available ₦$balance · minimum ₦$min'),
            const SizedBox(height: 12),
            TextField(controller: amountCtl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount (₦)')),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: methodId,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Payout method'),
              items: [for (final m in methods) DropdownMenuItem(value: m['id'] as String, child: Text('${m['bank_name']} · ${m['account_number']}'))],
              onChanged: (v) => setS(() => methodId = v),
            ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Request')),
          ],
        ),
      ),
    );
    if (ok != true) return;
    final amount = num.tryParse(amountCtl.text);
    String? err;
    if (amount == null || amount < min) {
      err = 'Minimum withdrawal is ₦$min.';
    } else if (amount > balance) {
      err = 'You only have ₦$balance available.';
    } else if (methodId == null) {
      err = 'Add a payout method first.';
    }
    if (err == null) {
      try {
        await db.from('withdrawals').insert({
          'user_id': uid,
          'amount': amount,
          'currency': 'NGN',
          'payout_method_id': methodId,
          'status': 'pending',
        });
        message = 'Withdrawal requested — an admin will process it shortly.';
      } catch (e) {
        err = '$e';
      }
    }
    if (err != null) message = err;
    _reload();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Affiliate')),
        body: AsyncBody<Map<String, dynamic>>(
          future: future,
          builder: (context, d) {
            final msg = message;
            message = null;
            if (msg != null) {
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
              });
            }
            final aff = d['aff'] as Map<String, dynamic>?;
            final settings = d['settings'] as Map<String, dynamic>?;
            final rate = settings?['commission_rate'];
            if (aff == null) {
              return Padding(
                padding: const EdgeInsets.all(24),
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  const Icon(Icons.card_giftcard, size: 56, color: AppColors.royal),
                  const SizedBox(height: 12),
                  Text(rate == null ? 'Earn commission when people you refer unlock a department.' : 'Earn $rate% commission when people you refer unlock a department.',
                      textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  FilledButton(onPressed: busy ? null : _become, child: const Text('Become an affiliate')),
                ]),
              );
            }
            final code = aff['referral_code'] as String;
            final link = webBaseUrl.isEmpty ? code : '$webBaseUrl/register?ref=$code';
            final balances = List<Map<String, dynamic>>.from((d['balances'] as List?) ?? []);
            final ngn = balances.where((b) => b['currency'] == 'NGN').firstOrNull;
            final balance = (ngn?['balance'] as num?) ?? 0;
            final min = (settings?['min_withdrawal_ngn'] as num?) ?? 0;
            final methods = List<Map<String, dynamic>>.from((d['methods'] as List?) ?? []);
            final withdrawals = List<Map<String, dynamic>>.from((d['withdrawals'] as List?) ?? []);
            final commissions = List<Map<String, dynamic>>.from((d['commissions'] as List?) ?? []);
            final fmt = DateFormat.yMMMd();
            return RefreshIndicator(
              onRefresh: () async => _reload(),
              child: ListView(padding: const EdgeInsets.all(16), children: [
                Card(
                  child: ListTile(
                    title: Text(code, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
                    subtitle: Text(link, maxLines: 1, overflow: TextOverflow.ellipsis),
                    trailing: IconButton(
                      icon: const Icon(Icons.copy),
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: link));
                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Copied.')));
                      },
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                Row(children: [
                  StatTile('Balance', '₦$balance'),
                  const SizedBox(width: 8),
                  StatTile('Earned', '₦${(ngn?['total_earned'] as num?) ?? 0}'),
                  const SizedBox(width: 8),
                  StatTile('Referrals', '${d['referralCount']}'),
                ]),
                const SizedBox(height: 12),
                FilledButton(
                  onPressed: balance >= min && balance > 0 ? () => _withdraw(methods, balance, min) : null,
                  child: Text('Withdraw (min ₦$min)'),
                ),
                const SizedBox(height: 24),
                Row(children: [
                  const Text('Payout methods', style: TextStyle(fontWeight: FontWeight.bold)),
                  const Spacer(),
                  TextButton.icon(onPressed: _addMethod, icon: const Icon(Icons.add), label: const Text('Add')),
                ]),
                if (methods.isEmpty) const Text('No payout method yet.', style: TextStyle(color: AppColors.text3)),
                for (final m in methods)
                  Card(
                    child: ListTile(
                      title: Text('${m['bank_name']} · ${m['account_number']}'),
                      subtitle: Text(m['account_name'] as String),
                      trailing: IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => _deleteMethod(m['id'] as String)),
                    ),
                  ),
                const SizedBox(height: 24),
                const Text('Withdrawals', style: TextStyle(fontWeight: FontWeight.bold)),
                if (withdrawals.isEmpty) const Text('None yet.', style: TextStyle(color: AppColors.text3)),
                for (final w in withdrawals)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('₦${w['amount']}'),
                    subtitle: Text(fmt.format(DateTime.parse(w['requested_at'] as String).toLocal())),
                    trailing: Text(w['status'] as String),
                  ),
                const SizedBox(height: 24),
                const Text('Commissions', style: TextStyle(fontWeight: FontWeight.bold)),
                if (commissions.isEmpty) const Text('None yet.', style: TextStyle(color: AppColors.text3)),
                for (final c in commissions)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text('${c['commission_currency'] == 'NGN' ? '₦' : ''}${c['commission_amount']}'),
                    subtitle: Text(fmt.format(DateTime.parse(c['created_at'] as String).toLocal())),
                    trailing: Text(c['status'] as String),
                  ),
              ]),
            );
          },
        ),
      );
}

class _AddPayoutMethodSheet extends StatefulWidget {
  const _AddPayoutMethodSheet();
  @override
  State<_AddPayoutMethodSheet> createState() => _AddPayoutMethodSheetState();
}

class _AddPayoutMethodSheetState extends State<_AddPayoutMethodSheet> {
  final account = TextEditingController();
  List<Map<String, dynamic>> banks = [];
  Map<String, dynamic>? bank;
  String? resolvedName;
  String? error;
  bool resolving = false;
  bool saving = false;

  @override
  void initState() {
    super.initState();
    _loadBanks();
    account.addListener(_maybeResolve);
  }

  Future<void> _loadBanks() async {
    try {
      final res = await db.functions.invoke('list-banks');
      final d = res.data as Map;
      if (d['success'] != true) throw d['error'] ?? "Couldn't load banks.";
      if (mounted) setState(() => banks = List<Map<String, dynamic>>.from(d['banks'] as List));
    } catch (e) {
      if (mounted) setState(() => error = functionErrorMessage(e, "Couldn't load the bank list."));
    }
  }

  // The account name is read back from the bank, never typed by the user.
  Future<void> _maybeResolve() async {
    setState(() {
      resolvedName = null;
      error = null;
    });
    if (bank == null || account.text.length != 10) return;
    setState(() => resolving = true);
    final snapshot = account.text;
    try {
      final res = await db.functions.invoke('resolve-bank-account',
          body: {'account_number': snapshot, 'bank_code': bank!['code']});
      final d = res.data as Map;
      if (d['success'] != true) throw d['error'] ?? 'Could not resolve this account.';
      if (mounted && snapshot == account.text) setState(() => resolvedName = d['account_name'] as String);
    } catch (e) {
      if (mounted) setState(() => error = functionErrorMessage(e, 'Could not resolve this account.'));
    }
    if (mounted) setState(() => resolving = false);
  }

  Future<void> _save() async {
    setState(() => saving = true);
    try {
      await db.from('payout_methods').insert({
        'user_id': db.auth.currentUser!.id,
        'currency': 'NGN',
        'method': 'bank_transfer',
        'bank_code': bank!['code'],
        'bank_name': bank!['name'],
        'account_number': account.text,
        'account_name': resolvedName,
      });
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted) {
        setState(() {
          saving = false;
          error = '$e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) => Padding(
        padding: EdgeInsets.fromLTRB(16, 16, 16, 16 + MediaQuery.of(context).viewInsets.bottom),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('Add payout method', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          DropdownButtonFormField<Map<String, dynamic>>(
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Bank'),
            items: [for (final b in banks) DropdownMenuItem(value: b, child: Text(b['name'] as String, overflow: TextOverflow.ellipsis))],
            onChanged: (b) {
              bank = b;
              _maybeResolve();
            },
          ),
          const SizedBox(height: 12),
          TextField(
            controller: account,
            keyboardType: TextInputType.number,
            maxLength: 10,
            decoration: const InputDecoration(labelText: 'Account number'),
          ),
          if (resolving) const LinearProgressIndicator(),
          if (resolvedName != null) Text(resolvedName!, style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.success)),
          if (error != null) Text(error!, style: const TextStyle(color: AppColors.danger)),
          const SizedBox(height: 12),
          FilledButton(onPressed: resolvedName == null || saving ? null : _save, child: const Text('Save')),
        ]),
      );
}
