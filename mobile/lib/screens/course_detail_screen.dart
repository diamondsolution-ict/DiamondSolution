import 'package:flutter/material.dart';
import '../core/supabase.dart';
import '../core/theme.dart';
import '../core/widgets.dart';
import 'study_screen.dart';

class CourseDetailScreen extends StatefulWidget {
  const CourseDetailScreen({super.key, required this.courseId});
  final String courseId;
  @override
  State<CourseDetailScreen> createState() => _CourseDetailScreenState();
}

class _CourseDetailScreenState extends State<CourseDetailScreen> {
  late Future<Map<String, dynamic>> future = _load();
  final jump = TextEditingController();

  Future<Map<String, dynamic>> _load() async {
    final uid = db.auth.currentUser!.id;
    final course = await db
        .from('courses')
        .select('id, title, description, department_id')
        .eq('id', widget.courseId)
        .filter('deleted_at', 'is', null)
        .maybeSingle();
    if (course == null) throw 'Course not found.';
    final r = await Future.wait<dynamic>([
      db.from('questions').select('id').eq('course_id', widget.courseId).eq('status', 'active').limit(1).count(),
      db
          .from('course_outline_sections')
          .select('title, start_question_order, end_question_order')
          .eq('course_id', widget.courseId)
          .order('sort_order', ascending: true),
      db
          .from('study_progress')
          .select('current_order, completed')
          .eq('user_id', uid)
          .eq('course_id', widget.courseId)
          .maybeSingle(),
    ]);
    return {
      'course': course,
      'count': (r[0] as dynamic).count,
      'outline': r[1],
      'progress': r[2],
    };
  }

  void _open({int? start}) {
    Navigator.of(context)
        .push(MaterialPageRoute(builder: (_) => StudyScreen(courseId: widget.courseId, start: start)))
        .then((_) => setState(() => future = _load()));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Course')),
        body: AsyncBody<Map<String, dynamic>>(
          future: future,
          builder: (context, d) {
            final course = d['course'] as Map<String, dynamic>;
            final total = d['count'] as int;
            final progress = d['progress'] as Map<String, dynamic>?;
            final outline = List<Map<String, dynamic>>.from(d['outline'] as List);
            final inProgress = progress != null && progress['completed'] != true;
            return ListView(padding: const EdgeInsets.all(16), children: [
              Text(course['title'] as String,
                  style: const TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: AppColors.navy)),
              if ((course['description'] as String?)?.isNotEmpty ?? false) ...[
                const SizedBox(height: 8),
                Text(course['description'] as String),
              ],
              const SizedBox(height: 8),
              Text('$total questions', style: const TextStyle(color: AppColors.text3)),
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: total == 0 ? null : () => _open(),
                icon: const Icon(Icons.play_arrow),
                label: Text(inProgress ? 'Resume session' : 'Start studying'),
              ),
              const SizedBox(height: 16),
              Row(children: [
                Expanded(
                  child: TextField(
                    controller: jump,
                    keyboardType: TextInputType.number,
                    decoration: InputDecoration(labelText: 'Jump to question (1–$total)'),
                  ),
                ),
                const SizedBox(width: 8),
                OutlinedButton(
                  onPressed: () {
                    final n = int.tryParse(jump.text);
                    if (n == null || n < 1 || n > total) {
                      ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(content: Text('Enter a number between 1 and $total.')));
                      return;
                    }
                    _open(start: n);
                  },
                  child: const Text('Go'),
                ),
              ]),
              if (outline.isNotEmpty) ...[
                const SizedBox(height: 24),
                const Text('Outline', style: TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                for (final s in outline)
                  Card(
                    child: ListTile(
                      title: Text(s['title'] as String),
                      subtitle: Text('Questions ${s['start_question_order']}–${s['end_question_order']}'),
                      onTap: () => _open(start: s['start_question_order'] as int),
                    ),
                  ),
              ],
            ]);
          },
        ),
      );
}
