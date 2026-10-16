import 'package:flutter/material.dart';
import '../core/access.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/ui.dart';
import '../main.dart';
import 'checkout_screen.dart';
import 'course_detail_screen.dart';

// Mirrors src/pages/CourseList.tsx: the Departments tab, and the per-department page
// (paywall / level filter / course list).

/// Departments tab body.
class CoursesScreen extends StatefulWidget {
  const CoursesScreen({super.key});
  @override
  State<CoursesScreen> createState() => _CoursesScreenState();
}

class _CoursesScreenState extends State<CoursesScreen> {
  late Future<(List<Map<String, dynamic>>, Set<String>)> future = _load();

  Future<(List<Map<String, dynamic>>, Set<String>)> _load() async {
    final uid = db.auth.currentUser!.id;
    final r = await Future.wait<dynamic>([
      db.from('departments').select('id, name, slug, image_path').eq('status', 'active').order('name', ascending: true),
      db.from('access_grants').select('department_id, expires_at').eq('user_id', uid),
    ]);
    // Only grants that haven't expired count as "Authorized".
    return (List<Map<String, dynamic>>.from(r[0]), (r[1] as List).where((g) => isGrantActive(g as Map<String, dynamic>)).map((g) => g['department_id'] as String).toSet());
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: () async => setState(() => future = _load()),
        child: FutureBuilder(
          future: future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            if (snap.hasError) return ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text('Something went wrong.\n${snap.error}', textAlign: TextAlign.center))]);
            final (depts, granted) = snap.data!;
            return ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 112), children: [
              if (depts.isEmpty) const EmptyCard(icon: Icons.folder_open, message: 'No departments available yet.'),
              for (final d in depts)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: _DepartmentTile(
                    dept: d,
                    granted: granted.contains(d['id']),
                    onTap: () async {
                      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => DepartmentScreen(departmentId: d['id'] as String, name: d['name'] as String)));
                      if (mounted) setState(() => future = _load()); // access may have been bought there
                    },
                  ),
                ),
            ]);
          },
        ),
      );
}

class _DepartmentTile extends StatelessWidget {
  const _DepartmentTile({required this.dept, required this.granted, required this.onTap});
  final Map<String, dynamic> dept;
  final bool granted;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    final path = dept['image_path'] as String?;
    final url = path == null ? null : db.storage.from('media').getPublicUrl(path);
    final name = dept['name'] as String;
    final fallback = Container(
      width: 48,
      height: 48,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: AppColors.royalSoft, borderRadius: BorderRadius.circular(12)),
      child: Text(name.characters.first, style: heading(14, color: AppColors.royal)),
    );
    return CardLuxury(
      onTap: onTap,
      padding: const EdgeInsets.all(16),
      child: Row(children: [
        if (url != null)
          ClipRRect(borderRadius: BorderRadius.circular(12), child: Image.network(url, width: 48, height: 48, fit: BoxFit.cover, errorBuilder: (_, __, ___) => fallback))
        else
          fallback,
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: heading(16)),
            if (granted) ...[const SizedBox(height: 4), const Badge2('Authorized')],
          ]),
        ),
        Container(
          width: 36,
          height: 36,
          decoration: BoxDecoration(color: AppColors.royalSoft, borderRadius: BorderRadius.circular(12)),
          child: const Icon(Icons.chevron_right, size: 18, color: AppColors.royal),
        ),
      ]),
    );
  }
}

/// One department: paywall when locked, otherwise level filter + course list.
class DepartmentScreen extends StatefulWidget {
  const DepartmentScreen({super.key, required this.departmentId, required this.name});
  final String departmentId;
  final String name;
  @override
  State<DepartmentScreen> createState() => _DepartmentScreenState();
}

class _DepartmentScreenState extends State<DepartmentScreen> {
  late Future<void> loaded = _load();
  bool hasAccess = false;
  num? price;
  int? priceDays;
  String? grantExpiresAt;
  List<Map<String, dynamic>> courses = [];
  List<Map<String, dynamic>> levels = [];
  String selectedLevel = '';
  bool paying = false;

  Future<void> _load() async {
    final uid = db.auth.currentUser!.id;
    final isAdmin = AuthScope.of(context).isAdmin;
    final r = await Future.wait<dynamic>([
      db.from('access_grants').select('department_id, expires_at').eq('user_id', uid).eq('department_id', widget.departmentId).maybeSingle(),
      // Price history table: newest row not in the future wins (same rule as the website/server).
      db
          .from('department_pricing')
          .select('amount, access_duration_days')
          .eq('department_id', widget.departmentId)
          .eq('currency', 'NGN')
          .lte('effective_from', DateTime.now().toUtc().toIso8601String())
          .order('effective_from', ascending: false)
          .limit(1),
      db.from('courses').select('id, title, level_id').eq('department_id', widget.departmentId).eq('status', 'published').filter('deleted_at', 'is', null).order('title', ascending: true),
      db.from('department_levels').select('id, label, sort_order').eq('department_id', widget.departmentId).order('sort_order', ascending: true),
    ]);
    final grant = r[0] as Map<String, dynamic>?;
    hasAccess = isAdmin || isGrantActive(grant);
    grantExpiresAt = grant?['expires_at'] as String?;
    final prices = r[1] as List;
    price = prices.isEmpty ? null : prices.first['amount'] as num;
    priceDays = prices.isEmpty ? null : prices.first['access_duration_days'] as int?;
    courses = List<Map<String, dynamic>>.from(r[2]);
    levels = List<Map<String, dynamic>>.from(r[3]);
  }

