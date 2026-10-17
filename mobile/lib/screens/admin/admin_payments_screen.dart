import 'package:flutter/material.dart';
import '../../core/csv.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'admin_common.dart';

// Mirrors src/pages/admin/AdminPayments.tsx ("Transactions"): filters, search, live recheck against
// Paystack, a per-payment detail page, and CSV export via the share sheet.
const _purposeLabel = {
  'department_access': 'Department access',
  'suspension_reactivation': 'Account reactivation',
  'device_unlock': 'Device unlock',
};
const _cols = 'id, user_id, provider, provider_reference, purpose, department_id, amount, currency, status, created_at, verified_at, raw_provider_response';

String _money(Map<String, dynamic> p) => '${p['currency'] == 'NGN' ? '₦' : '\$'}${groupDigits(asNum(p['amount']))}';
String _stamp(String iso) {
  final d = DateTime.parse(iso).toLocal();
  String t(int n) => n.toString().padLeft(2, '0');
  return '${d.year}-${t(d.month)}-${t(d.day)} ${t(d.hour)}:${t(d.minute)}';
}

class StatusPill extends StatelessWidget {
  const StatusPill(this.status, {super.key, this.small = false});
  final String status;
  final bool small;
  @override
  Widget build(BuildContext context) {
    final (bg, fg, border, icon) = switch (status) {
      'success' => (AppColors.emerald50, AppColors.emerald700, const Color(0xFFA7F3D0), Icons.check_circle_outline),
      'failed' => (AppColors.rose50, AppColors.rose700, AppColors.rose200, Icons.cancel_outlined),
      _ => (const Color(0xFFFFFBEB), const Color(0xFFB45309), const Color(0xFFFDE68A), Icons.schedule),
    };
    return Container(
      padding: EdgeInsets.symmetric(horizontal: small ? 6 : 8, vertical: 2),
      decoration: BoxDecoration(color: bg, border: Border.all(color: border), borderRadius: BorderRadius.circular(99)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: small ? 10 : 11, color: fg),
        const SizedBox(width: 4),
        Text('${status[0].toUpperCase()}${status.substring(1)}', style: body(small ? 11 : 12, weight: FontWeight.w600, color: fg)),
      ]),
    );
  }
}

class AdminPaymentsScreen extends StatefulWidget {
  const AdminPaymentsScreen({super.key});
  @override
  State<AdminPaymentsScreen> createState() => _AdminPaymentsScreenState();
}

