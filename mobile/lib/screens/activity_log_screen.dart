import 'package:flutter/material.dart';
import '../core/supabase.dart';
import '../core/theme.dart';

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
    return Scaffold(
      appBar: AppBar(title: const Text('Revision center')),
      body: Column(children: [
        SizedBox(
          height: 56,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.all(12),
            children: [
              for (final f in ['all', 'correct', 'incorrect', 'skipped'])
                Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: ChoiceChip(
                    label: Text(f),
                    selected: filter == f,
                    onSelected: (_) => setState(() => filter = f),
                  ),
                ),
            ],
          ),
        ),
        if (error != null) Padding(padding: const EdgeInsets.all(16), child: Text(error!)),
        Expanded(
          child: shown.isEmpty && !loading
              ? const Center(child: Text('Nothing to review yet.'))
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  itemCount: shown.length + 1,
                  itemBuilder: (context, i) {
                    if (i == shown.length) {
                      if (loading) return const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator()));
                      return hasMore
                          ? TextButton(onPressed: _loadMore, child: const Text('Load more'))
                          : const SizedBox(height: 16);
                    }
                    return _AttemptCard(
                      a: shown[i],
                      expanded: expanded == shown[i]['id'],
                      onTap: () => setState(() => expanded = expanded == shown[i]['id'] ? null : shown[i]['id'] as String),
                    );
                  },
                ),
        ),
      ]),
    );
  }
}

class _AttemptCard extends StatelessWidget {
  const _AttemptCard({required this.a, required this.expanded, required this.onTap});
  final Map<String, dynamic> a;
  final bool expanded;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final q = a['questions'] as Map<String, dynamic>?;
    final result = a['result'] as String;
    final ok = result == 'correct' || result == 'applied';
    final icon = ok ? Icons.check_circle : result == 'skipped' ? Icons.skip_next : Icons.cancel;
    final color = ok ? AppColors.success : result == 'skipped' ? AppColors.gold : AppColors.danger;
    final options = List<Map<String, dynamic>>.from((q?['question_options'] as List?) ?? []);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Icon(icon, color: color, size: 18),
                const SizedBox(width: 8),
                Expanded(child: Text(((q?['courses'] as Map?)?['title'] ?? '') as String, style: const TextStyle(color: AppColors.text3, fontSize: 12))),
              ]),
              const SizedBox(height: 8),
              Text((q?['prompt'] ?? '') as String, maxLines: expanded ? null : 2, overflow: expanded ? null : TextOverflow.ellipsis),
              if (expanded) ...[
                const SizedBox(height: 12),
                for (final o in options)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: Text(
                      '${o['label']}. ${o['body']}${o['is_correct'] == true ? '  ✓' : ''}${o['id'] == a['selected_option_id'] ? '  (your answer)' : ''}',
                      style: TextStyle(
                        fontWeight: o['is_correct'] == true ? FontWeight.bold : FontWeight.normal,
                        color: o['is_correct'] == true ? AppColors.success : null,
                      ),
                    ),
                  ),
                if (q?['type'] == 'application' && q?['expected_answer'] != null) Text(q!['expected_answer'] as String),
                if ((q?['explanation'] as String?)?.isNotEmpty ?? false) ...[
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: AppColors.royalSoft, borderRadius: BorderRadius.circular(12)),
                    child: Text(q!['explanation'] as String),
                  ),
                ],
              ],
            ]),
          ),
        ),
      ),
    );
  }
}
