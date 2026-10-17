import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/ui.dart';

// Mirrors src/pages/ActivityLog.tsx ("Revision Center").
class ActivityLogScreen extends StatefulWidget {
  const ActivityLogScreen({super.key});
  @override
  State<ActivityLogScreen> createState() => _ActivityLogScreenState();
}

class _ActivityLogScreenState extends State<ActivityLogScreen> {
  static const pageSize = 20;
  final attempts = <Map<String, dynamic>>[];
  String filter = 'all';
  bool loading = true;
  bool hasMore = true;
  String? error;
  String? expanded;

  @override
  void initState() {
    super.initState();
    _loadMore();
  }

  Future<void> _loadMore() async {
    setState(() {
      loading = true;
      error = null;
    });
    try {
      final rows = List<Map<String, dynamic>>.from(await db
          .from('question_attempts')
          .select('id, result, attempted_at, selected_option_id, '
              'questions(prompt, type, explanation, expected_answer, courses(title), '
              'question_options(id, label, body, is_correct))')
          .eq('user_id', db.auth.currentUser!.id)
          .order('attempted_at', ascending: false)
          .range(attempts.length, attempts.length + pageSize - 1));
      attempts.addAll(rows);
      hasMore = rows.length == pageSize;
    } catch (e) {
      error = '$e';
    }
    if (mounted) setState(() => loading = false);
  }

  bool _matches(Map<String, dynamic> a) {
    final r = a['result'];
    return switch (filter) {
      'all' => true,
      'correct' => r == 'correct' || r == 'applied',
      _ => r == filter,
    };
  }

  @override
  Widget build(BuildContext context) {
    final shown = attempts.where(_matches).toList();
    return PageShell(
      title: 'Revision Center',
      child: ListView(padding: const EdgeInsets.fromLTRB(16, 24, 16, 32), children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            for (final f in ['all', 'correct', 'incorrect', 'skipped'])
              Padding(
                padding: const EdgeInsets.only(right: 8),
                child: GestureDetector(
                  onTap: () => setState(() => filter = f),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                    decoration: BoxDecoration(color: filter == f ? AppColors.royal : AppColors.canvasSoft, borderRadius: BorderRadius.circular(12)),
                    child: Text(f[0].toUpperCase() + f.substring(1), style: body(14, weight: FontWeight.w600, color: filter == f ? Colors.white : AppColors.text2)),
                  ),
                ),
              ),
          ]),
        ),
        const SizedBox(height: 16),
        if (error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Banner2(error!)),
        if (loading && attempts.isEmpty)
          const Padding(padding: EdgeInsets.all(40), child: Center(child: CircularProgressIndicator()))
        else if (shown.isEmpty)
          CardLuxury(
            padding: const EdgeInsets.all(40),
            child: Column(children: [
              const Icon(Icons.checklist, size: 28, color: AppColors.text3),
              const SizedBox(height: 8),
              Text('No activity yet', style: heading(14)),
              const SizedBox(height: 8),
              Text('Start studying to see your attempts here.', textAlign: TextAlign.center, style: body(14, color: AppColors.text3)),
            ]),
          )
        else
          for (final a in shown)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: _AttemptCard(a: a, open: expanded == a['id'], onTap: () => setState(() => expanded = expanded == a['id'] ? null : a['id'] as String)),
            ),
        if (hasMore && shown.isNotEmpty) ...[
          const SizedBox(height: 8),
          BtnOutline(label: loading ? 'Loading…' : 'Load more', onPressed: loading ? null : _loadMore),
        ],
      ]),
    );
  }
}

class _AttemptCard extends StatelessWidget {
  const _AttemptCard({required this.a, required this.open, required this.onTap});
  final Map<String, dynamic> a;
  final bool open;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final q = a['questions'] as Map<String, dynamic>?;
    final result = a['result'] as String;
    final ok = result == 'correct' || result == 'applied';
    final color = ok ? const Color(0xFF059669) : result == 'skipped' ? const Color(0xFFD97706) : const Color(0xFFE11D48);
    final icon = ok ? Icons.check_circle_outline : result == 'skipped' ? Icons.skip_next : Icons.cancel_outlined;
    final options = List<Map<String, dynamic>>.from((q?['question_options'] as List?) ?? []);
    final when = DateFormat('MMM d, HH:mm').format(DateTime.parse(a['attempted_at'] as String).toLocal());
    return CardLuxury(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        InkWell(
          onTap: onTap,
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('${((q?['courses'] as Map?)?['title'] ?? '')} · $when'.toUpperCase(), style: body(12, weight: FontWeight.w600, color: AppColors.text3, letterSpacing: 0.5)),
                const SizedBox(height: 4),
                Text((q?['prompt'] ?? '') as String, style: body(14)),
              ]),
            ),
            const SizedBox(width: 12),
            Row(mainAxisSize: MainAxisSize.min, children: [
              Icon(icon, size: 14, color: color),
              const SizedBox(width: 4),
              Text(result[0].toUpperCase() + result.substring(1), style: body(12, weight: FontWeight.w700, color: color)),
            ]),
          ]),
        ),
        if (open && q != null) ...[
          const SizedBox(height: 12),
          const Divider(height: 1, color: AppColors.border),
          const SizedBox(height: 12),
          if (q['type'] == 'application')
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.navy, borderRadius: BorderRadius.circular(12)),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Expected answer', style: body(14, weight: FontWeight.w600, color: Colors.white)),
                const SizedBox(height: 4),
                Text((q['expected_answer'] as String?)?.isNotEmpty == true ? q['expected_answer'] as String : 'No expected answer recorded.', style: body(14, color: Colors.white.withValues(alpha: 0.9))),
              ]),
            )
          else
            for (final o in options)
              Builder(builder: (_) {
                final correct = o['is_correct'] == true;
                final mine = o['id'] == a['selected_option_id'];
                final bg = correct ? AppColors.emerald50 : mine ? AppColors.rose50 : null;
                final fg = correct ? AppColors.emerald700 : mine ? AppColors.rose700 : AppColors.text3;
                return Container(
                  width: double.infinity,
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
                  child: Text('${o['label']}. ${o['body']}${correct ? ' — Correct' : (mine ? ' — Your choice' : '')}', style: body(14, weight: correct || mine ? FontWeight.w600 : FontWeight.w400, color: fg)),
                );
              }),
          if ((q['explanation'] as String?)?.isNotEmpty == true)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 4),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppColors.canvasSoft, borderRadius: BorderRadius.circular(12)),
              child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Padding(padding: EdgeInsets.only(top: 2), child: Icon(Icons.lightbulb_outline, size: 15, color: AppColors.gold)),
                const SizedBox(width: 8),
                Expanded(child: Text(q['explanation'] as String, style: body(14, color: AppColors.text2))),
              ]),
            ),
        ],
      ]),
    );
  }
}