class _AdminPaymentsScreenState extends State<AdminPaymentsScreen> {
  List<Map<String, dynamic>> payments = [];
  Map<String, String> names = {}, emails = {}, phones = {}, depts = {};
  String status = 'all';
  String search = '';
  bool loading = true;
  String? loadError;
  final recheckCtl = TextEditingController();
  bool rechecking = false;
  ({bool ok, String message})? recheckResult;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final rows = List<Map<String, dynamic>>.from(await db.from('payments').select(_cols).order('created_at', ascending: false).limit(500));
      final userIds = {for (final p in rows) if (p['user_id'] is String) p['user_id'] as String};
      final r = await Future.wait<dynamic>([
        selectIn('profiles', 'user_id, display_name, phone', 'user_id', userIds),
        emailsFor(userIds),
        db.from('departments').select('id, name'),
      ]);
      if (!mounted) return;
      setState(() {
        payments = rows;
        names = {for (final p in r[0] as List) p['user_id'] as String: (p['display_name'] as String?) ?? 'Unnamed'};
        phones = {for (final p in r[0] as List) p['user_id'] as String: (p['phone'] as String?) ?? ''};
        emails = r[1] as Map<String, String>;
        depts = {for (final d in r[2] as List) d['id'] as String: '${d['name']}'};
        loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          loadError = "Couldn't load payments: $e";
          loading = false;
        });
      }
    }
  }

  Future<({bool ok, String message})> _recheck(String reference) async {
    try {
      final res = await db.functions.invoke('admin-recheck-payment', body: {'reference': reference});
      final data = res.data as Map?;
      if (data == null || data['success'] != true) return (ok: false, message: (data?['error'] as String?) ?? 'Recheck failed.');
      final msg = data['paystackStatus'] == 'success'
          ? (data['alreadyProcessed'] == true ? 'Paystack confirms this was successful — already recorded, nothing changed.' : 'Paystack confirms this was successful — recorded now and access granted.')
          : 'Paystack reports this transaction as "${data['paystackStatus']}" — recorded as failed.';
      await _load();
      return (ok: true, message: msg);
    } catch (e) {
      return (ok: false, message: functionErrorMessage(e, 'Recheck failed.'));
    }
  }

  List<Map<String, dynamic>> get filtered {
    final term = search.toLowerCase();
    return payments.where((p) {
      if (status != 'all' && p['status'] != status) return false;
      if (term.isEmpty) return true;
      final u = p['user_id'];
      return '${p['provider_reference']}'.toLowerCase().contains(term) ||
          (names[u] ?? '').toLowerCase().contains(term) ||
          (emails[u] ?? '').toLowerCase().contains(term) ||
          (p['department_id'] != null && (depts[p['department_id']] ?? '').toLowerCase().contains(term));
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final f = filtered;
    return ListView(padding: const EdgeInsets.all(20), children: [
      Row(children: [
        Expanded(child: Text('Transactions', style: heading(24))),
        OutlinedButton.icon(
          onPressed: f.isEmpty ? null : () => shareCsv('financial_ledger.csv', [['Reference', 'Payer', 'Email', 'Purpose', 'Department', 'Amount', 'Currency', 'Status', 'Date'], for (final p in f) ['${p['provider_reference']}', names[p['user_id']] ?? '', emails[p['user_id']] ?? '', _purposeLabel[p['purpose']] ?? '${p['purpose']}', p['department_id'] != null ? (depts[p['department_id']] ?? '') : '', '${p['amount']}', '${p['currency']}', '${p['status']}', _stamp(p['created_at'] as String)]]),
          style: OutlinedButton.styleFrom(minimumSize: const Size(0, 40), padding: const EdgeInsets.symmetric(horizontal: 12)),
          icon: const Icon(Icons.download, size: 14),
          label: Text('Export', style: body(14, weight: FontWeight.w600, color: AppColors.text2)),
        ),
      ]),
      const SizedBox(height: 16),
      CardLuxury(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [const Icon(Icons.verified_user_outlined, size: 16, color: AppColors.royal), const SizedBox(width: 8), Text('Recheck a transaction', style: body(14, weight: FontWeight.w600))]),
          const SizedBox(height: 2),
          Text("A student says they paid but it's not reflecting? Paste the Paystack reference below to check it live against Paystack — a confirmed success is recorded and access is granted immediately if it wasn't already.", style: body(12, color: AppColors.text3)),
          const SizedBox(height: 12),
          TextField(controller: recheckCtl, onChanged: (_) => setState(() {}), decoration: const InputDecoration(hintText: 'Paystack reference…')),
          const SizedBox(height: 8),
          BtnPrimary(
            label: rechecking ? 'Checking…' : 'Recheck',
            onPressed: rechecking || recheckCtl.text.trim().isEmpty
                ? null
                : () async {
                    setState(() {
                      rechecking = true;
                      recheckResult = null;
                    });
                    final r = await _recheck(recheckCtl.text.trim());
                    if (mounted) {
                      setState(() {
                        recheckResult = r;
                        rechecking = false;
                      });
                    }
                  },
          ),
          if (recheckResult != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(recheckResult!.message, style: body(14, weight: FontWeight.w500, color: recheckResult!.ok ? AppColors.emerald700 : const Color(0xFFE11D48)))),
        ]),
      ),
      const SizedBox(height: 16),
      Wrap(spacing: 8, runSpacing: 8, children: [
        for (final s in const ['all', 'success', 'failed', 'pending'])
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
      TextField(onChanged: (v) => setState(() => search = v), decoration: const InputDecoration(prefixIcon: Icon(Icons.search, size: 16), hintText: 'Search reference, payer, email, department…')),
      const SizedBox(height: 16),
      if (loadError != null)
        Banner2(loadError!)
      else if (loading)
        Text('Loading…', style: body(14, color: AppColors.text3))
      else if (f.isEmpty)
        const EmptyCard(icon: Icons.inbox_outlined, message: 'No transactions match.')
      else
        for (final p in f)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: CardLuxury(
              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => _PaymentDetail(payment: p, names: names, emails: emails, phones: phones, depts: depts, recheck: _recheck))),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(names[p['user_id']] ?? 'Unknown', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, weight: FontWeight.w600)),
                      Text(emails[p['user_id']] ?? '', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, color: AppColors.text3)),
                    ]),
                  ),
                  Text(_money(p), style: body(14, weight: FontWeight.w700)),
                ]),
                const SizedBox(height: 8),
                Text('${p['provider_reference']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, color: AppColors.text3).copyWith(fontFamily: 'monospace')),
                const SizedBox(height: 12),
                const Divider(height: 1, color: AppColors.border),
                const SizedBox(height: 12),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [StatusPill(p['status'] as String), Text(_stamp(p['created_at'] as String), style: body(12, color: AppColors.text3))]),
              ]),
            ),
          ),
      const SizedBox(height: 80),
    ]);
  }
}

