import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/ui.dart';
import '../main.dart';

// Mirrors src/pages/Leaderboard.tsx.

const _avatarGradients = [
  [AppColors.royal, AppColors.royalDark],
  [Color(0xFF10B981), Color(0xFF047857)],
  [Color(0xFFF59E0B), Color(0xFFB45309)],
  [Color(0xFFA855F7), Color(0xFF7E22CE)],
  [Color(0xFFF43F5E), Color(0xFFBE123C)],
  [Color(0xFF0EA5E9), Color(0xFF0369A1)],
];

// Same string hash as the website so a person keeps the same colour on both.
LinearGradient _avatarGradient(String key) {
  var hash = 0;
  for (final c in key.codeUnits) {
    hash = ((hash * 31) + c).toSigned(32);
  }
  final colors = _avatarGradients[hash.abs() % _avatarGradients.length];
  return LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: colors);
}

class LeaderboardScreen extends StatefulWidget {
  const LeaderboardScreen({super.key});
  @override
  State<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends State<LeaderboardScreen> {
  bool weekly = true;
  String departmentId = '';
  List<Map<String, dynamic>> departments = [];
  List<Map<String, dynamic>> rows = [];
  bool loading = true;
  bool started = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (started) return;
    started = true;
    departmentId = (AuthScope.of(context).profile?['department_id'] as String?) ?? '';
    db.from('departments').select('id, name').eq('status', 'active').order('name', ascending: true).then((d) {
      if (mounted) setState(() => departments = List<Map<String, dynamic>>.from(d));
    });
    _load();
  }

  Future<void> _load() async {
    setState(() => loading = true);
    final now = DateTime.now();
    final monday = now.subtract(Duration(days: now.weekday - 1));
    final sunday = monday.add(const Duration(days: 6));
    final fmt = DateFormat('yyyy-MM-dd');
    try {
      final standings = List<Map<String, dynamic>>.from(await db.rpc('leaderboard', params: {
        'p_from': weekly ? fmt.format(monday) : '2000-01-01',
        'p_to': fmt.format(weekly ? sunday : now),
        'p_department_id': departmentId.isEmpty ? null : departmentId,
        'p_limit': 50,
      }));
      final names = standings.isEmpty ? <Map<String, dynamic>>[] : List<Map<String, dynamic>>.from(await db.rpc('public_profile_names', params: {'p_user_ids': standings.map((s) => s['user_id']).toList()}));
      final byId = {for (final n in names) n['user_id']: n};
      final me = db.auth.currentUser?.id;
      rows = [
        for (final s in standings)
          () {
            final att = s['attempted'] as num, cor = s['correct'] as num;
            final n = byId[s['user_id']];
            return {
              'user_id': s['user_id'] as String,
              'attempted': att,
              'correct': cor,
              'points': (((att * 2 + cor * 0.5) * 10).round()) / 10,
              'accuracy': att > 0 ? (cor / att * 100).round() : 0,
              'name': (n?['display_name'] as String?) ?? (s['user_id'] == me ? 'You' : 'Scholar'),
              'university': (n?['university'] as String?) ?? '',
            };
          }()
      ];
    } catch (_) {
      rows = [];
    }
    if (mounted) setState(() => loading = false);
  }

