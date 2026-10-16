import 'package:flutter/material.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../main.dart';
import 'course_detail_screen.dart';

class DashboardScreen extends StatefulWidget {
  const DashboardScreen({super.key});
  @override
  State<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends State<DashboardScreen> {
  late Future<_DashData> future = _load();

  Future<_DashData> _load() async {
    final uid = db.auth.currentUser!.id;
    final results = await Future.wait<dynamic>([
      db.from('daily_practice_stats').select('practice_date, attempted, correct').eq('user_id', uid),
      db
          .from('study_progress')
          .select('course_id, current_order, courses(title)')
          .eq('user_id', uid)
          .eq('completed', false)
          .order('updated_at', ascending: false)
          .limit(1),
    ]);
    final stats = List<Map<String, dynamic>>.from(results[0]);
    final attempted = stats.fold<int>(0, (s, r) => s + (r['attempted'] as int));
    final correct = stats.fold<int>(0, (s, r) => s + (r['correct'] as int));
    final byDate = {for (final r in stats) r['practice_date'] as String: r};
    final now = DateTime.now();
    final days = List.generate(7, (i) {
      final d = now.subtract(Duration(days: 6 - i));
      return (isoDate(d), (byDate[isoDate(d)]?['attempted'] as int?) ?? 0);
    });
    final resume = (results[1] as List).isEmpty ? null : (results[1] as List).first as Map<String, dynamic>;
    return _DashData(attempted, correct, days, resume);
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    return RefreshIndicator(
      onRefresh: () async => setState(() => future = _load()),
      child: AsyncBody<_DashData>(
        future: future,
        builder: (context, d) {
          final points = ((d.attempted * 2 + d.correct * 0.5) * 10).round() / 10;
          final accuracy = d.attempted == 0 ? 0 : (d.correct / d.attempted * 100).round();
          final maxDay = d.days.map((e) => e.$2).fold<int>(1, (a, b) => b > a ? b : a);
          return ListView(padding: const EdgeInsets.all(16), children: [
            Text('Welcome back, ${auth.displayName}',
                style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: AppColors.navy)),
            const SizedBox(height: 16),
            Row(children: [
              StatTile('Points', '$points'),
              const SizedBox(width: 8),
              StatTile('Attempted', '${d.attempted}'),
              const SizedBox(width: 8),
              StatTile('Accuracy', '$accuracy%'),
            ]),
            const SizedBox(height: 16),
            if (d.resume != null)
              Card(
                child: ListTile(
                  leading: const Icon(Icons.play_circle_outline, color: AppColors.royal),
                  title: Text((d.resume!['courses'] as Map?)?['title'] ?? 'Continue studying'),
                  subtitle: Text('Resume at question ${(d.resume!['current_order'] as int) + 1}'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => CourseDetailScreen(courseId: d.resume!['course_id'] as String))),
                ),
              ),
            const SizedBox(height: 16),
            const Text('Last 7 days', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: SizedBox(
                  height: 120,
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      for (final day in d.days)
                        Expanded(
                          child: Column(mainAxisAlignment: MainAxisAlignment.end, children: [
                            Text('${day.$2}', style: const TextStyle(fontSize: 10)),
                            const SizedBox(height: 2),
                            Container(
                              height: 80 * day.$2 / maxDay + 2,
                              margin: const EdgeInsets.symmetric(horizontal: 4),
                              decoration: BoxDecoration(
                                  color: AppColors.royal, borderRadius: BorderRadius.circular(4)),
                            ),
                            const SizedBox(height: 4),
                            Text(day.$1.substring(8), style: const TextStyle(fontSize: 10, color: AppColors.text3)),
                          ]),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ]);
        },
      ),
    );
  }
}

class _DashData {
  _DashData(this.attempted, this.correct, this.days, this.resume);
  final int attempted;
  final int correct;
  final List<(String, int)> days;
  final Map<String, dynamic>? resume;
}