class _PaymentDetail extends StatefulWidget {
  const _PaymentDetail({required this.payment, required this.names, required this.emails, required this.phones, required this.depts, required this.recheck});
  final Map<String, dynamic> payment;
  final Map<String, String> names, emails, phones, depts;
  final Future<({bool ok, String message})> Function(String) recheck;
  @override
  State<_PaymentDetail> createState() => _PaymentDetailState();
}

class _PaymentDetailState extends State<_PaymentDetail> {
  late Map<String, dynamic> p = widget.payment;
  List<Map<String, dynamic>> others = [], withdrawals = [];
  bool historyLoading = true;
  bool rechecking = false;
  ({bool ok, String message})? result;

  @override
  void initState() {
    super.initState();
    _history();
  }

  Future<void> _history() async {
    final r = await Future.wait<dynamic>([
      db.from('payments').select(_cols).eq('user_id', p['user_id'] as String).order('created_at', ascending: false).limit(50),
      db.from('withdrawals').select('id, user_id, amount, currency, status, provider_reference, requested_at, processed_at, payout_methods(method, account_number, account_name)').eq('user_id', p['user_id'] as String).order('requested_at', ascending: false).limit(50),
    ]);
    if (!mounted) return;
    setState(() {
      others = List<Map<String, dynamic>>.from(r[0] as List);
      withdrawals = List<Map<String, dynamic>>.from(r[1] as List);
      historyLoading = false;
    });
  }

