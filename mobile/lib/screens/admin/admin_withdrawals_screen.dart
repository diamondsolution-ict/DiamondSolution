import 'package:flutter/material.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'admin_common.dart';
import 'admin_payments_screen.dart' show StatusPill;

// Mirrors src/pages/admin/AdminWithdrawals.tsx.
class AdminWithdrawalsScreen extends StatefulWidget {
  const AdminWithdrawalsScreen({super.key});
  @override
  State<AdminWithdrawalsScreen> createState() => _AdminWithdrawalsScreenState();
}

class _AdminWithdrawalsScreenState extends State<AdminWithdrawalsScreen> {
  List<Map<String, dynamic>> rows = [];
  Map<String, String> names = {}, emails = {};
  bool autoPayout = true;
  String status = 'pending';
  String search = '';
  bool loading = true;
  String? busyId, error;
  final recheckResult = <String, String>{};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final r = await Future.wait<dynamic>([
      db.from('withdrawals').select('id, user_id, amount, currency, status, provider_reference, provider_response, requested_at, processed_at, payout_methods(method, bank_code, bank_name, account_number, account_name)').order('requested_at', ascending: false).limit(200),
      db.from('app_settings').select('withdrawal_auto_payout_enabled').eq('id', 1).maybeSingle(),
    ]);
    final w = List<Map<String, dynamic>>.from(r[0] as List);
    final ids = {for (final x in w) x['user_id'] as String}.toList();
    if (ids.isNotEmpty) {
      final p = await Future.wait<dynamic>([db.from('profiles').select('user_id, display_name').inFilter('user_id', ids), db.rpc('admin_list_emails', params: {'p_user_ids': ids})]);
      names = {for (final x in p[0] as List) x['user_id'] as String: (x['display_name'] as String?) ?? 'Unnamed'};
      emails = {for (final x in p[1] as List) x['user_id'] as String: x['email'] as String};
    }
    if (!mounted) return;
    setState(() {
      rows = w;
      final s = r[1] as Map?;
      if (s != null) autoPayout = s['withdrawal_auto_payout_enabled'] == true;
      loading = false;
    });
  }

  Future<Map?> _payout(String id, Map<String, dynamic> body, String failPrefix, {String? suffix}) async {
    setState(() {
      busyId = id;
      error = null;
    });
    Map? data;
    try {
      final r = await db.functions.invoke('request-payout', body: {'withdrawal_id': id, ...body});
      data = r.data as Map?;
      if (data?['success'] != true) throw Exception('unknown error');
    } catch (e) {
      error = '$failPrefix: ${functionErrorMessage(e, 'unknown error')}${suffix ?? ''}';
      data = null;
    }
    if (mounted) setState(() => busyId = null);
    return data;
  }

  Future<void> _approve(String id) async {
    await _payout(id, {'action': 'approve'}, 'Payout failed', suffix: ' — withdrawal marked failed, settle manually if needed.');
    _load();
  }

  Future<void> _reject(String id) async {
    final reason = await promptDialog(context, 'Reason for rejecting this withdrawal?');
    if (reason == null) return;
    await _payout(id, {'action': 'reject', 'reason': reason}, 'Reject failed');
    _load();
  }

  Future<void> _markPaid(String id) async {
    final ref = await promptDialog(context, 'External payment reference (e.g. bank transaction id)?');
    if (ref == null || ref.isEmpty) return;
    setState(() {
      busyId = id;
      error = null;
    });
    try {
      await db.rpc('mark_withdrawal_paid_manually', params: {'p_withdrawal_id': id, 'p_reference': ref});
    } catch (e) {
      error = '$e';
    }
    if (mounted) setState(() => busyId = null);
    _load();
  }

  Future<void> _recheck(String id) async {
    setState(() => recheckResult[id] = '');
    final d = await _payout(id, {'action': 'recheck'}, 'Recheck failed');
    if (d == null) return;
    setState(() => recheckResult[id] = d['changed'] == true ? 'Paystack now reports "${d['paystackStatus']}" — updated to ${d['status']}.' : 'Paystack still reports "${d['paystackStatus']}" — no change.');
    if (d['changed'] == true) _load();
  }

  String _stamp(String iso) {
    final d = DateTime.parse(iso).toLocal();
    String t(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${t(d.month)}-${t(d.day)} ${t(d.hour)}:${t(d.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    final needle = search.trim().toLowerCase();
    final f = rows.where((w) {
      if (status != 'all' && w['status'] != status) return false;
      if (needle.isEmpty) return true;
      final pm = w['payout_methods'] as Map?;
      return [names[w['user_id']], emails[w['user_id']], w['provider_reference'], pm?['account_number']].any((v) => '${v ?? ''}'.toLowerCase().contains(needle));
    }).toList();
    final pending = rows.where((w) => w['status'] == 'pending');
    num sum(Iterable<Map<String, dynamic>> l) => l.fold<num>(0, (s, w) => s + asNum(w['amount']));
    final pendingNgn = sum(pending);
    final paid = sum(rows.where((w) => w['status'] == 'success'));
    Widget tile(IconData i, Color ic, String label, String value, String sub, {Color? vc}) => CardLuxury(
          padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [Icon(i, size: 12, color: ic), const SizedBox(width: 6), Text(label.toUpperCase(), style: body(10, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 0.5))]),
            const SizedBox(height: 4),
            Text(value, style: heading(20, color: vc ?? AppColors.text1)),
            Text(sub, style: body(11, color: AppColors.text3)),
          ]),
        );
    return ListView(padding: const EdgeInsets.all(20), children: [
      Text('Withdrawals', style: heading(24)),
      const SizedBox(height: 16),
      Row(children: [
        Expanded(child: tile(Icons.schedule, const Color(0xFFD97706), 'Pending', '${pending.length}', pendingNgn > 0 ? '₦${groupDigits(pendingNgn)}' : '—')),
        const SizedBox(width: 12),
        Expanded(child: tile(Icons.check_circle_outline, AppColors.emerald600, 'Paid out', '₦${groupDigits(paid)}', 'Last 200 requests', vc: AppColors.emerald600)),
      ]),
      const SizedBox(height: 12),
      tile(Icons.shield_outlined, AppColors.royal, 'Automatic payouts', autoPayout ? 'On' : 'Off', 'Change in Admin → Settings', vc: autoPayout ? AppColors.emerald600 : AppColors.text3),
      if (!autoPayout) ...[
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(color: const Color(0xFFFFFBEB), border: Border.all(color: const Color(0xFFFDE68A)), borderRadius: BorderRadius.circular(12)),
          child: Text('Automatic payouts are switched off — every withdrawal below must be settled with "Mark as paid manually", even eligible NGN bank-transfer ones.', style: body(14, color: const Color(0xFFB45309))),
        ),
      ],
      const SizedBox(height: 16),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final s in const ['pending', 'success', 'failed', 'all'])
          GestureDetector(
            onTap: () => setState(() => status = s),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              decoration: BoxDecoration(color: status == s ? AppColors.royal : AppColors.canvasSoft, borderRadius: BorderRadius.circular(12)),
              child: Text('${s[0].toUpperCase()}${s.substring(1)}', style: body(14, weight: FontWeight.w600, color: status == s ? Colors.white : AppColors.text2)),
            ),
          ),
      ]),
      const SizedBox(height: 12),
      TextField(onChanged: (v) => setState(() => search = v), decoration: const InputDecoration(prefixIcon: Icon(Icons.search, size: 16), hintText: 'Search name, email, reference…')),
      if (error != null) ...[const SizedBox(height: 16), Banner2(error!)],
      const SizedBox(height: 16),
      if (loading)
        Text('Loading…', style: body(14, color: AppColors.text3))
      else if (f.isEmpty)
        const EmptyCard(icon: Icons.inbox_outlined, message: 'No withdrawals match.')
      else
        for (final w in f) _card(w),
      const SizedBox(height: 80),
    ]);
  }

  Widget _card(Map<String, dynamic> w) {
    final id = w['id'] as String;
    final pm = w['payout_methods'] as Map?;
    final bank = pm?['method'] == 'bank_transfer';
    final canAuto = autoPayout && w['currency'] == 'NGN' && bank;
    final resp = w['provider_response'] as Map?;
    final busy = busyId == id;
    final failMsg = w['status'] == 'failed' ? (resp?['reason'] ?? resp?['message']) : null;
    Widget btn(String label, VoidCallback? onTap, {bool primary = false, bool danger = false, IconData? icon}) => GestureDetector(
          onTap: onTap,
          child: Opacity(
            opacity: onTap == null ? 0.5 : 1,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
              decoration: BoxDecoration(color: primary ? AppColors.royal : (danger ? Colors.white : AppColors.royalSoft), border: Border.all(color: primary ? AppColors.royal : AppColors.border), borderRadius: BorderRadius.circular(12)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                if (icon != null) ...[Icon(icon, size: 12, color: AppColors.text2), const SizedBox(width: 6)],
                Text(label, style: body(12, weight: FontWeight.w600, color: primary ? Colors.white : (danger ? const Color(0xFFE11D48) : (icon != null ? AppColors.text2 : AppColors.royal)))),
              ]),
            ),
          ),
        );
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: CardLuxury(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            Container(width: 36, height: 36, decoration: const BoxDecoration(color: AppColors.royalSoft, shape: BoxShape.circle), child: Icon(bank ? Icons.account_balance_outlined : Icons.account_balance_wallet_outlined, size: 15, color: AppColors.royal)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(names[w['user_id']] ?? 'Unknown', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, weight: FontWeight.w600)),
                Text(emails[w['user_id']] ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, color: AppColors.text3)),
              ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [Text('${w['currency'] == 'NGN' ? '₦' : '\$'}${groupDigits(asNum(w['amount']))}', style: body(14, weight: FontWeight.w700)), const SizedBox(height: 2), StatusPill(w['status'] as String)]),
          ]),
          const SizedBox(height: 12),
          const Divider(height: 1, color: AppColors.border),
          const SizedBox(height: 12),
          Text('Account: ${pm?['account_name'] ?? '—'} · ${pm?['bank_name'] != null ? '${pm!['bank_name']} ' : ''}${pm?['account_number'] ?? 'no account on file'}', style: body(12, color: AppColors.text3)),
          Text('Requested ${_stamp(w['requested_at'] as String)}', style: body(12, color: AppColors.text3)),
          if (w['provider_reference'] != null) Text('Ref: ${w['provider_reference']}', style: body(12, color: AppColors.text3).copyWith(fontFamily: 'monospace')),
          if (w['processed_at'] != null) Text('Processed ${_stamp(w['processed_at'] as String)}', style: body(12, color: AppColors.text3)),
          if (failMsg != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('$failMsg', style: body(12, weight: FontWeight.w600, color: const Color(0xFFE11D48)))),
          if ((recheckResult[id] ?? '').isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(recheckResult[id]!, style: body(12, weight: FontWeight.w600, color: AppColors.royal))),
          if (w['status'] == 'pending' || (w['provider_reference'] != null && resp?['manual'] != true)) ...[
            const SizedBox(height: 12),
            const Divider(height: 1, color: AppColors.border),
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 8, children: [
              if (w['status'] == 'pending') ...[
                if (canAuto) btn(busy ? 'Paying…' : 'Pay via Paystack', busy ? null : () => _approve(id), primary: true),
                btn('Mark as paid manually', busy ? null : () => _markPaid(id)),
                btn('Reject', busy ? null : () => _reject(id), danger: true),
              ],
              if (w['provider_reference'] != null && resp?['manual'] != true) btn('Recheck on Paystack', busy ? null : () => _recheck(id), danger: false, icon: Icons.refresh),
            ]),
          ],
        ]),
      ),
    );
  }
}