  Future<void> _pay() async {
    setState(() => paying = true);
    final ok = await startDepartmentCheckout(context, widget.departmentId);
    if (!mounted) return;
    setState(() => paying = false);
    if (ok == true) {
      // Mirrors what the server just granted (processDepartmentAccessPayment).
      setState(() {
        hasAccess = true;
        grantExpiresAt = priceDays == null || priceDays == 0 ? null : DateTime.now().add(Duration(days: priceDays!)).toUtc().toIso8601String();
      });
    } else if (ok == false) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Payment was not completed.')));
    }
  }

  String _levelLabel(String id) => levels.where((l) => l['id'] == id).map((l) => l['label'] as String).firstOrNull ?? '';

  @override
  Widget build(BuildContext context) => PageShell(
        title: widget.name,
        child: FutureBuilder<void>(
          future: loaded,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
            if (snap.hasError) return Center(child: Text('Something went wrong.\n${snap.error}', textAlign: TextAlign.center));
            if (!hasAccess) return _restricted();
            final visible = selectedLevel.isEmpty ? courses : courses.where((c) => c['level_id'] == selectedLevel).toList();
            return ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 32), children: [
              if (courses.isEmpty)
                const EmptyCard(icon: Icons.menu_book_outlined, message: 'No courses in this department yet.')
              else ...[
                Align(
                  alignment: Alignment.centerLeft,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(color: AppColors.goldPale, border: Border.all(color: AppColors.goldBorder), borderRadius: BorderRadius.circular(99)),
                    child: Row(mainAxisSize: MainAxisSize.min, children: [
                      const Icon(Icons.auto_awesome, size: 12, color: AppColors.goldDark),
                      const SizedBox(width: 6),
                      Text(AuthScope.of(context).isAdmin ? 'Lifetime access active' : describeAccessStatus(grantExpiresAt), style: body(12, weight: FontWeight.w700, color: AppColors.goldDark)),
                    ]),
                  ),
                ),
                if (levels.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    _chip('All levels', selectedLevel.isEmpty, () => setState(() => selectedLevel = '')),
                    for (final l in levels) _chip(l['label'] as String, selectedLevel == l['id'], () => setState(() => selectedLevel = l['id'] as String)),
                  ]),
                ],
                const SizedBox(height: 12),
                if (visible.isEmpty)
                  const EmptyCard(icon: Icons.menu_book_outlined, message: 'No courses at this level yet.')
                else
                  for (final c in visible)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: CardLuxury(
                        padding: const EdgeInsets.all(16),
                        onTap: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => CourseDetailScreen(courseId: c['id'] as String))),
                        child: Row(children: [
                          Container(width: 40, height: 40, decoration: BoxDecoration(color: AppColors.royalSoft, borderRadius: BorderRadius.circular(12)), child: const Icon(Icons.menu_book_outlined, size: 18, color: AppColors.royal)),
                          const SizedBox(width: 12),
                          Expanded(child: Text(c['title'] as String, style: heading(16))),
                          const SizedBox(width: 8),
                          Badge2(_levelLabel(c['level_id'] as String)),
                        ]),
                      ),
                    ),
              ],
            ]);
          },
        ),
      );

  Widget _chip(String label, bool on, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(color: on ? AppColors.royal : AppColors.canvasSoft, borderRadius: BorderRadius.circular(99)),
          child: Text(label, style: body(14, weight: FontWeight.w600, color: on ? Colors.white : AppColors.text2)),
        ),
      );

  Widget _restricted() => ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 32), children: [
        CardLuxury(
          padding: const EdgeInsets.all(32),
          child: Column(children: [
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(gradient: diamondGradient, borderRadius: BorderRadius.circular(16)),
              child: const Icon(Icons.lock_outline, size: 22, color: AppColors.gold),
            ),
            const SizedBox(height: 16),
            Text('Restricted', style: heading(18)),
            const SizedBox(height: 8),
            Text(describePaywall(priceDays, widget.name), textAlign: TextAlign.center, style: body(14, color: AppColors.text3)),
            const SizedBox(height: 24),
            BtnPrimary(
              label: paying ? 'Confirming…' : 'Authorize payment — ${price == null ? '—' : '₦${_commas(price!)}'}${describePriceTerm(priceDays)}',
              onPressed: paying || price == null ? null : _pay,
            ),
            if (AuthScope.of(context).profile?['currency'] == 'USD') ...[const SizedBox(height: 8), Text('Charged in NGN via Paystack.', style: body(12, color: AppColors.text3))],
          ]),
        ),
      ]);
}

String _commas(num n) => n.toStringAsFixed(n == n.roundToDouble() ? 0 : 2).replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (m) => ',');
