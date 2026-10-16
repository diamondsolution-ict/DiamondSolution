import 'package:flutter/material.dart';
import '../../core/supabase.dart';
import '../../core/theme.dart';
import '../../core/ui.dart';
import 'admin_common.dart';

const _monthLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Mirrors src/pages/admin/AdminAnalytics.tsx.
class AdminAnalyticsScreen extends StatefulWidget {
  const AdminAnalyticsScreen({super.key});
  @override
  State<AdminAnalyticsScreen> createState() => _AdminAnalyticsScreenState();
}

class _AdminAnalyticsScreenState extends State<AdminAnalyticsScreen> {
  Map<String, dynamic>? overview, dash, visitOv;
  List<Map<String, dynamic>> revenue = [], payouts = [], scholars = [], daily = [], peak = [];
  int period = 30;
  bool loading = true;
  DateTime refreshedAt = DateTime.now();

  @override
  void initState() {
    super.initState();
    _load();
  }

  List<Map<String, dynamic>> _rows(dynamic v) => List<Map<String, dynamic>>.from(v as List);

  Future<void> _load() async {
    setState(() => loading = true);
    final r = await Future.wait<dynamic>([
      db.rpc('admin_analytics_overview'),
      db.rpc('admin_dashboard_stats'),
      db.rpc('admin_revenue_history_monthly'),
      db.rpc('admin_affiliate_payouts_monthly'),
      db.rpc('admin_most_active_scholars', params: {'p_days': period}),
      db.rpc('admin_visit_overview', params: {'p_days': period}),
      db.rpc('admin_visits_daily', params: {'p_days': period}),
      db.rpc('admin_visit_peak_hours', params: {'p_days': period}),
    ]);
    if (!mounted) return;
    setState(() {
      overview = _rows(r[0]).firstOrNull;
      dash = _rows(r[1]).firstOrNull;
      revenue = _rows(r[2]);
      payouts = _rows(r[3]);
      scholars = _rows(r[4]);
      visitOv = _rows(r[5]).firstOrNull;
      daily = _rows(r[6]);
      peak = _rows(r[7]);
      refreshedAt = DateTime.now();
      loading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    if (loading || overview == null || dash == null) return const Center(child: CircularProgressIndicator());
    final kpis = [
      _kpi(Icons.attach_money, 'Live Revenue (MTD)', '₦${groupDigits(asNum(dash!['revenue_ngn']))}', 'All-time success', AppColors.emerald600),
      _kpi(Icons.people_outline, 'Scholarly Access', groupDigits(asNum(dash!['total_students'])), 'Institutional connections', AppColors.royal),
      _kpi(Icons.emoji_events_outlined, 'Avg Enrollment', '₦${groupDigits(asNum(overview!['avg_enrollment_ngn']).round())}', 'Mean tuition value', AppColors.royal),
      _kpi(Icons.gpp_maybe_outlined, 'Suspension Rate', '${overview!['suspension_rate']}%', 'Violation deactivations', const Color(0xFFE11D48)),
    ];
    final t = refreshedAt;
    final clock = '${(t.hour % 12 == 0 ? 12 : t.hour % 12)}:${t.minute.toString().padLeft(2, '0')}:${t.second.toString().padLeft(2, '0')} ${t.hour >= 12 ? 'PM' : 'AM'}';
    return ListView(padding: const EdgeInsets.all(20), children: [
      GridView.count(crossAxisCount: 2, shrinkWrap: true, physics: const NeverScrollableScrollPhysics(), mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 1.5, children: kpis),
      const SizedBox(height: 24),
      _barCard(Icons.bar_chart, 'Revenue History (Annual)', AppColors.royal, AppColors.royal, revenue, 'amount', 'month'),
      const SizedBox(height: 16),
      _barCard(Icons.people_outline, 'Affiliate Payouts (Annual)', const Color(0xFFE11D48), AppColors.rose500, payouts, 'amount', 'month'),
      const SizedBox(height: 16),
      CardLuxury(
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [const Icon(Icons.show_chart, size: 15, color: AppColors.royal), const SizedBox(width: 8), Text('Engagement Analytics', style: heading(14))]),
          const SizedBox(height: 2),
          Text('Snapshot as of $clock — not live, tap Refresh for the latest.', style: body(12, color: AppColors.text3)),
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(4),
            decoration: BoxDecoration(color: Colors.white, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              for (final p in const [(7, '7D'), (30, '30D'), (90, '90D')])
                Expanded(
                  child: GestureDetector(
                    onTap: () {
                      setState(() => period = p.$1);
                      _load();
                    },
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 6),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: period == p.$1 ? AppColors.royal : Colors.transparent, borderRadius: BorderRadius.circular(8)),
                      child: Text(p.$2, style: body(12, weight: FontWeight.w600, color: period == p.$1 ? Colors.white : AppColors.text3)),
                    ),
                  ),
                ),
              Expanded(
                child: GestureDetector(
                  onTap: _load,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 6),
                    alignment: Alignment.center,
                    child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [const Icon(Icons.refresh, size: 12, color: AppColors.royal), const SizedBox(width: 4), Text('Refresh', style: body(12, weight: FontWeight.w600, color: AppColors.royal))]),
                  ),
                ),
              ),
            ]),
          ),
          const SizedBox(height: 16),
          _visitTile('Total Visits', groupDigits(asNum(visitOv?['total_visits'] ?? 0)), 'Last $period days'),
          _visitTile('Unique Visitors', groupDigits(asNum(visitOv?['unique_visitors'] ?? 0)), 'Last $period days'),
          _visitTile('Avg Visits / Visitor', '${visitOv?['avg_visits_per_visitor'] ?? 0}', 'Return frequency'),
          const SizedBox(height: 8),
          _miniBars(Icons.trending_up, 'Page Visits Over Time', daily, 'visits', AppColors.royal.withValues(alpha: 0.7), daily.every((d) => asNum(d['visits']) == 0)),
          const SizedBox(height: 20),
          _miniBars(Icons.schedule, 'Peak Visit Hours (Local Time)', peak, 'visits', AppColors.emerald600.withValues(alpha: 0.7), !peak.any((h) => asNum(h['visits']) > 0)),
          const SizedBox(height: 24),
          Text('MOST ACTIVE SCHOLARS', style: body(12, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 0.5)),
          const SizedBox(height: 8),
          if (scholars.isEmpty)
            Text('No practice activity in this period.', style: body(14, color: AppColors.text3))
          else
            for (var i = 0; i < scholars.length; i++) _scholar(i, scholars[i]),
        ]),
      ),
      const SizedBox(height: 80),
    ]);
  }

  Widget _kpi(IconData icon, String label, String value, String sub, Color color) => CardLuxury(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
          Row(children: [Icon(icon, size: 13, color: color), const SizedBox(width: 6), Expanded(child: Text(label.toUpperCase(), maxLines: 1, overflow: TextOverflow.ellipsis, style: body(10, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 0.5)))]),
          const SizedBox(height: 4),
          Text(value, maxLines: 1, overflow: TextOverflow.ellipsis, style: heading(20, color: color)),
          Text(sub, style: body(11, color: AppColors.text3)),
        ]),
      );

  Widget _barCard(IconData icon, String title, Color titleColor, Color bar, List<Map<String, dynamic>> data, String valueKey, String labelKey) {
    final maxV = data.fold<num>(1, (m, r) => asNum(r[valueKey]) > m ? asNum(r[valueKey]) : m);
    return CardLuxury(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [Icon(icon, size: 15, color: titleColor), const SizedBox(width: 8), Text(title, style: heading(14, color: titleColor))]),
        const SizedBox(height: 16),
        SizedBox(
          height: 100,
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            for (final r in data)
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 3),
                  child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                    Container(height: (asNum(r[valueKey]) / maxV * 84).clamp(2, 84).toDouble(), decoration: BoxDecoration(color: bar, borderRadius: const BorderRadius.vertical(top: Radius.circular(4)))),
                    const SizedBox(height: 4),
                    Text(_monthLabels[(asNum(r[labelKey]).toInt() - 1).clamp(0, 11)], style: body(9, color: AppColors.text3)),
                  ]),
                ),
              ),
          ]),
        ),
      ]),
    );
  }

  Widget _visitTile(String l, String v, String sub) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(color: AppColors.canvasSoft, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(l.toUpperCase(), style: body(10, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 0.5)),
          const SizedBox(height: 4),
          Text(v, style: heading(20, color: AppColors.royal)),
          Text(sub, style: body(11, color: AppColors.text3)),
        ]),
      );

  Widget _miniBars(IconData icon, String title, List<Map<String, dynamic>> data, String key, Color color, bool empty) {
    final maxV = data.fold<num>(1, (m, r) => asNum(r[key]) > m ? asNum(r[key]) : m);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Row(children: [Icon(icon, size: 13, color: AppColors.royal), const SizedBox(width: 6), Expanded(child: Text(title.toUpperCase(), style: body(12, weight: FontWeight.w700, color: AppColors.text3, letterSpacing: 0.5)))]),
      const SizedBox(height: 12),
      if (empty)
        Text('No visits recorded yet in this period.', style: body(12, color: AppColors.text3))
      else
        SizedBox(
          height: 80,
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            for (final d in data) Expanded(child: Container(margin: const EdgeInsets.symmetric(horizontal: 1), height: (asNum(d[key]) / maxV * 72).clamp(2, 72).toDouble(), decoration: BoxDecoration(color: color, borderRadius: const BorderRadius.vertical(top: Radius.circular(4))))),
          ]),
        ),
    ]);
  }

  Widget _scholar(int i, Map<String, dynamic> s) {
    final attempted = asNum(s['attempted']);
    final acc = attempted > 0 ? (asNum(s['correct']) / attempted * 100).round() : 0;
    final secs = asNum(s['study_seconds']);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(12)),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Expanded(child: Text('#${i + 1} ${s['display_name']}', maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, weight: FontWeight.w600))),
          Text('${s['department_name'] ?? '—'}', style: body(12, color: AppColors.text3)),
        ]),
        const SizedBox(height: 6),
        Wrap(spacing: 16, children: [
          Text('${attempted.toInt()} attempted', style: body(12, color: AppColors.text2)),
          Text('$acc% accuracy', style: body(12, color: AppColors.text2)),
          Text('${secs ~/ 3600}h ${((secs % 3600) / 60).round()}m', style: body(12, color: AppColors.text2)),
        ]),
      ]),
    );
  }
}