  Widget _kv(String k, Widget v) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(k.toUpperCase(), style: body(12, weight: FontWeight.w600, color: AppColors.text3, letterSpacing: 0.5)), v]);

  @override
  Widget build(BuildContext context) {
    final uid = p['user_id'];
    final raw = p['raw_provider_response'] as Map<String, dynamic>?;
    final auth = raw?['authorization'] as Map<String, dynamic>?;
    final channel = (raw?['channel'] ?? auth?['channel']) as String?;
    final fees = raw?['fees'] is num ? (raw!['fees'] as num) / 100 : null;
    final gateway = <String>[
      if (channel != null) 'Channel: $channel',
      if (auth?['bank'] != null) 'Bank: ${auth!['bank']}',
      if (auth?['card_type'] != null) 'Card: ${auth!['card_type']} …${auth['last4']}',
      if (fees != null) 'Fees: $fees',
      if (raw?['paid_at'] != null) 'Paid at: ${raw!['paid_at']}',
      if (raw?['gateway_response'] != null) 'Gateway response: ${raw!['gateway_response']}',
    ];
    return PageShell(
      title: 'Payment details',
      child: ListView(padding: const EdgeInsets.all(20), children: [
        Text('${p['provider_reference']}', style: body(12, color: AppColors.text3).copyWith(fontFamily: 'monospace')),
        const SizedBox(height: 16),
        CardLuxury(
          child: Wrap(runSpacing: 16, spacing: 16, children: [
            SizedBox(width: 150, child: _kv('Payer', Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(widget.names[uid] ?? 'Unknown', style: body(14, weight: FontWeight.w600)),
              Text(widget.emails[uid] ?? '—', style: body(12, color: AppColors.text3)),
              if ((widget.phones[uid] ?? '').isNotEmpty) Text(widget.phones[uid]!, style: body(12, color: AppColors.text3)),
            ]))),
            SizedBox(width: 130, child: _kv('Amount', Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(_money(p), style: body(14, weight: FontWeight.w700)), const SizedBox(height: 4), StatusPill(p['status'] as String)]))),
            SizedBox(width: 150, child: _kv('Purpose', Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(_purposeLabel[p['purpose']] ?? '${p['purpose']}', style: body(14)), if (p['department_id'] != null) Text(widget.depts[p['department_id']] ?? '', style: body(12, color: AppColors.text3))]))),
            SizedBox(width: 130, child: _kv('Provider', Text('${p['provider']}'.replaceFirstMapped(RegExp(r'^.'), (m) => m[0]!.toUpperCase()), style: body(14)))),
            SizedBox(width: 150, child: _kv('Created', Text(_stamp(p['created_at'] as String), style: body(14)))),
            SizedBox(width: 130, child: _kv('Verified', Text(p['verified_at'] != null ? _stamp(p['verified_at'] as String) : '—', style: body(14)))),
          ]),
        ),
        if (gateway.isNotEmpty) ...[
          const SizedBox(height: 16),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.canvasSoft, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text('GATEWAY DETAIL (STORED)', style: body(12, weight: FontWeight.w600, color: AppColors.text3, letterSpacing: 0.5)),
              const SizedBox(height: 6),
              for (final g in gateway) Padding(padding: const EdgeInsets.only(bottom: 2), child: Text(g, style: body(12, color: AppColors.text2))),
            ]),
          ),
        ],
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.royalSoft.withValues(alpha: 0.4), border: Border.all(color: AppColors.royal.withValues(alpha: 0.2)), borderRadius: BorderRadius.circular(12)),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [const Icon(Icons.verified_user_outlined, size: 13, color: AppColors.royal), const SizedBox(width: 6), Text('Check live on Paystack', style: body(12, weight: FontWeight.w600, color: AppColors.royal))]),
            const SizedBox(height: 2),
            Text("Queries Paystack directly for this reference's current state, independent of what's stored here.", style: body(12, color: AppColors.text3)),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: rechecking
                  ? null
                  : () async {
                      setState(() {
                        rechecking = true;
                        result = null;
                      });
                      final r = await widget.recheck(p['provider_reference'] as String);
                      final fresh = await db.from('payments').select(_cols).eq('provider', 'paystack').eq('provider_reference', p['provider_reference'] as String).maybeSingle();
                      if (mounted) {
                        setState(() {
                          result = r;
                          rechecking = false;
                          if (fresh != null) p = fresh;
                        });
                      }
                    },
              style: OutlinedButton.styleFrom(minimumSize: const Size(0, 36), padding: const EdgeInsets.symmetric(horizontal: 12)),
              icon: const Icon(Icons.refresh, size: 12),
              label: Text(rechecking ? 'Checking…' : 'Recheck on Paystack', style: body(12, weight: FontWeight.w600, color: AppColors.text2)),
            ),
            if (result != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(result!.message, style: body(12, weight: FontWeight.w500, color: result!.ok ? AppColors.emerald700 : const Color(0xFFE11D48)))),
          ]),
        ),
        const SizedBox(height: 20),
        Text("THIS PAYER'S OTHER PAYMENTS", style: body(12, weight: FontWeight.w600, color: AppColors.text3, letterSpacing: 0.5)),
        const SizedBox(height: 8),
        if (historyLoading)
          Text('Loading…', style: body(12, color: AppColors.text3))
        else if (others.length <= 1)
          Text('No other payments on record.', style: body(12, color: AppColors.text3))
        else
          for (final o in others.where((o) => o['id'] != p['id']))
            _historyRow('${o['provider_reference']}', '${_purposeLabel[o['purpose']] ?? o['purpose']} · ${_stamp(o['created_at'] as String)}', _money(o), o['status'] as String, mono: true),
        const SizedBox(height: 20),
        Text("THIS PAYER'S REQUESTS TO BE PAID (WITHDRAWALS)", style: body(12, weight: FontWeight.w600, color: AppColors.text3, letterSpacing: 0.5)),
        const SizedBox(height: 8),
        if (historyLoading)
          Text('Loading…', style: body(12, color: AppColors.text3))
        else if (withdrawals.isEmpty)
          Text('No withdrawal requests on record.', style: body(12, color: AppColors.text3))
        else
          for (final w in withdrawals)
            _historyRow('${(w['payout_methods'] as Map?)?['method'] ?? '—'} · ${(w['payout_methods'] as Map?)?['account_number'] ?? 'no account on file'}', 'Requested ${_stamp(w['requested_at'] as String)}', _money(w), w['status'] as String),
        const SizedBox(height: 40),
      ]),
    );
  }

  Widget _historyRow(String title, String sub, String amount, String status, {bool mono = false}) => Container(
        margin: const EdgeInsets.only(bottom: 6),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, color: AppColors.text2).copyWith(fontFamily: mono ? 'monospace' : null)),
              Text(sub, style: body(12, color: AppColors.text3)),
            ]),
          ),
          const SizedBox(width: 8),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [Text(amount, style: body(12, weight: FontWeight.w600)), const SizedBox(height: 2), StatusPill(status, small: true)]),
        ]),
      );
}
