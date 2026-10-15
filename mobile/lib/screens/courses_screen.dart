import 'package:flutter/material.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../main.dart';
import 'checkout_screen.dart';
import 'course_detail_screen.dart';

class CoursesScreen extends StatefulWidget {
  const CoursesScreen({super.key});
  @override
  State<CoursesScreen> createState() => _CoursesScreenState();
}

class _CoursesScreenState extends State<CoursesScreen> {
  late Future<(List<Map<String, dynamic>>, Set<String>, Map<String, num>)> future = _load();

  Future<(List<Map<String, dynamic>>, Set<String>, Map<String, num>)> _load() async {
    final uid = db.auth.currentUser!.id;
    final r = await Future.wait<dynamic>([
      db.from('departments').select('id, name').eq('status', 'active').order('name'),
      db.from('access_grants').select('department_id').eq('user_id', uid),
      // Price history table: newest row not in the future wins (same rule as the website).
      db
          .from('department_pricing')
          .select('department_id, amount')
          .eq('currency', 'NGN')
          .lte('effective_from', DateTime.now().toUtc().toIso8601String())
          .order('effective_from', ascending: false),
    ]);
    final prices = <String, num>{};
    for (final p in r[2] as List) {
      prices.putIfAbsent(p['department_id'] as String, () => p['amount'] as num);
    }
    return (
      List<Map<String, dynamic>>.from(r[0]),
      (r[1] as List).map((g) => g['department_id'] as String).toSet(),
      prices,
    );
  }

  @override
  Widget build(BuildContext context) {
    final isAdmin = AuthScope.of(context).isAdmin;
    return RefreshIndicator(
      onRefresh: () async => setState(() => future = _load()),
      child: AsyncBody(
        future: future,
        builder: (context, data) {
          final (depts, granted, prices) = data;
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: depts.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (context, i) {
              final d = depts[i];
              final unlocked = isAdmin || granted.contains(d['id']);
              return Card(
                child: ListTile(
                  leading: Icon(unlocked ? Icons.folder_open : Icons.lock_outline,
                      color: unlocked ? AppColors.royal : AppColors.text3),
                  title: Text(d['name'] as String),
                  subtitle: Text(unlocked
                      ? 'Unlocked'
                      : prices[d['id']] != null
                          ? 'Unlock for ₦${prices[d['id']]}'
                          : 'Not available yet'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () async {
                    await Navigator.of(context).push(MaterialPageRoute(
                        builder: (_) => DepartmentScreen(
                            departmentId: d['id'] as String,
                            name: d['name'] as String,
                            unlocked: unlocked,
                            price: prices[d['id']])));
                    // Access may have been bought inside the department screen.
                    setState(() => future = _load());
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }
}

class DepartmentScreen extends StatefulWidget {
  const DepartmentScreen(
      {super.key, required this.departmentId, required this.name, required this.unlocked, this.price});
  final String departmentId;
  final String name;
  final bool unlocked;
  final num? price;
  @override
  State<DepartmentScreen> createState() => _DepartmentScreenState();
}

class _DepartmentScreenState extends State<DepartmentScreen> {
  late bool unlocked = widget.unlocked;
  late final Future<(List<Map<String, dynamic>>, List<Map<String, dynamic>>)> future = _load();

  Future<(List<Map<String, dynamic>>, List<Map<String, dynamic>>)> _load() async {
    final r = await Future.wait<dynamic>([
      db
          .from('courses')
          .select('id, title, level_id')
          .eq('department_id', widget.departmentId)
          .eq('status', 'published')
          .filter('deleted_at', 'is', null)
          .order('title'),
      db.from('department_levels').select('id, label, sort_order').eq('department_id', widget.departmentId).order('sort_order'),
    ]);
    return (List<Map<String, dynamic>>.from(r[0]), List<Map<String, dynamic>>.from(r[1]));
  }

  Future<void> _unlock() async {
    final ok = await startDepartmentCheckout(context, widget.departmentId);
    if (!mounted || ok == null) return;
    if (ok) {
      setState(() => unlocked = true);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Payment confirmed — department unlocked.')));
    } else {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Payment was not completed.')));
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(widget.name)),
        bottomNavigationBar: unlocked || widget.price == null
            ? null
            : SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: FilledButton.icon(
                    onPressed: _unlock,
                    icon: const Icon(Icons.lock_open),
                    label: Text('Unlock for ₦${widget.price}'),
                  ),
                ),
              ),
        body: AsyncBody(
          future: future,
          builder: (context, data) {
            final (courses, levels) = data;
            final labels = {for (final l in levels) l['id'] as String: l['label'] as String};
            if (courses.isEmpty) {
              return const Center(child: Text('No courses published yet.'));
            }
            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: courses.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (context, i) {
                final c = courses[i];
                return Card(
                  child: ListTile(
                    leading: const Icon(Icons.menu_book_outlined, color: AppColors.royal),
                    title: Text(c['title'] as String),
                    subtitle: Text(labels[c['level_id']] ?? ''),
                    trailing: Icon(unlocked ? Icons.chevron_right : Icons.lock_outline),
                    onTap: unlocked
                        ? () => Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => CourseDetailScreen(courseId: c['id'] as String)))
                        : _unlock,
                  ),
                );
              },
            );
          },
        ),
      );
}
