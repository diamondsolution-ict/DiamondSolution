import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../core/access.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/ui.dart';

// Mirrors src/pages/PaymentHistory.tsx.

const _purposeLabel = {
  'department_access': 'Department access',
  'suspension_reactivation': 'Account reactivation',
  'device_unlock': 'Device unlock',
};

String _n(num v) => NumberFormat('#,##0.###').format(v);

const _selectCols = 'id, provider, provider_reference, purpose, department_id, amount, currency, status, created_at, verified_at, raw_provider_response, departments ( name ), access_grants ( expires_at )';

String? _accessSummary(Map<String, dynamic> p) {
  if (p['purpose'] != 'department_access' || p['status'] != 'success') return null;
  final grants = p['access_grants'] as List?;
  if (grants == null || grants.isEmpty) return null;
  return describeAccessStatus((grants.first as Map)['expires_at'] as String?);
}

class PaymentHistoryScreen extends StatefulWidget {
  const PaymentHistoryScreen({super.key});
  @override
  State<PaymentHistoryScreen> createState() => _PaymentHistoryScreenState();
}

class _PaymentHistoryScreenState extends State<PaymentHistoryScreen> {
  List<Map<String, dynamic>> payments = [];
  bool loading = true;
  String status = 'all';
  String search = '';

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      // A student's own history realistically never exceeds a few dozen rows: one fetch is enough.
      final rows = await db.from('payments').select(_selectCols).eq('user_id', db.auth.currentUser!.id).order('created_at', ascending: false).limit(500);
      payments = List<Map<String, dynamic>>.from(rows);
    } catch (_) {
      payments = [];
    }
    if (mounted) setState(() => loading = false);
  }

  List<Map<String, dynamic>> get filtered {
    final needle = search.trim().toLowerCase();
    return payments.where((p) {
      if (status != 'all' && p['status'] != status) return false;
      if (needle.isEmpty) return true;
      return ((p['departments'] as Map?)?['name'] as String? ?? '').toLowerCase().contains(needle) ||
          (_purposeLabel[p['purpose']] ?? '').toLowerCase().contains(needle) ||
          (p['provider_reference'] as String).toLowerCase().contains(needle);
    }).toList();
  }

  @override
  Widget build(BuildContext context) {
    final list = filtered;
    return PageShell(
      title: 'Payment History',
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 32), children: [
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final s in ['all', 'success', 'pending', 'failed'])
            GestureDetector(
              onTap: () => setState(() => status = s),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                decoration: BoxDecoration(color: status == s ? AppColors.royal : AppColors.canvasSoft, borderRadius: BorderRadius.circular(12)),
                child: Text(s[0].toUpperCase() + s.substring(1), style: body(14, weight: FontWeight.w600, color: status == s ? Colors.white : AppColors.text2)),
              ),
            ),
        ]),
        const SizedBox(height: 12),
        TextField(
          onChanged: (v) => setState(() => search = v),
          style: body(14),
          decoration: const InputDecoration(
            hintText: 'Search department, type, or reference…',
            prefixIcon: Icon(Icons.search, size: 14, color: AppColors.text3),
            prefixIconConstraints: BoxConstraints(minWidth: 40),
            contentPadding: EdgeInsets.symmetric(vertical: 15, horizontal: 12),
          ),
        ),
        const SizedBox(height: 16),
        if (loading)
          Text('Loading…', style: body(14, color: AppColors.text3))
        else if (list.isEmpty)
          EmptyCard(icon: Icons.receipt_long_outlined, message: payments.isEmpty ? 'No payments yet.' : 'No payments match.')
        else
          for (final p in list)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: CardLuxury(
                padding: const EdgeInsets.all(16),
                onTap: () async {
                  await _openDetail(p);
                  _load();
                },
                child: Row(children: [
                  Container(width: 36, height: 36, decoration: const BoxDecoration(color: AppColors.royalSoft, shape: BoxShape.circle), child: const Icon(Icons.receipt_long_outlined, size: 15, color: AppColors.royal)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text((p['departments'] as Map?)?['name'] as String? ?? _purposeLabel[p['purpose']] ?? '', style: body(14, weight: FontWeight.w600)),
                      const SizedBox(height: 2),
                      Text('${_purposeLabel[p['purpose']] ?? p['purpose']} · ${DateFormat('MMM d, yyyy · HH:mm').format(DateTime.parse(p['created_at'] as String).toLocal())} · ${p['provider']}', style: body(12, color: AppColors.text3)),
                      if (_accessSummary(p) != null) Padding(padding: const EdgeInsets.only(top: 2), child: Text(_accessSummary(p)!, style: body(12, weight: FontWeight.w500, color: AppColors.royal))),
                    ]),
                  ),
                  const SizedBox(width: 8),
                  Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                    Text('${_n(p['amount'] as num)} ${p['currency']}', style: body(14, weight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    _StatusBadge(p['status'] as String),
                  ]),
                ]),
              ),
            ),
      ]),
    );
  }

  Future<void> _openDetail(Map<String, dynamic> p) => showDialog<void>(
        context: context,
        barrierColor: AppColors.navy.withValues(alpha: 0.5),
        builder: (_) => _DetailDialog(payment: p),
      );
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge(this.status);
  final String status;
  @override
  Widget build(BuildContext context) {
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

class _DetailDialog extends StatefulWidget {
  const _DetailDialog({required this.payment});
  final Map<String, dynamic> payment;
  @override
  State<_DetailDialog> createState() => _DetailDialogState();
}

class _DetailDialogState extends State<_DetailDialog> {
  late Map<String, dynamic> p = widget.payment;
  bool rechecking = false;
  ({bool ok, String message})? result;

  // verify-payment is idempotent and re-checks with Paystack, so calling it again is a safe recheck.
  Future<void> _recheck() async {
    setState(() {
      rechecking = true;
      result = null;
    });
    try {
      final res = await db.functions.invoke('verify-payment', body: {'reference': p['provider_reference'], 'department_id': p['department_id'], 'purpose': p['purpose']});
      final d = res.data as Map;
      if (d['success'] != true) throw d['error'] ?? "Couldn't check this payment right now.";
      final fresh = await db.from('payments').select(_selectCols).eq('id', p['id']).maybeSingle();
      if (!mounted) return;
      setState(() {
        if (fresh != null) p = fresh;
        result = (ok: true, message: d['alreadyProcessed'] == true ? 'Paystack confirms this was successful — already recorded, nothing to change.' : 'Paystack confirms this was successful — recorded now and access granted.');
      });
    } catch (e) {
      if (mounted) setState(() => result = (ok: false, message: functionErrorMessage(e, "Couldn't check this payment right now.")));
    }
    if (mounted) setState(() => rechecking = false);
  }

  Widget _kv(String label, Widget value) => Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label.toUpperCase(), style: body(12, weight: FontWeight.w600, color: AppColors.text3, letterSpacing: 0.5)),
        const SizedBox(height: 2),
        value,
      ]);

  @override
  Widget build(BuildContext context) {
    final raw = p['raw_provider_response'] as Map?;
    final auth = raw?['authorization'] as Map?;
    final channel = (raw?['channel'] ?? auth?['channel']) as String?;
    final gateway = raw?['gateway_response'] as String?;
    final paidAt = raw?['paid_at'] as String?;
    final bank = auth?['bank'] as String?;
    final cardType = auth?['card_type'] as String?;
    final last4 = auth?['last4'] as String?;
    final summary = _accessSummary(p);
    final fmt = DateFormat('yyyy-MM-dd HH:mm:ss');
    final dept = (p['departments'] as Map?)?['name'] as String?;
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.all(16),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 448),
        child: Container(
          decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
          padding: const EdgeInsets.all(24),
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              Row(children: [
                Expanded(child: Text('Payment details', style: heading(18))),
                GestureDetector(onTap: () => Navigator.pop(context), child: const Padding(padding: EdgeInsets.all(4), child: Icon(Icons.close, size: 18, color: AppColors.text3))),
              ]),
              const SizedBox(height: 2),
              Text(p['provider_reference'] as String, style: const TextStyle(fontFamily: 'monospace', fontSize: 12, color: AppColors.text3)),
              const SizedBox(height: 16),
              Wrap(spacing: 16, runSpacing: 12, children: [
                SizedBox(width: 150, child: _kv('Amount', Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text('${_n(p['amount'] as num)} ${p['currency']}', style: body(14, weight: FontWeight.w700)), const SizedBox(height: 4), _StatusBadge(p['status'] as String)]))),
                SizedBox(width: 150, child: _kv('What for', Text(_purposeLabel[p['purpose']] ?? '${p['purpose']}', style: body(14)))),
                if (dept != null) SizedBox(width: 150, child: _kv('Department', Text(dept, style: body(14)))),
                SizedBox(width: 150, child: _kv('Provider', Text('${p['provider']}'[0].toUpperCase() + '${p['provider']}'.substring(1), style: body(14)))),
                SizedBox(width: 150, child: _kv('Created', Text(fmt.format(DateTime.parse(p['created_at'] as String).toLocal()), style: body(14)))),
                if (p['verified_at'] != null) SizedBox(width: 150, child: _kv('Verified', Text(fmt.format(DateTime.parse(p['verified_at'] as String).toLocal()), style: body(14)))),
              ]),
              if (summary != null) ...[
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(color: AppColors.emerald50, borderRadius: BorderRadius.circular(8)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('ACCESS GRANTED', style: body(12, weight: FontWeight.w600, color: AppColors.emerald700, letterSpacing: 0.5)),
                    Text(summary, style: body(14, weight: FontWeight.w600, color: const Color(0xFF065F46))),
                  ]),
                ),
              ],
              if (channel != null || gateway != null || paidAt != null || bank != null || cardType != null) ...[
                const SizedBox(height: 16),
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(color: AppColors.canvasSoft, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('GATEWAY DETAIL', style: body(12, weight: FontWeight.w600, color: AppColors.text3, letterSpacing: 0.5)),
                    const SizedBox(height: 6),
                    if (channel != null) Text('Channel: $channel', style: body(12, color: AppColors.text2)),
                    if (bank != null) Text('Bank: $bank', style: body(12, color: AppColors.text2)),
                    if (cardType != null) Text('Card: $cardType …$last4', style: body(12, color: AppColors.text2)),
                    if (paidAt != null) Text('Paid at: $paidAt', style: body(12, color: AppColors.text2)),
                    if (gateway != null) Text('Gateway response: $gateway', style: body(12, color: AppColors.text2)),
                  ]),
                ),
              ],
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(color: AppColors.royalSoft.withValues(alpha: 0.4), border: Border.all(color: AppColors.royal.withValues(alpha: 0.2)), borderRadius: BorderRadius.circular(12)),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Check live on Paystack', style: body(12, weight: FontWeight.w600, color: AppColors.royal)),
                  const SizedBox(height: 2),
                  Text("Paid but it's not reflecting? Recheck this reference directly against Paystack — a confirmed success is recorded and access granted immediately if it wasn't already.", style: body(12, color: AppColors.text3)),
                  const SizedBox(height: 8),
                  OutlinedButton.icon(
                    onPressed: rechecking ? null : _recheck,
                    icon: Icon(Icons.refresh, size: 12, color: rechecking ? AppColors.text3 : AppColors.text2),
                    label: Text(rechecking ? 'Checking…' : 'Recheck payment', style: body(12, weight: FontWeight.w600, color: AppColors.text2)),
                    style: OutlinedButton.styleFrom(minimumSize: const Size(0, 34), padding: const EdgeInsets.symmetric(horizontal: 12)),
                  ),
                  if (result != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(result!.message, style: body(12, weight: FontWeight.w500, color: result!.ok ? AppColors.emerald700 : const Color(0xFFE11D48)))),
                ]),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}
