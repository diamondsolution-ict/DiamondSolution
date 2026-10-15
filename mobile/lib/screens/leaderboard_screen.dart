import 'package:flutter/material.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import '../main.dart';

class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key});
  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen> {
  bool weekly = true;
  Future<List<Map<String, dynamic>>>? future;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    future ??= _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final now = DateTime.now();
    final monday = now.subtract(Duration(days: now.weekday - 1));
    final sunday = monday.add(const Duration(days: 6));
    final deptId = AuthScope.of(context).profile?['department_id'];
    final standings = List<Map<String, dynamic>>.from(await db.rpc('leaderboard', params: {
      'p_from': weekly ? isoDate(monday) : '2000-01-01',
      'p_to': isoDate(weekly ? sunday : now),
      'p_department_id': deptId,
      'p_limit': 50,
    }));
    if (standings.isEmpty) return [];
    final names = List<Map<String, dynamic>>.from(await db.rpc('public_profile_names',
        params: {'p_user_ids': standings.map((s) => s['user_id']).toList()}));
    final byId = {for (final n in names) n['user_id']: n};
    final me = db.auth.currentUser?.id;
    return [
      for (final s in standings)
        {
          'user_id': s['user_id'],
          'name': byId[s['user_id']]?['display_name'] ?? (s['user_id'] == me ? 'You' : 'Scholar'),
          'university': byId[s['user_id']]?['university'] ?? '',
          'points': (((s['attempted'] as num) * 2 + (s['correct'] as num) * 0.5) * 10).round() / 10,
        }
    ];
  }

  @override
  Widget build(BuildContext context) {
    final me = db.auth.currentUser?.id;
    return Column(children: [
      Padding(
        padding: const EdgeInsets.all(16),
        child: SegmentedButton<bool>(
          segments: const [
            ButtonSegment(value: true, label: Text('This week')),
            ButtonSegment(value: false, label: Text('All time')),
          ],
          selected: {weekly},
          onSelectionChanged: (s) => setState(() {
            weekly = s.first;
            future = _load();
          }),
        ),
      ),
      Expanded(
        child: AsyncBody<List<Map<String, dynamic>>>(
          future: future!,
          builder: (context, rows) {
            if (rows.isEmpty) return const Center(child: Text('No activity yet.'));
            return ListView.builder(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: rows.length,
              itemBuilder: (context, i) {
                final r = rows[i];
                final mine = r['user_id'] == me;
                return Card(
                  color: mine ? AppColors.royalSoft : null,
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: i < 3 ? AppColors.gold : AppColors.canvasSoft,
                      child: Text('${i + 1}', style: const TextStyle(color: AppColors.navy)),
                    ),
                    title: Text(r['name'] as String),
                    subtitle: (r['university'] as String).isEmpty ? null : Text(r['university'] as String),
                    trailing: Text('${r['points']} pts', style: const TextStyle(fontWeight: FontWeight.bold)),
                  ),
                );
              },
            );
          },
        ),
      ),
    ]);
  }
}
