import 'package:flutter/material.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'admin_common.dart';

// Mirrors src/pages/admin/AdminDashboard.tsx.
class AdminDashboardScreen extends StatefulWidget {
  const AdminDashboardScreen({super.key, this.onOpenPayments});
  final VoidCallback? onOpenPayments;
  @override
  State<AdminDashboardScreen> createState() => _AdminDashboardScreenState();
}

class _AdminDashboardScreenState extends State<AdminDashboardScreen> {
  Map<String, dynamic>? stats;
  List<Map<String, dynamic>> revenue = [];
  List<Map<String, dynamic>> recent = [];
  bool loading = true;
  String? error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final r = await Future.wait<dynamic>([
        db.rpc('admin_dashboard_stats'),
        db.rpc('admin_revenue_by_department'),
        db.from('payments').select('id, amount, currency, status, user_id, department_id, departments ( name )').order('created_at', ascending: false).limit(5),
      ]);
      final statRows = List<Map<String, dynamic>>.from(r[0] as List);
      final payments = List<Map<String, dynamic>>.from(r[2] as List);
      final ids = {for (final p in payments) if (p['user_id'] is String) p['user_id'] as String}.toList();
      final names = <String, String?>{};
      if (ids.isNotEmpty) {
        final profs = await db.from('profiles').select('user_id, display_name').inFilter('user_id', ids);
        for (final p in profs) {
          names[p['user_id'] as String] = p['display_name'] as String?;
        }
      }
      if (!mounted) return;
      setState(() {
        stats = statRows.isEmpty ? null : statRows.first;
        revenue = List<Map<String, dynamic>>.from(r[1] as List);
        recent = [for (final p in payments) {...p, 'display_name': names[p['user_id']]}];
        loading = false;
      });
    } catch (e) {
      if (mounted) {
        setState(() {
          error = '$e';
          loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) return const Center(child: CircularProgressIndicator());
    if (stats == null) return Center(child: Text(error ?? 'No data.', style: body(14, color: AppColors.text3)));
    final s = stats!;
    final cards = [
      AdminStatCard(icon: Icons.people_outline, tone: StatTone.royal, label: 'Total Students', value: groupDigits(asNum(s['total_students'])), sub: '${asNum(s['suspended_students'])} suspended'),
      AdminStatCard(icon: Icons.gpp_maybe_outlined, tone: StatTone.rose, label: 'Protocol Violation', value: groupDigits(asNum(s['suspended_students'])), sub: 'Total suspended'),
      AdminStatCard(icon: Icons.payments_outlined, tone: StatTone.emerald, label: 'Total Revenue', value: formatMixed(asNum(s['revenue_ngn']), asNum(s['revenue_usd'])), sub: 'All-time success'),
      AdminStatCard(icon: Icons.volunteer_activism_outlined, tone: StatTone.gold, label: 'Total Paid Out', value: formatMixed(asNum(s['paid_out_ngn']), asNum(s['paid_out_usd'])), sub: 'Successful withdrawals'),
      AdminStatCard(icon: Icons.link, tone: StatTone.royal, label: 'Active Affiliates', value: groupDigits(asNum(s['active_affiliates'])), sub: 'Opted-in partners'),
      AdminStatCard(icon: Icons.schedule, tone: StatTone.amber, label: 'Pending Payouts', value: groupDigits(asNum(s['pending_payouts'])), sub: 'Awaiting approval'),
    ];
    final maxRevenue = revenue.fold<num>(1, (m, r) => asNum(r['total_amount']) > m ? asNum(r['total_amount']) : m);
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(padding: const EdgeInsets.all(20), children: [
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 12,
          childAspectRatio: 1.45,
          children: cards,
        ),
        const SizedBox(height: 24),
        CardLuxury(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.receipt_long_outlined, size: 16, color: AppColors.royal),
              const SizedBox(width: 8),
              Expanded(child: Text('Recent Payments', style: heading(14))),
              if (widget.onOpenPayments != null) GestureDetector(onTap: widget.onOpenPayments, child: Text('View Ledger →', style: body(12, weight: FontWeight.w600, color: AppColors.royal))),
            ]),
            if (recent.isEmpty)
              Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: Center(child: Column(children: [const Icon(Icons.inbox_outlined, size: 24, color: AppColors.text3), const SizedBox(height: 8), Text('No payments yet.', style: body(14, color: AppColors.text3))])))
            else
              for (var i = 0; i < recent.length; i++) ...[
                if (i > 0) const Divider(height: 1, color: AppColors.border),
                _paymentRow(recent[i]),
              ],
          ]),
        ),
        const SizedBox(height: 16),
        CardLuxury(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              const Icon(Icons.pie_chart_outline, size: 16, color: AppColors.royal),
              const SizedBox(width: 8),
              Text('Revenue Breakdown', style: heading(14)),
            ]),
            if (revenue.isEmpty)
              Padding(padding: const EdgeInsets.symmetric(vertical: 24), child: Center(child: Column(children: [const Icon(Icons.trending_up, size: 24, color: AppColors.text3), const SizedBox(height: 8), Text('No revenue yet.', style: body(14, color: AppColors.text3))])))
            else
              for (final r in revenue)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Expanded(child: Text('${r['department_name']}', style: body(12, weight: FontWeight.w600))),
                      Text('${asNum(r['enrolled_count'])} enrolled', style: body(12, color: AppColors.text3)),
                    ]),
                    const SizedBox(height: 4),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(99),
                      child: LinearProgressIndicator(value: (asNum(r['total_amount']) / maxRevenue).toDouble().clamp(0, 1), minHeight: 8, backgroundColor: AppColors.canvasSoft, valueColor: const AlwaysStoppedAnimation(AppColors.royal)),
                    ),
                    Align(alignment: Alignment.centerRight, child: Text('₦${(asNum(r['total_amount']) / 1000000).toStringAsFixed(2)}M', style: body(11, color: AppColors.text3))),
                  ]),
                ),
          ]),
        ),
        const SizedBox(height: 80),
      ]),
    );
  }

  Widget _paymentRow(Map<String, dynamic> p) {
    final ok = p['status'] == 'success';
    final name = (p['display_name'] as String?) ?? 'Academic Partner';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Row(children: [
        Container(width: 32, height: 32, alignment: Alignment.center, decoration: const BoxDecoration(color: AppColors.royalSoft, shape: BoxShape.circle), child: Text(name.substring(0, 1).toUpperCase(), style: body(12, weight: FontWeight.w700, color: AppColors.royal))),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, weight: FontWeight.w600)),
            Text(((p['departments'] as Map?)?['name'] as String?) ?? '—', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, color: AppColors.text3)),
          ]),
        ),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('${groupDigits(asNum(p['amount']))} ${p['currency']}', style: body(14, weight: FontWeight.w600)),
          const SizedBox(height: 2),
          ok
              ? Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: AppColors.royalSoft, border: Border.all(color: AppColors.royalBorder), borderRadius: BorderRadius.circular(99)), child: Text('${p['status']}', style: body(10, weight: FontWeight.w700, color: AppColors.royal)))
              : Container(padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2), decoration: BoxDecoration(color: const Color(0xFFFFE4E6), borderRadius: BorderRadius.circular(99)), child: Text('${p['status']}', style: body(10, weight: FontWeight.w700, color: AppColors.rose700))),
        ]),
      ]),
    );
  }
}