  @override
  Widget build(BuildContext context) => PageShell(
        title: 'Leaderboard',
        child: ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 32), children: [
          Row(children: [
            _pill('This week', weekly, () {
              setState(() => weekly = true);
              _load();
            }),
            const SizedBox(width: 8),
            _pill('All time', !weekly, () {
              setState(() => weekly = false);
              _load();
            }),
          ]),
          const SizedBox(height: 16),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: [
              _deptPill('All departments', departmentId.isEmpty, () {
                setState(() => departmentId = '');
                _load();
              }),
              for (final d in departments) ...[
                const SizedBox(width: 8),
                _deptPill(d['name'] as String, departmentId == d['id'], () {
                  setState(() => departmentId = d['id'] as String);
                  _load();
                }),
              ],
            ]),
          ),
          const SizedBox(height: 16),
          Row(children: [
            const Icon(Icons.bolt, size: 13, color: AppColors.gold),
            const SizedBox(width: 6),
            Text('Formula: (Attempts × 2) + (Correct × 0.5)', style: body(12, color: AppColors.text3)),
          ]),
          const SizedBox(height: 16),
          if (loading)
            Text('Calculating standings…', style: body(14, color: AppColors.text3))
          else if (rows.isEmpty)
            CardLuxury(
              padding: const EdgeInsets.all(40),
              child: Column(children: [
                const Icon(Icons.emoji_events_outlined, size: 28, color: AppColors.text3),
                const SizedBox(height: 8),
                Text('No rankings yet', style: heading(14)),
                const SizedBox(height: 8),
                Text('Be the first to practice this week and claim the top spot.', textAlign: TextAlign.center, style: body(14, color: AppColors.text3)),
              ]),
            )
          else ...[
            Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              for (var i = 0; i < rows.length && i < 3; i++) ...[
                if (i > 0) const SizedBox(width: 8),
                Expanded(child: _podium(rows[i], i)),
              ],
            ]),
            const SizedBox(height: 16),
            for (var i = 3; i < rows.length; i++) _row(rows[i], i),
          ],
        ]),
      );

  Widget _pill(String label, bool on, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(color: on ? AppColors.royal : AppColors.canvasSoft, borderRadius: BorderRadius.circular(12)),
          child: Text(label, style: body(14, weight: FontWeight.w600, color: on ? Colors.white : AppColors.text2)),
        ),
      );

  Widget _deptPill(String label, bool on, VoidCallback onTap) => GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(color: on ? AppColors.navy : AppColors.canvasSoft, borderRadius: BorderRadius.circular(12)),
          child: Text(label, style: body(12, weight: FontWeight.w600, color: on ? Colors.white : AppColors.text2)),
        ),
      );

  Widget _podium(Map<String, dynamic> r, int i) {
    final badgeBg = [AppColors.gold, const Color(0xFFCBD5E1), const Color(0xFFB45309)][i];
    final badgeFg = i == 2 ? Colors.white : AppColors.navy;
    final name = r['name'] as String;
    return CardLuxury(
      padding: const EdgeInsets.all(12),
      child: Column(children: [
        Container(
          width: 48,
          height: 48,
          alignment: Alignment.center,
          decoration: BoxDecoration(gradient: _avatarGradient(r['user_id'] as String), shape: BoxShape.circle),
          child: Text(name.characters.first.toUpperCase(), style: body(16, weight: FontWeight.w700, color: Colors.white)),
        ),
        Transform.translate(
          offset: const Offset(0, -12),
          child: Container(
            width: 24,
            height: 24,
            decoration: BoxDecoration(color: badgeBg, shape: BoxShape.circle, border: Border.all(color: Colors.white, width: 2)),
            child: Icon(i == 0 ? Icons.workspace_premium : Icons.military_tech, size: 12, color: badgeFg),
          ),
        ),
        Transform.translate(
          offset: const Offset(0, -8),
          child: Column(children: [
            Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, textAlign: TextAlign.center, style: heading(14)),
            Text(r['university'] as String, maxLines: 1, overflow: TextOverflow.ellipsis, style: body(12, color: AppColors.text3)),
            const SizedBox(height: 4),
            Text('${_n(r['points'] as num)} pts', style: body(14, weight: FontWeight.w700, color: AppColors.royal)),
            Text('${r['accuracy']}% accuracy', style: body(12, color: AppColors.text3)),
          ]),
        ),
      ]),
    );
  }

  Widget _row(Map<String, dynamic> r, int i) {
    final name = r['name'] as String;
    final odd = (i - 3).isEven; // website stripes odd children: first row after the podium is odd
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(color: odd ? AppColors.canvasSoft.withValues(alpha: 0.6) : null, borderRadius: BorderRadius.circular(12)),
      child: Row(children: [
        SizedBox(width: 20, child: Text('${i + 1}', textAlign: TextAlign.center, style: body(14, weight: FontWeight.w600, color: AppColors.text3))),
        const SizedBox(width: 12),
        Container(
          width: 32,
          height: 32,
          alignment: Alignment.center,
          decoration: BoxDecoration(gradient: _avatarGradient(r['user_id'] as String), shape: BoxShape.circle),
          child: Text(name.characters.first.toUpperCase(), style: body(12, weight: FontWeight.w700, color: Colors.white)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, maxLines: 1, overflow: TextOverflow.ellipsis, style: body(14, weight: FontWeight.w500)),
            Row(children: [
              const Icon(Icons.track_changes, size: 11, color: AppColors.text3),
              const SizedBox(width: 4),
              Flexible(child: Text('${_n(r['correct'] as num)} correct of ${_n(r['attempted'] as num)}', overflow: TextOverflow.ellipsis, style: body(12, color: AppColors.text3))),
            ]),
          ]),
        ),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('${_n(r['points'] as num)} pts', style: body(14, weight: FontWeight.w700, color: AppColors.royal)),
          Text('${r['accuracy']}%', style: body(12, color: AppColors.text3)),
        ]),
      ]),
    );
  }

  String _n(num v) => v == v.roundToDouble() ? v.toInt().toString() : v.toString();
}
